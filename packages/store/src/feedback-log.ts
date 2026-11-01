import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type EventActor, canonicalJson } from '@ppp/core';
import { IntegrityError } from './errors';
import { writeAtomic } from './design-store';
import { sha256Hex } from './hash';

/**
 * The feedback log: one hash-chained NDJSON file for every piece of feedback on
 * a verdict. It has the same guarantees as a design log (ADR-0007): append-only,
 * idempotent by Idempotency-Key, refuses to write to a broken chain, and
 * quarantines an interrupted final line on the next write.
 *
 * Hash input (durable format, documented in docs/DATA_FORMATS.md):
 *   sha256( prev_hash + "\n" + canonical_json({seq, ts, type, actor, idempotency_key, payload}) )
 * where type is always "FeedbackRecorded".
 */

export const FEEDBACK_EVENT_TYPE = 'FeedbackRecorded';
const GENESIS = '0'.repeat(64);

export interface FeedbackPayload {
  id: string;
  designId: string;
  placementId: string | null;
  rule: string;
  reasonTag: string;
  note: string;
  graphVersion: string;
  ruleConfigVersion: string;
  modelVersion: string;
}

export interface FeedbackEntry {
  seq: number;
  ts: string;
  type: typeof FEEDBACK_EVENT_TYPE;
  actor: EventActor;
  idempotency_key: string;
  payload: FeedbackPayload;
  prev_hash: string;
  hash: string;
}

export interface FeedbackRead {
  entries: FeedbackEntry[];
  tornTail: boolean;
  chainOk: boolean;
  problem?: string;
}

export function feedbackHash(prevHash: string, entry: Omit<FeedbackEntry, 'prev_hash' | 'hash'>): string {
  return sha256Hex(
    `${prevHash}\n${canonicalJson({
      seq: entry.seq,
      ts: entry.ts,
      type: entry.type,
      actor: entry.actor,
      idempotency_key: entry.idempotency_key,
      payload: entry.payload,
    })}`,
  );
}

/** The first problem in the chain, or null when every link checks out. */
export function feedbackChainProblem(entries: readonly FeedbackEntry[]): string | null {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.seq !== i + 1) return `expected seq ${i + 1} but found ${entry.seq}`;
    if (entry.prev_hash !== prev) return `seq ${entry.seq} does not link to the previous entry`;
    if (feedbackHash(prev, entry) !== entry.hash) return `seq ${entry.seq} content does not match its hash`;
    prev = entry.hash;
  }
  return null;
}

export class FeedbackLog {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly path: string) {}

  async read(): Promise<FeedbackRead> {
    const text = await readText(this.path);
    const lines = text.split('\n');
    const entries: FeedbackEntry[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === '') continue;
      try {
        entries.push(JSON.parse(line) as FeedbackEntry);
      } catch {
        if (i === lines.length - 1) return finish(entries, true);
        return { entries, tornTail: false, chainOk: false, problem: `line ${i + 1} is not valid JSON` };
      }
    }
    return finish(entries, false);
  }

  /**
   * Appends one entry. An Idempotency-Key that was already used returns the
   * original entry with replayed = true and writes nothing.
   */
  append(
    input: { actor: EventActor; idempotencyKey: string; payload: FeedbackPayload },
  ): Promise<{ entry: FeedbackEntry; replayed: boolean }> {
    const run = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await this.repairTornTail();
      const log = await this.read();
      if (!log.chainOk) throw new IntegrityError(`refusing to write to the feedback log: ${log.problem}`, 'feedback');
      const prior = log.entries.find((entry) => entry.idempotency_key === input.idempotencyKey);
      if (prior) return { entry: prior, replayed: true };
      const head = log.entries.length;
      const draft = {
        seq: head + 1,
        ts: new Date().toISOString(),
        type: FEEDBACK_EVENT_TYPE,
        actor: input.actor,
        idempotency_key: input.idempotencyKey,
        payload: input.payload,
      } as const;
      const prevHash = head === 0 ? GENESIS : log.entries[head - 1].hash;
      const entry: FeedbackEntry = { ...draft, prev_hash: prevHash, hash: feedbackHash(prevHash, draft) };
      await writeLine(this.path, entry);
      return { entry, replayed: false };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** A final line without a newline is either finished (repair) or torn (quarantine). */
  private async repairTornTail(): Promise<void> {
    const text = await readText(this.path);
    if (text === '' || text.endsWith('\n')) return;
    const cut = text.lastIndexOf('\n') + 1;
    const tail = text.slice(cut);
    if (tail.startsWith('{')) {
      try {
        JSON.parse(tail);
        await appendFile(this.path, '\n', 'utf8');
        return;
      } catch {
        // Incomplete entry: fall through and quarantine it.
      }
    }
    await writeFile(join(dirname(this.path), `feedback.torn-${Date.now()}-${randomUUID().slice(0, 8)}.txt`), tail, 'utf8');
    await writeAtomic(this.path, text.slice(0, cut));
  }
}

function finish(entries: FeedbackEntry[], tornTail: boolean): FeedbackRead {
  const problem = feedbackChainProblem(entries);
  return problem === null
    ? { entries, tornTail, chainOk: true }
    : { entries, tornTail, chainOk: false, problem };
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function writeLine(path: string, entry: FeedbackEntry): Promise<void> {
  const handle = await open(path, 'a');
  try {
    await handle.appendFile(`${JSON.stringify(entry)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}
