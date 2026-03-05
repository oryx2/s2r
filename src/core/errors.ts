// Error types

export class S2RError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S2RError';
  }
}

export function isS2RError(error: unknown): error is S2RError {
  return error instanceof S2RError;
}
