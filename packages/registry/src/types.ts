/**
 * Capability registry types. A capability is defined once here; the HTTP API,
 * CLI, MCP tool list and web client are projections of these definitions.
 * This package is pure data plus validation: it contains no handlers.
 */

export type SideEffect = 'read' | 'write' | 'sensitive_write';
export type Determinism = 'deterministic' | 'model-backed' | 'human-gated';
export type AtomicityClass = 'single_store' | 'saga' | 'idempotent_read' | 'non_atomic';
export type ReloadClass = 'pointer_swap' | 'dual_eval_swap' | 'deploy_only' | 'not_applicable';
export type WebSupport = 'identical' | 'adapted' | 'not_applicable';
export type InterfaceName = 'api' | 'cli' | 'mcp' | 'web';

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export interface FieldSpec {
  type: FieldType;
  description: string;
  required?: boolean;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  default?: string | number | boolean;
  items?: FieldSpec;
  properties?: Shape;
}

/** An object shape: named fields. Unknown keys are rejected. */
export type Shape = Record<string, FieldSpec>;

export interface CapabilityDef {
  id: string;
  title: string;
  description: string;
  input: Shape;
  /** Human-readable description of the success payload (`data`). */
  output: string;
  sideEffect: SideEffect;
  determinism: Determinism;
  scopes: readonly string[];
  atomicity: AtomicityClass;
  /** Writes must carry a client-generated Idempotency-Key. */
  idempotencyRequired: boolean;
  reloadClass: ReloadClass;
  recoveryBehavior: string;
  webSupport: WebSupport;
  exposure: Readonly<Record<InterfaceName, boolean>>;
}
