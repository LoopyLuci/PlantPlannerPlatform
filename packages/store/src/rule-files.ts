import { readFile } from 'node:fs/promises';
import { type RuleConfig, parseRuleConfig } from '@ppp/core';

/** Reads and validates one rule configuration file. A bad file stops start-up rather than falling back silently. */
export async function readRuleConfig(path: string): Promise<RuleConfig> {
  const text = await readFile(path, 'utf8');
  try {
    return parseRuleConfig(JSON.parse(text));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot use rule configuration ${path}: ${reason}`);
  }
}
