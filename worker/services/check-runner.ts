import type { MonitoringLog } from '../../shared/types';
import { displayHostname } from '../../shared/url';
import { handleIncidentTransition, type IncidentWebsite } from './incidents';
import { performCheck, type CheckOutcome } from './monitor';

export interface CheckableWebsite extends IncidentWebsite {
  nextCheckAt: number;
  checkIntervalMinutes: number;
}

export interface CheckRunResult {
  log: MonitoringLog;
  outcome: CheckOutcome;
}

/**
 * Runs one check and persists the log, the website's latest state and any
 * incident transition. Keeping this in a service means the cron scheduler and
 * the "Check now" endpoint always behave identically.
 */
export async function runWebsiteCheck(db: D1Database, website: CheckableWebsite): Promise<CheckRunResult> {
  const outcome = await performCheck(website.url);
  const completedAt = Date.now();

  const log = await db
    .prepare(
      `INSERT INTO monitoring_logs
         (website_id, checked_at, status_code, response_time_ms, result, is_up, error_message, redirected_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      website.id,
      outcome.checkedAt,
      outcome.statusCode,
      outcome.responseTimeMs,
      outcome.result,
      outcome.isUp ? 1 : 0,
      outcome.errorMessage,
      outcome.redirectedTo,
    )
    .first<{ id: number }>();

  const nextCheckAt = completedAt + website.checkIntervalMinutes * 60_000;

  await db
    .prepare(
      `UPDATE websites
          SET status = ?, last_checked_at = ?, last_status_code = ?, last_response_time_ms = ?,
              last_error = ?, next_check_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      outcome.isUp ? 'up' : 'down',
      outcome.checkedAt,
      outcome.statusCode,
      outcome.responseTimeMs,
      outcome.errorMessage,
      nextCheckAt,
      completedAt,
      website.id,
    )
    .run();

  await handleIncidentTransition(db, website, outcome, completedAt);

  return {
    outcome,
    log: {
      id: log?.id ?? 0,
      websiteId: website.id,
      checkedAt: outcome.checkedAt,
      statusCode: outcome.statusCode,
      responseTimeMs: outcome.responseTimeMs,
      result: outcome.result,
      isUp: outcome.isUp,
      errorMessage: outcome.errorMessage,
      redirectedTo: outcome.redirectedTo,
    },
  };
}

export function websiteDisplayName(name: string, url: string): string {
  return name.trim() || displayHostname(url);
}
