/**
 * The curated plant knowledge graph, loaded from plain-text CSV (see
 * data/knowledge-graph/SCHEMA.md). This module is pure: it parses strings it
 * is given, so it runs in Node and in the browser alike.
 *
 * Build-time invariant (Phase 0 gate): every trait row and every companion edge
 * cites a known source and carries an evidence grade. Violations throw, so
 * a graph with uncited facts cannot be loaded.
 */

export type Grade = 'A' | 'B' | 'C';
export type Direction = 'beneficial' | 'antagonistic' | 'neutral';
export type GuildLayer = 'canopy' | 'understory' | 'groundcover' | 'root';

export const GUILD_LAYERS: readonly GuildLayer[] = ['canopy', 'understory', 'groundcover', 'root'];
export const DIRECTIONS: readonly Direction[] = ['beneficial', 'antagonistic', 'neutral'];
export const NUMERIC_TRAITS = [
  'mature_height_m',
  'mature_spread_m',
  'planting_spacing_m',
  'sun_hours_min',
  'ph_min',
  'ph_max',
  'hardiness_min',
  'hardiness_max',
] as const;
export type TraitName = (typeof NUMERIC_TRAITS)[number];

export interface SpeciesRecord {
  urn: string;
  scientificName: string;
  commonName: string;
  family: string;
  growthForm: string;
  guildLayer: GuildLayer;
}

export interface TraitValue {
  value: number;
  sourceId: string;
  grade: Grade;
}

export interface CompanionEdge {
  a: string;
  b: string;
  mechanism: string;
  direction: Direction;
  sourceId: string;
  grade: Grade;
  note: string;
}

export interface SourceRecord {
  sourceId: string;
  title: string;
  author: string;
  year: string;
  url: string;
  archiveUrl: string;
  license: string;
  citationStatus: string;
  grade: Grade;
}

export interface KnowledgeGraph {
  graphVersion: string;
  graphStatus: string;
  species: ReadonlyMap<string, SpeciesRecord>;
  traits: ReadonlyMap<string, Partial<Record<TraitName, TraitValue>>>;
  edges: readonly CompanionEdge[];
  sources: ReadonlyMap<string, SourceRecord>;
}

export interface KnowledgeFiles {
  manifest: { graph_version?: string; status?: string };
  speciesCsv: string;
  traitsCsv: string;
  edgesCsv: string;
  sourcesCsv: string;
}

export class KnowledgeIntegrityError extends Error {
  constructor(readonly problems: string[]) {
    super(`Knowledge graph integrity check failed:\n- ${problems.join('\n- ')}`);
    this.name = 'KnowledgeIntegrityError';
  }
}

export type CsvRow = Record<string, string>;

/** Parses RFC 4180-style CSV: quoted fields, doubled quotes, CRLF or LF line endings. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const [header, ...body] = rows as [string[], ...string[][]];
  const names = header.map((h) => h.trim());
  return body.map((cells) => {
    const out: CsvRow = {};
    names.forEach((name, index) => {
      out[name] = (cells[index] ?? '').trim();
    });
    return out;
  });
}

export function isGrade(value: string | undefined): value is Grade {
  return value === 'A' || value === 'B' || value === 'C';
}

export function gradeWeight(grade: Grade): number {
  if (grade === 'A') return 1;
  if (grade === 'B') return 0.7;
  return 0.4;
}

/** The weaker of two grades. A combined verdict is only as strong as its weakest input. */
export function lowerGrade(a: Grade, b: Grade): Grade {
  return gradeWeight(a) <= gradeWeight(b) ? a : b;
}

