import type { DesignView, PlacementView } from '../api';

/**
 * The offline outbox, pure parts (ADR-0011). Nothing here touches the network or storage,
 * so the rules can be tested directly: how a queued change looks on a copy of the design,
 * and how the queue drains in order and stops at the first conflict.
 */

/** Only placement writes can be queued offline. Other writes stay online-only. */
export const OUTBOX_CAPABILITIES = ['design.add_placement', 'design.update_placement', 'design.remove_placement'] as const;
export type OutboxCapability = (typeof OUTBOX_CAPABILITIES)[number];

export function isOutboxCapability(name: string): name is OutboxCapability {
  return (OUTBOX_CAPABILITIES as readonly string[]).includes(name);
}

export interface OutboxEntry {
  /** Assigned by the store on insert; entries drain in this order. */
  id?: number;
  designId: string;
  capability: OutboxCapability;
  /** The request fields without design_id and base_seq. */
  input: Record<string, unknown>;
  /** Reused on every retry, so the server never applies the same change twice. */
  idempotencyKey: string;
  /** The sequence the change was made against, so the server can detect a conflict. */
  baseSeq: number;
  createdAt: string;
  state: 'pending' | 'conflict';
  /** Why the server refused the change, when state is 'conflict'. */
  note?: string;
}

/** A new placement id in the same shape the server accepts (`p_` plus 12 hex characters). */
export function newPlacementId(): string {
  return `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Applies one queued change to a copy of the design, the way the server would. `footprintOf`
 * gives the default footprint for a species, the same default the server uses.
 */
export function applyEntry(design: DesignView, entry: OutboxEntry, footprintOf: (urn: string) => number): DesignView {
  const input = entry.input;
  let placements: PlacementView[] = design.placements;
  if (entry.capability === 'design.add_placement') {
    const speciesUrn = String(input.species_urn);
    const placement: PlacementView = {
      id: String(input.placement_id),
      speciesUrn,
      x: Number(input.x),
      y: Number(input.y),
      footprintM: input.footprint_m === undefined ? footprintOf(speciesUrn) : Number(input.footprint_m),
      pinned: input.pinned === true,
    };
    placements = [...placements, placement];
  } else if (entry.capability === 'design.update_placement') {
    placements = placements.map((p) => {
      if (p.id !== String(input.placement_id)) return p;
      return {
        ...p,
        ...(input.species_urn !== undefined ? { speciesUrn: String(input.species_urn) } : {}),
        ...(input.x !== undefined ? { x: Number(input.x) } : {}),
        ...(input.y !== undefined ? { y: Number(input.y) } : {}),
        ...(input.footprint_m !== undefined ? { footprintM: Number(input.footprint_m) } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned === true } : {}),
      };
    });
  } else {
    placements = placements.filter((p) => p.id !== String(input.placement_id));
  }
  return { ...design, placements, seq: entry.baseSeq + 1 };
}

/** The design as the user should see it: the last server copy with every queued change applied in order. */
export function applyAll(design: DesignView, entries: OutboxEntry[], footprintOf: (urn: string) => number): DesignView {
  return entries
    .filter((e) => e.designId === design.designId)
    .reduce((current, entry) => applyEntry(current, entry, footprintOf), design);
}

/** What the server said about one replayed change. */
export type SendResult =
  | { kind: 'ok' }
  | { kind: 'unreachable' }
  | { kind: 'conflict'; message: string }
  | { kind: 'rejected'; message: string };

export type DrainOutcome = 'empty' | 'drained' | 'unreachable' | 'blocked';

/**
 * Sends queued changes in order. Stops at the first one the server cannot reach or refuses:
 * a refused change is marked as a conflict for a person to decide, and nothing after it is sent,
 * because later changes were made against a sequence that this one would change.
 */
export async function drainOutbox(
  entries: OutboxEntry[],
  send: (entry: OutboxEntry) => Promise<SendResult>,
  handlers: {
    accepted: (entry: OutboxEntry) => Promise<void>;
    refused: (entry: OutboxEntry, message: string) => Promise<void>;
  },
): Promise<DrainOutcome> {
  if (entries.length === 0) return 'empty';
  for (const entry of entries) {
    if (entry.state === 'conflict') return 'blocked';
    const result = await send(entry);
    if (result.kind === 'ok') {
      await handlers.accepted(entry);
    } else if (result.kind === 'unreachable') {
      return 'unreachable';
    } else {
      await handlers.refused(entry, result.message);
      return 'blocked';
    }
  }
  return 'drained';
}
