import { mkdtemp, readFile, readdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FeedbackLog, type FeedbackPayload, IntegrityError } from '../src/index';

const actor = { id: 'tester', interface: 'test' };

function payload(id: string, note = 'Checked by hand'): FeedbackPayload {
  return {
    id,
    designId: 'd_0123456789abcdef',
    placementId: 'p_1',
    rule: 'soil_ph',
    reasonTag: 'data_wrong',
    note,
    graphVersion: 'kg-2026.10',
    ruleConfigVersion: 'rules-1.0',
    modelVersion: 'none',
  };
}

let root: string;
let log: FeedbackLog;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ppp-feedback-'));
  log = new FeedbackLog(join(root, 'feedback', 'feedback.ndjson'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('feedback log', () => {
  it('appends a chained entry and reads it back as healthy', async () => {
    const first = await log.append({ actor, idempotencyKey: 'k1', payload: payload('fb_1') });
    await log.append({ actor, idempotencyKey: 'k2', payload: payload('fb_2') });
    const read = await log.read();
    expect(read.chainOk).toBe(true);
    expect(read.entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(read.entries[1].prev_hash).toBe(first.entry.hash);
  });

  it('returns the original entry for a repeated key and writes nothing', async () => {
    await log.append({ actor, idempotencyKey: 'k1', payload: payload('fb_1') });
    const again = await log.append({ actor, idempotencyKey: 'k1', payload: payload('fb_1', 'different text') });
    expect(again.replayed).toBe(true);
    expect((await log.read()).entries).toHaveLength(1);
  });

  it('detects an edited note as a broken chain, and refuses to write to it', async () => {
    await log.append({ actor, idempotencyKey: 'k1', payload: payload('fb_1') });
    const text = await readFile(log.path, 'utf8');
    await writeFile(log.path, text.replace('Checked by hand', 'Edited later'), 'utf8');
    const read = await log.read();
    expect(read.chainOk).toBe(false);
    await expect(log.append({ actor, idempotencyKey: 'k2', payload: payload('fb_2') })).rejects.toBeInstanceOf(IntegrityError);
  });

  it('quarantines an interrupted final line on the next write, and keeps the chain valid', async () => {
    await log.append({ actor, idempotencyKey: 'k1', payload: payload('fb_1') });
    await appendFile(log.path, '{"seq":2,"ts":"2026', 'utf8');
    expect((await log.read()).tornTail).toBe(true);
    await log.append({ actor, idempotencyKey: 'k2', payload: payload('fb_2') });
    const read = await log.read();
    expect(read.tornTail).toBe(false);
    expect(read.chainOk).toBe(true);
    expect(read.entries).toHaveLength(2);
    const quarantined = (await readdir(join(root, 'feedback'))).filter((name) => name.startsWith('feedback.torn-'));
    expect(quarantined).toHaveLength(1);
  });

  it('keeps a contiguous chain under concurrent appends', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => log.append({ actor, idempotencyKey: `c${i}`, payload: payload(`fb_${i}`) })));
    const read = await log.read();
    expect(read.chainOk).toBe(true);
    expect(read.entries.map((e) => e.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});
