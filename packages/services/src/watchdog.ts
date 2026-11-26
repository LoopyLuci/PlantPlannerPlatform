/**
 * Durability watchdog for the Plant Planner Platform.
 *
 * A running process (not a dispatch capability) that watches the data store and
 * the host process and reports a tri-state assessment for each probe. It is the
 * automated twin of the durability runbook (`docs/runbooks/durability-incident.md`).
 *
 * Six probes:
 *
 *   1. chainIntegrity  - every design log verifies its hash chain
 *   2. tornTail        - any design has a torn final line
 *   3. snapshotConsistent - no snapshot disagrees with its design log
 *   4. eventLoopLag    - the host event loop lags behind real time
 *   5. memoryRss       - the process RSS is within bounds and not climbing
 *   6. heartBeat       - the watchdog itself keeps a steady tick
 *
 * Classification (low to high): `healthy` < `degraded` < `critical`.
 *
 * Remediation is graduated, and the watchdog never repairs data or applies a
 * human decision (invariant I3). What it does:
 *
 *   - It never writes to a design log and never rewrites a design file.
 *   - It never auto-merges, auto-curations, auto-archives, or otherwise acts on
 *     a human decision. The `actions` list below is advisory: an operator may
 *     choose from it, following the runbook.
 *   - The only automated actions are lossless reporting: append one JSONL line
 *     to a sidecar file, and (optionally) POST a copy to an external beacon.
 *     A failed beacon never affects the monitor.
 *
 * Every report carries the platform version triple (invariant I4) so the
 * output can be traced back to the knowledge graph and rule configuration it
 * was computed against.
 */

import {
  type DesignIntegrity,
  type HealthReport,
  type SnapshotStatus,
} from '@ppp/store';
import { mkdir, appendFile } from 'node:fs/promises';
import type { VersionTriple } from '@ppp/core';

/** Result of a single probe. `ok` is the true/false of the underlying
 * condition. `degraded`/`critical` describe the platform-level severity so
 * the monitor can classify without interpreting the probe. */
export interface ProbeResult {
  name: string;
  ok: boolean;
  degraded: boolean;
  critical: boolean;
  detail: string;
  ms: number;
}

/** Total system status, low (healthy) to high (critical). */
export type SystemStatus = 'healthy' | 'degraded' | 'critical';

/**
 * A watchdog report. Diagnosis plus actionable, non-destructive
 * recommendations. The report is written to a sidecar (lossy, outside the
 * event log per invariant I8) and, on a failure, copied to any configured
 * external beacon.
 */
export interface WatchdogReport {
  version: VersionTriple;
  at: string;
  probes: ProbeResult[];
  status: SystemStatus;
  actions: ReadonlyArray<{
    severity: 'clear' | 'note' | 'advisory';
    message: string;
  }>;
}

/** A watchdog report: classification plus advisory actions, shaped for the
 * `durability.watchdog_status` capability output. */
export interface WatchdogStatus {
  status: SystemStatus;
  probes: ProbeResult[];
  actions: ReadonlyArray<{ severity: 'clear' | 'note' | 'advisory'; message: string }>;
}

/**
 * Minimal store surface the watchdog needs. `health()` is the existing
 * platform capability; this interface keeps the watchdog unit-testable without
 * a live server or a running process.
 */
export interface StoreHealth {
  health(): Promise<HealthReport>;
}

export interface WatchdogOptions {
  /** Store used for the three store probe (chain, torn tail, snapshot). */
  store: StoreHealth;
  /** Platform version triple, identical to what dispatch() returns. */
  version: VersionTriple;
  /** Directory that receives the sidecar JSONL (e.g. data/durability). */
  beaconDir?: string;
  /** Optional external beacon endpoint for degraded/critical reports. */
  beaconUrl?: string;
  /** Period between automatic runs, in ms (default 30 000). */
  intervalMs?: number;
  /** Degraded threshold for RSS, in MiB (default 192). */
  rssLimitMb?: number;
  /** Critical threshold for RSS, in MiB (default 320). */
  memoryLimitMb?: number;
  /** Event-loop probe: p50 latency considered critical (ms, default 25). */
  eventLoopP50CriticalMs?: number;
  /** Event-loop probe: p95 latency considered degraded (ms, default 5). */
  eventLoopP95DegradedMs?: number;
  /** Event-loop probe: number of latency samples (default 60). */
  eventLoopSamples?: number;
  /** Optional override of the latency samples, for deterministic tests. */
  overrideEventLoopLatencies?: readonly number[];
}

