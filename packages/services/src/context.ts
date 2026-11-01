import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeGraph, RuleConfig } from '@ppp/core';
import { DesignStore, FeedbackLog, readKnowledgeGraph, readRuleConfig } from '@ppp/store';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface ServiceContext {
  dataDir: string;
  knowledgeDir: string;
  rulesFile: string;
  archiveDir: string;
  store: DesignStore;
  feedback: FeedbackLog;
  kg: KnowledgeGraph;
  rules: RuleConfig;
  now: () => Date;
}

export interface ContextOptions {
  dataDir?: string;
  knowledgeDir?: string;
  rulesFile?: string;
  now?: () => Date;
}

/**
 * Builds the shared service context once per process. Every adapter (HTTP,
 * CLI, MCP) builds it the same way, so they all see the same data.
 */
export async function createContext(options: ContextOptions = {}): Promise<ServiceContext> {
  const dataDir = options.dataDir ?? process.env.PPP_DATA_DIR ?? join(REPO_ROOT, 'data');
  const knowledgeDir = options.knowledgeDir ?? process.env.PPP_KNOWLEDGE_DIR ?? join(REPO_ROOT, 'data', 'knowledge-graph');
  const rulesFile = options.rulesFile ?? process.env.PPP_RULES_FILE ?? join(REPO_ROOT, 'config', 'rules', 'rules-1.0.json');
  const kg = await readKnowledgeGraph(knowledgeDir);
  const rules = await readRuleConfig(rulesFile);
  return {
    dataDir,
    knowledgeDir,
    rulesFile,
    archiveDir: join(dataDir, 'archive'),
    store: new DesignStore(join(dataDir, 'designs')),
    feedback: new FeedbackLog(join(dataDir, 'feedback', 'feedback.ndjson')),
    kg,
    rules,
    now: options.now ?? (() => new Date()),
  };
}
