import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type DesignState,
  DomainError,
  type EventActor,
  type EventEnvelope,
  type EventType,
  applyEvent,
  canonicalJson,
  replay,
} from '@ppp/core';
import { IntegrityError } from './errors';
import { type ChainCheck, GENESIS_HASH, type StoredEvent, computeHash, parseLog, verifyChain } from './eventlog';
import { sha256Hex } from './hash';

export interface DraftEvent {
  type: EventType;
  actor: EventActor;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
}

export interface AppendResult {
  event: StoredEvent;
  replayed: boolean;
  state: DesignState;
}

export interface LogRead {
  events: StoredEvent[];
  tornTail: boolean;
  chain: ChainCheck;
}

export interface SnapshotFile {
  schema: 'ppp-snapshot-1';
  design_id: string;
  offset: number;
  head_hash: string;
  state: DesignState;
  state_hash: string;
  created_at: string;
}

export type SnapshotStatus =
  | { status: 'none' }
  | { status: 'verified'; offset: number; stateHash: string }
  | { status: 'mismatch'; offset: number; reason: string };

export interface DesignIntegrity {
  designId: string;
  headSeq: number;
  chainOk: boolean;
  chainProblem?: string;
  tornTail: boolean;
  stateHash: string | null;
  snapshot: SnapshotStatus;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'corrupt';
  checkedDesigns: number;
  designs: DesignIntegrity[];
}

/**
 * Persists designs as hash-chained, append-only NDJSON logs, one file per design.
 * Writes to one design are serialized in-process. Reads never modify files.
 * Repairs (quarantining a torn final line) happen only on the write path.
 */
export class DesignStore {
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Projected state per design, valid while the log's signature is unchanged. Derived data only (I6). */
  private readonly projections = new Map<string, { signature: string; state: DesignState | null }>();

  constructor(readonly dir: string) {}

  logPath(designId: string): string {
    return join(this.dir, `${designId}.ndjson`);
  }

  snapshotPath(designId: string): string {
    return join(this.dir, `${designId}.snapshot.json`);
  }

  async listDesignIds(): Promise<string[]> {
    await mkdir(this.dir, { recursive: true });
    const names = await readdir(this.dir);
    return names
      .filter((name) => name.endsWith('.ndjson'))
      .map((name) => name.slice(0, -'.ndjson'.length))
      .sort();
  }

  async hasDesign(designId: string): Promise<boolean> {
    return (await readText(this.logPath(designId))) !== '';
  }

  async readLog(designId: string): Promise<LogRead> {
    const parsed = parseLog(await readText(this.logPath(designId)));
    if (parsed.badLine !== null) {
      return {
        events: parsed.events,
        tornTail: false,
        chain: {
          ok: false,
          eventCount: parsed.events.length,
          headSeq: parsed.events.length,
          headHash: parsed.events[parsed.events.length - 1]?.hash ?? GENESIS_HASH,
          problem: `line ${parsed.badLine} is not valid JSON`,
          firstBadSeq: parsed.events.length + 1,
        },
      };
    }
    return { events: parsed.events, tornTail: parsed.tornTail !== null, chain: verifyChain(parsed.events) };
  }

  /**
   * Current projected state, or null if the design does not exist. Fails closed on corruption.
   *
   * The projection is cached per design. A cached entry is used only while the log file's size
   * and modification time are unchanged, so a write from any process invalidates it. The
   * signature is read before the log, so a racing write can only cause a miss, never a stale hit.
   * verify() still reads and checks the whole log.
   */
  async loadState(designId: string): Promise<DesignState | null> {
    const signature = await this.logSignature(designId);
    const cached = this.projections.get(designId);
    if (cached && cached.signature === signature) return structuredClone(cached.state);

    const log = await this.readLog(designId);
    if (!log.chain.ok) {
      throw new IntegrityError(`design ${designId} failed its integrity check: ${log.chain.problem}`, designId);
    }
    const snapshot = await this.readValidSnapshot(designId, log.events);
    let state: DesignState | null = snapshot?.state ?? null;
    for (const event of log.events.slice(snapshot?.offset ?? 0)) {
      state = applyEvent(state, event);
    }
    this.projections.set(designId, { signature, state });
    return structuredClone(state);
  }

