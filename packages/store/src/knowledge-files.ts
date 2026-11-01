import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type KnowledgeGraph, buildKnowledgeGraph } from '@ppp/core';

/** Reads the plain-text knowledge graph from a directory and validates it. */
export async function readKnowledgeGraph(dir: string): Promise<KnowledgeGraph> {
  const read = (name: string) => readFile(join(dir, name), 'utf8');
  const manifest = JSON.parse(await read('manifest.json')) as { graph_version?: string; status?: string };
  return buildKnowledgeGraph({
    manifest,
    speciesCsv: await read('species.csv'),
    traitsCsv: await read('traits.csv'),
    edgesCsv: await read('companion_edges.csv'),
    sourcesCsv: await read('sources.csv'),
  });
}
