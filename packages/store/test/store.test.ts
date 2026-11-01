import { mkdtemp, readFile, readdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError, type DesignState } from '@ppp/core';
import {
  DesignStore,
  GENESIS_HASH,
  IntegrityError,
  computeHash,
  FeedbackLog,
  exportPlainArchive,
  parseLog,
  readKnowledgeGraph,
  sha256Hex,
  verifyChain,
  type DraftEvent,
  type StoredEvent,
} from '../src/index';
import { canonicalJson } from '@ppp/core';

const KNOWLEDGE_DIR = join(import.meta.dirname, '..', '..', '..', 'data', 'knowledge-graph');
const RULES_FILE = join(import.meta.dirname, '..', '..', '..', 'config', 'rules', 'rules-1.0.json');
const actor = { id: 'tester', interface: 'test' };

function createDraft(key: string, name = 'Plot'): DraftEvent {
  return {
    type: 'DesignCreated',
    actor,
    idempotency_key: key,
    payload: {
      designId: 'd_0123456789abcdef',
      name,
      site: { name, widthM: 5, depthM: 5 },
      placements: [],
    },
  };
}

function addDraft(key: string, id: string, x = 1): DraftEvent {
  return {
    type: 'PlacementAdded',
    actor,
    idempotency_key: key,
    payload: {
      placement: { id, speciesUrn: 'urn:ppp:species:alpha-one', x, y: 1, footprintM: 0.5, pinned: false },
    },
  };
}

const DESIGN = 'd_0123456789abcdef';
let root: string;
let store: DesignStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ppp-store-'));
  store = new DesignStore(join(root, 'designs'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('hash-chained event log', () => {
  it('verifies a chain built by the store', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    const log = await store.readLog(DESIGN);
    expect(log.chain.ok).toBe(true);
    expect(log.chain.headSeq).toBe(2);
  });

  it('detects an edited event', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    const path = store.logPath(DESIGN);
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replace('"x":1', '"x":9'), 'utf8');
    const log = await store.readLog(DESIGN);
    expect(log.chain.ok).toBe(false);
    expect(log.chain.firstBadSeq).toBe(2);
  });

  it('detects a deleted middle event', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    await store.append(DESIGN, addDraft('k2', 'p2'));
    const lines = (await readFile(store.logPath(DESIGN), 'utf8')).trim().split('\n');
    await writeFile(store.logPath(DESIGN), `${lines[0]}\n${lines[2]}\n`, 'utf8');
    expect((await store.readLog(DESIGN)).chain.ok).toBe(false);
  });

  it('reports a torn final line without treating it as part of the chain', () => {
    const parsed = parseLog('{"seq":1}\n{"seq":2');
    expect(parsed.tornTail).toBe('{"seq":2');
    expect(parsed.badLine).toBeNull();
  });

  it('reports corruption in the middle of the file as a bad line', () => {
    const parsed = parseLog('{"seq":1}\nnot json\n{"seq":3}\n');
    expect(parsed.badLine).toBe(2);
  });

  it('computes the same hash for the same content', () => {
    const event = {
      seq: 1,
      ts: 't',
      type: 'DesignCreated' as const,
      actor,
      idempotency_key: 'k',
      payload: { b: 1, a: 2 },
    };
    const expected = sha256Hex(`${GENESIS_HASH}\n${canonicalJson({ ...event, payload: { a: 2, b: 1 } })}`);
    expect(computeHash(GENESIS_HASH, event)).toBe(expected);
  });

  it('verifies an empty chain as healthy', () => {
    expect(verifyChain([]).ok).toBe(true);
  });
});

describe('design store writes', () => {
  it('returns the original event for a repeated idempotency key without writing again', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    const first = await store.append(DESIGN, addDraft('same', 'p1'));
    const second = await store.append(DESIGN, addDraft('same', 'p2'));
    expect(second.replayed).toBe(true);
    expect(second.event.seq).toBe(first.event.seq);
    expect((await store.readLog(DESIGN)).events).toHaveLength(2);
  });

  it('rejects a stale expectedSeq with a conflict that reports the current sequence', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    const attempt = store.append(DESIGN, addDraft('k2', 'p2'), { expectedSeq: 1 });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: 'conflict', details: { currentSeq: 2 } });
  });

  it('keeps a contiguous, valid chain under concurrent appends', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.append(DESIGN, addDraft(`c${i}`, `p${i}`, 0.1 * i))));
    const log = await store.readLog(DESIGN);
    expect(log.events.map((e) => e.seq)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(log.chain.ok).toBe(true);
    const state = await store.loadState(DESIGN);
    expect(Object.keys(state?.placements ?? {})).toHaveLength(25);
  });

  it('validates a transition before writing it', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await expect(store.append(DESIGN, addDraft('k1', 'p1'))).resolves.toBeDefined();
    await expect(store.append(DESIGN, addDraft('k2', 'p1'))).rejects.toBeInstanceOf(DomainError);
    expect((await store.readLog(DESIGN)).events).toHaveLength(2);
  });

  it('quarantines an incomplete final line on the next write, and keeps the chain valid', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await appendFile(store.logPath(DESIGN), '{"seq":2,"ts":"2026', 'utf8');
    expect((await store.readLog(DESIGN)).tornTail).toBe(true);
    await store.append(DESIGN, addDraft('k1', 'p1'));
    const files = await readdir(join(root, 'designs'));
    expect(files.some((f) => f.includes('.torn-'))).toBe(true);
    expect((await store.readLog(DESIGN)).chain.ok).toBe(true);
  });

  it('refuses to write to a design whose log fails verification', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    const text = await readFile(store.logPath(DESIGN), 'utf8');
    await writeFile(store.logPath(DESIGN), text.replace('"name":"Plot"', '"name":"Forged"'), 'utf8');
    await expect(store.append(DESIGN, addDraft('k1', 'p1'))).rejects.toBeInstanceOf(IntegrityError);
    await expect(store.loadState(DESIGN)).rejects.toBeInstanceOf(IntegrityError);
  });
});

