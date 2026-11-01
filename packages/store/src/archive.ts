import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import {
  type DesignState,
  type FeedbackReasonTag,
  type KnowledgeGraph,
  type PlacementState,
  round2,
  routeFeedback,
} from '@ppp/core';
import { IntegrityError } from './errors';
import { sha256Bytes } from './hash';
import type { DesignStore } from './design-store';
import type { FeedbackEntry, FeedbackLog } from './feedback-log';

/**
 * archive.export_plain: regenerates a directory of plain text and CSV that a
 * person can read with no project software (invariant I10). The directory is
 * generated output: never edit it by hand, always regenerate it.
 */

export interface ArchiveOptions {
  store: DesignStore;
  feedback: FeedbackLog;
  knowledgeDir: string;
  rulesFile: string;
  outDir: string;
  kg: KnowledgeGraph;
  generatedAt: string;
}

export interface ArchiveFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ArchiveSummary {
  outDir: string;
  designs: number;
  species: number;
  files: ArchiveFile[];
}

const KNOWLEDGE_FILES = ['manifest.json', 'species.csv', 'traits.csv', 'companion_edges.csv', 'sources.csv', 'SCHEMA.md'];

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function placementsCsv(state: DesignState, kg: KnowledgeGraph): string {
  const header = 'placement_id,species_urn,common_name,scientific_name,x_m,y_m,footprint_m,pinned';
  const rows = sortedPlacements(state).map((p) => {
    const species = kg.species.get(p.speciesUrn);
    return [
      p.id,
      p.speciesUrn,
      species?.commonName ?? '',
      species?.scientificName ?? '',
      round2(p.x),
      round2(p.y),
      round2(p.footprintM),
      p.pinned,
    ]
      .map(csvCell)
      .join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

export function placementsGeoJson(state: DesignState, kg: KnowledgeGraph): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    name: state.name,
    crs: { type: 'name', properties: { name: 'local-site-metres' } },
    features: sortedPlacements(state).map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round2(p.x), round2(p.y)] },
      properties: {
        placement_id: p.id,
        species_urn: p.speciesUrn,
        common_name: kg.species.get(p.speciesUrn)?.commonName ?? '',
        footprint_m: round2(p.footprintM),
        pinned: p.pinned,
      },
    })),
  };
}

function sortedPlacements(state: DesignState): PlacementState[] {
  return Object.values(state.placements).sort((a, b) => a.id.localeCompare(b.id));
}

