import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_REASON_TAGS, FEEDBACK_ROUTES, RULE_NAMES } from '@ppp/core';
import { CAPABILITIES } from '@ppp/registry';
import {
  type ServiceContext,
  HANDLERS,
  createContext,
  dispatch,
  type Envelope,
} from '../src/index';

const KNOWLEDGE_DIR = join(import.meta.dirname, '..', '..', '..', 'data', 'knowledge-graph');
const meta = (key: string | null = null) => ({ interface: 'test', actorId: 'tester', idempotencyKey: key });

let root: string;
let ctx: ServiceContext;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ppp-services-'));
  ctx = await createContext({ dataDir: root, knowledgeDir: KNOWLEDGE_DIR, now: () => new Date('2026-10-31T00:00:00Z') });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function expectOk(envelope: Envelope): Record<string, unknown> {
  if (!envelope.ok) throw new Error(`expected ok, got ${envelope.error.code}: ${envelope.error.message}`);
  return envelope.data;
}

describe('capability wiring', () => {
  it('has exactly one handler for every registered capability', () => {
    expect(Object.keys(HANDLERS).sort()).toEqual(CAPABILITIES.map((c) => c.id).sort());
  });

  it('stamps every envelope with the version triple, including failures', async () => {
    const ok = await dispatch(ctx, 'platform.get_health', {}, meta());
    const bad = await dispatch(ctx, 'plants.search', { limit: 0 }, meta());
    for (const envelope of [ok, bad]) {
      expect(envelope.version).toEqual({ modelVersion: 'none', graphVersion: 'kg-2026.10', ruleConfigVersion: 'rules-1.0' });
    }
  });

  it('answers unknown capabilities and invalid input with stable error codes', async () => {
    const unknown = await dispatch(ctx, 'nope.nothing', {}, meta());
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('unknown_capability');
    const invalid = await dispatch(ctx, 'plants.search', { limit: 'ten' }, meta());
    if (invalid.ok) throw new Error('expected failure');
    expect(invalid.error.code).toBe('validation_error');
    expect(invalid.error.issues?.[0].path).toBe('limit');
  });
});

describe('plant knowledge', () => {
  it('searches by name and filters by layer', async () => {
    const data = expectOk(await dispatch(ctx, 'plants.search', { query: 'tomato' }, meta()));
    expect(data.count).toBe(1);
    const layered = expectOk(await dispatch(ctx, 'plants.search', { guild_layer: 'canopy' }, meta()));
    expect((layered.items as { guildLayer: string }[]).every((i) => i.guildLayer === 'canopy')).toBe(true);
  });

  it('returns a profile whose every trait cites a source, and lists unknown traits explicitly', async () => {
    const data = expectOk(await dispatch(ctx, 'plants.get_profile', { urn: 'urn:ppp:species:ocimum-basilicum' }, meta()));
    const traits = data.traits as { sourceId: string; grade: string }[];
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every((t) => t.sourceId && t.grade)).toBe(true);
    expect(data.unknownTraits).toEqual(expect.arrayContaining(['hardiness_min', 'hardiness_max']));
  });

  it('reports a missing species as not_found', async () => {
    const result = await dispatch(ctx, 'plants.get_profile', { urn: 'urn:ppp:species:not-a-plant' }, meta());
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('not_found');
  });
});

