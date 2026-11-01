import type { DesignState, PlacementState, SiteState } from './design';
import { distance, round2 } from './geometry';
import {
  type CompanionEdge,
  type Direction,
  type Grade,
  type KnowledgeGraph,
  edgesBetween,
  gradeWeight,
  lowerGrade,
  traitRecord,
  traitValue,
} from './knowledge';

/**
 * The deterministic rule engine. Every function here is pure: the same design,
 * knowledge graph and configuration always produce the same verdicts. No model
 * is consulted (invariant I1). Every verdict that rests on a trait carries the
 * source id and evidence grade of that trait.
 */

export type Status = 'pass' | 'warn' | 'fail' | 'unknown';

/** Every rule that can produce a verdict. The registry's enum lists must match this (a services test checks it). */
export const RULE_NAMES = [
  'graph_membership',
  'hardiness',
  'sun',
  'soil_ph',
  'footprint_overlap',
  'spacing_same_species',
  'mature_overlap',
  'companion',
] as const;

export type RuleName = (typeof RULE_NAMES)[number];

export interface Verdict {
  rule: RuleName;
  status: Status;
  /** The placement the verdict is about. Pair verdicts name the first placement here. */
  placementId: string;
  neighborPlacementId?: string;
  observed?: number;
  required?: string;
  message: string;
  sourceId?: string;
  grade?: Grade;
  mechanism?: string;
  direction?: Direction;
}

/**
 * The thresholds the rule engine uses. They live in a versioned file
 * (config/rules/<version>.json), not in code. The file's version is stamped on
 * every result as ruleConfigVersion (I4). Changing a value means a new file and
 * a new version, recorded in an ADR.
 */
export interface RuleConfig {
  /** The file version, for example "rules-1.0". */
  version: string;
  /** Companion relationships are evaluated within this centre-to-centre distance. */
  companionRadiusM: number;
  /** Overlaps smaller than this are treated as touching, not colliding. */
  overlapToleranceM: number;
  /** Mature canopies overlapping by more than this are flagged as a future conflict. */
  matureOverlapWarnM: number;
  /** Footprint used when a species has no recorded planting spacing. */
  fallbackFootprintM: number;
}

const RULE_NUMBER_FIELDS = ['companionRadiusM', 'overlapToleranceM', 'matureOverlapWarnM', 'fallbackFootprintM'] as const;

/** Validates a parsed rule configuration. Refuses a missing version or any field that is not a positive number. */
export function parseRuleConfig(value: unknown): RuleConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('rule configuration must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !/^rules-\d+\.\d+$/.test(record.version)) {
    throw new Error('rule configuration needs a version such as "rules-1.0"');
  }
  const config: RuleConfig = {
    version: record.version,
    companionRadiusM: 0,
    overlapToleranceM: 0,
    matureOverlapWarnM: 0,
    fallbackFootprintM: 0,
  };
  for (const field of RULE_NUMBER_FIELDS) {
    const number = record[field];
    if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) {
      throw new Error(`rule configuration field ${field} must be a positive number`);
    }
    config[field] = number;
  }
  return config;
}

export const COMPANION_SCORE_FORMULA =
  'score = clamp(50 + sum(beneficial: 10 x w) - sum(antagonistic: 15 x w), 0, 100); ' +
  'w(A)=1.0, w(B)=0.7, w(C)=0.4; edges between placements within companionRadiusM. 50 is the neutral baseline.';

const RANK: Record<Status, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 };

export function worstStatus(verdicts: readonly Verdict[]): Status {
  let worst: Status = 'pass';
  for (const verdict of verdicts) {
    if (RANK[verdict.status] > RANK[worst]) worst = verdict.status;
  }
  return worst;
}

function speciesName(kg: KnowledgeGraph, urn: string): string {
  return kg.species.get(urn)?.commonName || urn;
}

function humanize(mechanism: string): string {
  return mechanism.replace(/_/g, ' ');
}

/** Footprint a species should get when none is given. Returns the source of the number. */
export function defaultFootprint(
  kg: KnowledgeGraph,
  urn: string,
  cfg: RuleConfig,
): { footprintM: number; source: 'spacing_trait' | 'fallback' } {
  const spacing = traitValue(kg, urn, 'planting_spacing_m');
  if (spacing !== undefined) return { footprintM: spacing, source: 'spacing_trait' };
  return { footprintM: cfg.fallbackFootprintM, source: 'fallback' };
}

