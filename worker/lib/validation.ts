import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { ApiError } from './errors';

export async function parseJsonBody<T>(c: Context<AppEnv>, schema: ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body must be valid JSON.');
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    const flattened = z.flattenError(result.error);
    const details: Record<string, string[]> = {};
    const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) details[field] = messages;
    }
    if (Object.keys(details).length === 0 && flattened.formErrors.length > 0) {
      details._form = flattened.formErrors;
    }
    throw new ApiError(422, 'validation_error', 'Please check the highlighted fields.', details);
  }
  return result.data;
}

export function parseQuery<T>(c: Context<AppEnv>, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
}

export function requestIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
