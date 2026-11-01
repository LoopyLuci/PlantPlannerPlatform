#!/usr/bin/env tsx
/**
 * Local CI pipeline: preflight checks, then the verification stages, run on this machine.
 * The same stages back the pre-push hook (see `--install-hooks`) and `npm run ci`.
 *
 *   npm run ci                 standard tier: preflight, typecheck, tests, build, archive, end-to-end
 *   npm run ci:quick           quick tier: preflight, typecheck, tests, archive (no build, no browser)
 *   npm run ci:full            full tier: standard plus the kill test (200 kills) and the performance check
 *   npm run ci -- --only test  run named stages only (comma-separated)
 *   npm run ci -- --skip e2e   leave named stages out
 *   npm run ci:hooks           install the pre-push hook (git config core.hooksPath .githooks)
 *
 * Behaviour:
 * - Preflight runs first and stops the run on a fatal problem (wrong Node, missing
 *   dependencies, busy port, no browser for the end-to-end stage).
 * - Stages run in groups. Stages in one group run in parallel (typecheck and tests).
 * - Each stage has a timeout. On timeout its whole process tree is killed.
 * - A lock file (`.ci/lock`) stops two runs from writing the same output at once. A lock
 *   left by a dead process is cleared automatically.
 * - Logs go to `.ci/logs/`, and the result of the last run to `.ci/last-run.json`. Both are git-ignored.
 * - Exit code 0 means every stage passed. Any failure exits 1 after all running stages finish.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CI_DIR = join(ROOT, '.ci');
const LOG_DIR = join(CI_DIR, 'logs');
const LOCK_FILE = join(CI_DIR, 'lock');
const REPORT_FILE = join(CI_DIR, 'last-run.json');
const E2E_PORT = Number(process.env.PPP_E2E_PORT ?? 4411);
const MIN_NODE = [20, 11];

type Tier = 'quick' | 'standard' | 'full';
const TIER_ORDER: Tier[] = ['quick', 'standard', 'full'];

interface Stage {
  name: string;
  /** Lowest tier that includes this stage. */
  tier: Tier;
  /** Stages with the same group number run in parallel. Groups run in ascending order. */
  group: number;
  timeoutMs: number;
  /** Shell command, run from the repository root. */
  command?: string;
  /** In-process check, used instead of a command. Throws on failure. */
  check?: () => Promise<string>;
}

interface StageResult {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  durationMs: number;
  detail: string;
  logFile?: string;
}

const STAGES: Stage[] = [
  { name: 'typecheck', tier: 'quick', group: 1, timeoutMs: 180_000, command: 'npm run typecheck' },
  { name: 'test', tier: 'quick', group: 1, timeoutMs: 300_000, command: 'npm run test' },
  { name: 'archive', tier: 'quick', group: 2, timeoutMs: 120_000, check: verifyArchive },
  { name: 'build', tier: 'standard', group: 2, timeoutMs: 180_000, command: 'npm run build' },
  { name: 'e2e', tier: 'standard', group: 3, timeoutMs: 600_000, command: 'npx playwright test' },
  { name: 'kill-test', tier: 'full', group: 4, timeoutMs: 900_000, command: 'npm run kill-test -- --iterations 200' },
  { name: 'bench', tier: 'full', group: 5, timeoutMs: 300_000, command: 'npm run bench' },
];

// ---------- argument handling ----------

interface Options {
  tier: Tier;
  only: Set<string> | null;
  skip: Set<string>;
  installHooks: boolean;
  uninstallHooks: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { tier: 'standard', only: null, skip: new Set(), installHooks: false, uninstallHooks: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === '--tier') {
      const tier = next() as Tier;
      if (!TIER_ORDER.includes(tier)) throw new Error(`unknown tier "${tier}" (quick, standard, full)`);
      opts.tier = tier;
    } else if (arg.startsWith('--tier=')) {
      const tier = arg.slice('--tier='.length) as Tier;
      if (!TIER_ORDER.includes(tier)) throw new Error(`unknown tier "${tier}" (quick, standard, full)`);
      opts.tier = tier;
    } else if (arg === '--only') {
      opts.only = new Set(next().split(','));
    } else if (arg === '--skip') {
      next().split(',').forEach((name) => opts.skip.add(name));
    } else if (arg === '--install-hooks') {
      opts.installHooks = true;
    } else if (arg === '--uninstall-hooks') {
      opts.uninstallHooks = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  const known = new Set(STAGES.map((s) => s.name));
  for (const name of [...(opts.only ?? []), ...opts.skip]) {
    if (!known.has(name)) throw new Error(`unknown stage "${name}" (${[...known].join(', ')})`);
  }
  return opts;
}

function selectStages(opts: Options): Stage[] {
  const tierIndex = TIER_ORDER.indexOf(opts.tier);
  return STAGES.filter((stage) => {
    if (opts.only) return opts.only.has(stage.name);
    if (opts.skip.has(stage.name)) return false;
    return TIER_ORDER.indexOf(stage.tier) <= tierIndex;
  });
}

// ---------- lock ----------

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Takes the run lock. Clears a lock left by a process that no longer exists. */
function acquireLock(): () => void {
  mkdirSync(CI_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(LOCK_FILE, 'wx');
      writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      closeSync(fd);
      return () => rmSync(LOCK_FILE, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(LOCK_FILE, 'utf8').split('\n')[0]);
      if (pid && processAlive(pid)) throw new Error(`another run is in progress (pid ${pid}); wait for it or delete .ci/lock`);
      rmSync(LOCK_FILE, { force: true });
    }
  }
  throw new Error('could not take the run lock');
}