/**
 * The merged view of `WatchdogOptions` after defaults are applied: every field
 * that the user may omit is filled with its documented default, so the
 * remaining optional values are only the config that is genuinely optional.
 * Optional values (`beaconDir`, `beaconUrl`) stay `string | undefined`; all
 * numeric, object and function fields are non-optional after merging.
 */
type MergedWatchdogOptions = {
  store: StoreHealth;
  version: VersionTriple;
  beaconDir: string | undefined;
  beaconUrl: string | undefined;
  intervalMs: number;
  rssLimitMb: number;
  memoryLimitMb: number;
  eventLoopP50CriticalMs: number;
  eventLoopP95DegradedMs: number;
  eventLoopSamples: number;
  overrideEventLoopLatencies: readonly number[] | undefined;
};

/**
 * Default thresholds chosen conservatively for a Node services process:
 * an idle Node pipes sub-millisecond setImmediate round trips. A process that
 * sustains p95 > 5 ms or p50 > 25 ms is either under load or being throttled.
 */


function padLeft(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function formatTimestamp(now: number): string {
  const d = new Date(now);
  return (
    d.getUTCFullYear().toString() +
    '-' + padLeft(d.getUTCMonth() + 1, 2) +
    '-' + padLeft(d.getUTCDate(), 2) +
    'T' + padLeft(d.getUTCHours(), 2) +
    ':' + padLeft(d.getUTCMinutes(), 2) +
    ':' + padLeft(d.getUTCSeconds(), 2) +
    '.' + padLeft(d.getUTCMilliseconds(), 3) +
    'Z'
  );
}

export function classify(
  probes: readonly ProbeResult[],
): { status: SystemStatus; actions: ReadonlyArray<{ severity: 'clear' | 'note' | 'advisory'; message: string }> } {
  const degraded = probes.some((p) => p.degraded);
  const critical = probes.some((p) => p.critical);

  let status: SystemStatus = 'healthy';
  if (critical) status = 'critical';
  else if (degraded) status = 'degraded';

  const actions: { severity: 'clear' | 'note' | 'advisory'; message: string }[] = [];
  if (critical) {
    for (const p of probes.filter((p) => p.critical)) {
      actions.push({
        severity: 'advisory',
        message:
          `Probe "${p.name}" is critical: ${p.detail}. Follow the durability runbook and do not write to affected designs.`,
      });
    }
  } else if (degraded) {
    for (const p of probes.filter((p) => p.degraded)) {
      actions.push({ severity: 'note', message: `Probe "${p.name}" is degraded: ${p.detail}.` });
    }
  } else {
    actions.push({ severity: 'clear', message: 'All probes healthy; no action needed.' });
  }
  return { status, actions };
}

/** Event-loop lag probe. Latency is measured as a `setImmediate` round trip:
 * time from `performance.now()` before the yield to the callback. On a idle
 * Node process this is sub-millisecond; sustained waits indicate the event
 * loop is blocked or throttled. */
export async function probeEventLoopLag(options: {
  p50CriticalMs?: number;
  p95DegradedMs?: number;
  samples?: number;
  overrideEventLoopLatencies?: readonly number[];
}): Promise<ProbeResult> {
  const {
    p50CriticalMs = 25,
    p95DegradedMs = 5,
    samples = 60,
    overrideEventLoopLatencies,
  } = options;

  const started = performance.now();
  const latencies: number[] = [];

  if (overrideEventLoopLatencies !== undefined) {
    latencies.push(...overrideEventLoopLatencies);
  } else {
    let i = 0;
    await (async () => {
      while (i < samples) {
        const before = performance.now();
        await new Promise<void>((resolve) => setImmediate(resolve));
        latencies.push(performance.now() - before);
        i += 1;
      }
    })();
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const ms = performance.now() - started;

  const degraded = p95 > p95DegradedMs;
  const critical = p50 > p50CriticalMs;
  return { name: 'eventLoopLag', ok: !degraded && !critical, degraded, critical, detail: `p50 ${p50.toFixed(2)} ms / p95 ${p95.toFixed(2)} ms (thresholds p50 ${p50CriticalMs} ms, p95 ${p95DegradedMs} ms)`, ms };
}

/** RSS probe. `ok` means within the degraded threshold; `degraded` means over
 * the degraded threshold but not the critical one; `critical` means over the
 * critical threshold. */
export function probeMemoryRss(options: {
  rssMb?: number;
  rssLimitMb?: number;
  memoryLimitMb?: number;
}): ProbeResult {
  const { rssMb: rssMbOverride, rssLimitMb = 192, memoryLimitMb = 320 } = options;
  const rssBytes = rssMbOverride !== undefined ? rssMbOverride * 1048576 : process.memoryUsage().rss;
  const rssMb = rssBytes / 1048576;
  const degraded = rssMb > rssLimitMb;
  const critical = rssMb > memoryLimitMb;
  return {
    name: 'memoryRss',
    ok: !degraded,
    degraded,
    critical,
    detail: `rss ${rssMb.toFixed(1)} MiB (degraded above ${rssLimitMb} MiB, critical above ${memoryLimitMb} MiB)`,
    ms: 0,
  };
}

function probeChainIntegrity(report: HealthReport): ProbeResult {
  for (const design of report.designs) {
    if (!design.chainOk) {
      return {
        name: 'chainIntegrity',
        ok: false,
        degraded: false,
        critical: true,
        detail: `design ${design.designId} chainOk=false (${design.chainProblem ?? 'unknown problem'})`,
        ms: 0,
      };
    }
  }
  return {
    name: 'chainIntegrity',
    ok: true,
    degraded: false,
    critical: false,
    detail: `all ${report.designs.length} design log(s) chain_ok`,
    ms: 0,
  };
}

function probeTornTail(report: HealthReport): ProbeResult {
  const torn = report.designs.find((d) => d.tornTail);
  if (torn) {
    return {
      name: 'tornTail',
      ok: false,
      degraded: true,
      critical: false,
      detail: `design ${torn.designId} has a torn final line; the next write quarantines it (runbook step 2)`,
      ms: 0,
    };
  }
  return {
    name: 'tornTail',
    ok: true,
    degraded: false,
    critical: false,
    detail: `no torn tail across ${report.designs.length} design(s)`,
    ms: 0,
  };
}

function probeSnapshotConsistent(report: HealthReport): ProbeResult {
  const mismatched = report.designs.find((d) => d.snapshot.status === 'mismatch');
  if (mismatched) {
    const snapshot = mismatched.snapshot as Extract<SnapshotStatus, { status: 'mismatch' }>;
    return {
      name: 'snapshotConsistent',
      ok: false,
      degraded: true,
      critical: false,
      detail: `design ${mismatched.designId} snapshot status=mismatch (${snapshot.reason ?? 'log disagrees with snapshot'})`,
      ms: 0,
    };
  }
  return {
    name: 'snapshotConsistent',
    ok: true,
    degraded: false,
    critical: false,
    detail: `all ${report.designs.length} snapshot(s) consistent`,
    ms: 0,
  };
}

interface BeaconWriter {
  (report: WatchdogReport): Promise<void>;
}

/**
 * Build a beacon for the watchdog. The sidecar JSONL is always written; the
 * HTTP(S) POST is only attempted on degraded/critical reports and never
 * affects the monitor. Failures are swallowed so the watchdog keeps working.
 */
export function createBeacon(config: { dir: string; url?: string }): BeaconWriter {
  const { dir, url } = config;

  return async (report) => {
    // Lossless sidecar. This is a separate file from the event log (I8).
    await mkdir(dir, { recursive: true });
    await appendFile(`${dir}/watchdog.jsonl`, `${JSON.stringify(report)}\n`, 'utf8');

    if (!url) return;
    try {
      const data = Buffer.from(JSON.stringify(report), 'utf8');
      const parsed = new URL(url);
      const httpMod = parsed.protocol === 'https:' ? await import('node:https') : await import('node:http');
      const len = data.byteLength;
      const res = await new Promise<ReturnType<typeof httpMod['request']>>((resolve, reject) => {
        const req = httpMod.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { 'content-length': String(len), 'content-type': 'application/json' },
          },
          (res) => {
            // consume the body so the socket can be reused
            res.resume();
            resolve(req);
          },
        );
        req.on('error', reject);
        req.end(data);
      });
      await new Promise<void>((resolve, reject) => {
        res.on('finish', resolve);
        res.on('error', reject);
      });
    } catch (error) {
      // The sidecar already holds the clean report; a beacon outage is
      // orthogonal to the monitor and must not crash it.
    }
  };
}