/** Verdicts about one placement on its own (site fit). */
export function singleVerdicts(site: SiteState, placement: PlacementState, kg: KnowledgeGraph): Verdict[] {
  const id = placement.id;
  const urn = placement.speciesUrn;
  if (!kg.species.has(urn)) {
    return [
      {
        rule: 'graph_membership',
        status: 'unknown',
        placementId: id,
        message: `${urn} is not in knowledge graph ${kg.graphVersion}, so it cannot be evaluated`,
      },
    ];
  }
  const out: Verdict[] = [];
  const growthForm = kg.species.get(urn)?.growthForm ?? '';
  const isAnnual = growthForm.includes('annual');
  const zoneMin = traitRecord(kg, urn, 'hardiness_min');
  const zoneMax = traitRecord(kg, urn, 'hardiness_max');
  const name = speciesName(kg, urn);

  if (isAnnual) {
    out.push({
      rule: 'hardiness',
      status: 'pass',
      placementId: id,
      message: `${name} is an annual, grown each season, so the hardiness range is not applied`,
    });
  } else if (site.hardinessZone === undefined) {
    out.push({ rule: 'hardiness', status: 'unknown', placementId: id, message: 'Site hardiness zone is not set' });
  } else if (!zoneMin || !zoneMax) {
    out.push({ rule: 'hardiness', status: 'unknown', placementId: id, message: `No hardiness range is recorded for ${name}` });
  } else {
    const zone = site.hardinessZone;
    const inRange = zone >= zoneMin.value && zone <= zoneMax.value;
    out.push({
      rule: 'hardiness',
      status: inRange ? 'pass' : 'fail',
      placementId: id,
      observed: zone,
      required: `zone ${zoneMin.value}-${zoneMax.value}`,
      message: inRange
        ? `Zone ${zone} is within the hardiness range ${zoneMin.value}-${zoneMax.value}`
        : `Zone ${zone} is outside the hardiness range ${zoneMin.value}-${zoneMax.value}`,
      sourceId: zoneMin.sourceId,
      grade: lowerGrade(zoneMin.grade, zoneMax.grade),
    });
  }

  const sunMin = traitRecord(kg, urn, 'sun_hours_min');
  if (site.sunHours === undefined) {
    out.push({ rule: 'sun', status: 'unknown', placementId: id, message: 'Site sun hours are not set' });
  } else if (!sunMin) {
    out.push({ rule: 'sun', status: 'unknown', placementId: id, message: `No sun requirement is recorded for ${name}` });
  } else {
    const enough = site.sunHours >= sunMin.value;
    out.push({
      rule: 'sun',
      status: enough ? 'pass' : 'fail',
      placementId: id,
      observed: site.sunHours,
      required: `at least ${sunMin.value} h`,
      message: enough
        ? `${site.sunHours} h of sun meets the ${sunMin.value} h minimum`
        : `${site.sunHours} h of sun is below the ${sunMin.value} h minimum`,
      sourceId: sunMin.sourceId,
      grade: sunMin.grade,
    });
  }

  const phMin = traitRecord(kg, urn, 'ph_min');
  const phMax = traitRecord(kg, urn, 'ph_max');
  if (site.soilPh === undefined) {
    out.push({ rule: 'soil_ph', status: 'unknown', placementId: id, message: 'Soil pH is not set' });
  } else if (!phMin || !phMax) {
    out.push({ rule: 'soil_ph', status: 'unknown', placementId: id, message: `No soil pH range is recorded for ${name}` });
  } else {
    const ph = site.soilPh;
    const inRange = ph >= phMin.value && ph <= phMax.value;
    out.push({
      rule: 'soil_ph',
      status: inRange ? 'pass' : 'warn',
      placementId: id,
      observed: ph,
      required: `pH ${phMin.value}-${phMax.value}`,
      message: inRange
        ? `Soil pH ${ph} is within ${phMin.value}-${phMax.value}`
        : `Soil pH ${ph} is outside ${phMin.value}-${phMax.value}; amend the soil or choose another plant`,
      sourceId: phMin.sourceId,
      grade: lowerGrade(phMin.grade, phMax.grade),
    });
  }
  return out;
}

