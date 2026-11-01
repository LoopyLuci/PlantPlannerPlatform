/**
 * Raised when stored data fails verification. The store fails closed: it
 * refuses writes to a design whose log does not verify and never guesses.
 */
export class IntegrityError extends Error {
  constructor(
    message: string,
    readonly designId?: string,
  ) {
    super(message);
    this.name = 'IntegrityError';
  }
}