describe('design lifecycle', () => {
  let designId = '';
  const key = 'lifecycle-create-1';

  it('refuses a write without an Idempotency-Key', async () => {
    const result = await dispatch(ctx, 'design.create', { name: 'No key' }, meta(null));
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('idempotency_key_required');
  });

  it('creates a starter garden, and a retry with the same key creates nothing new', async () => {
    const first = expectOk(await dispatch(ctx, 'design.create', { name: 'Garden', template: 'starter_pollinator' }, meta(key)));
    designId = first.designId as string;
    expect(first.replayed).toBe(false);
    const second = expectOk(await dispatch(ctx, 'design.create', { name: 'Garden', template: 'starter_pollinator' }, meta(key)));
    expect(second.designId).toBe(designId);
    expect(second.replayed).toBe(true);
    const list = expectOk(await dispatch(ctx, 'design.list', {}, meta()));
    expect((list.designs as unknown[]).length).toBe(1);
  });

  it('evaluates the starter with cited warnings and a cited companion relationship', async () => {
    const evaluation = expectOk(await dispatch(ctx, 'design.evaluate', { design_id: designId }, meta()));
    const verdicts = evaluation.verdicts as { rule: string; status: string; sourceId?: string }[];
    expect(verdicts.some((v) => v.rule === 'soil_ph' && v.status === 'warn')).toBe(true);
    expect(verdicts.some((v) => v.rule === 'companion' && v.sourceId)).toBe(true);
  });

  it('adds, moves and undoes a placement, each with a stale-safe base_seq', async () => {
    const design = expectOk(await dispatch(ctx, 'design.get', { design_id: designId }, meta()));
    const seq = design.seq as number;
    const added = expectOk(
      await dispatch(
        ctx,
        'design.add_placement',
        { design_id: designId, species_urn: 'urn:ppp:species:tagetes-patula', x: 5.5, y: 3.5, base_seq: seq },
        meta('add-1'),
      ),
    );
    const placement = added.placement as { id: string; x: number };
    const moved = expectOk(
      await dispatch(
        ctx,
        'design.update_placement',
        { design_id: designId, placement_id: placement.id, x: 5.2, base_seq: added.seq },
        meta('move-1'),
      ),
    );
    expect(moved.changed).toBe(true);
    const unchanged = expectOk(
      await dispatch(ctx, 'design.update_placement', { design_id: designId, placement_id: placement.id, x: 5.2 }, meta('move-2')),
    );
    expect(unchanged.changed).toBe(false);
    expect(unchanged.seq).toBe(moved.seq);
  });

  it('returns a conflict for a stale base_seq and never writes', async () => {
    const result = await dispatch(
      ctx,
      'design.add_placement',
      { design_id: designId, species_urn: 'urn:ppp:species:tagetes-patula', x: 1, y: 1, base_seq: 0 },
      meta('stale-1'),
    );
    if (result.ok) throw new Error('expected conflict');
    expect(result.error.code).toBe('conflict');
    expect(result.error.details).toMatchObject({ currentSeq: expect.any(Number) });
  });

  it('removes a placement and can restore it under the same id', async () => {
    const design = expectOk(await dispatch(ctx, 'design.get', { design_id: designId }, meta()));
    const target = (design.placements as { id: string; speciesUrn: string; x: number; y: number; footprintM: number }[])[0];
    const removed = expectOk(
      await dispatch(ctx, 'design.remove_placement', { design_id: designId, placement_id: target.id }, meta('remove-1')),
    );
    expect(removed.removed).toBeDefined();
    const restored = expectOk(
      await dispatch(
        ctx,
        'design.add_placement',
        {
          design_id: designId,
          species_urn: target.speciesUrn,
          x: target.x,
          y: target.y,
          footprint_m: target.footprintM,
          placement_id: target.id,
        },
        meta('restore-1'),
      ),
    );
    expect((restored.placement as { id: string }).id).toBe(target.id);
  });

  it('keeps coordinates inside the site and rejects malformed ids', async () => {
    const outside = await dispatch(
      ctx,
      'design.add_placement',
      { design_id: designId, species_urn: 'urn:ppp:species:tagetes-patula', x: 99, y: 1 },
      meta('outside-1'),
    );
    if (outside.ok) throw new Error('expected validation failure');
    expect(outside.error.code).toBe('validation_error');

    const traversal = await dispatch(ctx, 'design.get', { design_id: '../../etc/passwd' }, meta());
    if (traversal.ok) throw new Error('expected validation failure');
    expect(traversal.error.code).toBe('validation_error');

    const proto = await dispatch(
      ctx,
      'design.add_placement',
      { design_id: designId, species_urn: 'urn:ppp:species:tagetes-patula', x: 1, y: 1, placement_id: '__proto__' },
      meta('proto-1'),
    );
    if (proto.ok) throw new Error('expected validation failure');
    expect(proto.error.code).toBe('validation_error');
  });

  it('suggests candidates with reasons for everything rejected', async () => {
    const suggestion = expectOk(await dispatch(ctx, 'placement.suggest', { design_id: designId, x: 2, y: 3, limit: 4 }, meta()));
    expect((suggestion.candidates as unknown[]).length).toBeGreaterThan(0);
    expect((suggestion.rejected as { reason: string }[]).every((r) => r.reason.length > 0)).toBe(true);
  });

  it('archives only with explicit confirmation, and hides the design by default', async () => {
    const refused = await dispatch(ctx, 'design.archive', { design_id: designId, confirm: false }, meta('archive-0'));
    if (refused.ok) throw new Error('expected refusal');
    expect(refused.error.code).toBe('confirmation_required');
    expectOk(await dispatch(ctx, 'design.archive', { design_id: designId, confirm: true }, meta('archive-1')));
    const visible = expectOk(await dispatch(ctx, 'design.list', {}, meta()));
    expect(visible.designs).toEqual([]);
    const all = expectOk(await dispatch(ctx, 'design.list', { include_archived: true }, meta()));
    expect((all.designs as unknown[]).length).toBe(1);
  });

  it('keeps the full history, including the archive marker', async () => {
    const history = expectOk(await dispatch(ctx, 'design.history', { design_id: designId }, meta()));
    const types = (history.events as { type: string }[]).map((e) => e.type);
    expect(types[0]).toBe('DesignCreated');
    expect(types.at(-1)).toBe('DesignArchived');
  });

  it('verifies the design as healthy', async () => {
    const verified = expectOk(await dispatch(ctx, 'design.verify', { design_id: designId }, meta()));
    expect(verified.status).toBe('healthy');
  });
});

