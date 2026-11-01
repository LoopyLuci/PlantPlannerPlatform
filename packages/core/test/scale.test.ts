import { describe, expect, it } from 'vitest';
import { type PlacementState, buildKnowledgeGraph, evaluateDesign } from '../src/index';
import { FIXTURE_FILES, RULE_CONFIG, emptyDesign } from './fixtures';

/**
 * Scale check for the planned catalogue size (about 500 species). The species here are
 * SYNTHETIC: generated names and made-up numbers, cited to a fixture source. They are not
 * horticultural data and must never be copied into data/knowledge-graph. The point is to time
 * the graph loader and the rules engine at a realistic size, not to test any plant fact.
 */

const SPECIES = 500;
const EDGES_PER_SPECIES = 2;

function syntheticFiles() {
  const urn = (i: number) => `urn:ppp:species:synthetic-${String(i).padStart(3, '0')}`;
  const species = ['urn,scientific_name,common_name,family,growth_form,guild_layer'];
  const traits = ['urn,trait,value,unit,source_id,grade'];
  const edges = ['species_a_urn,species_b_urn,mechanism,direction,source_id,grade,note'];
  for (let i = 0; i < SPECIES; i += 1) {
    const u = urn(i);
    species.push(`${u},Synthetic ${i},Synthetic ${i},Family${i % 40},shrub,understory`);
    const spread = 0.3 + (i % 7) * 0.1;
    const values: [string, number, string][] = [
      ['mature_spread_m', spread, 'm'],
      ['planting_spacing_m', spread * 0.8, 'm'],
      ['sun_hours_min', 4 + (i % 5), 'h'],
      ['ph_min', 5.5, 'pH'],
      ['ph_max', 7.5, 'pH'],
      ['hardiness_min', 4 + (i % 4), 'zone'],
      ['hardiness_max', 9, 'zone'],
    ];
    for (const [trait, value, unit] of values) traits.push(`${u},${trait},${value},${unit},S-B,B`);
    for (let k = 1; k <= EDGES_PER_SPECIES; k += 1) {
      edges.push(`${u},${urn((i + k * 37) % SPECIES)},rivalry_claimed,antagonistic,S-B,B,synthetic`);
    }
  }
  return {
    manifest: { graph_version: 'kg-synthetic', status: 'synthetic' },
    sourcesCsv: FIXTURE_FILES.sourcesCsv,
    speciesCsv: species.join('\n'),
    traitsCsv: traits.join('\n'),
    edgesCsv: edges.join('\n'),
  };
}

function design(count: number, speciesCount: number): ReturnType<typeof emptyDesign> {
  const placements: Record<string, PlacementState> = {};
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i += 1) {
    const id = `p${String(i).padStart(3, '0')}`;
    placements[id] = {
      id,
      speciesUrn: `urn:ppp:species:synthetic-${String(i % speciesCount).padStart(3, '0')}`,
      x: 0.3 + (i % side) * 0.5,
      y: 0.3 + Math.floor(i / side) * 0.5,
      footprintM: 0.5,
      pinned: false,
    };
  }
  return { ...emptyDesign({ widthM: 20, depthM: 20 }), placements };
}

function medianMs(run: () => void, repeats: number): number {
  const times: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    const started = performance.now();
    run();
    times.push(performance.now() - started);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
}

describe(`scale: ${SPECIES} synthetic species`, () => {
  const files = syntheticFiles();
  const kg = buildKnowledgeGraph(files);

  it('loads the whole catalogue with every species and edge', () => {
    expect(kg.species.size).toBe(SPECIES);
    expect(kg.species.has('urn:ppp:species:synthetic-000')).toBe(true);
    expect(kg.edges.length).toBe(SPECIES * EDGES_PER_SPECIES);
  });

  it('evaluates a 50-plant design under the 50 ms gate, with the same verdicts on every run', () => {
    const state = design(50, SPECIES);
    const first = evaluateDesign(state, kg, RULE_CONFIG);
    const second = evaluateDesign(state, kg, RULE_CONFIG);
    expect(second).toEqual(first);
    const ms = medianMs(() => evaluateDesign(state, kg, RULE_CONFIG), 7);
    expect(ms).toBeLessThan(50);
  });

  it('evaluates a 200-plant design under the same gate', () => {
    const state = design(200, SPECIES);
    const ms = medianMs(() => evaluateDesign(state, kg, RULE_CONFIG), 5);
    expect(ms).toBeLessThan(50);
  });
});
