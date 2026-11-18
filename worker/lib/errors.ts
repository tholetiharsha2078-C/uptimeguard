import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../env';

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(c: Context<AppEnv>, error: ApiError) {
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    error.status,
  );
}

export function unauthorized(message = 'You need to sign in to continue.') {
  return new ApiError(401, 'unauthorized', message);
}

export function notFound(message = 'Not found.') {
  return new ApiError(404, 'not_found', message);
}
