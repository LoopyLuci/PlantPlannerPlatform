import { CAPABILITIES } from './capabilities';
import type { CapabilityDef } from './types';

export * from './types';
export * from './validate';
export { CAPABILITIES, CAPABILITY_IDS, getCapability, inputShape } from './capabilities';

/** MCP tools are read-only in this phase; agents propose, humans write (ADR-0005). */
export const MCP_TOOL_LIMIT = 15;

export function mcpCapabilities(defs: readonly CapabilityDef[] = CAPABILITIES): CapabilityDef[] {
  return defs.filter((c) => c.exposure.mcp);
}

/** Converts a capability id into a tool name that every MCP client accepts. */
export function toolName(id: string): string {
  return id.replace(/\./g, '_');
}

const ID_PATTERN = /^[a-z_]+\.[a-z_]+$/;

/**
 * Registry completeness checks. Each returned string is a violation.
 * The test suite and `npm test` fail if this list is not empty.
 */
export function validateRegistry(defs: readonly CapabilityDef[] = CAPABILITIES): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    const label = def.id || '(missing id)';
    if (!ID_PATTERN.test(def.id)) problems.push(`${label}: id must look like "area.action"`);
    if (seen.has(def.id)) problems.push(`${label}: duplicate id`);
    seen.add(def.id);
    for (const key of ['title', 'description', 'output', 'recoveryBehavior'] as const) {
      if (!def[key]) problems.push(`${label}: ${key} is empty`);
    }
    if (def.scopes.length === 0) problems.push(`${label}: at least one scope is required`);
    if (def.sideEffect !== 'read' && !def.idempotencyRequired) {
      problems.push(`${label}: writes must require an Idempotency-Key`);
    }
    if (def.sideEffect === 'read' && def.atomicity !== 'idempotent_read') {
      problems.push(`${label}: reads must be idempotent_read`);
    }
    if (def.sideEffect !== 'read' && def.atomicity === 'idempotent_read') {
      problems.push(`${label}: writes cannot be idempotent_read`);
    }
    if (def.determinism === 'human-gated' && def.sideEffect !== 'sensitive_write') {
      problems.push(`${label}: human-gated capabilities must be sensitive_write`);
    }
    if (def.sideEffect === 'sensitive_write') {
      const confirm = def.input.confirm;
      if (!confirm || confirm.type !== 'boolean' || !confirm.required) {
        problems.push(`${label}: sensitive_write requires a required boolean "confirm" field`);
      }
    }
    if (def.exposure.mcp && def.sideEffect !== 'read') {
      problems.push(`${label}: only read capabilities may be exposed over MCP`);
    }
  }
  const mcpCount = mcpCapabilities(defs).length;
  if (mcpCount > MCP_TOOL_LIMIT) {
    problems.push(`MCP exposes ${mcpCount} tools; the limit is ${MCP_TOOL_LIMIT}`);
  }
  return problems;
}
