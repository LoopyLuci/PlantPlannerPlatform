/**
 * The version triple travels with every result (invariant I4).
 * - modelVersion: the learned model in use. "none" until Ivy exists; the
 *   platform is fully functional without it (invariant I2).
 * - graphVersion: the curated knowledge graph, read from its manifest.
 * - ruleConfigVersion: the version of the rule configuration file in use
 *   (config/rules/), read at start-up.
 */
export const MODEL_VERSION = 'none';

export interface VersionTriple {
  modelVersion: string;
  graphVersion: string;
  ruleConfigVersion: string;
}

export function versionTriple(graphVersion: string, ruleConfigVersion: string): VersionTriple {
  return { modelVersion: MODEL_VERSION, graphVersion, ruleConfigVersion };
}
