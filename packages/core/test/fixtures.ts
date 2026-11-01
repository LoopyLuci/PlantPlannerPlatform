import { readFileSync } from 'node:fs';
import { type DesignState, buildKnowledgeGraph, parseRuleConfig } from '../src/index';

/** The rule configuration that ships with the app, so tests use the same numbers as the running system. */
export const RULE_CONFIG = parseRuleConfig(
  JSON.parse(readFileSync(new URL('../../../config/rules/rules-1.0.json', import.meta.url), 'utf8')),
);

/** A tiny, fully cited knowledge graph used to test rules in isolation. */
export const FIXTURE_FILES = {
  manifest: { graph_version: 'kg-test', status: 'fixture' },
  sourcesCsv: [
    'source_id,title,author,year,url,archive_url,license,citation_status,grade',
    'S-B,Fixture reference B,,,,,CC-BY-4.0,fixture,B',
    'S-C,Fixture lore C,,,,,CC-BY-4.0,fixture,C',
  ].join('\n'),
  speciesCsv: [
    'urn,scientific_name,common_name,family,growth_form,guild_layer',
    'urn:ppp:species:alpha-one,Alpha one,Alpha,Fam1,shrub,understory',
    'urn:ppp:species:beta-two,Beta two,Beta,Fam2,shrub,understory',
    'urn:ppp:species:gamma-three,Gamma three,Gamma,Fam3,annual herb,groundcover',
  ].join('\n'),
  traitsCsv: [
    'urn,trait,value,unit,source_id,grade',
    'urn:ppp:species:alpha-one,mature_spread_m,0.6,m,S-B,B',
    'urn:ppp:species:alpha-one,planting_spacing_m,0.5,m,S-B,B',
    'urn:ppp:species:alpha-one,sun_hours_min,6,h,S-B,B',
    'urn:ppp:species:alpha-one,ph_min,6,pH,S-B,B',
    'urn:ppp:species:alpha-one,ph_max,7,pH,S-B,B',
    'urn:ppp:species:alpha-one,hardiness_min,5,zone,S-B,B',
    'urn:ppp:species:alpha-one,hardiness_max,8,zone,S-B,B',
    'urn:ppp:species:beta-two,mature_spread_m,0.6,m,S-B,B',
    'urn:ppp:species:beta-two,planting_spacing_m,0.4,m,S-B,B',
    'urn:ppp:species:beta-two,sun_hours_min,6,h,S-B,B',
    'urn:ppp:species:beta-two,ph_min,6,pH,S-B,B',
    'urn:ppp:species:beta-two,ph_max,7,pH,S-B,B',
    'urn:ppp:species:beta-two,hardiness_min,5,zone,S-B,B',
    'urn:ppp:species:beta-two,hardiness_max,8,zone,S-B,B',
    'urn:ppp:species:gamma-three,planting_spacing_m,0.3,m,S-B,B',
    'urn:ppp:species:gamma-three,sun_hours_min,4,h,S-B,B',
    'urn:ppp:species:gamma-three,ph_min,5,pH,S-B,B',
    'urn:ppp:species:gamma-three,ph_max,6,pH,S-B,B',
  ].join('\n'),
  edgesCsv: [
    'species_a_urn,species_b_urn,mechanism,direction,source_id,grade,note',
    'urn:ppp:species:alpha-one,urn:ppp:species:beta-two,rivalry_claimed,antagonistic,S-B,B,fixture',
    'urn:ppp:species:alpha-one,urn:ppp:species:gamma-three,pest_repellence_claimed,beneficial,S-C,C,fixture',
    'urn:ppp:species:beta-two,urn:ppp:species:gamma-three,neutral_claim,neutral,S-C,C,fixture',
  ].join('\n'),
};

export function fixtureGraph() {
  return buildKnowledgeGraph(FIXTURE_FILES);
}

export function emptyDesign(overrides: Partial<DesignState['site']> = {}): DesignState {
  return {
    designId: 'd_test',
    name: 'Test',
    site: { name: 'Test site', widthM: 10, depthM: 10, hardinessZone: 6, sunHours: 7, soilPh: 6.5, ...overrides },
    placements: {},
    archived: false,
    seq: 0,
  };
}
