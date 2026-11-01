import { describe, expect, it } from 'vitest';
import {
  type PlacementState,
  checkCandidate,
  companionScore,
  evaluateDesign,
  pairVerdicts,
  parseRuleConfig,
  singleVerdicts,
  suggestCandidates,
} from '../src/index';
import { RULE_CONFIG, emptyDesign, fixtureGraph } from './fixtures';

describe('rule configuration file', () => {
  it('loads the shipped file with its version and every threshold', () => {
    expect(RULE_CONFIG).toEqual({
      version: 'rules-1.0',
      companionRadiusM: 2.5,
      overlapToleranceM: 0.01,
      matureOverlapWarnM: 0.25,
      fallbackFootprintM: 0.5,
    });
  });

  it('refuses a file without a version, or with a value that is not a positive number', () => {
    const good = { ...RULE_CONFIG };
    expect(() => parseRuleConfig({ ...good, version: undefined })).toThrow(/version/);
    expect(() => parseRuleConfig({ ...good, version: 'v1' })).toThrow(/version/);
    expect(() => parseRuleConfig({ ...good, companionRadiusM: 0 })).toThrow(/companionRadiusM/);
    expect(() => parseRuleConfig({ ...good, fallbackFootprintM: '0.5' })).toThrow(/fallbackFootprintM/);
    expect(() => parseRuleConfig([])).toThrow(/JSON object/);
  });
});

const kg = fixtureGraph();
const alpha = 'urn:ppp:species:alpha-one';
const beta = 'urn:ppp:species:beta-two';
const gamma = 'urn:ppp:species:gamma-three';

function place(id: string, speciesUrn: string, x: number, y: number, footprintM = 0.5): PlacementState {
  return { id, speciesUrn, x, y, footprintM, pinned: false };
}

describe('single-placement rules', () => {
  it('passes sun and hardiness when the site meets the requirement', () => {
    const verdicts = singleVerdicts(emptyDesign().site, place('p1', alpha, 0, 0), kg);
    expect(verdicts.find((v) => v.rule === 'sun')?.status).toBe('pass');
    expect(verdicts.find((v) => v.rule === 'hardiness')?.status).toBe('pass');
  });

  it('fails sun below the minimum and cites the source and grade', () => {
    const verdicts = singleVerdicts(emptyDesign({ sunHours: 4 }).site, place('p1', alpha, 0, 0), kg);
    const sun = verdicts.find((v) => v.rule === 'sun');
    expect(sun?.status).toBe('fail');
    expect(sun?.observed).toBe(4);
    expect(sun?.sourceId).toBe('S-B');
    expect(sun?.grade).toBe('B');
  });

  it('reports unknown, never a guess, when the site value is missing', () => {
    const verdicts = singleVerdicts(emptyDesign({ sunHours: undefined, hardinessZone: undefined }).site, place('p1', alpha, 0, 0), kg);
    expect(verdicts.find((v) => v.rule === 'sun')?.status).toBe('unknown');
    expect(verdicts.find((v) => v.rule === 'hardiness')?.status).toBe('unknown');
  });

  it('treats annuals as outside the hardiness rule', () => {
    const verdicts = singleVerdicts(emptyDesign({ hardinessZone: 1 }).site, place('p1', gamma, 0, 0), kg);
    expect(verdicts.find((v) => v.rule === 'hardiness')?.status).toBe('pass');
  });

  it('warns on soil pH outside the tolerated range', () => {
    const verdicts = singleVerdicts(emptyDesign({ soilPh: 8.2 }).site, place('p1', alpha, 0, 0), kg);
    expect(verdicts.find((v) => v.rule === 'soil_ph')?.status).toBe('warn');
  });

  it('reports a species that is missing from the graph as unknown', () => {
    const verdicts = singleVerdicts(emptyDesign().site, place('p1', 'urn:ppp:species:not-real', 0, 0), kg);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].rule).toBe('graph_membership');
    expect(verdicts[0].status).toBe('unknown');
  });
});