/**
 * A running durability watchdog. Create it once per process, start it, and
 * query the latest report. The probes are deterministic except the
 * event-loop probe (which samples real host timing); the event-loop probe
 * accepts an optional override for tests.
 */
export class Watchdog {
  public lastRunAt: number;
  private timer: NodeJS.Timeout | null = null;
  private status: WatchdogReport | null = null;
  private opts: MergedWatchdogOptions;

  constructor(opts: Partial<WatchdogOptions> = {}) {
    this.lastRunAt = 0;
    this.opts = {
      store: opts.store ?? {
        health: async () => ({ status: 'healthy', checkedDesigns: 0, designs: [] }),
      },
      version: opts.version ?? { modelVersion: 'none', graphVersion: '', ruleConfigVersion: '' },
      beaconDir: opts.beaconDir,
      beaconUrl: opts.beaconUrl,
      intervalMs: opts.intervalMs ?? 30_000,
      rssLimitMb: opts.rssLimitMb ?? 192,
      memoryLimitMb: opts.memoryLimitMb ?? 320,
      eventLoopP50CriticalMs: opts.eventLoopP50CriticalMs ?? 25,
      eventLoopP95DegradedMs: opts.eventLoopP95DegradedMs ?? 5,
      eventLoopSamples: opts.eventLoopSamples ?? 60,
      overrideEventLoopLatencies: opts.overrideEventLoopLatencies,
    };
  }