  /**
   * Appends one event. The transition is validated against the current state
   * before anything is written. An Idempotency-Key that was already applied
   * returns the original event with replayed = true and writes nothing.
   */
  append(designId: string, draft: DraftEvent, options: { expectedSeq?: number } = {}): Promise<AppendResult> {
    return this.serialize(designId, async () => {
      await mkdir(this.dir, { recursive: true });
      await this.repairTornTail(designId);
      const log = await this.readLog(designId);
      if (!log.chain.ok) {
        throw new IntegrityError(`refusing to write to design ${designId}: ${log.chain.problem}`, designId);
      }
      const before = replay(log.events);
      if (draft.idempotency_key !== null) {
        const prior = log.events.find((event) => event.idempotency_key === draft.idempotency_key);
        if (prior && before) return { event: prior, replayed: true, state: before };
      }
      const head = log.events.length;
      if (options.expectedSeq !== undefined && options.expectedSeq !== head) {
        throw new DomainError(
          'conflict',
          `Design ${designId} is at seq ${head}, but the request was based on seq ${options.expectedSeq}`,
          { currentSeq: head, expectedSeq: options.expectedSeq },
        );
      }
      const envelope: EventEnvelope = {
        seq: head + 1,
        ts: new Date().toISOString(),
        type: draft.type,
        actor: draft.actor,
        idempotency_key: draft.idempotency_key,
        payload: draft.payload,
      };
      const state = applyEvent(before, envelope);
      const prevHash = head === 0 ? GENESIS_HASH : log.events[head - 1].hash;
      const event: StoredEvent = { ...envelope, prev_hash: prevHash, hash: computeHash(prevHash, envelope) };
      await writeLine(this.logPath(designId), event);
      this.projections.delete(designId);
      return { event, replayed: false, state };
    });
  }

  /** Writes a snapshot of the current state, verified against a full replay. */
  snapshot(designId: string): Promise<{ offset: number; stateHash: string }> {
    return this.serialize(designId, async () => {
      const log = await this.readLog(designId);
      if (!log.chain.ok) throw new IntegrityError(`cannot snapshot ${designId}: ${log.chain.problem}`, designId);
      const state = replay(log.events);
      if (!state) throw new DomainError('not_found', `Design ${designId} does not exist`);
      const offset = log.events.length;
      const stateHash = sha256Hex(canonicalJson(state));
      const file: SnapshotFile = {
        schema: 'ppp-snapshot-1',
        design_id: designId,
        offset,
        head_hash: log.events[offset - 1].hash,
        state,
        state_hash: stateHash,
        created_at: new Date().toISOString(),
      };
      await writeAtomic(this.snapshotPath(designId), `${JSON.stringify(file, null, 2)}\n`);
      return { offset, stateHash };
    });
  }

  /** Read-only integrity check: chain, full replay hash, and snapshot consistency. */
  async verify(designId: string): Promise<DesignIntegrity> {
    const log = await this.readLog(designId);
    if (!log.chain.ok) {
      return {
        designId,
        headSeq: log.chain.headSeq,
        chainOk: false,
        chainProblem: log.chain.problem,
        tornTail: log.tornTail,
        stateHash: null,
        snapshot: { status: 'none' },
      };
    }
    const state = replay(log.events);
    return {
      designId,
      headSeq: log.events.length,
      chainOk: true,
      tornTail: log.tornTail,
      stateHash: state ? sha256Hex(canonicalJson(state)) : null,
      snapshot: await this.checkSnapshot(designId, log.events),
    };
  }

