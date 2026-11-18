import type { Env } from '../env';
import { purgeRateLimits } from '../lib/rate-limit';
import { runWebsiteCheck } from './check-runner';

const LOCK_ID = 'scheduler';
const LOCK_TTL_MS = 4 * 60 * 1000;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;

interface DueWebsite {
  id: string;
  user_id: string;
  name: string;
  url: string;
  hostname: string;
  check_interval_minutes: number;
  next_check_at: number;
}

export interface ScheduledRunSummary {
  skipped: boolean;
  sitesChecked: number;
  failures: number;
  durationMs: number;
}

async function acquireLock(db: D1Database, now: number): Promise<boolean> {
  const lockedUntil = now + LOCK_TTL_MS;

  const takenOver = await db
    .prepare(
      `UPDATE monitor_runs
          SET started_at = ?, locked_until = ?, finished_at = NULL, status = 'running', sites_checked = 0, error = NULL
        WHERE id = ? AND locked_until < ?`,
    )
    .bind(now, lockedUntil, LOCK_ID, now)
    .run();
  if (takenOver.meta.changes > 0) return true;

  const created = await db
    .prepare(
      `INSERT OR IGNORE INTO monitor_runs (id, started_at, locked_until, sites_checked, status)
       VALUES (?, ?, ?, 0, 'running')`,
    )
    .bind(LOCK_ID, now, lockedUntil)
    .run();
  return created.meta.changes > 0;
}

async function releaseLock(db: D1Database, summary: { sitesChecked: number; failures: number }): Promise<void> {
  await db
    .prepare(
      `UPDATE monitor_runs
          SET finished_at = ?, locked_until = 0, sites_checked = ?, status = 'completed', error = ?
        WHERE id = ?`,
    )
    .bind(Date.now(), summary.sitesChecked, summary.failures > 0 ? `${summary.failures} check(s) failed` : null, LOCK_ID)
    .run();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item !== undefined) results[index] = await worker(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function housekeeping(db: D1Database): Promise<void> {
  const now = Date.now();
  await db.prepare('DELETE FROM monitoring_logs WHERE checked_at < ?').bind(now - 90 * 86_400_000).run();
  await db.prepare(`DELETE FROM incidents WHERE status = 'resolved' AND resolved_at < ?`).bind(now - 180 * 86_400_000).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  await purgeRateLimits(db);
}

/**
 * Cron entry point. A single D1 row acts as a distributed lock so overlapping
 * cron invocations cannot run duplicate checks. Each claimed website also has
 * its `next_check_at` advanced atomically before the request is made.
 */
export async function runScheduledMonitoring(env: Env): Promise<ScheduledRunSummary> {
  const startedAt = Date.now();
  const db = env.DB;

  if (!(await acquireLock(db, startedAt))) {
    return { skipped: true, sitesChecked: 0, failures: 0, durationMs: Date.now() - startedAt };
  }

  let sitesChecked = 0;
  let failures = 0;

  try {
    const due = await db
      .prepare(
        `SELECT id, user_id, name, url, hostname, check_interval_minutes, next_check_at
           FROM websites
          WHERE is_paused = 0 AND next_check_at <= ?
          ORDER BY next_check_at ASC
          LIMIT ?`,
      )
      .bind(startedAt, BATCH_SIZE)
      .all<DueWebsite>();

    await mapWithConcurrency(due.results, CONCURRENCY, async (row) => {
      const claim = await db
        .prepare(
          `UPDATE websites SET next_check_at = ?
            WHERE id = ? AND is_paused = 0 AND next_check_at <= ?`,
        )
        .bind(Date.now() + row.check_interval_minutes * 60_000, row.id, Date.now())
        .run();
      if (claim.meta.changes === 0) return;

      try {
        await runWebsiteCheck(db, {
          id: row.id,
          userId: row.user_id,
          name: row.name,
          url: row.url,
          hostname: row.hostname,
          checkIntervalMinutes: row.check_interval_minutes,
          nextCheckAt: row.next_check_at,
        });
        sitesChecked += 1;
      } catch (error) {
        failures += 1;
        console.error(`Check failed for website ${row.id}`, error);
      }
    });

    if (Math.random() < 0.05) {
      try {
        await housekeeping(db);
      } catch (error) {
        console.error('Housekeeping failed', error);
      }
    }
  } catch (error) {
    failures += 1;
    await db
      .prepare(`UPDATE monitor_runs SET status = 'failed', error = ? WHERE id = ?`)
      .bind(error instanceof Error ? error.message : 'Unknown error', LOCK_ID)
      .run();
  } finally {
    await releaseLock(db, { sitesChecked, failures });
  }

  return { skipped: false, sitesChecked, failures, durationMs: Date.now() - startedAt };
}
