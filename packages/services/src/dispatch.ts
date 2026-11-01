import { type VersionTriple, versionTriple } from '@ppp/core';
import { applyDefaults, getCapability, validateInput, type ValidationIssue } from '@ppp/registry';
import type { ServiceContext } from './context';
import { type ErrorCode, ERROR_HTTP_STATUS, toMappedError } from './errors';
import { HANDLERS, type CallMeta } from './handlers';

/**
 * The single entry point for every adapter. HTTP, CLI and MCP all call
 * dispatch(), so validation, idempotency, error mapping and the version triple
 * are enforced identically no matter how a request arrived (invariant I9).
 */

export interface Provenance {
  interface: string;
  actor: string;
}

export interface SuccessEnvelope {
  ok: true;
  capability: string;
  data: Record<string, unknown>;
  version: VersionTriple;
  provenance: Provenance;
  idempotency: { key: string; replayed: boolean } | null;
}

export interface FailureEnvelope {
  ok: false;
  capability: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    issues?: ValidationIssue[];
  };
  version: VersionTriple;
  provenance: Provenance;
}

export type Envelope = SuccessEnvelope | FailureEnvelope;

export function httpStatusFor(envelope: Envelope): number {
  return envelope.ok ? 200 : ERROR_HTTP_STATUS[envelope.error.code];
}

export async function dispatch(
  ctx: ServiceContext,
  capabilityId: string,
  rawInput: unknown,
  meta: CallMeta,
): Promise<Envelope> {
  const version = versionTriple(ctx.kg.graphVersion, ctx.rules.version);
  const provenance: Provenance = { interface: meta.interface, actor: meta.actorId };
  const fail = (code: ErrorCode, message: string, extra: Partial<FailureEnvelope['error']> = {}): FailureEnvelope => ({
    ok: false,
    capability: capabilityId,
    error: { code, message, ...extra },
    version,
    provenance,
  });

  const def = getCapability(capabilityId);
  if (!def) return fail('unknown_capability', `No capability named ${capabilityId}`);

  const issues = validateInput(def.input, rawInput);
  if (issues.length > 0) return fail('validation_error', `Invalid input for ${capabilityId}`, { issues });

  if (def.sideEffect !== 'read' && !meta.idempotencyKey) {
    return fail('idempotency_key_required', `${capabilityId} is a write and needs an Idempotency-Key`);
  }

  const handler = HANDLERS[capabilityId];
  if (!handler) return fail('internal_error', `Capability ${capabilityId} has no handler`);

  try {
    const input = applyDefaults(def.input, rawInput as Record<string, unknown>);
    const data = await handler(ctx, input, meta);
    const replayed = data.replayed === true;
    return {
      ok: true,
      capability: capabilityId,
      data,
      version,
      provenance,
      idempotency: def.sideEffect === 'read' ? null : { key: meta.idempotencyKey ?? '', replayed },
    };
  } catch (error) {
    const mapped = toMappedError(error);
    return fail(mapped.code, mapped.message, mapped.details ? { details: mapped.details } : {});
  }
}