  async health(): Promise<HealthReport> {
    const ids = await this.listDesignIds();
    const designs: DesignIntegrity[] = [];
    for (const id of ids) designs.push(await this.verify(id));
    const status = designs.some((d) => !d.chainOk)
      ? 'corrupt'
      : designs.some((d) => d.tornTail || d.snapshot.status === 'mismatch')
        ? 'degraded'
        : 'healthy';
    return { status, checkedDesigns: ids.length, designs };
  }

  private async logSignature(designId: string): Promise<string> {
    try {
      const info = await stat(this.logPath(designId));
      return `${info.size}:${info.mtimeMs}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
      throw error;
    }
  }

  private serialize<T>(designId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(designId) ?? Promise.resolve();
    const run = previous.then(task);
    this.queues.set(
      designId,
      run.catch(() => undefined),
    );
    return run;
  }

  /** A final line without a newline is either finished (repair) or torn (quarantine). */
  private async repairTornTail(designId: string): Promise<void> {
    const path = this.logPath(designId);
    const text = await readText(path);
    if (text === '' || text.endsWith('\n')) return;
    const cut = text.lastIndexOf('\n') + 1;
    const tail = text.slice(cut);
    if (tail.startsWith('{')) {
      try {
        JSON.parse(tail);
        await appendFile(path, '\n', 'utf8');
        return;
      } catch {
        // Incomplete record: fall through and quarantine it.
      }
    }
    await writeFile(join(this.dir, `${designId}.torn-${Date.now()}.txt`), tail, 'utf8');
    await writeAtomic(path, text.slice(0, cut));
  }

  private async readValidSnapshot(designId: string, events: readonly StoredEvent[]): Promise<SnapshotFile | null> {
    const text = await readText(this.snapshotPath(designId));
    if (text === '') return null;
    let snap: SnapshotFile;
    try {
      snap = JSON.parse(text) as SnapshotFile;
    } catch {
      return null;
    }
    if (snap.schema !== 'ppp-snapshot-1' || snap.design_id !== designId) return null;
    if (sha256Hex(canonicalJson(snap.state)) !== snap.state_hash) return null;
    if (snap.offset < 1 || snap.offset > events.length) return null;
    if (events[snap.offset - 1].hash !== snap.head_hash) return null;
    return snap;
  }

  private async checkSnapshot(designId: string, events: readonly StoredEvent[]): Promise<SnapshotStatus> {
    const text = await readText(this.snapshotPath(designId));
    if (text === '') return { status: 'none' };
    let snap: SnapshotFile;
    try {
      snap = JSON.parse(text) as SnapshotFile;
    } catch {
      return { status: 'mismatch', offset: 0, reason: 'snapshot file is not valid JSON' };
    }
    if (sha256Hex(canonicalJson(snap.state)) !== snap.state_hash) {
      return { status: 'mismatch', offset: snap.offset, reason: 'snapshot state does not match its own hash' };
    }
    if (snap.offset < 1 || snap.offset > events.length) {
      return { status: 'mismatch', offset: snap.offset, reason: 'snapshot offset is beyond the log' };
    }
    if (events[snap.offset - 1].hash !== snap.head_hash) {
      return { status: 'mismatch', offset: snap.offset, reason: 'snapshot head hash is not in the log' };
    }
    const atOffset = replay(events.slice(0, snap.offset));
    const replayHash = atOffset ? sha256Hex(canonicalJson(atOffset)) : '';
    if (replayHash !== snap.state_hash) {
      return { status: 'mismatch', offset: snap.offset, reason: 'replaying the log to the snapshot offset gives a different state' };
    }
    return { status: 'verified', offset: snap.offset, stateHash: snap.state_hash };
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function writeLine(path: string, event: StoredEvent): Promise<void> {
  const handle = await open(path, 'a');
  try {
    await handle.appendFile(`${JSON.stringify(event)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Write to a temporary file, fsync, then rename. Readers see the old or the new file, never half of one. */
export async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp-${randomUUID()}`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}