describe('projection cache', () => {
  it('serves a repeated read without re-reading the log', async () => {
    await store.append(DESIGN, createDraft('k-create'), { expectedSeq: 0 });
    await store.loadState(DESIGN);
    const spy = vi.spyOn(store, 'readLog');
    const state = await store.loadState(DESIGN);
    expect(spy).not.toHaveBeenCalled();
    expect(state?.seq).toBe(1);
  });

  it('sees a write made through another store instance on the same directory', async () => {
    await store.append(DESIGN, createDraft('k-create'), { expectedSeq: 0 });
    await store.loadState(DESIGN);
    await new DesignStore(store.dir).append(DESIGN, addDraft('k-add', 'p_1'), { expectedSeq: 1 });
    const state = await store.loadState(DESIGN);
    expect(state?.seq).toBe(2);
    expect(Object.keys(state?.placements ?? {})).toEqual(['p_1']);
  });

  it('returns a copy, so a caller cannot change the cached state', async () => {
    await store.append(DESIGN, createDraft('k-create'), { expectedSeq: 0 });
    const first = await store.loadState(DESIGN);
    if (first) first.name = 'changed by caller';
    expect((await store.loadState(DESIGN))?.name).toBe('Plot');
  });
});

describe('snapshots and self-check', () => {
  it('restores the same state from a snapshot plus tail as from a full replay', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    await store.snapshot(DESIGN);
    await store.append(DESIGN, addDraft('k2', 'p2', 3));
    const fromSnapshot = await store.loadState(DESIGN);
    await rm(store.snapshotPath(DESIGN));
    const fromReplay = await store.loadState(DESIGN);
    expect(canonicalJson(fromSnapshot)).toBe(canonicalJson(fromReplay));
  });

  it('verifies a healthy snapshot', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.snapshot(DESIGN);
    const integrity = await store.verify(DESIGN);
    expect(integrity.snapshot.status).toBe('verified');
  });

  it('flags a snapshot whose state was edited', async () => {
    await store.append(DESIGN, createDraft('k0', 'Plot'), { expectedSeq: 0 });
    await store.snapshot(DESIGN);
    const text = await readFile(store.snapshotPath(DESIGN), 'utf8');
    await writeFile(store.snapshotPath(DESIGN), text.replace('"name": "Plot"', '"name": "Edited"'), 'utf8');
    const integrity = await store.verify(DESIGN);
    expect(integrity.snapshot.status).toBe('mismatch');
  });

  it('reports a corrupt design as corrupt in the health report', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    const text = await readFile(store.logPath(DESIGN), 'utf8');
    await writeFile(store.logPath(DESIGN), text.replace('"name":"Plot"', '"name":"Forged"'), 'utf8');
    const report = await store.health();
    expect(report.status).toBe('corrupt');
  });

  it('reports an empty data directory as healthy', async () => {
    expect((await store.health()).status).toBe('healthy');
  });
});

describe('plain-text archive', () => {
  it('exports readable files with checksums that verify', async () => {
    await store.append(DESIGN, createDraft('k0'), { expectedSeq: 0 });
    await store.append(DESIGN, addDraft('k1', 'p1'));
    const kg = await readKnowledgeGraph(KNOWLEDGE_DIR);
    const outDir = join(root, 'archive');
    const summary = await exportPlainArchive({
      store,
      feedback: new FeedbackLog(join(root, 'feedback', 'feedback.ndjson')),
      knowledgeDir: KNOWLEDGE_DIR,
      rulesFile: RULES_FILE,
      outDir,
      kg,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });
    expect(summary.designs).toBe(1);
    const checksums = (await readFile(join(outDir, 'checksums.sha256'), 'utf8')).trim().split('\n');
    for (const line of checksums) {
      const [expected, path] = line.split('  ');
      const bytes = await readFile(join(outDir, ...path.split('/')));
      expect(sha256Hex(bytes.toString('utf8'))).toBe(expected);
    }
    const csv = await readFile(join(outDir, 'designs', DESIGN, 'placements.csv'), 'utf8');
    expect(csv.split('\n')[0]).toBe('placement_id,species_urn,common_name,scientific_name,x_m,y_m,footprint_m,pinned');
    // A species that is not in the graph still exports, with its names left blank.
    expect(csv).toContain('p1,urn:ppp:species:alpha-one,,,1,1,0.5,false');
  });
});

describe('knowledge graph on disk', () => {
  it('loads the seed graph, and every trait and edge cites a known source', async () => {
    const kg = await readKnowledgeGraph(KNOWLEDGE_DIR);
    expect(kg.graphVersion).toBe('kg-2026.10');
    expect(kg.species.size).toBeGreaterThanOrEqual(12);
    for (const traits of kg.traits.values()) {
      for (const trait of Object.values(traits)) {
        expect(kg.sources.has(trait?.sourceId ?? '')).toBe(true);
      }
    }
    for (const edge of kg.edges) {
      expect(kg.sources.has(edge.sourceId)).toBe(true);
      expect(['A', 'B', 'C']).toContain(edge.grade);
    }
  });
});

export type { DesignState, StoredEvent };
