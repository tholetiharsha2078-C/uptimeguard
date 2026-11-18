import type { CheckOutcome } from './monitor';

export interface IncidentWebsite {
  id: string;
  userId: string;
  name: string;
  url: string;
  hostname: string;
}

function humanDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return `${hours}h ${rest}m`;
  return `${Math.floor(hours / 24)} days`;
}

async function notify(
  db: D1Database,
  website: IncidentWebsite,
  incidentId: string,
  type: 'incident_opened' | 'incident_resolved',
  title: string,
  body: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, website_id, incident_id, type, title, body, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(crypto.randomUUID(), website.userId, website.id, incidentId, type, title, body, now)
    .run();
}

/**
 * Opens an incident on the first failed check and resolves it on recovery.
 * A partial unique index guarantees at most one open incident per website even
 * if two checks race.
 */
export async function handleIncidentTransition(
  db: D1Database,
  website: IncidentWebsite,
  outcome: CheckOutcome,
  now: number,
): Promise<void> {
  const open = await db
    .prepare(`SELECT id, started_at AS startedAt FROM incidents WHERE website_id = ? AND status = 'open' LIMIT 1`)
    .bind(website.id)
    .first<{ id: string; startedAt: number }>();

  if (!outcome.isUp) {
    if (!open) {
      const incidentId = crypto.randomUUID();
      const inserted = await db
        .prepare(
          `INSERT INTO incidents (id, website_id, status, started_at, resolved_at, cause, last_status_code, last_error, created_at, updated_at)
           SELECT ?, ?, 'open', ?, NULL, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE website_id = ? AND status = 'open')`,
        )
        .bind(
          incidentId,
          website.id,
          now,
          outcome.result,
          outcome.statusCode,
          outcome.errorMessage,
          now,
          now,
          website.id,
        )
        .run();

      if (inserted.meta.changes > 0) {
        await notify(
          db,
          website,
          incidentId,
          'incident_opened',
          `${website.name} is down`,
          `${website.hostname} failed its health check: ${outcome.errorMessage ?? 'no response'}.`,
          now,
        );
      }
      return;
    }

    await db
      .prepare(`UPDATE incidents SET last_status_code = ?, last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(outcome.statusCode, outcome.errorMessage, now, open.id)
      .run();
    return;
  }

  if (!open) return;

  await db
    .prepare(`UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, open.id)
    .run();

  await notify(
    db,
    website,
    open.id,
    'incident_resolved',
    `${website.name} recovered`,
    `${website.hostname} is responding normally again after ${humanDuration(now - open.startedAt)} of downtime.`,
    now,
  );
}