describe('pair rules', () => {
  it('fails overlapping footprints with the overlap amount', () => {
    const verdicts = pairVerdicts(place('a', alpha, 0, 0, 0.6), place('b', beta, 0.4, 0, 0.6), kg, RULE_CONFIG);
    const overlap = verdicts.find((v) => v.rule === 'footprint_overlap');
    expect(overlap?.status).toBe('fail');
    expect(overlap?.observed).toBeCloseTo(0.2, 2);
  });

  it('warns on same-species spacing and states the shortfall', () => {
    const verdicts = pairVerdicts(place('a', alpha, 0, 0), place('b', alpha, 0.3, 0), kg, RULE_CONFIG);
    const spacing = verdicts.find((v) => v.rule === 'spacing_same_species');
    expect(spacing?.status).toBe('warn');
    expect(spacing?.message).toContain('0.2 m short');
  });

  it('marks a beneficial companion pass with its mechanism and grade', () => {
    const verdicts = pairVerdicts(place('a', alpha, 0, 0), place('c', gamma, 1, 0), kg, RULE_CONFIG);
    const companion = verdicts.find((v) => v.rule === 'companion');
    expect(companion?.status).toBe('pass');
    expect(companion?.direction).toBe('beneficial');
    expect(companion?.grade).toBe('C');
    expect(companion?.mechanism).toBe('pest_repellence_claimed');
  });

  it('warns on an antagonistic companion within the radius only', () => {
    const near = pairVerdicts(place('a', alpha, 0, 0), place('b', beta, 2, 0), kg, RULE_CONFIG);
    expect(near.find((v) => v.rule === 'companion')?.status).toBe('warn');
    const far = pairVerdicts(place('a', alpha, 0, 0), place('b', beta, 9, 0), kg, RULE_CONFIG);
    expect(far.find((v) => v.rule === 'companion')).toBeUndefined();
  });

  it('does not emit neutral relationships', () => {
    const verdicts = pairVerdicts(place('b', beta, 0, 0), place('c', gamma, 1, 0), kg, RULE_CONFIG);
    expect(verdicts.find((v) => v.rule === 'companion')).toBeUndefined();
  });
});

describe('companion score', () => {
  it('is 50 with no relationships', () => {
    expect(companionScore([])).toBe(50);
  });

  it('adds weighted benefit and subtracts weighted antagonism', () => {
    const verdicts = [
      { rule: 'companion' as const, status: 'pass' as const, placementId: 'a', direction: 'beneficial' as const, grade: 'A' as const, message: '' },
      { rule: 'companion' as const, status: 'warn' as const, placementId: 'a', direction: 'antagonistic' as const, grade: 'C' as const, message: '' },
    ];
    // 50 + 10 * 1.0 - 15 * 0.4 = 54
    expect(companionScore(verdicts)).toBe(54);
  });

  it('clamps to the 0-100 range', () => {
    const many = Array.from({ length: 10 }, () => ({
      rule: 'companion' as const,
      status: 'warn' as const,
      placementId: 'a',
      direction: 'antagonistic' as const,
      grade: 'A' as const,
      message: '',
    }));
    expect(companionScore(many)).toBe(0);
  });
});

describe('design evaluation', () => {
  const design = {
    ...emptyDesign(),
    placements: {
      p2: place('p2', beta, 2, 0),
      p1: place('p1', alpha, 0, 0),
    },
  };

  it('is deterministic and independent of insertion order', () => {
    const a = evaluateDesign(design, kg, RULE_CONFIG);
    const reversed = { ...design, placements: { p1: design.placements.p1, p2: design.placements.p2 } };
    const b = evaluateDesign(reversed, kg, RULE_CONFIG);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('attributes pair verdicts to both placements and summarises by worst status', () => {
    const result = evaluateDesign(design, kg, RULE_CONFIG);
    expect(result.placements.p1.verdicts.some((v) => v.rule === 'companion')).toBe(true);
    expect(result.placements.p2.verdicts.some((v) => v.rule === 'companion')).toBe(true);
    expect(result.placements.p1.status).toBe('warn');
    expect(result.summary.warn + result.summary.pass + result.summary.fail + result.summary.unknown).toBe(2);
  });

  it('stamps the graph and rule versions on the result', () => {
    const result = evaluateDesign(design, kg, RULE_CONFIG);
    expect(result.graphVersion).toBe('kg-test');
    expect(result.ruleConfigVersion).toBe('rules-1.0');
  });
});

describe('candidate checks and suggestions', () => {
  const base = { ...emptyDesign(), placements: { p1: place('p1', alpha, 2, 2, 0.6) } };

  it('reports collisions with existing footprints', () => {
    const check = checkCandidate(base, { speciesUrn: beta, x: 2.2, y: 2 }, kg, RULE_CONFIG);
    expect(check.collidesWith).toEqual(['p1']);
    expect(check.status).toBe('fail');
  });

  it('ignores the placement being moved', () => {
    const check = checkCandidate(base, { speciesUrn: alpha, x: 2.1, y: 2, ignorePlacementId: 'p1' }, kg, RULE_CONFIG);
    expect(check.collidesWith).toEqual([]);
  });

  it('rejects candidates that fail a hard filter, with the reason', () => {
    const suggestion = suggestCandidates(emptyDesign({ soilPh: 5.5 }), kg, { x: 1, y: 1 }, { limit: 5 }, RULE_CONFIG);
    expect(suggestion.rejected).toContainEqual({ speciesUrn: alpha, reason: 'soil_ph_outside_range' });
    expect(suggestion.candidates.map((c) => c.speciesUrn)).toEqual([gamma]);
  });

  it('ranks candidates by companion score and lists collisions as rejected', () => {
    const suggestion = suggestCandidates(base, kg, { x: 2.3, y: 2 }, { limit: 5 }, RULE_CONFIG);
    expect(suggestion.rejected.some((r) => r.reason.startsWith('collides_with:p1'))).toBe(true);
    const scores = suggestion.candidates.map((c) => c.companionScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
