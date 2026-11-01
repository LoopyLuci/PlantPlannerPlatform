import { describe, expect, it } from 'vitest';
import {
  type EventEnvelope,
  DomainError,
  applyEvent,
  buildKnowledgeGraph,
  canonicalJson,
  parseCsv,
  replay,
  KnowledgeIntegrityError,
} from '../src/index';
import { FIXTURE_FILES, fixtureGraph } from './fixtures';

const actor = { id: 'tester', interface: 'test' };
function event(seq: number, type: EventEnvelope['type'], payload: Record<string, unknown>): EventEnvelope {
  return { seq, ts: '2026-10-31T00:00:00.000Z', type, actor, idempotency_key: `k${seq}`, payload };
}

const site = { name: 'Plot', widthM: 5, depthM: 5, hardinessZone: 6, sunHours: 7, soilPh: 6.5 };
const placement = { id: 'p1', speciesUrn: 'urn:ppp:species:alpha-one', x: 1, y: 1, footprintM: 0.5, pinned: false };

describe('design reducer', () => {
  it('folds create, add, update and remove into the expected state', () => {
    const state = replay([
      event(1, 'DesignCreated', { designId: 'd_x', name: 'Plot', site, placements: [] }),
      event(2, 'PlacementAdded', { placement }),
      event(3, 'PlacementUpdated', { placementId: 'p1', changes: { x: 2 }, previous: { x: 1 } }),
    ]);
    expect(state?.placements.p1.x).toBe(2);
    expect(state?.seq).toBe(3);
    const removed = applyEvent(state, event(4, 'PlacementRemoved', { placement: { ...placement, x: 2 } }));
    expect(Object.keys(removed.placements)).toEqual([]);
  });

  it('refuses a placement id that already exists', () => {
    const state = replay([
      event(1, 'DesignCreated', { designId: 'd_x', name: 'Plot', site, placements: [placement] }),
    ]);
    expect(() => applyEvent(state, event(2, 'PlacementAdded', { placement }))).toThrow(DomainError);
  });

  it('refuses changes to an archived design except the archive marker', () => {
    const state = replay([
      event(1, 'DesignCreated', { designId: 'd_x', name: 'Plot', site, placements: [] }),
      event(2, 'DesignArchived', {}),
    ]);
    expect(() => applyEvent(state, event(3, 'PlacementAdded', { placement }))).toThrow(/archived/);
  });

  it('refuses to update or remove a placement that does not exist', () => {
    const state = replay([event(1, 'DesignCreated', { designId: 'd_x', name: 'Plot', site, placements: [] })]);
    expect(() => applyEvent(state, event(2, 'PlacementUpdated', { placementId: 'nope', changes: {}, previous: {} }))).toThrow(
      /does not exist/,
    );
  });
});

describe('canonical JSON', () => {
  it('is independent of key order and drops undefined values', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3] }, u: undefined })).toBe('{"a":{"c":[3],"d":2},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});

describe('CSV parsing', () => {
  it('handles quoted commas, doubled quotes and CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });
});

describe('knowledge graph integrity', () => {
  it('builds the fixture graph with indexed traits and edges', () => {
    const kg = fixtureGraph();
    expect(kg.graphVersion).toBe('kg-test');
    expect(kg.species.size).toBe(3);
    expect(kg.edges).toHaveLength(3);
  });

  it('refuses a trait that cites an unknown source', () => {
    const files = {
      ...FIXTURE_FILES,
      traitsCsv: `${FIXTURE_FILES.traitsCsv}\nurn:ppp:species:alpha-one,mature_height_m,1,m,S-MISSING,B`,
    };
    expect(() => buildKnowledgeGraph(files)).toThrow(KnowledgeIntegrityError);
  });

  it('refuses a trait without an evidence grade', () => {
    const files = {
      ...FIXTURE_FILES,
      traitsCsv: `${FIXTURE_FILES.traitsCsv}\nurn:ppp:species:alpha-one,mature_height_m,1,m,S-B,`,
    };
    expect(() => buildKnowledgeGraph(files)).toThrow(/invalid grade/);
  });

  it('refuses an unknown trait name rather than silently keeping it', () => {
    const files = {
      ...FIXTURE_FILES,
      traitsCsv: `${FIXTURE_FILES.traitsCsv}\nurn:ppp:species:alpha-one,vibes,1,m,S-B,B`,
    };
    expect(() => buildKnowledgeGraph(files)).toThrow(/unknown trait/);
  });
});