/** Verdicts about one pair of placements. Symmetric in its inputs. */
export function pairVerdicts(a: PlacementState, b: PlacementState, kg: KnowledgeGraph, cfg: RuleConfig): Verdict[] {
  const out: Verdict[] = [];
  const d = distance(a, b);
  const nameA = speciesName(kg, a.speciesUrn);
  const nameB = speciesName(kg, b.speciesUrn);
  const pair = { placementId: a.id, neighborPlacementId: b.id };

  const overlap = (a.footprintM + b.footprintM) / 2 - d;
  if (overlap > cfg.overlapToleranceM) {
    out.push({
      rule: 'footprint_overlap',
      status: 'fail',
      ...pair,
      observed: round2(overlap),
      required: '0 m',
      message: `Footprints of ${nameA} and ${nameB} overlap by ${round2(overlap)} m`,
    });
  }

  if (a.speciesUrn === b.speciesUrn) {
    const spacing = traitRecord(kg, a.speciesUrn, 'planting_spacing_m');
    if (spacing && d < spacing.value - cfg.overlapToleranceM) {
      out.push({
        rule: 'spacing_same_species',
        status: 'warn',
        ...pair,
        observed: round2(d),
        required: `${spacing.value} m`,
        message: `${round2(spacing.value - d)} m short of the ${spacing.value} m spacing for ${nameA}`,
        sourceId: spacing.sourceId,
        grade: spacing.grade,
      });
    }
  }

  const spreadA = traitRecord(kg, a.speciesUrn, 'mature_spread_m');
  const spreadB = traitRecord(kg, b.speciesUrn, 'mature_spread_m');
  if (spreadA && spreadB) {
    const matureOverlap = (spreadA.value + spreadB.value) / 2 - d;
    if (matureOverlap > cfg.matureOverlapWarnM) {
      out.push({
        rule: 'mature_overlap',
        status: 'warn',
        ...pair,
        observed: round2(matureOverlap),
        required: `at most ${cfg.matureOverlapWarnM} m`,
        message: `Mature canopies of ${nameA} and ${nameB} will overlap by ${round2(matureOverlap)} m`,
        sourceId: spreadA.sourceId,
        grade: lowerGrade(spreadA.grade, spreadB.grade),
      });
    }
  }

  if (d <= cfg.companionRadiusM) {
    for (const edge of edgesBetween(kg, a.speciesUrn, b.speciesUrn)) {
      if (edge.direction === 'neutral') continue;
      out.push(companionVerdict(edge, pair, d, nameA, nameB, cfg));
    }
  }
  return out;
}

function companionVerdict(
  edge: CompanionEdge,
  pair: { placementId: string; neighborPlacementId: string },
  d: number,
  nameA: string,
  nameB: string,
  cfg: RuleConfig,
): Verdict {
  return {
    rule: 'companion',
    status: edge.direction === 'beneficial' ? 'pass' : 'warn',
    ...pair,
    observed: round2(d),
    required: `within ${cfg.companionRadiusM} m`,
    message: `${nameA} and ${nameB}: ${humanize(edge.mechanism)} (${edge.direction}, evidence grade ${edge.grade})`,
    sourceId: edge.sourceId,
    grade: edge.grade,
    mechanism: edge.mechanism,
    direction: edge.direction,
  };
}

/** Companion score from companion verdicts only. See COMPANION_SCORE_FORMULA. */
export function companionScore(verdicts: readonly Verdict[]): number {
  let score = 50;
  for (const verdict of verdicts) {
    if (verdict.rule !== 'companion' || !verdict.grade) continue;
    const weight = gradeWeight(verdict.grade);
    if (verdict.direction === 'beneficial') score += 10 * weight;
    else if (verdict.direction === 'antagonistic') score -= 15 * weight;
  }
  return Math.round(Math.min(100, Math.max(0, score)));
}

export interface PlacementEvaluation {
  placementId: string;
  status: Status;
  companionScore: number;
  verdicts: Verdict[];
}

export interface DesignEvaluation {
  designId: string;
  seq: number;
  graphVersion: string;
  ruleConfigVersion: string;
  placements: Record<string, PlacementEvaluation>;
  verdicts: Verdict[];
  summary: Record<Status, number>;
  companionScoreFormula: string;
}

export function evaluateDesign(state: DesignState, kg: KnowledgeGraph, cfg: RuleConfig): DesignEvaluation {
  const list = Object.values(state.placements).sort((x, y) => x.id.localeCompare(y.id));
  const verdicts: Verdict[] = [];
  const perPlacement = new Map<string, Verdict[]>();
  for (const p of list) perPlacement.set(p.id, []);

  for (const p of list) {
    const own = singleVerdicts(state.site, p, kg);
    verdicts.push(...own);
    perPlacement.get(p.id)?.push(...own);
  }
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const pairs = pairVerdicts(a, b, kg, cfg);
      verdicts.push(...pairs);
      perPlacement.get(a.id)?.push(...pairs);
      perPlacement.get(b.id)?.push(...pairs);
    }
  }

  const placements: Record<string, PlacementEvaluation> = {};
  const summary: Record<Status, number> = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const p of list) {
    const own = perPlacement.get(p.id) ?? [];
    const status = worstStatus(own);
    summary[status] += 1;
    placements[p.id] = { placementId: p.id, status, companionScore: companionScore(own), verdicts: own };
  }
  return {
    designId: state.designId,
    seq: state.seq,
    graphVersion: kg.graphVersion,
    ruleConfigVersion: cfg.version,
    placements,
    verdicts,
    summary,
    companionScoreFormula: COMPANION_SCORE_FORMULA,
  };
}

