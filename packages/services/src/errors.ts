import { DomainError } from '@ppp/core';
import { IntegrityError } from '@ppp/store';

export type ErrorCode =
  | 'validation_error'
  | 'unknown_capability'
  | 'not_found'
  | 'conflict'
  | 'idempotency_key_required'
  | 'confirmation_required'
  | 'integrity_error'
  | 'internal_error';

export class CapabilityError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unknown_capability: 404,
  not_found: 404,
  conflict: 409,
  idempotency_key_required: 400,
  confirmation_required: 400,
  integrity_error: 500,
  internal_error: 500,
};

/** Stable exit codes for the CLI: 0 ok, 1 general, 2 input, 4 conflict, 5 integrity. */
export const ERROR_EXIT_CODE: Record<ErrorCode, number> = {
  validation_error: 2,
  unknown_capability: 2,
  not_found: 1,
  conflict: 4,
  idempotency_key_required: 2,
  confirmation_required: 2,
  integrity_error: 5,
  internal_error: 1,
};

export interface MappedError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function toMappedError(error: unknown): MappedError {
  if (error instanceof CapabilityError) return { code: error.code, message: error.message, details: error.details };
  if (error instanceof DomainError) {
    const code = error.code === 'invalid_transition' ? 'conflict' : error.code;
    return { code, message: error.message, details: error.details };
  }
  if (error instanceof IntegrityError) {
    return { code: 'integrity_error', message: error.message, details: error.designId ? { designId: error.designId } : undefined };
  }
  return { code: 'internal_error', message: error instanceof Error ? error.message : String(error) };
}
