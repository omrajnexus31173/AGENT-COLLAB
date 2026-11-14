import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_ERROR',
    public retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export function safeError(error: unknown): { status: number; message: string; code: string } {
  if (error instanceof AppError) return { status: error.status, message: error.message, code: error.code };
  if (error instanceof ZodError)
    return { status: 422, message: 'The request contains an invalid value.', code: 'VALIDATION_ERROR' };
  if (error instanceof SyntaxError)
    return { status: 400, message: 'The request body must be valid JSON.', code: 'INVALID_JSON' };
  const code = (error as { code?: string })?.code;
  if (code === '23505')
    return { status: 409, message: 'That name or email is already in use.', code: 'CONFLICT' };
  if (code === '23503')
    return {
      status: 409,
      message: 'This item is still referenced. Refresh and try again.',
      code: 'REFERENCE_CONFLICT',
    };
  console.error('[request]Unhandled application error', {
    type: error instanceof Error ? error.name : 'UnknownError',
    code: code ?? 'none',
  });
  return {
    status: 500,
    message: 'The request could not be completed. Please try again.',
    code: 'INTERNAL_ERROR',
  };
}
