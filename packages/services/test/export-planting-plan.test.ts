import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContext, dispatch, type CallMeta, type Envelope, type SuccessEnvelope } from '../src/index';

describe('design.export_planting_plan', () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let designId: string;
  let outDir: string;
  let meta: CallMeta;
  let tmp: string;

  beforeAll(async () => {
    meta = { interface: 'cli', actorId: 't@e', idempotencyKey: 'exp-test-1' };
    tmp = await mkdtemp(join(tmpdir(), 'ppp-plan-export-'));
    ctx = await createContext({ dataDir: tmp });
    const created = await dispatch(
      ctx,
      'design.create',
      { name: 'Test plot', width_m: 4, depth_m: 3 },
      meta,
    );
    designId = requireSuccess(created).data.designId as string;
    outDir = join(tmp, 'plans', 'my-plan');
  });

  async function runExport(extraKey: string | null | undefined = null): Promise<Envelope> {
    const key = extraKey ?? meta.idempotencyKey;
    return dispatch(ctx, 'design.export_planting_plan', { design_id: designId, out_dir: outDir }, {
      interface: meta.interface,
      actorId: meta.actorId,
      idempotencyKey: key,
    });
  }

  function requireSuccess(env: Envelope): SuccessEnvelope {
    if (!env.ok) {
      throw new Error(`Expected a success envelope, got failure: ${env.error.message}`);
    }
    return env as SuccessEnvelope;
  }

  it('exports a design as CSV + GeoJSON + README + checksums', async () => {
    const env = requireSuccess(await runExport());
    expect(env.ok).toBe(true);
    expect(env.capability).toBe('design.export_planting_plan');
    expect(env.data.out_dir).toBe(outDir);
    expect(env.data.designs).toBe(1);
    expect(env.data.species).toBeGreaterThan(0);
    const filePaths = (env.data.files as { path: string }[]).map((f) => f.path);
    // checksums.sha256 is not listed: a checksum file cannot contain its own hash.
    expect(filePaths).toEqual([
      `designs/${designId}/design.json`,
      `designs/${designId}/placements.csv`,
      `designs/${designId}/placements.geojson`,
      `designs/${designId}/README.md`,
    ]);
    expect(env.data.files).toHaveLength(4);

    // The checksum file lists exactly the four design files.
    const entries = await readFile(join(outDir, 'checksums.sha256'), 'utf8');
    expect(entries.split('\n').filter(Boolean).length).toBe(4);

    // The design log was not appended to by the export.
    const before = await ctx.store.readLog(designId);
    await runExport();
    const after = await ctx.store.readLog(designId);
    expect(after.chain.ok).toBe(true);
    expect(after.events.length).toBe(before.events.length);
  });

  it('regenerates the same files (idempotent overwrite)', async () => {
    requireSuccess(await runExport());
    const before = await readFile(join(outDir, 'checksums.sha256'), 'utf8');
    const again = requireSuccess(await runExport(meta.idempotencyKey as string));
    expect(again.ok).toBe(true);
    // The export regenerates its files; it does not replay a stored result.
    expect(again.data.replayed).toBe(false);
    const after = await readFile(join(outDir, 'checksums.sha256'), 'utf8');
    expect(after).toBe(before);
  });

  it('writes a checksum file that verifies', async () => {
    requireSuccess(await runExport());
    const lines = (await readFile(join(outDir, 'checksums.sha256'), 'utf8')).trim().split('\n');
    for (const line of lines) {
      const [sha, ...pathParts] = line.split('  ');
      const full = join(outDir, ...pathParts);
      const actual = createHash('sha256').update(await readFile(full)).digest('hex');
      expect(actual).toBe(sha);
    }
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });
});
