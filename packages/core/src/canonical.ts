/**
 * Canonical JSON: object keys sorted recursively, undefined values dropped.
 * Two logically equal values always produce the same string, which is what
 * makes content hashes reproducible across machines and languages.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = sortKeys(source[key]);
    }
    return out;
  }
  return value;
}
