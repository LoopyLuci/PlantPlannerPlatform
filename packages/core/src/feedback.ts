/**
 * Feedback on verdicts: the reason tags a person can give, and the router that
 * decides where a piece of feedback goes. The router is a pure function of the
 * reason tag. It never changes a design, the knowledge graph or a rule. Every
 * route ends with a human action (invariants I1 and I3, ADR-0007).
 */

export const FEEDBACK_REASON_TAGS = [
  'source_outdated',
  'site_condition_differs',
  'variety_differs',
  'rule_too_strict',
  'rule_too_loose',
  'data_wrong',
  'other',
] as const;

export type FeedbackReasonTag = (typeof FEEDBACK_REASON_TAGS)[number];

export const FEEDBACK_ROUTES = ['curation_queue', 'rule_review', 'site_update', 'design_note'] as const;

export type FeedbackRoute = (typeof FEEDBACK_ROUTES)[number];

export const FEEDBACK_NOTE_MAX_LENGTH = 500;

export interface RouteDecision {
  route: FeedbackRoute;
  /** Always true. The router suggests where a human should look; it never acts. */
  humanActionRequired: true;
  reason: string;
}

const ROUTES: Record<FeedbackReasonTag, RouteDecision> = {
  source_outdated: {
    route: 'curation_queue',
    humanActionRequired: true,
    reason: 'The knowledge graph changes only through curation, with a new source (I1, I3).',
  },
  data_wrong: {
    route: 'curation_queue',
    humanActionRequired: true,
    reason: 'The knowledge graph changes only through curation, with a new source (I1, I3).',
  },
  rule_too_strict: {
    route: 'rule_review',
    humanActionRequired: true,
    reason: 'Thresholds change only through a new rule configuration version and an ADR.',
  },
  rule_too_loose: {
    route: 'rule_review',
    humanActionRequired: true,
    reason: 'Thresholds change only through a new rule configuration version and an ADR.',
  },
  site_condition_differs: {
    route: 'site_update',
    humanActionRequired: true,
    reason: 'Update the site condition in the Site window. Nothing changes automatically.',
  },
  variety_differs: {
    route: 'design_note',
    humanActionRequired: true,
    reason: 'Kept with the design as a note. The species data is not changed.',
  },
  other: {
    route: 'design_note',
    humanActionRequired: true,
    reason: 'Kept with the design as a note for a person to read.',
  },
};

export function routeFeedback(reasonTag: FeedbackReasonTag): RouteDecision {
  return ROUTES[reasonTag];
}