export interface CandidateInput {
  speciesUrn: string;
  x: number;
  y: number;
  footprintM?: number;
  /** Excludes this placement from collision checks, e.g. when it is being moved. */
  ignorePlacementId?: string;
}

export interface CandidateCheck {
  speciesUrn: string;
  footprintM: number;
  status: Status;
  companionScore: number;
  verdicts: Verdict[];
  collidesWith: string[];
}

export const CANDIDATE_ID = '__candidate__';

export function checkCandidate(
  state: DesignState,
  candidate: CandidateInput,
  kg: KnowledgeGraph,
  cfg: RuleConfig,
): CandidateCheck {
  const footprintM = candidate.footprintM ?? defaultFootprint(kg, candidate.speciesUrn, cfg).footprintM;
  const temp: PlacementState = {
    id: CANDIDATE_ID,
    speciesUrn: candidate.speciesUrn,
    x: candidate.x,
    y: candidate.y,
    footprintM,
    pinned: false,
  };
  const verdicts = singleVerdicts(state.site, temp, kg);
  const collidesWith: string[] = [];
  for (const other of Object.values(state.placements)) {
    if (other.id === candidate.ignorePlacementId) continue;
    const pairs = pairVerdicts(temp, other, kg, cfg);
    verdicts.push(...pairs);
    if (pairs.some((v) => v.rule === 'footprint_overlap')) collidesWith.push(other.id);
  }
  collidesWith.sort();
  return {
    speciesUrn: candidate.speciesUrn,
    footprintM,
    status: worstStatus(verdicts),
    companionScore: companionScore(verdicts),
    verdicts,
    collidesWith,
  };
}

export interface SuggestionCandidate extends CandidateCheck {
  commonName: string;
  scientificName: string;
}

export interface Suggestion {
  point: { x: number; y: number };
  candidates: SuggestionCandidate[];
  rejected: { speciesUrn: string; reason: string }[];
}

/** Hard filters a species must pass before it is even considered for a site. */
export function hardFilterReason(site: SiteState, urn: string, kg: KnowledgeGraph): string | undefined {
  if (site.hardinessZone !== undefined) {
    const lo = traitValue(kg, urn, 'hardiness_min');
    const hi = traitValue(kg, urn, 'hardiness_max');
    const annual = (kg.species.get(urn)?.growthForm ?? '').includes('annual');
    if (!annual && lo !== undefined && hi !== undefined && (site.hardinessZone < lo || site.hardinessZone > hi)) {
      return 'hardiness_zone_outside_range';
    }
  }
  if (site.sunHours !== undefined) {
    const min = traitValue(kg, urn, 'sun_hours_min');
    if (min !== undefined && site.sunHours < min) return 'sun_hours_below_requirement';
  }
  if (site.soilPh !== undefined) {
    const lo = traitValue(kg, urn, 'ph_min');
    const hi = traitValue(kg, urn, 'ph_max');
    if (lo !== undefined && hi !== undefined && (site.soilPh < lo || site.soilPh > hi)) {
      return 'soil_ph_outside_range';
    }
  }
  return undefined;
}

export function suggestCandidates(
  state: DesignState,
  kg: KnowledgeGraph,
  point: { x: number; y: number },
  options: { limit: number },
  cfg: RuleConfig,
): Suggestion {
  const scored: SuggestionCandidate[] = [];
  const rejected: { speciesUrn: string; reason: string }[] = [];
  const urns = [...kg.species.keys()].sort((a, b) => speciesName(kg, a).localeCompare(speciesName(kg, b)));

  for (const urn of urns) {
    const species = kg.species.get(urn);
    const reason = hardFilterReason(state.site, urn, kg);
    if (reason) {
      rejected.push({ speciesUrn: urn, reason });
      continue;
    }
    const spacing = traitValue(kg, urn, 'planting_spacing_m');
    if (spacing === undefined) {
      rejected.push({ speciesUrn: urn, reason: 'spacing_not_recorded' });
      continue;
    }
    const check = checkCandidate(state, { speciesUrn: urn, x: point.x, y: point.y, footprintM: spacing }, kg, cfg);
    if (check.collidesWith.length > 0) {
      rejected.push({ speciesUrn: urn, reason: `collides_with:${check.collidesWith.join(',')}` });
      continue;
    }
    scored.push({
      ...check,
      commonName: species?.commonName ?? urn,
      scientificName: species?.scientificName ?? '',
    });
  }

  scored.sort((a, b) => b.companionScore - a.companionScore || a.commonName.localeCompare(b.commonName));
  return { point, candidates: scored.slice(0, options.limit), rejected: rejected.slice(0, 200) };
}
