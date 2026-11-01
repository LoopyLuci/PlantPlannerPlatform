import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  MCP_TOOL_LIMIT,
  applyDefaults,
  getCapability,
  mcpCapabilities,
  parseCliValue,
  toJsonSchema,
  toolName,
  validateInput,
  validateRegistry,
} from '../src/index';

describe('capability registry', () => {
  it('passes every structural check (invariant I9 gate)', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('keeps ids unique and MCP tool names safe', () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of mcpCapabilities()) {
      expect(toolName(def.id)).toMatch(/^[a-z_]{3,64}$/);
    }
  });

  it('exposes only read capabilities over MCP, within the tool limit', () => {
    const tools = mcpCapabilities();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.length).toBeLessThanOrEqual(MCP_TOOL_LIMIT);
    expect(tools.every((t) => t.sideEffect === 'read')).toBe(true);
  });

  it('requires an Idempotency-Key on every write and a confirm flag on sensitive writes', () => {
    for (const def of CAPABILITIES.filter((c) => c.sideEffect !== 'read')) {
      expect(def.idempotencyRequired, def.id).toBe(true);
    }
    const archive = getCapability('design.archive');
    expect(archive?.sideEffect).toBe('sensitive_write');
    expect(archive?.input.confirm?.required).toBe(true);
  });

  it('detects a broken definition', () => {
    const broken = [{ ...CAPABILITIES[0], id: 'Bad Id', idempotencyRequired: false, sideEffect: 'write' as const }];
    const problems = validateRegistry(broken);
    expect(problems.some((p) => p.includes('area.action'))).toBe(true);
    expect(problems.some((p) => p.includes('Idempotency-Key'))).toBe(true);
  });
});

describe('input validation', () => {
  const addPlacement = getCapability('design.add_placement')!.input;

  it('accepts a complete, well-typed input', () => {
    const issues = validateInput(addPlacement, {
      design_id: 'd_0123456789abcdef',
      species_urn: 'urn:ppp:species:lavandula-angustifolia',
      x: 1.2,
      y: 0.4,
    });
    expect(issues).toEqual([]);
  });

  it('requires coordinates for add_placement', () => {
    const paths = validateInput(addPlacement, {
      design_id: 'd_0123456789abcdef',
      species_urn: 'urn:ppp:species:lavandula-angustifolia',
    }).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('rejects unknown fields, wrong types and NaN', () => {
    const issues = validateInput(addPlacement, {
      design_id: 'd_0123456789abcdef',
      species_urn: 'urn:ppp:species:lavandula-angustifolia',
      x: Number.NaN,
      y: '3',
      extra: true,
    });
    const paths = issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['x', 'y', 'extra']));
  });

  it('applies defaults and reports enum violations', () => {
    const search = getCapability('plants.search')!.input;
    expect(applyDefaults(search, {}).limit).toBe(25);
    expect(validateInput(search, { guild_layer: 'sky' }).map((i) => i.path)).toEqual(['guild_layer']);
  });

  it('parses CLI strings to the declared type', () => {
    expect(parseCliValue({ type: 'number', description: '' }, '2.5')).toBe(2.5);
    expect(parseCliValue({ type: 'boolean', description: '' }, '')).toBe(true);
    expect(Number.isNaN(parseCliValue({ type: 'number', description: '' }, '  ') as number)).toBe(true);
    expect(parseCliValue({ type: 'array', description: '' }, '[1,2]')).toEqual([1, 2]);
  });

  it('produces JSON Schema that marks required fields and forbids extras', () => {
    const schema = toJsonSchema(addPlacement) as { required: string[]; additionalProperties: boolean };
    expect(schema.required).toEqual(expect.arrayContaining(['design_id', 'species_urn', 'x', 'y']));
    expect(schema.additionalProperties).toBe(false);
  });
});
