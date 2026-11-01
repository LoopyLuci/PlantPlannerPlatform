import { type EventEnvelope, canonicalJson } from '@ppp/core';
import { sha256Hex } from './hash';

/**
 * The append-only, hash-chained event log. Each line of a design's .ndjson file
 * is one event. Its hash covers its own content and the previous event's hash,
 * so editing, reordering, or deleting any line breaks verification.
 *
 * Hash input (durable format, documented in docs/DATA_FORMATS.md):
 *   sha256( prev_hash + "\n" + canonical_json({seq, ts, type, actor, idempotency_key, payload}) )
 */

export const GENESIS_HASH = '0'.repeat(64);

export interface StoredEvent extends EventEnvelope {
  prev_hash: string;
  hash: string;
}

export function computeHash(prevHash: string, event: EventEnvelope): string {
  const body = canonicalJson({
    seq: event.seq,
    ts: event.ts,
    type: event.type,
    actor: event.actor,
    idempotency_key: event.idempotency_key,
    payload: event.payload,
  });
  return sha256Hex(`${prevHash}\n${body}`);
}

export interface ParsedLog {
  events: StoredEvent[];
  /** An incomplete final line left by an interrupted write. Not part of the chain. */
  tornTail: string | null;
  /** 1-based line number of a corrupt line that is not the final line. */
  badLine: number | null;
}

export function parseLog(text: string): ParsedLog {
  const lines = text.split('\n');
  const events: StoredEvent[] = [];
  let tornTail: string | null = null;
  let badLine: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '') continue;
    const isLast = i === lines.length - 1;
    try {
      events.push(JSON.parse(line) as StoredEvent);
    } catch {
      if (isLast) {
        tornTail = line;
      } else {
        badLine = i + 1;
        break;
      }
    }
  }
  return { events, tornTail, badLine };
}

export interface ChainCheck {
  ok: boolean;
  eventCount: number;
  headSeq: number;
  headHash: string;
  problem?: string;
  firstBadSeq?: number;
}

export function verifyChain(events: readonly StoredEvent[]): ChainCheck {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const fail = (problem: string): ChainCheck => ({
      ok: false,
      eventCount: events.length,
      headSeq: i,
      headHash: prev,
      problem,
      firstBadSeq: event.seq,
    });
    if (event.seq !== i + 1) return fail(`expected seq ${i + 1} but found ${event.seq}`);
    if (event.prev_hash !== prev) return fail(`seq ${event.seq} does not link to the previous event`);
    if (computeHash(prev, event) !== event.hash) return fail(`seq ${event.seq} content does not match its hash`);
    prev = event.hash;
  }
  return { ok: true, eventCount: events.length, headSeq: events.length, headHash: prev };
}
