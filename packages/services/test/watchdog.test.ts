import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type HealthReport, DesignStore } from '@ppp/store';
import {
  classify,
  createBeacon,
  probeEventLoopLag,
  probeMemoryRss,
  type ProbeResult,
  type WatchdogStatus,
  Watchdog,
  type WatchdogReport,
} from '../src/watchdog';

function healthReport(designs: HealthReport['designs']): HealthReport {
  return { status: 'healthy', checkedDesigns: 0, designs };
}

type Store = { health(): Promise<HealthReport> };

async function healthyStore(designs: HealthReport['designs'] = []): Promise<Store> {
  const store = new DesignStore(await mkdtemp(join(tmpdir(), 'ppp-watchdog-')));
  return {
    health: async () => healthReport(designs),
  };
}

describe('watchdog: classify', () => {
  const healthy: ProbeResult[] = [
    { name: 'a', ok: true, degraded: false, critical: false, detail: 'ok', ms: 0 },
    { name: 'b', ok: true, degraded: false, critical: false, detail: 'ok', ms: 0 },
  ];
  const degraded: ProbeResult[] = [
    ...healthy,
    { name: 'c', ok: false, degraded: true, critical: false, detail: 'warm', ms: 0 },
  ];
  const critical: ProbeResult[] = [
    ...healthy,
    { name: 'd', ok: false, degraded: false, critical: true, detail: 'bad chain', ms: 0 },
  ];

  it('returns healthy with no action when all probes are ok', () => {
    const result = classify(healthy);
    expect(result.status).toBe('healthy');
    expect(result.actions).toEqual([{ severity: 'clear', message: 'All probes healthy; no action needed.' }]);
  });

  it('returns degraded with one note per degraded probe', () => {
    const result = classify(degraded);
    expect(result.status).toBe('degraded');
    expect(result.actions).toEqual([
      { severity: 'note', message: 'Probe "c" is degraded: warm.' },
    ]);
  });

  it('returns critical with one advisory per critical probe', () => {
    const result = classify(critical);
    expect(result.status).toBe('critical');
    expect(result.actions).toEqual([
      { severity: 'advisory', message: 'Probe "d" is critical: bad chain. Follow the durability runbook and do not write to affected designs.' },
    ]);
  });
});

describe('watchdog: probeEventLoopLag', () => {
  it('reports ok for sub-millisecond round trips', async () => {
    const report = await probeEventLoopLag({
      overrideEventLoopLatencies: Array.from({ length: 60 }, (_, i) => i % 3),
    });
    expect(report.name).toBe('eventLoopLag');
    expect(report.ok).toBe(true);
    expect(report.degraded).toBe(false);
    expect(report.critical).toBe(false);
    expect(report.ms).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded and then critical for a stalled loop', async () => {
    const report = await probeEventLoopLag({
      overrideEventLoopLatencies: Array.from({ length: 60 }, () => 100),
      p95DegradedMs: 5,
      p50CriticalMs: 25,
    });
    expect(report.ok).toBe(false);
    expect(report.degraded).toBe(true);
    expect(report.critical).toBe(true);
  });
});

describe('watchdog: probeMemoryRss', () => {
  it('decides from the configured thresholds, not the host', () => {
    expect(probeMemoryRss({ rssMb: 0, rssLimitMb: 100000, memoryLimitMb: 200000 }).ok).toBe(true);
    expect(probeMemoryRss({ rssMb: 200, rssLimitMb: 192, memoryLimitMb: 320 }).degraded).toBe(true);
    expect(probeMemoryRss({ rssMb: 500, rssLimitMb: 192, memoryLimitMb: 320 }).critical).toBe(true);
  });
});

describe('watchdog: capability output', () => {
  it('is a WatchdogStatus with status, probes and actions', async () => {
    const store = await healthyStore();
    const watchdog = new Watchdog({
      store,
      version: { modelVersion: 'none', graphVersion: 'kg-2026.10', ruleConfigVersion: 'rules-1.0' },
      beaconUrl: process.env.PPP_DURABILITY_BEACON_URL ?? '',
    });
    const report = await watchdog.runNow();
    const status: WatchdogStatus = { status: report.status, probes: report.probes, actions: report.actions };
    expect(status.status).toBe('healthy');
    expect(status.probes.map((p) => p.name)).toContain('chainIntegrity');
    expect(status.probes.map((p) => p.name)).toContain('heartBeat');
    expect(status.probes).toHaveLength(6);
    expect(status.actions).toEqual([
      { severity: 'clear', message: 'All probes healthy; no action needed.' },
    ]);
  });
});

describe('watchdog: chain failure escalates critical', () => {
  it('marks the platform critical when a design log has a bad chain', async () => {
    const store = await healthyStore([
      {
        designId: 'd_0000000000000001',
        headSeq: 1,
        chainOk: true,
        tornTail: false,
        stateHash: null,
        snapshot: { status: 'none' },
      },
      {
        designId: 'd_0000000000000002',
        headSeq: 0,
        chainOk: false,
        chainProblem: 'hash mismatch',
        tornTail: false,
        stateHash: null,
        snapshot: { status: 'none' },
      },
    ]);
    const watchdog = new Watchdog({
      store,
      version: { modelVersion: 'none', graphVersion: 'kg-2026.10', ruleConfigVersion: 'rules-1.0' },
      beaconUrl: process.env.PPP_DURABILITY_BEACON_URL ?? '',
    });
    const report = await watchdog.runNow();
    expect(report.status).toBe('critical');
    expect(report.probes.find((p) => p.name === 'chainIntegrity')!.critical).toBe(true);
    expect(report.probes.find((p) => p.name === 'heartBeat')!.ok).toBe(true);
  });

  it('returns a critical report when the store itself throws', async () => {
    const store: Store = {
      health: async () => { throw new Error('store is down'); },
    };
    const watchdog = new Watchdog({
      store,
      version: { modelVersion: 'none', graphVersion: 'kg-2026.10', ruleConfigVersion: 'rules-1.0' },
      beaconUrl: process.env.PPP_DURABILITY_BEACON_URL ?? '',
    });
    const report = await watchdog.runNow();
    expect(report.status).toBe('critical');
    expect(report.probes.find((p) => p.name === 'heartBeat')!.ok).toBe(true);
  });
});

describe('watchdog: beacon', () => {
  it('writes the sidecar and skips the POST when no url is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ppp-watchdog-beacon-'));
    try {
      const store = await healthyStore();
      const watchdog = new Watchdog({
        store,
        version: { modelVersion: 'none', graphVersion: 'kg-2026.10', ruleConfigVersion: 'rules-1.0' },
        beaconDir: dir,
      });
      await watchdog.runNow();
      const lines = await readFile(`${dir}/watchdog.jsonl`, 'utf8');
      expect(lines.trim().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(lines.trim());
      expect(parsed).toHaveProperty('status', 'healthy');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function readFile(path: string, encoding: BufferEncoding): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, encoding);
}
