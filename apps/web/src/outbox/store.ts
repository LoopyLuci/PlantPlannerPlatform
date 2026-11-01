import type { DesignView, EvaluationView } from '../api';
import type { OutboxEntry } from './logic';

/**
 * Browser storage for the outbox (ADR-0011): queued changes, and the last copy of each design,
 * its checks and the species list, so the editor can open with the server down.
 *
 * This is per-browser state, not the design log. Every call is wrapped: when storage is missing,
 * blocked or full, `available` is false and writes fall back to online-only.
 */

const DB_NAME = 'ppp-outbox';
const DB_VERSION = 1;

export interface CachedDesign {
  design: DesignView;
  evaluation: EvaluationView | null;
  savedAt: string;
}

export interface OutboxStore {
  available: boolean;
  list(): Promise<OutboxEntry[]>;
  add(entry: OutboxEntry): Promise<number | null>;
  update(entry: OutboxEntry): Promise<void>;
  remove(id: number): Promise<void>;
  removeDesign(designId: string): Promise<void>;
  getDesign(designId: string): Promise<CachedDesign | null>;
  putDesign(cached: CachedDesign): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  putMeta(key: string, value: unknown): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('designId', 'designId');
      }
      if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'designId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The outbox database is blocked by another window.'));
  });
}

const UNAVAILABLE: OutboxStore = {
  available: false,
  list: async () => [],
  add: async () => null,
  update: async () => undefined,
  remove: async () => undefined,
  removeDesign: async () => undefined,
  getDesign: async () => null,
  putDesign: async () => undefined,
  getMeta: async () => null,
  putMeta: async () => undefined,
};

/** Opens the outbox. Resolves to an unavailable store when IndexedDB cannot be used. */
export async function openOutbox(): Promise<OutboxStore> {
  let db: IDBDatabase;
  try {
    if (typeof indexedDB === 'undefined') return UNAVAILABLE;
    db = await open();
  } catch {
    return UNAVAILABLE;
  }

  const tx = <T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) =>
    request(run(db.transaction(store, mode).objectStore(store)));

  const list = async () => {
    const all = await tx<OutboxEntry[]>('entries', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  };

  return {
    available: true,
    list,
    async add(entry) {
      const { id: _ignored, ...rest } = entry;
      return Number(await tx<IDBValidKey>('entries', 'readwrite', (s) => s.add(rest)));
    },
    async update(entry) {
      await tx('entries', 'readwrite', (s) => s.put(entry));
    },
    async remove(id) {
      await tx('entries', 'readwrite', (s) => s.delete(id));
    },
    async removeDesign(designId) {
      const all = await list();
      const doomed = all.filter((e) => e.designId === designId && e.id !== undefined);
      const t = db.transaction('entries', 'readwrite');
      for (const entry of doomed) t.objectStore('entries').delete(entry.id as number);
      await new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async getDesign(designId) {
      return (await tx<CachedDesign | undefined>('designs', 'readonly', (s) => s.get(designId))) ?? null;
    },
    async putDesign(cached) {
      await tx('designs', 'readwrite', (s) => s.put({ ...cached, designId: cached.design.designId }));
    },
    async getMeta<T>(key: string) {
      return ((await tx<T | undefined>('meta', 'readonly', (s) => s.get(key))) ?? null) as T | null;
    },
    async putMeta(key, value) {
      await tx('meta', 'readwrite', (s) => s.put(value, key));
    },
  };
}

