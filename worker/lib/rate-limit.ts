import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from './errors';
import { requestIp } from './validation';

/**
 * Fixed-window rate limiting backed by D1 so limits are shared across all
 * Worker isolates. The UPSERT is atomic: concurrent requests cannot both read
 * a stale counter.
 */
export async function enforceRateLimit(
  c: Context<AppEnv>,
  name: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  if (c.env.ENVIRONMENT === 'development' && c.env.DEMO_MODE === '1') return;

  const now = Date.now();
  const key = `${name}:${requestIp(c)}`;
  const resetAt = now + windowMs;

  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
     RETURNING count, reset_at`,
  )
    .bind(key, resetAt, now, now, resetAt)
    .first<{ count: number; reset_at: number }>();

  if (!row) return;

  if (row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((row.reset_at - now) / 1000));
    c.header('Retry-After', String(retryAfter));
    throw new ApiError(429, 'rate_limited', `Too many requests. Try again in ${retryAfter} seconds.`);
  }
}

/** Housekeeping used by the cron trigger; keeps the table from growing forever. */
export async function purgeRateLimits(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(Date.now() - 86_400_000).run();
}
