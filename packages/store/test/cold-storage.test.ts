import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DesignStore, FeedbackLog, exportPlainArchive, readKnowledgeGraph } from '../src/index';

/**
 * Cold-storage readability check (docs/checklists/longevity-audit.md, section 1).
 *
 * This test builds an archive, then reads it using only Node's built-in file
 * and hash functions. It imports no project code. The rules it applies are the
 * ones written in docs/DATA_FORMATS.md, so if it passes, a reader with those
 * documents can check the archive without this software.
 */

const KNOWLEDGE_DIR = join(import.meta.dirname, '..', '..', '..', 'data', 'knowledge-graph');
const RULES_FILE = join(import.meta.dirname, '..', '..', '..', 'config', 'rules', 'rules-1.0.json');
const DESIGN = 'd_0123456789abcdef';
const GENESIS = '0'.repeat(64);
const actor = { id: 'cold-reader', interface: 'test' };

/** Canonical JSON as DATA_FORMATS.md defines it: sorted keys, undefined dropped. Written independently of the project. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

interface LineRecord {
  seq: number;
  ts: string;
  type: string;
  actor: unknown;
  idempotency_key: string | null;
  payload: unknown;
  prev_hash: string;
  hash: string;
}

/** Recomputes every hash in an NDJSON chain by hand. Returns the first failure, or null. */
function checkChain(text: string): string | null {
  let prev = GENESIS;
  const lines = text.split('\n').filter((line) => line !== '');
  for (let i = 0; i < lines.length; i += 1) {
    const record = JSON.parse(lines[i]) as LineRecord;
    if (record.seq !== i + 1) return `line ${i + 1} has seq ${record.seq}`;
    if (record.prev_hash !== prev) return `seq ${record.seq} does not link back`;
    const body = canonical({
      seq: record.seq,
      ts: record.ts,
      type: record.type,
      actor: record.actor,
      idempotency_key: record.idempotency_key,
      payload: record.payload,
    });
    if (sha256(`${prev}\n${body}`) !== record.hash) return `seq ${record.seq} does not recompute`;
    prev = record.hash;
  }
  return null;
}

