export type DomainErrorCode = 'conflict' | 'not_found' | 'invalid_transition';

/** A business-rule failure. Adapters map the code to HTTP status and CLI exit code. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
