/**
 * Performance check (TODO P0, PLAN Phase 0 gate): a 50-plant design must evaluate
 * in under 50 ms. This script builds designs with 50 and 200 placements in a
 * temporary data directory, times the rules engine and the projection cache,
 * and exits 1 if the 50-plant gate is missed. Plan drawing at 60 fps is a browser
 * measurement and is not covered here.
 *
 * Run: npm run bench
 */
import { performance } from 'node:perf_hooks';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateDesign } from '@ppp/core';
import { type ServiceContext, createContext, dispatch } from '@ppp/services';
import { DesignStore } from '@ppp/store';

const GATE_MS = 50;
const meta = (key: string) => ({ interface: 'bench', actorId: 'bench', idempotencyKey: key });

interface Timing {
  label: string;
  median: number;
  p95: number;
}

function measure(label: string, runs: number, fn: () => unknown): Timing {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { label, median: at(0.5), p95: at(0.95) };
}

async function measureAsync(label: string, runs: number, fn: () => Promise<unknown>): Promise<Timing> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { label, median: at(0.5), p95: at(0.95) };
}

async function buildDesign(ctx: ServiceContext, name: string, count: number): Promise<string> {
  const created = await dispatch(
    ctx,
    'design.create',
    { name, width_m: 40, depth_m: 40, hardiness_zone: 7, sun_hours: 6.5, soil_ph: 7.4 },
    meta(`bench-create-${name}`),
  );
  if (!created.ok) throw new Error(`design.create failed: ${created.error.message}`);
  const designId = created.data.designId as string;
  const urns = [...ctx.kg.species.keys()].sort();
  for (let i = 0; i < count; i += 1) {
    const result = await dispatch(
      ctx,
      'design.add_placement',
      {
        design_id: designId,
        species_urn: urns[i % urns.length],
        x: (i % 20) * 1.9 + 0.5,
        y: Math.floor(i / 20) * 1.9 + 0.5,
        footprint_m: 0.5,
      },
      meta(`bench-${name}-${i}`),
    );
    if (!result.ok) throw new Error(`add_placement ${i} failed: ${result.error.message}`);
  }
  return designId;
}

const root = await mkdtemp(join(tmpdir(), 'ppp-bench-'));
try {
  const ctx = await createContext({ dataDir: root });
  const small = await buildDesign(ctx, 'fifty', 50);
  const large = await buildDesign(ctx, 'two-hundred', 200);

  const state50 = await ctx.store.loadState(small);
  const state200 = await ctx.store.loadState(large);
  if (!state50 || !state200) throw new Error('bench designs did not load');

  const timings: Timing[] = [
    measure('evaluateDesign, 50 plants (pure rules)', 200, () => evaluateDesign(state50, ctx.kg, ctx.rules)),
    await measureAsync('design.evaluate, 50 plants (load + rules)', 100, () =>
      dispatch(ctx, 'design.evaluate', { design_id: small }, meta('')),
    ),
    measure('evaluateDesign, 200 plants (pure rules)', 40, () => evaluateDesign(state200, ctx.kg, ctx.rules)),
    await measureAsync('loadState, 50 plants, cold (full replay)', 50, async () => {
      await new DesignStore(ctx.store.dir).loadState(small);
    }),
    await measureAsync('loadState, 50 plants, cached', 200, () => ctx.store.loadState(small)),
  ];

  console.log('Phase 0 performance check');
  console.log('measure'.padEnd(52) + 'median ms'.padStart(12) + 'p95 ms'.padStart(12));
  for (const t of timings) {
    console.log(t.label.padEnd(52) + t.median.toFixed(2).padStart(12) + t.p95.toFixed(2).padStart(12));
  }

  const gate = timings[0].median < GATE_MS && timings[1].median < GATE_MS;
  console.log(`gate: a 50-plant design evaluates in under ${GATE_MS} ms (median): ${gate ? 'PASS' : 'FAIL'}`);
  process.exitCode = gate ? 0 : 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