export function buildKnowledgeGraph(files: KnowledgeFiles): KnowledgeGraph {
  const problems: string[] = [];
  if (!files.manifest.graph_version) problems.push('manifest.json: graph_version is missing');

  const sources = new Map<string, SourceRecord>();
  for (const row of parseCsv(files.sourcesCsv)) {
    const sourceId = row.source_id ?? '';
    if (!sourceId) {
      problems.push('sources.csv: a row has no source_id');
      continue;
    }
    if (sources.has(sourceId)) problems.push(`sources.csv: duplicate source_id ${sourceId}`);
    if (!isGrade(row.grade)) problems.push(`sources.csv: ${sourceId} has invalid grade "${row.grade ?? ''}"`);
    sources.set(sourceId, {
      sourceId,
      title: row.title ?? '',
      author: row.author ?? '',
      year: row.year ?? '',
      url: row.url ?? '',
      archiveUrl: row.archive_url ?? '',
      license: row.license ?? '',
      citationStatus: row.citation_status ?? '',
      grade: isGrade(row.grade) ? row.grade : 'C',
    });
  }

  const species = new Map<string, SpeciesRecord>();
  for (const row of parseCsv(files.speciesCsv)) {
    const urn = row.urn ?? '';
    if (!/^urn:ppp:species:[a-z0-9-]+$/.test(urn)) {
      problems.push(`species.csv: invalid urn "${urn}"`);
      continue;
    }
    if (species.has(urn)) problems.push(`species.csv: duplicate urn ${urn}`);
    if (!(GUILD_LAYERS as readonly string[]).includes(row.guild_layer ?? '')) {
      problems.push(`species.csv: ${urn} has invalid guild_layer "${row.guild_layer ?? ''}"`);
    }
    species.set(urn, {
      urn,
      scientificName: row.scientific_name ?? '',
      commonName: row.common_name ?? '',
      family: row.family ?? '',
      growthForm: row.growth_form ?? '',
      guildLayer: (row.guild_layer ?? 'understory') as GuildLayer,
    });
  }

  const traits = new Map<string, Partial<Record<TraitName, TraitValue>>>();
  for (const row of parseCsv(files.traitsCsv)) {
    const urn = row.urn ?? '';
    const trait = row.trait ?? '';
    const label = `${urn} ${trait}`;
    if (!species.has(urn)) {
      problems.push(`traits.csv: unknown species ${urn}`);
      continue;
    }
    if (!(NUMERIC_TRAITS as readonly string[]).includes(trait)) {
      problems.push(`traits.csv: unknown trait "${trait}" for ${urn}`);
      continue;
    }
    const value = Number(row.value);
    if (row.value === '' || !Number.isFinite(value)) problems.push(`traits.csv: ${label} is not numeric`);
    if (!sources.has(row.source_id ?? '')) problems.push(`traits.csv: ${label} cites unknown source "${row.source_id ?? ''}"`);
    if (!isGrade(row.grade)) problems.push(`traits.csv: ${label} has invalid grade "${row.grade ?? ''}"`);
    const name = trait as TraitName;
    const record = traits.get(urn) ?? {};
    if (record[name]) problems.push(`traits.csv: duplicate trait ${label}`);
    record[name] = { value, sourceId: row.source_id ?? '', grade: isGrade(row.grade) ? row.grade : 'C' };
    traits.set(urn, record);
  }

  const edges: CompanionEdge[] = [];
  for (const row of parseCsv(files.edgesCsv)) {
    const a = row.species_a_urn ?? '';
    const b = row.species_b_urn ?? '';
    const label = `${a} <-> ${b}`;
    if (!species.has(a) || !species.has(b)) problems.push(`companion_edges.csv: unknown species in ${label}`);
    if (!row.mechanism) problems.push(`companion_edges.csv: missing mechanism in ${label}`);
    if (!(DIRECTIONS as readonly string[]).includes(row.direction ?? '')) {
      problems.push(`companion_edges.csv: invalid direction in ${label}`);
    }
    if (!sources.has(row.source_id ?? '')) problems.push(`companion_edges.csv: ${label} cites unknown source`);
    if (!isGrade(row.grade)) problems.push(`companion_edges.csv: ${label} has invalid grade`);
    edges.push({
      a,
      b,
      mechanism: row.mechanism ?? '',
      direction: (row.direction ?? 'neutral') as Direction,
      sourceId: row.source_id ?? '',
      grade: isGrade(row.grade) ? row.grade : 'C',
      note: row.note ?? '',
    });
  }

  if (problems.length > 0) throw new KnowledgeIntegrityError(problems);
  return {
    graphVersion: files.manifest.graph_version ?? '',
    graphStatus: files.manifest.status ?? 'unknown',
    species,
    traits,
    edges,
    sources,
  };
}

export function traitRecord(kg: KnowledgeGraph, urn: string, trait: TraitName): TraitValue | undefined {
  return kg.traits.get(urn)?.[trait];
}

export function traitValue(kg: KnowledgeGraph, urn: string, trait: TraitName): number | undefined {
  return traitRecord(kg, urn, trait)?.value;
}

export function edgesBetween(kg: KnowledgeGraph, a: string, b: string): CompanionEdge[] {
  return kg.edges.filter((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