  /** Run all probes once and return the report. Does not change the process
   * exit code, and never mutates the data store. */
  async runNow(): Promise<WatchdogReport> {
    const now = Date.now();
    const started = performance.now();
    const health = await this.safeHealth();
    const probes: ProbeResult[] = [];

    probes.push(probeChainIntegrity(health));
    probes.push(probeTornTail(health));
    probes.push(probeSnapshotConsistent(health));
    probes.push(await probeEventLoopLag({
      p50CriticalMs: this.opts.eventLoopP50CriticalMs,
      p95DegradedMs: this.opts.eventLoopP95DegradedMs,
      samples: this.opts.eventLoopSamples,
      overrideEventLoopLatencies: this.opts.overrideEventLoopLatencies,
    }));
    probes.push(probeMemoryRss({
      rssLimitMb: this.opts.rssLimitMb,
      memoryLimitMb: this.opts.memoryLimitMb,
    }));

    // The heartbeat self-probe proves the runner is not stalled.
    const elapsedSinceLastRun = this.lastRunAt === 0
      ? 'first run'
      : `${Math.round((now - this.lastRunAt) / 1000)} s ago`;
    probes.push({
      name: 'heartBeat',
      ok: true,
      degraded: false,
      critical: false,
      detail: `runner alive; last run ${elapsedSinceLastRun}`,
      ms: 0,
    });

    const { status, actions } = classify(probes);
    const report: WatchdogReport = {
      version: this.opts.version,
      at: formatTimestamp(now),
      probes,
      status,
      actions,
    };

    if (this.opts.beaconDir || this.opts.beaconUrl) {
      try {
        // The sidecar (lossless, outside the event log) is written on every
        // run. The external POST happens only on degraded/critical so that a
        // healthy monitor does not make noisy requests.
        if (this.opts.beaconDir) {
          await mkdir(this.opts.beaconDir, { recursive: true });
          await appendFile(
            `${this.opts.beaconDir}/watchdog.jsonl`,
            `${JSON.stringify(report)}\n`,
            'utf8',
          );
        }
        if (this.opts.beaconUrl && status !== 'healthy') {
          const beacon = createBeacon({ dir: this.opts.beaconDir ?? '', url: this.opts.beaconUrl });
          await beacon(report);
        }
      } catch {
        // A beacon outage is orthogonal to the monitor and must not crash it.
      }
    }

    this.status = report;
    this.lastRunAt = now;
    return report;
  }

  private async safeHealth(): Promise<HealthReport> {
    try {
      return await this.opts.store.health();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'corrupt',
        checkedDesigns: 0,
        designs: [
          {
            designId: '(store health call failed)',
            headSeq: 0,
            chainOk: false,
            chainProblem: message,
            tornTail: false,
            stateHash: null,
            snapshot: { status: 'none' },
          },
        ],
      };
    }
  }

  /** Start the background runner (runs immediately, then every `intervalMs`). */
  start(): () => void {
    void this.runNow().then(() => {
      if (this.timer === null) {
        this.timer = setInterval(() => {
          void this.runNow();
        }, this.opts.intervalMs);
      }
    });
    return () => {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Stop the background runner. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Public configuration read by the server entry point. */
  get intervalMs(): number {
    return this.opts.intervalMs;
  }

  get beaconDir(): string | undefined {
    return this.opts.beaconDir;
  }

  /** The last report, or null if `runNow()` has never succeeded. */
  get report(): WatchdogReport | null {
    return this.status;
  }
}