let root: string;
let outDir: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ppp-cold-'));
  outDir = join(root, 'archive');
  const store = new DesignStore(join(root, 'designs'));
  const feedback = new FeedbackLog(join(root, 'feedback', 'feedback.ndjson'));
  await store.append(
    DESIGN,
    {
      type: 'DesignCreated',
      actor,
      idempotency_key: 'cold-create',
      payload: {
        designId: DESIGN,
        name: 'Cold test bed',
        site: { name: 'Cold test bed', widthM: 6, depthM: 4, sunHours: 6.5, soilPh: 7.4, hardinessZone: 7 },
        placements: [],
      },
    },
    { expectedSeq: 0 },
  );
  await store.append(
    DESIGN,
    {
      type: 'PlacementAdded',
      actor,
      idempotency_key: 'cold-add',
      payload: {
        placement: {
          id: 'p_lav',
          speciesUrn: 'urn:ppp:species:lavandula-angustifolia',
          x: 1.2,
          y: 1.5,
          footprintM: 0.5,
          pinned: false,
        },
      },
    },
    { expectedSeq: 1 },
  );
  await feedback.append({
    actor,
    idempotencyKey: 'cold-feedback',
    payload: {
      id: 'fb_0123456789abcdef',
      designId: DESIGN,
      placementId: 'p_lav',
      rule: 'sun',
      reasonTag: 'site_condition_differs',
      note: 'Shade from a fence, checked by hand, a, b',
      graphVersion: 'kg-2026.10',
      ruleConfigVersion: 'rules-1.0',
      modelVersion: 'none',
    },
  });
  await exportPlainArchive({
    store,
    feedback,
    knowledgeDir: KNOWLEDGE_DIR,
    rulesFile: RULES_FILE,
    outDir,
    kg: await readKnowledgeGraph(KNOWLEDGE_DIR),
    generatedAt: '2026-11-01T00:00:00.000Z',
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('cold-storage readability (no project code)', () => {
  it('recomputes every design event hash from the documented rule', async () => {
    const text = await readFile(join(outDir, 'designs', DESIGN, 'events.ndjson'), 'utf8');
    expect(text.split('\n').filter((line) => line !== '')).toHaveLength(2);
    expect(checkChain(text)).toBeNull();
  });

  it('recomputes every feedback hash from the documented rule', async () => {
    const text = await readFile(join(outDir, 'feedback', 'feedback.ndjson'), 'utf8');
    expect(checkChain(text)).toBeNull();
    expect(text).toContain('"type":"FeedbackRecorded"');
  });

  it('verifies every file against checksums.sha256 using only SHA-256', async () => {
    const lines = (await readFile(join(outDir, 'checksums.sha256'), 'utf8')).trim().split('\n');
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      const [expected, path] = line.split('  ');
      const bytes = await readFile(join(outDir, ...path.split('/')));
      expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(expected);
    }
  });

  it('lists every file in the checksum file, so nothing is unchecked', async () => {
    const listed = new Set((await readFile(join(outDir, 'checksums.sha256'), 'utf8')).trim().split('\n').map((l) => l.split('  ')[1]));
    const walk = async (dir: string, prefix: string): Promise<string[]> => {
      const out: string[] = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
        else if (rel !== 'checksums.sha256') out.push(rel);
      }
      return out;
    };
    for (const path of await walk(outDir, '')) expect(listed.has(path), path).toBe(true);
  });

  it('reads the placements and feedback as CSV with the documented columns', async () => {
    const placements = (await readFile(join(outDir, 'designs', DESIGN, 'placements.csv'), 'utf8')).trim().split('\n');
    expect(placements[0]).toBe('placement_id,species_urn,common_name,scientific_name,x_m,y_m,footprint_m,pinned');
    expect(placements).toHaveLength(2);
    expect(placements[1].startsWith('p_lav,')).toBe(true);

    const feedback = (await readFile(join(outDir, 'feedback', 'feedback.csv'), 'utf8')).trim().split('\n');
    expect(feedback[0]).toBe(
      'feedback_id,recorded_at,actor,design_id,placement_id,rule,reason_tag,route,note,graph_version,rule_config_version,model_version',
    );
    expect(feedback[1]).toContain('site_update');
    expect(feedback[1]).toContain('"Shade from a fence, checked by hand, a, b"');
  });

  it('names every column of the knowledge graph in the schema and cites a source for every trait', async () => {
    const schema = await readFile(join(outDir, 'knowledge-graph', 'SCHEMA.md'), 'utf8');
    const traits = (await readFile(join(outDir, 'knowledge-graph', 'traits.csv'), 'utf8')).trim().split('\n');
    const header = traits[0].split(',');
    for (const column of header) expect(schema, column).toContain(column);
    const sourceCol = header.indexOf('source_id');
    const gradeCol = header.indexOf('grade');
    for (const row of traits.slice(1)) {
      const cells = row.split(',');
      expect(cells[sourceCol], row).toMatch(/^[A-Z0-9-]+$/);
      expect(['A', 'B', 'C']).toContain(cells[gradeCol]);
    }
  });

  it('keeps the rule thresholds in the archive, with the version every verdict names', async () => {
    const rules = JSON.parse(await readFile(join(outDir, 'rules', 'rules-1.0.json'), 'utf8')) as { version: string };
    expect(rules.version).toBe('rules-1.0');
  });

  it('explains the folders in the README', async () => {
    const readme = await readFile(join(outDir, 'README.md'), 'utf8');
    for (const name of ['placements.csv', 'events.ndjson', 'checksums.sha256', 'feedback.csv', 'rules/', 'SCHEMA.md']) {
      expect(readme, name).toContain(name);
    }
  });
});
