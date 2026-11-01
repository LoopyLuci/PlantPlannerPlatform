import type { FieldSpec, Shape } from './types';

export interface ValidationIssue {
  path: string;
  message: string;
}

type JsonSchema = Record<string, unknown>;

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function checkValue(spec: FieldSpec, value: unknown, path: string, issues: ValidationIssue[]): void {
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') {
        issues.push({ path, message: 'must be a string' });
        return;
      }
      if (spec.minLength !== undefined && value.length < spec.minLength) {
        issues.push({ path, message: `must be at least ${spec.minLength} characters` });
      }
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        issues.push({ path, message: `must be at most ${spec.maxLength} characters` });
      }
      if (spec.enum && !spec.enum.includes(value)) {
        issues.push({ path, message: `must be one of: ${spec.enum.join(', ')}` });
      }
      return;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, message: 'must be a finite number' });
        return;
      }
      if (spec.type === 'integer' && !Number.isInteger(value)) {
        issues.push({ path, message: 'must be an integer' });
        return;
      }
      if (spec.min !== undefined && value < spec.min) issues.push({ path, message: `must be >= ${spec.min}` });
      if (spec.max !== undefined && value > spec.max) issues.push({ path, message: `must be <= ${spec.max}` });
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') issues.push({ path, message: 'must be true or false' });
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ path, message: 'must be an array' });
        return;
      }
      if (spec.items) {
        value.forEach((item, index) => checkValue(spec.items as FieldSpec, item, `${path}[${index}]`, issues));
      }
      return;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        issues.push({ path, message: 'must be an object' });
        return;
      }
      if (spec.properties) validateFields(spec.properties, value as Record<string, unknown>, path, issues);
      return;
    }
  }
}

function validateFields(shape: Shape, obj: Record<string, unknown>, base: string, issues: ValidationIssue[]): void {
  for (const [key, spec] of Object.entries(shape)) {
    const path = joinPath(base, key);
    const value = obj[key];
    if (value === undefined) {
      if (spec.required) issues.push({ path, message: 'is required' });
      continue;
    }
    checkValue(spec, value, path, issues);
  }
  for (const key of Object.keys(obj)) {
    if (!(key in shape)) issues.push({ path: joinPath(base, key), message: 'is not a recognized field' });
  }
}

/** Validates a raw input object against a capability's input shape. */
export function validateInput(shape: Shape, input: unknown): ValidationIssue[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return [{ path: '', message: 'input must be an object' }];
  }
  const issues: ValidationIssue[] = [];
  validateFields(shape, input as Record<string, unknown>, '', issues);
  return issues;
}

/** Returns a copy of `input` with top-level defaults filled in. */
export function applyDefaults(shape: Shape, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const [key, spec] of Object.entries(shape)) {
    if (out[key] === undefined && spec.default !== undefined) out[key] = spec.default;
  }
  return out;
}

const JSON_TYPES: Record<FieldSpec['type'], string> = {
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
};

function specToJsonSchema(spec: FieldSpec): JsonSchema {
  const out: JsonSchema = { type: JSON_TYPES[spec.type], description: spec.description };
  if (spec.enum) out.enum = [...spec.enum];
  if (spec.minLength !== undefined) out.minLength = spec.minLength;
  if (spec.maxLength !== undefined) out.maxLength = spec.maxLength;
  if (spec.min !== undefined) out.minimum = spec.min;
  if (spec.max !== undefined) out.maximum = spec.max;
  if (spec.default !== undefined) out.default = spec.default;
  if (spec.items) out.items = specToJsonSchema(spec.items);
  if (spec.properties) out.properties = toJsonSchema(spec.properties);
  return out;
}

/** Converts a capability input shape to JSON Schema (used by MCP and OpenAPI). */
export function toJsonSchema(shape: Shape): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(shape)) {
    properties[key] = specToJsonSchema(spec);
    if (spec.required) required.push(key);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

/** Converts one CLI flag value (always a string) to the type the field expects. */
export function parseCliValue(spec: FieldSpec, raw: string): unknown {
  switch (spec.type) {
    case 'number':
    case 'integer':
      return raw.trim() === '' ? Number.NaN : Number(raw);
    case 'boolean':
      if (raw === '' || raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    case 'array':
    case 'object':
      return JSON.parse(raw) as unknown;
    default:
      return raw;
  }
}