export function feedbackCsv(entries: readonly FeedbackEntry[]): string {
  const header =
    'feedback_id,recorded_at,actor,design_id,placement_id,rule,reason_tag,route,note,graph_version,rule_config_version,model_version';
  const rows = entries.map((e) =>
    [
      e.payload.id,
      e.ts,
      e.actor.id,
      e.payload.designId,
      e.payload.placementId ?? '',
      e.payload.rule,
      e.payload.reasonTag,
      routeFeedback(e.payload.reasonTag as FeedbackReasonTag).route,
      e.payload.note,
      e.payload.graphVersion,
      e.payload.ruleConfigVersion,
      e.payload.modelVersion,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

function readme(generatedAt: string, graphVersion: string, designs: number): string {
  return [
    '# Plant Planner Platform: plain-text archive',
    '',
    `Generated ${generatedAt} from knowledge graph ${graphVersion} and ${designs} design(s).`,
    '',
    'You can read every file here with a text editor or a spreadsheet program.',
    'No project software is needed.',
    '',
    '## What is where',
    '',
    '- `knowledge-graph/`: the plant knowledge graph. `species.csv` lists plants. `traits.csv`',
    '  lists each trait value with its source and evidence grade. `companion_edges.csv` lists',
    '  plant relationships with their mechanisms. `sources.csv` lists every citation.',
    '  `SCHEMA.md` defines every column.',
    '- `designs/<design_id>/design.json`: the design settings and its current sequence number.',
    '- `designs/<design_id>/placements.csv`: every plant placed, with position in metres.',
    '- `designs/<design_id>/placements.geojson`: the same placements as GeoJSON points.',
    '  Coordinates are metres from the site top-left corner, not GPS. x grows to the east,',
    '  y grows downward on a north-up plan.',
    '- `designs/<design_id>/events.ndjson`: the full history. One JSON object per line.',
    '  Each line has a `hash` and a `prev_hash`. Replaying the lines in order rebuilds the design.',
    '- `rules/`: the rule thresholds in use (`rules-1.0.json`). Every verdict names this version.',
    '- `feedback/feedback.csv`: every recorded disagreement with a verdict, its reason, and where it was routed.',
    '  Routing suggests a human action only. Nothing in this archive was changed by feedback.',
    '- `feedback/feedback.ndjson`: the same records as the hash-chained log, one JSON object per line.',
    '- `checksums.sha256`: a SHA-256 for every file. Check them with `sha256sum -c checksums.sha256`.',
    '',
    '## Confidence',
    '',
    'Each trait has an evidence grade: A (measured or authoritative), B (expert consensus),',
    'C (anecdotal, unverified, or mixed). Current seed data is C until it is curated.',
    '',
  ].join('\n');
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export async function exportPlainArchive(options: ArchiveOptions): Promise<ArchiveSummary> {
  const { store, knowledgeDir, outDir, kg, generatedAt } = options;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  const put = async (relativePath: string, content: string | Uint8Array) => {
    const full = join(outDir, ...relativePath.split('/'));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    written.push(relativePath);
  };

  for (const name of KNOWLEDGE_FILES) {
    await put(posix.join('knowledge-graph', name), await readFile(join(knowledgeDir, name)));
  }

  const ids = await store.listDesignIds();
  let designCount = 0;
  for (const designId of ids) {
    const state = await store.loadState(designId);
    if (!state) continue;
    designCount += 1;
    const base = posix.join('designs', designId);
    await put(
      posix.join(base, 'design.json'),
      `${JSON.stringify(
        {
          design_id: designId,
          name: state.name,
          archived: state.archived,
          head_seq: state.seq,
          site: state.site,
          graph_version: kg.graphVersion,
          generated_at: generatedAt,
        },
        null,
        2,
      )}\n`,
    );
    await put(posix.join(base, 'placements.csv'), placementsCsv(state, kg));
    await put(posix.join(base, 'placements.geojson'), `${JSON.stringify(placementsGeoJson(state, kg), null, 2)}\n`);
    await put(posix.join(base, 'events.ndjson'), await readFile(store.logPath(designId), 'utf8'));
  }

  const feedback = await options.feedback.read();
  if (!feedback.chainOk) {
    throw new IntegrityError(`cannot export the feedback log: ${feedback.problem}`, 'feedback');
  }
  await put(posix.join('feedback', 'feedback.ndjson'), await readOptional(options.feedback.path));
  await put(posix.join('feedback', 'feedback.csv'), feedbackCsv(feedback.entries));
  await put(posix.join('rules', basename(options.rulesFile)), await readFile(options.rulesFile));
  await put(
    posix.join('feedback', 'README.md'),
    'Feedback on verdicts. feedback.csv is the readable view; feedback.ndjson is the chained record.\n' +
      'Each route is a suggestion for a person. Nothing here changes a design or the knowledge graph.\n',
  );
  await put('README.md', readme(generatedAt, kg.graphVersion, designCount));

  const files: ArchiveFile[] = [];
  for (const relativePath of [...written].sort()) {
    const bytes = await readFile(join(outDir, ...relativePath.split('/')));
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256Bytes(bytes) });
  }
  const checksumLines = files.map((f) => `${f.sha256}  ${f.path}`);
  await put('checksums.sha256', `${checksumLines.join('\n')}\n`);

  return { outDir, designs: designCount, species: kg.species.size, files };
}
