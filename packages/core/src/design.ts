import { DomainError } from './errors';

/**
 * The design projection and the event reducer. A design is a fold over its
 * append-only event log: applyEvent(state, event) is the only way state changes.
 * Every event is validated here before it can be written (see the store).
 */

export interface SiteState {
  name: string;
  widthM: number;
  depthM: number;
  /** Undefined means "unknown". Rules report unknown; they never assume a value. */
  hardinessZone?: number;
  sunHours?: number;
  soilPh?: number;
}

export interface PlacementState {
  id: string;
  speciesUrn: string;
  x: number;
  y: number;
  footprintM: number;
  pinned: boolean;
}

export interface DesignState {
  designId: string;
  name: string;
  site: SiteState;
  placements: Record<string, PlacementState>;
  archived: boolean;
  seq: number;
}

export const EVENT_TYPES = [
  'DesignCreated',
  'SiteUpdated',
  'PlacementAdded',
  'PlacementUpdated',
  'PlacementRemoved',
  'DesignArchived',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventActor {
  id: string;
  interface: string;
}

/** The event as it is hashed and stored. The store adds prev_hash and hash. */
export interface EventEnvelope {
  seq: number;
  ts: string;
  type: EventType;
  actor: EventActor;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
}

export interface DesignCreatedPayload {
  designId: string;
  name: string;
  site: SiteState;
  placements: PlacementState[];
}

export interface SiteUpdatedPayload {
  changes: Partial<SiteState>;
  previous: Partial<SiteState>;
}

export interface PlacementAddedPayload {
  placement: PlacementState;
}

export interface PlacementUpdatedPayload {
  placementId: string;
  changes: Partial<Omit<PlacementState, 'id'>>;
  previous: Partial<Omit<PlacementState, 'id'>>;
}

export interface PlacementRemovedPayload {
  placement: PlacementState;
}

function requireState(state: DesignState | null, type: EventType): DesignState {
  if (state === null) throw new DomainError('invalid_transition', `${type} requires an existing design`);
  if (state.archived && type !== 'DesignArchived') {
    throw new DomainError('conflict', `Design ${state.designId} is archived; ${type} is not allowed`);
  }
  return state;
}

export function applyEvent(state: DesignState | null, event: EventEnvelope): DesignState {
  switch (event.type) {
    case 'DesignCreated': {
      if (state !== null) throw new DomainError('invalid_transition', 'Design already exists');
      const p = event.payload as unknown as DesignCreatedPayload;
      const placements: Record<string, PlacementState> = {};
      for (const placement of p.placements ?? []) placements[placement.id] = { ...placement };
      return {
        designId: p.designId,
        name: p.name,
        site: { ...p.site },
        placements,
        archived: false,
        seq: event.seq,
      };
    }
    case 'SiteUpdated': {
      const current = requireState(state, event.type);
      const p = event.payload as unknown as SiteUpdatedPayload;
      return { ...current, site: { ...current.site, ...p.changes }, seq: event.seq };
    }
    case 'PlacementAdded': {
      const current = requireState(state, event.type);
      const p = event.payload as unknown as PlacementAddedPayload;
      if (current.placements[p.placement.id]) {
        throw new DomainError('conflict', `Placement ${p.placement.id} already exists`);
      }
      return {
        ...current,
        placements: { ...current.placements, [p.placement.id]: { ...p.placement } },
        seq: event.seq,
      };
    }
    case 'PlacementUpdated': {
      const current = requireState(state, event.type);
      const p = event.payload as unknown as PlacementUpdatedPayload;
      const existing = current.placements[p.placementId];
      if (!existing) throw new DomainError('not_found', `Placement ${p.placementId} does not exist`);
      return {
        ...current,
        placements: { ...current.placements, [p.placementId]: { ...existing, ...p.changes } },
        seq: event.seq,
      };
    }
    case 'PlacementRemoved': {
      const current = requireState(state, event.type);
      const p = event.payload as unknown as PlacementRemovedPayload;
      if (!current.placements[p.placement.id]) {
        throw new DomainError('not_found', `Placement ${p.placement.id} does not exist`);
      }
      const remaining = { ...current.placements };
      delete remaining[p.placement.id];
      return { ...current, placements: remaining, seq: event.seq };
    }
    case 'DesignArchived': {
      const current = requireState(state, event.type);
      return { ...current, archived: true, seq: event.seq };
    }
  }
}

/** Replays a full event list. Returns null for an empty log. */
export function replay(events: readonly EventEnvelope[]): DesignState | null {
  let state: DesignState | null = null;
  for (const event of events) state = applyEvent(state, event);
  return state;
}
