import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import type { WebsiteListItem } from '../../shared/types';
import { createWebsiteSchema, rangeSchema, updateWebsiteSchema } from '../../shared/schemas';
import { displayHostname, validateWebsiteUrl } from '../../shared/url';
import { requireAuth } from '../lib/auth';
import { ApiError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { assertSafeTarget, unsafeCodeToApiCode, UnsafeTargetError } from '../lib/ssrf';
import { parseJsonBody } from '../lib/validation';
import { runWebsiteCheck } from '../services/check-runner';
import { getMonitoringLogs, getResponseSeries, getUptimeBuckets, getWebsiteDetail, getWebsiteForUser, getWebsiteList } from '../services/analytics';

const websites = new Hono<AppEnv>();

websites.use('*', requireAuth);

const MAX_WEBSITES_PER_USER = 50;

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  range: rangeSchema,
});

websites.get('/', async (c) => {
  const list = await getWebsiteList(c.env.DB, c.get('user').id);
  return c.json({ websites: list });
});

websites.post('/', async (c) => {
  await enforceRateLimit(c, 'website-create', 30, 60 * 60 * 1000);
  const user = c.get('user');
  const input = await parseJsonBody(c, createWebsiteSchema);

  const parsed = validateWebsiteUrl(input.url);
  if (!parsed.ok) {
    throw new ApiError(422, parsed.code, parsed.message, { url: [parsed.message] });
  }

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM websites WHERE user_id = ?')
    .bind(user.id)
    .first<{ count: number }>();
  if (Number(count?.count ?? 0) >= MAX_WEBSITES_PER_USER) {
    throw new ApiError(
      422,
      'limit_reached',
      `You can monitor up to ${MAX_WEBSITES_PER_USER} websites. Remove one to add another.`,
    );
  }

  const duplicate = await c.env.DB.prepare('SELECT id FROM websites WHERE user_id = ? AND url = ?')
    .bind(user.id, parsed.url)
    .first<{ id: string }>();
  if (duplicate) {
    throw new ApiError(409, 'already_monitored', 'That website is already being monitored.', {
      url: ['That website is already being monitored.'],
    });
  }

  try {
    await assertSafeTarget(parsed.url);
  } catch (error) {
    if (error instanceof UnsafeTargetError) {
      throw new ApiError(422, unsafeCodeToApiCode(error.code), error.message, { url: [error.message] });
    }
    throw error;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const name = input.name?.trim() || displayHostname(parsed.url);
  const interval = input.intervalMinutes ?? user.defaultIntervalMinutes;

  await c.env.DB.prepare(
    `INSERT INTO websites
       (id, user_id, name, url, hostname, status, is_paused, check_interval_minutes,
        last_checked_at, last_status_code, last_response_time_ms, last_error, next_check_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'unknown', 0, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  )
    .bind(id, user.id, name, parsed.url, parsed.hostname, interval, now, now, now)
    .run();

  const website = await getWebsiteForUser(c.env.DB, user.id, id);
  if (!website) throw new ApiError(500, 'internal_error', 'Website was created but could not be loaded.');

  return c.json({ website }, 201);
});

websites.get('/:id', async (c) => {
  const user = c.get('user');
  const detail = await getWebsiteDetail(c.env.DB, user.id, c.req.param('id'));
  if (!detail) throw new ApiError(404, 'not_found', 'Website not found.');
  return c.json(detail);
});

websites.patch('/:id', async (c) => {
  await enforceRateLimit(c, 'website-update', 120, 60 * 60 * 1000);
  const user = c.get('user');
  const id = c.req.param('id');
  const input = await parseJsonBody(c, updateWebsiteSchema);

  const existing = await c.env.DB.prepare(
    'SELECT id, name, check_interval_minutes AS interval, is_paused AS isPaused, last_checked_at AS lastCheckedAt FROM websites WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .first<{ id: string; name: string; interval: number; isPaused: number; lastCheckedAt: number | null }>();
  if (!existing) throw new ApiError(404, 'not_found', 'Website not found.');

  const now = Date.now();
  const name = input.name ?? existing.name;
  const interval = input.intervalMinutes ?? existing.interval;
  const nowPaused = input.isPaused ?? Boolean(existing.isPaused);
  const wasPaused = Boolean(existing.isPaused);

  const status = nowPaused ? 'paused' : wasPaused ? 'unknown' : undefined;
  const nextCheckAt = nowPaused ? existing.lastCheckedAt ?? now : wasPaused || input.intervalMinutes !== undefined ? now : undefined;

  await c.env.DB.prepare(
    `UPDATE websites
        SET name = ?, check_interval_minutes = ?, is_paused = ?, updated_at = ?
            ${status ? ', status = ?' : ''}
            ${nextCheckAt !== undefined ? ', next_check_at = ?' : ''}
      WHERE id = ? AND user_id = ?`,
  )
    .bind(
      name,
      interval,
      nowPaused ? 1 : 0,
      now,
      ...(status ? [status] : []),
      ...(nextCheckAt !== undefined ? [nextCheckAt] : []),
      id,
      user.id,
    )
    .run();

  const detail = await getWebsiteDetail(c.env.DB, user.id, id);
  if (!detail) throw new ApiError(404, 'not_found', 'Website not found.');
  return c.json(detail);
});

websites.delete('/:id', async (c) => {
  await enforceRateLimit(c, 'website-delete', 60, 60 * 60 * 1000);
  const user = c.get('user');
  const id = c.req.param('id');
  const result = await c.env.DB.prepare('DELETE FROM websites WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();
  if (result.meta.changes === 0) throw new ApiError(404, 'not_found', 'Website not found.');
  return c.body(null, 204);
});

websites.post('/:id/check', async (c) => {
  await enforceRateLimit(c, 'manual-check', 20, 5 * 60 * 1000);
  const user = c.get('user');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, name, url, hostname, check_interval_minutes AS intervalMinutes, next_check_at AS nextCheckAt
       FROM websites WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.id)
    .first<{
      id: string;
      userId: string;
      name: string;
      url: string;
      hostname: string;
      intervalMinutes: number;
      nextCheckAt: number;
    }>();
  if (!row) throw new ApiError(404, 'not_found', 'Website not found.');

  const { log } = await runWebsiteCheck(c.env.DB, {
    id: row.id,
    userId: row.userId,
    name: row.name,
    url: row.url,
    hostname: row.hostname,
    checkIntervalMinutes: row.intervalMinutes,
    nextCheckAt: row.nextCheckAt,
  });

  const detail = await getWebsiteDetail(c.env.DB, user.id, id);
  if (!detail) throw new ApiError(404, 'not_found', 'Website not found.');

  return c.json({ log, website: detail.website });
});

websites.get('/:id/logs', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const website = await c.env.DB.prepare('SELECT id FROM websites WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<{ id: string }>();
  if (!website) throw new ApiError(404, 'not_found', 'Website not found.');

  const query = logsQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  const logs = await getMonitoringLogs(c.env.DB, id, { limit: query.limit, range: query.range });
  return c.json({ logs });
});

websites.get('/:id/series', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const website = await c.env.DB.prepare('SELECT id FROM websites WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<{ id: string }>();
  if (!website) throw new ApiError(404, 'not_found', 'Website not found.');

  const range = rangeSchema.parse(c.req.query('range') ?? '24h');
  const [series, buckets] = await Promise.all([
    getResponseSeries(c.env.DB, { websiteId: id, userId: user.id, range }),
    getUptimeBuckets(c.env.DB, id, range),
  ]);
  return c.json({ series, buckets });
});

export const websiteRoutes = websites;

export type WebsiteListResponse = { websites: WebsiteListItem[] };
