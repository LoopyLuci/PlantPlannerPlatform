import type { Direction, Grade, Status, Verdict, VersionTriple } from '@ppp/core';

/**
 * Typed client for the local HTTP API. Every call is a POST to a capability,
 * exactly as the CLI and MCP adapters call the same contract.
 */

export interface SiteView {
  name: string;
  widthM: number;
  depthM: number;
  hardinessZone?: number;
  sunHours?: number;
  soilPh?: number;
}

export interface PlacementView {
  id: string;
  speciesUrn: string;
  x: number;
  y: number;
  footprintM: number;
  pinned: boolean;
}

export interface DesignView {
  designId: string;
  name: string;
  archived: boolean;
  seq: number;
  site: SiteView;
  placements: PlacementView[];
}

export interface DesignSummary {
  designId: string;
  name: string;
  archived: boolean;
  seq: number;
  placementCount: number;
}

export interface SpeciesSummary {
  urn: string;
  scientificName: string;
  commonName: string;
  family: string;
  growthForm: string;
  guildLayer: 'canopy' | 'understory' | 'groundcover' | 'root';
  traits: {
    matureHeightM: number | null;
    matureSpreadM: number | null;
    plantingSpacingM: number | null;
    sunHoursMin: number | null;
    phMin: number | null;
    phMax: number | null;
    hardinessMin: number | null;
    hardinessMax: number | null;
  };
}

export interface EvaluationView {
  designId: string;
  seq: number;
  placements: Record<string, { placementId: string; status: Status; companionScore: number; verdicts: Verdict[] }>;
  verdicts: Verdict[];
  summary: Record<Status, number>;
  companionScoreFormula: string;
}

export interface CandidateView {
  speciesUrn: string;
  commonName: string;
  scientificName: string;
  footprintM: number;
  status: Status;
  companionScore: number;
  verdicts: Verdict[];
  collidesWith: string[];
}

export interface SuggestionView {
  candidates: CandidateView[];
  rejected: { speciesUrn: string; reason: string }[];
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Envelope<T> {
  ok: boolean;
  capability: string;
  data?: T;
  error?: ApiError;
  version?: VersionTriple;
  idempotency?: { key: string; replayed: boolean } | null;
}

export class ApiUnreachableError extends Error {
  constructor() {
    super('Cannot reach the local Plant Planner server. Start it with "npm start", then try again.');
    this.name = 'ApiUnreachableError';
  }
}

export async function call<T>(
  capability: string,
  input: Record<string, unknown>,
  options: { idempotencyKey?: string } = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`/api/v1/capabilities/${capability}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiUnreachableError();
  }
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
  }
}

/** A fresh key for each user action. Retries of the same action reuse it. */
export function newKey(prefix = 'web'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type { Direction, Grade, Status, Verdict, VersionTriple };