// ---------- preflight ----------

interface Check {
  name: string;
  ok: boolean;
  fatal: boolean;
  detail: string;
}

async function preflight(stages: Stage[]): Promise<Check[]> {
  const checks: Check[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  checks.push({ name: 'node version', ok: nodeOk, fatal: true, detail: `${process.versions.node} (needs >= ${MIN_NODE.join('.')})` });

  const pin = existsSync(join(ROOT, '.nvmrc')) ? readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim() : '';
  checks.push({
    name: 'node matches .nvmrc',
    ok: !pin || String(major) === pin.split('.')[0],
    fatal: false,
    detail: pin ? `pinned ${pin}, running ${process.versions.node}` : 'no .nvmrc',
  });

  const required = ['AGENTS.md', 'HANDOVER.md', 'TODO.md', 'package.json', 'package-lock.json', 'docs/adr/INDEX.md'];
  const missing = required.filter((path) => !existsSync(join(ROOT, path)));
  checks.push({ name: 'required files', ok: missing.length === 0, fatal: true, detail: missing.length ? `missing: ${missing.join(', ')}` : `${required.length} present` });

  const installed = existsSync(join(ROOT, 'node_modules', '.package-lock.json'));
  checks.push({ name: 'dependencies installed', ok: installed, fatal: true, detail: installed ? 'node_modules present' : 'run npm ci' });

  if (stages.some((s) => s.name === 'e2e')) {
    const free = await portFree(E2E_PORT);
    checks.push({ name: `port ${E2E_PORT} free`, ok: free, fatal: true, detail: free ? 'free' : 'in use; set PPP_E2E_PORT or stop the other server' });
    const browser = await browserAvailable();
    checks.push({ name: 'browser for end-to-end', ok: browser.ok, fatal: true, detail: browser.detail });
  }

  const dirty = await gitDirty();
  checks.push({ name: 'working tree', ok: true, fatal: false, detail: dirty === null ? 'not a git repository' : dirty ? `${dirty} uncommitted change(s)` : 'clean' });
  return checks;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => server.close(() => resolvePort(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function browserAvailable(): Promise<{ ok: boolean; detail: string }> {
  if (process.env.PPP_E2E_CHANNEL) return { ok: true, detail: `channel ${process.env.PPP_E2E_CHANNEL}` };
  const { chromium } = await import('@playwright/test');
  const path = chromium.executablePath();
  const ok = existsSync(path);
  return { ok, detail: ok ? 'bundled Chromium' : 'run npx playwright install chromium (or set PPP_E2E_CHANNEL=msedge)' };
}

/** Number of changed or untracked paths, or null outside a git repository. */
async function gitDirty(): Promise<number | null> {
  const result = await run('git status --porcelain', 30_000);
  if (result.code !== 0) return null;
  return result.output.split('\n').filter((line) => line.trim() !== '').length;
}

// ---------- archive verification (cross-platform, no sha256sum needed) ----------

async function verifyArchive(): Promise<string> {
  const dir = join(ROOT, 'data', 'archive');
  const listing = join(dir, 'checksums.sha256');
  if (!existsSync(listing)) throw new Error('data/archive/checksums.sha256 is missing; run npm run archive');
  const lines = readFileSync(listing, 'utf8').split('\n').filter((line) => line.trim() !== '');
  const bad: string[] = [];
  for (const line of lines) {
    const [expected, ...rest] = line.split(/\s+/);
    const relative = rest.join(' ');
    const file = join(dir, relative);
    if (!existsSync(file)) {
      bad.push(`${relative} (missing)`);
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (actual !== expected) bad.push(`${relative} (changed)`);
  }
  if (bad.length) throw new Error(`checksum mismatch: ${bad.join(', ')}`);
  return `${lines.length} files match`;
}

// ---------- running commands ----------

interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

/** Runs a shell command, captures its output, and kills its whole process tree on timeout. */
function run(command: string, timeoutMs: number, onSpawn?: (child: ChildProcess) => void): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(command, {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0', npm_config_update_notifier: 'false' },
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    onSpawn?.(child);
    const chunks: string[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, output: chunks.join(''), timedOut });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ code: 1, output: `${chunks.join('')}\n${error.message}`, timedOut });
    });
  });
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function runStage(stage: Stage): Promise<StageResult> {
  const started = Date.now();
  const logFile = join(LOG_DIR, `${stage.name}.log`);
  mkdirSync(LOG_DIR, { recursive: true });

  if (stage.check) {
    try {
      const detail = await withTimeout(stage.check(), stage.timeoutMs, stage.name);
      writeFileSync(logFile, `${detail}\n`);
      return { name: stage.name, status: 'pass', durationMs: Date.now() - started, detail, logFile };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeFileSync(logFile, `${message}\n`);
      return { name: stage.name, status: 'fail', durationMs: Date.now() - started, detail: message, logFile };
    }
  }

  const result = await run(stage.command ?? 'echo nothing to run', stage.timeoutMs);
  writeFileSync(logFile, result.output);
  if (result.timedOut) {
    return { name: stage.name, status: 'fail', durationMs: Date.now() - started, detail: `timed out after ${stage.timeoutMs / 1000}s`, logFile };
  }
  const ok = result.code === 0;
  return {
    name: stage.name,
    status: ok ? 'pass' : 'fail',
    durationMs: Date.now() - started,
    detail: ok ? 'ok' : `exit ${result.code}; last lines in ${logFile}`,
    logFile,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------- hooks ----------

const PRE_PUSH = `#!/bin/sh
# Installed by \`npm run ci:hooks\`. Runs the standard local pipeline before every push.
# To skip once in an emergency: git push --no-verify (the pipeline is not optional for merges to main).
npm run ci --silent || {
  echo "Local CI failed; the push was stopped. Details: .ci/last-run.json and .ci/logs/" >&2
  exit 1
}
`;

function installHooks(uninstall: boolean) {
  if (uninstall) {
    run('git config --unset core.hooksPath', 30_000).then((r) => console.log(r.code === 0 ? 'hooks uninstalled' : 'no hooks path was set'));
    return;
  }
  const dir = join(ROOT, '.githooks');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'pre-push');
  writeFileSync(file, PRE_PUSH);
  try {
    chmodSync(file, 0o755);
  } catch {
    // Windows ignores the execute bit; Git for Windows runs the hook through sh.
  }
  run('git config core.hooksPath .githooks', 30_000).then((r) => {
    console.log(r.code === 0 ? 'pre-push hook installed (core.hooksPath = .githooks)' : `could not set core.hooksPath: ${r.output}`);
  });
}

// ---------- main ----------

function format(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.installHooks || opts.uninstallHooks) {
    installHooks(opts.uninstallHooks);
    return;
  }

  const stages = selectStages(opts);
  const started = Date.now();
  const releaseLock = acquireLock();
  try {
    console.log(`Local CI · tier ${opts.tier} · ${stages.length} stage(s)\n`);

    console.log('Preflight');
    const checks = await preflight(stages);
    for (const check of checks) {
      const mark = check.ok ? 'ok  ' : check.fatal ? 'FAIL' : 'warn';
      console.log(`  ${mark} ${check.name}: ${check.detail}`);
    }
    const fatal = checks.filter((c) => !c.ok && c.fatal);
    if (fatal.length) {
      console.log('\nPreflight failed; no stages were run.');
      writeReport(opts.tier, checks, [], started, false);
      process.exitCode = 1;
      return;
    }

    const results: StageResult[] = [];
    let failed = false;
    const groups = [...new Set(stages.map((s) => s.group))].sort((a, b) => a - b);
    for (const group of groups) {
      const batch = stages.filter((s) => s.group === group);
      console.log(`\nRunning ${batch.map((s) => s.name).join(', ')}`);
      const outcomes = await Promise.all(batch.map((stage) => runStage(stage)));
      for (const outcome of outcomes) {
        results.push(outcome);
        console.log(`  ${outcome.status === 'pass' ? 'pass' : 'FAIL'} ${outcome.name.padEnd(10)} ${format(outcome.durationMs).padStart(9)}  ${outcome.detail}`);
        if (outcome.status === 'fail') failed = true;
      }
      // Stop before expensive groups if a cheap one already failed.
      if (failed) break;
    }
    for (const stage of stages) {
      if (!results.some((r) => r.name === stage.name)) results.push({ name: stage.name, status: 'skipped', durationMs: 0, detail: 'not reached' });
    }

    const passed = !failed;
    console.log(`\n${passed ? 'PASSED' : 'FAILED'} in ${format(Date.now() - started)}`);
    writeReport(opts.tier, checks, results, started, passed);
    process.exitCode = passed ? 0 : 1;
  } finally {
    releaseLock();
  }
}

function writeReport(tier: Tier, checks: Check[], stages: StageResult[], started: number, passed: boolean) {
  mkdirSync(CI_DIR, { recursive: true });
  const report = {
    passed,
    tier,
    node: process.versions.node,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    preflight: checks,
    stages,
  };
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