describe('feedback on verdicts', () => {
  let designId = '';
  let placementId = '';
  let seqBefore = 0;

  it('records feedback, routes it to a person, and leaves the design unchanged', async () => {
    const created = expectOk(await dispatch(ctx, 'design.create', { name: 'Feedback bed', template: 'starter_pollinator' }, meta('fb-design')));
    designId = created.designId as string;
    const design = expectOk(await dispatch(ctx, 'design.get', { design_id: designId }, meta()));
    placementId = (design.placements as { id: string }[])[0].id;
    seqBefore = design.seq as number;

    const recorded = expectOk(
      await dispatch(
        ctx,
        'feedback.record',
        {
          design_id: designId,
          placement_id: placementId,
          rule: 'sun',
          reason_tag: 'site_condition_differs',
          note: 'The tree on the north side was removed last month',
        },
        meta('fb-1'),
      ),
    );
    expect(recorded.replayed).toBe(false);
    expect(recorded.route).toEqual({
      route: 'site_update',
      humanActionRequired: true,
      reason: expect.any(String),
    });
    const after = expectOk(await dispatch(ctx, 'design.get', { design_id: designId }, meta()));
    expect(after.seq).toBe(seqBefore);
  });

  it('returns the original entry for a repeated key, and writes nothing new', async () => {
    const again = expectOk(
      await dispatch(ctx, 'feedback.record', { design_id: designId, rule: 'sun', reason_tag: 'other' }, meta('fb-1')),
    );
    expect(again.replayed).toBe(true);
    const list = expectOk(await dispatch(ctx, 'feedback.list', { design_id: designId }, meta()));
    expect(list.count).toBe(1);
  });

  it('refuses a placement that is not on the design, and a rule that does not exist', async () => {
    const unknownPlacement = await dispatch(
      ctx,
      'feedback.record',
      { design_id: designId, placement_id: 'p_missing', rule: 'sun', reason_tag: 'other' },
      meta('fb-2'),
    );
    expect(unknownPlacement.ok).toBe(false);
    if (!unknownPlacement.ok) expect(unknownPlacement.error.code).toBe('not_found');

    const unknownRule = await dispatch(ctx, 'feedback.record', { design_id: designId, rule: 'vibes', reason_tag: 'other' }, meta('fb-3'));
    expect(unknownRule.ok).toBe(false);
    if (!unknownRule.ok) expect(unknownRule.error.code).toBe('validation_error');
  });

  it('lists feedback filtered by route, with the version triple on each entry', async () => {
    await dispatch(ctx, 'feedback.record', { design_id: designId, rule: 'companion', reason_tag: 'data_wrong', note: 'Source disagrees' }, meta('fb-4'));
    const curation = expectOk(await dispatch(ctx, 'feedback.list', { route: 'curation_queue' }, meta()));
    expect(curation.count).toBe(1);
    const [item] = curation.items as Record<string, unknown>[];
    expect(item).toMatchObject({ rule: 'companion', reasonTag: 'data_wrong', humanActionRequired: true, graphVersion: 'kg-2026.10' });
    expect(item.ruleConfigVersion).toBe('rules-1.0');
  });

  it('keeps the registry enum lists equal to the core lists', () => {
    const enumOf = (capability: string, field: string) =>
      CAPABILITIES.find((c) => c.id === capability)?.input[field].enum;
    expect(enumOf('feedback.record', 'rule')).toEqual([...RULE_NAMES]);
    expect(enumOf('feedback.record', 'reason_tag')).toEqual([...FEEDBACK_REASON_TAGS]);
    expect(enumOf('feedback.list', 'route')).toEqual([...FEEDBACK_ROUTES]);
  });
});
