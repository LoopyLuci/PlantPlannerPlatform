import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesignStore } from '@ppp/store';

/**
 * Process-kill test (TODO P0, PLAN Phase 0 gate). A child process writes to a
 * design. The parent kills it with SIGKILL at a random moment during a write,
 * then checks what survived:
 *   - every acknowledged write is in the log (acknowledged means fsynced);
 *   - at most one unacknowledged write is in the log;
 *   - the chain verifies, apart from an interrupted final line;
 *   - an interrupted final line is quarantined on the next write, not lost silently;
 *   - the replayed state matches the log, with no duplicate placements.
 */

export const KILL_DESIGN = 'd_0123456789abcdef';
const actor = { id: 'kill-test', interface: 'script' };
const SPECIES = 'urn:ppp:species:alpha-one';

const CREATE = {
  type: 'DesignCreated' as const,
  actor,
  idempotency_key: 'kill-create',
  payload: {
    designId: KILL_DESIGN,
    name: 'Kill test',
    site: { name: 'Kill test', widthM: 10, depthM: 10 },
    placements: [],
  },
};

/** A small seeded generator, so a failing run can be replayed with the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface KillOutcome {
  acknowledged: number;
  persisted: number;
  tornTail: boolean;
  failures: string[];
}

/** Runs the writer, kills it mid-write, and checks the log. Cleans up its own directory. */
export async function runKillIteration(random: () => number): Promise<KillOutcome> {
  const dir = await mkdtemp(join(tmpdir(), 'ppp-kill-'));
  try {
    const dataDir = join(dir, 'designs');
    await new DesignStore(dataDir).append(KILL_DESIGN, CREATE, { expectedSeq: 0 });
    const acknowledged = await runWriterUntilKill(dataDir, random);
    return await checkAfterKill(dataDir, acknowledged);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Waits until the writer has acknowledged a random number of writes, then kills it a few milliseconds later. */
function runWriterUntilKill(dataDir: string, random: () => number): Promise<number> {
  const target = 1 + Math.floor(random() * 40);
  const delayMs = Math.floor(random() * 4);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'kill-writer.ts'), dataDir, KILL_DESIGN], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let acknowledged = 0;
    let pending = '';
    let killing = false;
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const k = Number(line);
        if (Number.isInteger(k)) acknowledged = Math.max(acknowledged, k + 1);
      }
      if (!killing && acknowledged >= target) {
        killing = true;
        setTimeout(() => child.kill('SIGKILL'), delayMs);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    // 'close' waits for stdout to be fully read, so no acknowledgement is missed.
    child.on('close', (code, signal) => {
      if (signal === 'SIGKILL') resolve(acknowledged);
      else reject(new Error(`writer exited before the kill (code ${code}): ${stderr.trim()}`));
    });
  });
}

async function checkAfterKill(dataDir: string, acknowledged: number): Promise<KillOutcome> {
  const failures: string[] = [];
  const store = new DesignStore(dataDir);
  const log = await store.readLog(KILL_DESIGN);
  if (!log.chain.ok) failures.push(`chain broken after kill: ${log.chain.problem}`);

  const adds = log.events.filter((event) => event.type === 'PlacementAdded');
  const persisted = adds.length;
  if (persisted < acknowledged) failures.push(`${acknowledged} writes were acknowledged but only ${persisted} persisted`);
  if (persisted > acknowledged + 1) failures.push(`${persisted} persisted but only ${acknowledged} acknowledged`);
  const ids = new Set(adds.map((event) => (event.payload as { placement: { id: string } }).placement.id));
  if (ids.size !== persisted) failures.push('duplicate placement ids in the log');

  // The next write must repair the log, and the repaired log must verify.
  await store.append(KILL_DESIGN, {
    type: 'PlacementAdded',
    actor,
    idempotency_key: 'kill-sentinel',
    payload: { placement: { id: 'p_sentinel', speciesUrn: SPECIES, x: 0.1, y: 0.1, footprintM: 0.3, pinned: false } },
  });
  const health = await store.verify(KILL_DESIGN);
  if (!health.chainOk) failures.push(`chain still broken after repair: ${health.chainProblem}`);
  if (health.tornTail) failures.push('an interrupted line is still in the log after repair');
  if (log.tornTail) {
    const names = await readdir(dataDir);
    if (!names.some((name) => name.includes('.torn-'))) failures.push('the interrupted line was not quarantined');
  }

  const state = await store.loadState(KILL_DESIGN);
  const count = Object.keys(state?.placements ?? {}).length;
  if (count !== persisted + 1) failures.push(`replayed state has ${count} placements, expected ${persisted + 1}`);
  return { acknowledged, persisted, tornTail: log.tornTail, failures };
}
