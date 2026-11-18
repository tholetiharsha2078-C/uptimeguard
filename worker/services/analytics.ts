import type {
  CheckResult,
  DashboardData,
  Incident,
  MonitoringLog,
  Notification,
  ResponsePoint,
  TimeRange,
  UptimeBucket,
  WebsiteDetail,
  WebsiteListItem,
  WebsiteStatus,
} from '../../shared/types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export const RANGE_MS: Record<TimeRange, number> = {
  '24h': 24 * HOUR,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
};

const RANGE_BUCKET: Record<TimeRange, number> = {
  '24h': HOUR,
  '7d': 6 * HOUR,
  '30d': DAY,
};

export function computeUptime(checks: number, upChecks: number): number | null {
  if (checks <= 0) return null;
  return Math.round((upChecks / checks) * 10_000) / 100;
}

export function roundMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value);
}

interface WebsiteRow {
  id: string;
  name: string;
  url: string;
  hostname: string;
  status: WebsiteStatus;
  isPaused: number;
  intervalMinutes: number;
  lastCheckedAt: number | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastError: string | null;
  nextCheckAt: number | null;
  createdAt: number;
  updatedAt: number;
  checks24h: number;
  up24h: number | null;
  avgResponseMs24h: number | null;
  openIncidentStartedAt: number | null;
}

function mapWebsite(row: WebsiteRow): WebsiteListItem {
  const checks24h = Number(row.checks24h ?? 0);
  const up24h = Number(row.up24h ?? 0);
  const paused = Boolean(row.isPaused);
  const status: WebsiteStatus = paused ? 'paused' : row.lastCheckedAt === null ? 'unknown' : row.status;

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    hostname: row.hostname,
    status,
    isPaused: paused,
    intervalMinutes: row.intervalMinutes,
    lastCheckedAt: row.lastCheckedAt,
    lastStatusCode: row.lastStatusCode,
    lastResponseTimeMs: row.lastResponseTimeMs,
    lastError: row.lastError,
    nextCheckAt: row.nextCheckAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    checks24h,
    uptime24h: computeUptime(checks24h, up24h),
    avgResponseMs24h: roundMs(row.avgResponseMs24h),
    openIncidentStartedAt: row.openIncidentStartedAt,
  };
}

const WEBSITE_SELECT = `
  SELECT w.id, w.name, w.url, w.hostname, w.status, w.is_paused AS isPaused,
         w.check_interval_minutes AS intervalMinutes, w.last_checked_at AS lastCheckedAt,
         w.last_status_code AS lastStatusCode, w.last_response_time_ms AS lastResponseTimeMs,
         w.last_error AS lastError, w.next_check_at AS nextCheckAt,
         w.created_at AS createdAt, w.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM monitoring_logs l WHERE l.website_id = w.id AND l.checked_at >= ?) AS checks24h,
         (SELECT SUM(l.is_up) FROM monitoring_logs l WHERE l.website_id = w.id AND l.checked_at >= ?) AS up24h,
         (SELECT AVG(l.response_time_ms) FROM monitoring_logs l WHERE l.website_id = w.id AND l.checked_at >= ? AND l.is_up = 1) AS avgResponseMs24h,
         (SELECT i.started_at FROM incidents i WHERE i.website_id = w.id AND i.status = 'open' LIMIT 1) AS openIncidentStartedAt
    FROM websites w
   WHERE w.user_id = ?
   ORDER BY w.created_at DESC
`;

export async function getWebsiteList(db: D1Database, userId: string, now = Date.now()): Promise<WebsiteListItem[]> {
  const since = now - RANGE_MS['24h'];
  const rows = await db.prepare(WEBSITE_SELECT).bind(since, since, since, userId).all<WebsiteRow>();
  return rows.results.map(mapWebsite);
}

export async function getWebsiteForUser(
  db: D1Database,
  userId: string,
  websiteId: string,
  now = Date.now(),
): Promise<WebsiteListItem | null> {
  const since = now - RANGE_MS['24h'];
  const row = await db
    .prepare(`${WEBSITE_SELECT.replace('WHERE w.user_id = ?', 'WHERE w.user_id = ? AND w.id = ?')}`)
    .bind(since, since, since, userId, websiteId)
    .first<WebsiteRow>();
  return row ? mapWebsite(row) : null;
}

interface AggregateRow {
  checks: number;
  up: number | null;
  avgMs: number | null;
}

async function aggregate(db: D1Database, websiteId: string, since: number): Promise<AggregateRow> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS checks,
              SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) AS up,
              AVG(CASE WHEN is_up = 1 THEN response_time_ms END) AS avgMs
         FROM monitoring_logs
        WHERE website_id = ? AND checked_at >= ?`,
    )
    .bind(websiteId, since)
    .first<AggregateRow>();
  return row ?? { checks: 0, up: 0, avgMs: null };
}

interface IncidentRow {
  id: string;
  websiteId: string;
  websiteName: string;
  websiteUrl: string;
  status: 'open' | 'resolved';
  startedAt: number;
  resolvedAt: number | null;
  cause: CheckResult;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: number;
}

export function mapIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    websiteId: row.websiteId,
    websiteName: row.websiteName,
    websiteUrl: row.websiteUrl,
    status: row.status,
    startedAt: row.startedAt,
    resolvedAt: row.resolvedAt,
    durationSeconds: row.resolvedAt ? Math.max(0, Math.round((row.resolvedAt - row.startedAt) / 1000)) : null,
    cause: row.cause,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

const INCIDENT_SELECT = `
  SELECT i.id, i.website_id AS websiteId, w.name AS websiteName, w.url AS websiteUrl,
         i.status, i.started_at AS startedAt, i.resolved_at AS resolvedAt, i.cause,
         i.last_status_code AS lastStatusCode, i.last_error AS lastError, i.created_at AS createdAt
    FROM incidents i
    JOIN websites w ON w.id = i.website_id
`;

export async function getIncidents(
  db: D1Database,
  userId: string,
  options: { status?: 'open' | 'resolved' | 'all'; range?: TimeRange; limit?: number; offset?: number } = {},
): Promise<{ incidents: Incident[]; total: number }> {
  const { status = 'all', range, limit = 50, offset = 0 } = options;
  const clauses = ['w.user_id = ?'];
  const bindings: (string | number)[] = [userId];

  if (status !== 'all') {
    clauses.push('i.status = ?');
    bindings.push(status);
  }
  if (range) {
    clauses.push('i.started_at >= ?');
    bindings.push(Date.now() - RANGE_MS[range]);
  }
  const where = clauses.join(' AND ');

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM incidents i JOIN websites w ON w.id = i.website_id WHERE ${where}`)
    .bind(...bindings)
    .first<{ total: number }>();

  const rows = await db
    .prepare(`${INCIDENT_SELECT} WHERE ${where} ORDER BY i.started_at DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, limit, offset)
    .all<IncidentRow>();

  return { incidents: rows.results.map(mapIncident), total: Number(countRow?.total ?? 0) };
}

export async function getRecentIncidents(db: D1Database, userId: string, limit = 5): Promise<Incident[]> {
  const rows = await db
    .prepare(`${INCIDENT_SELECT} WHERE w.user_id = ? ORDER BY i.started_at DESC LIMIT ?`)
    .bind(userId, limit)
    .all<IncidentRow>();
  return rows.results.map(mapIncident);
}

export interface ResponseSeriesOptions {
  websiteId?: string;
  userId: string;
  range: TimeRange;
  now?: number;
}

export async function getResponseSeries(
  db: D1Database,
  options: ResponseSeriesOptions,
): Promise<ResponsePoint[]> {
  const { websiteId, userId, range } = options;
  const now = options.now ?? Date.now();
  const bucketMs = RANGE_BUCKET[range];
  const since = now - RANGE_MS[range];

  const clause = websiteId
    ? `l.website_id = ? AND l.checked_at >= ?`
    : `w.user_id = ? AND l.checked_at >= ?`;
  const binding = websiteId ?? userId;

  const rows = await db
    .prepare(
      `SELECT CAST(l.checked_at / ? AS INTEGER) * ? AS bucket,
              AVG(CASE WHEN l.is_up = 1 THEN l.response_time_ms END) AS avgMs,
              COUNT(*) AS checks
         FROM monitoring_logs l
         JOIN websites w ON w.id = l.website_id
        WHERE ${clause}
        GROUP BY bucket
        ORDER BY bucket ASC`,
    )
    .bind(bucketMs, bucketMs, binding, since)
    .all<{ bucket: number; avgMs: number | null; checks: number }>();

  const byBucket = new Map(rows.results.map((row) => [Number(row.bucket), row]));
  const points: ResponsePoint[] = [];
  const firstBucket = Math.floor(since / bucketMs) * bucketMs;
  for (let bucket = firstBucket; bucket <= now; bucket += bucketMs) {
    const row = byBucket.get(bucket);
    points.push({
      timestamp: bucket,
      avgMs: row ? roundMs(row.avgMs) : null,
      checks: row ? Number(row.checks) : 0,
    });
  }
  return points;
}

export async function getUptimeBuckets(
  db: D1Database,
  websiteId: string,
  range: TimeRange,
  now = Date.now(),
): Promise<UptimeBucket[]> {
  const bucketMs = RANGE_BUCKET[range];
  const since = now - RANGE_MS[range];
  const rows = await db
    .prepare(
      `SELECT CAST(checked_at / ? AS INTEGER) * ? AS bucket,
              COUNT(*) AS checks,
              SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) AS up,
              SUM(CASE WHEN is_up = 0 THEN 1 ELSE 0 END) AS downChecks,
              AVG(CASE WHEN is_up = 1 THEN response_time_ms END) AS avgMs
         FROM monitoring_logs
        WHERE website_id = ? AND checked_at >= ?
        GROUP BY bucket
        ORDER BY bucket ASC`,
    )
    .bind(bucketMs, bucketMs, websiteId, since)
    .all<{ bucket: number; checks: number; up: number | null; downChecks: number; avgMs: number | null }>();

  const byBucket = new Map(rows.results.map((row) => [Number(row.bucket), row]));
  const buckets: UptimeBucket[] = [];
  const firstBucket = Math.floor(since / bucketMs) * bucketMs;
  for (let bucket = firstBucket; bucket <= now; bucket += bucketMs) {
    const row = byBucket.get(bucket);
    const checks = row ? Number(row.checks) : 0;
    buckets.push({
      timestamp: bucket,
      checks,
      uptime: row ? computeUptime(checks, Number(row.up ?? 0)) : null,
      avgMs: row ? roundMs(row.avgMs) : null,
      downChecks: row ? Number(row.downChecks ?? 0) : 0,
    });
  }
  return buckets;
}

interface LogRow {
  id: number;
  websiteId: string;
  checkedAt: number;
  statusCode: number | null;
  responseTimeMs: number | null;
  result: CheckResult;
  isUp: number;
  errorMessage: string | null;
  redirectedTo: string | null;
}

export async function getMonitoringLogs(
  db: D1Database,
  websiteId: string,
  options: { limit?: number; range?: TimeRange } = {},
): Promise<MonitoringLog[]> {
  const { limit = 50, range } = options;
  const since = range ? Date.now() - RANGE_MS[range] : 0;
  const rows = await db
    .prepare(
      `SELECT id, website_id AS websiteId, checked_at AS checkedAt, status_code AS statusCode,
              response_time_ms AS responseTimeMs, result, is_up AS isUp, error_message AS errorMessage,
              redirected_to AS redirectedTo
         FROM monitoring_logs
        WHERE website_id = ? AND checked_at >= ?
        ORDER BY checked_at DESC
        LIMIT ?`,
    )
    .bind(websiteId, since, limit)
    .all<LogRow>();
  return rows.results.map((row) => ({ ...row, isUp: Boolean(row.isUp) }));
}

export async function getWebsiteDetail(
  db: D1Database,
  userId: string,
  websiteId: string,
  now = Date.now(),
): Promise<{ website: WebsiteDetail; series: ResponsePoint[]; buckets: UptimeBucket[]; logs: MonitoringLog[]; incidents: Incident[] } | null> {
  const website = await getWebsiteForUser(db, userId, websiteId, now);
  if (!website) return null;

  const [agg7d, agg30d, series, buckets, logs, incidentResult] = await Promise.all([
    aggregate(db, websiteId, now - RANGE_MS['7d']),
    aggregate(db, websiteId, now - RANGE_MS['30d']),
    getResponseSeries(db, { websiteId, userId, range: '24h', now }),
    getUptimeBuckets(db, websiteId, '7d', now),
    getMonitoringLogs(db, websiteId, { limit: 50, range: '7d' }),
    getIncidents(db, userId, { status: 'all', limit: 20 }),
  ]);

  const openIncident = incidentResult.incidents.find((incident) => incident.websiteId === websiteId && incident.status === 'open') ?? null;
  const siteIncidents = incidentResult.incidents.filter((incident) => incident.websiteId === websiteId);

  return {
    website: {
      ...website,
      uptime7d: computeUptime(agg7d.checks, Number(agg7d.up ?? 0)),
      uptime30d: computeUptime(agg30d.checks, Number(agg30d.up ?? 0)),
      checks7d: Number(agg7d.checks),
      checks30d: Number(agg30d.checks),
      avgResponseMs7d: roundMs(agg7d.avgMs),
      openIncident,
    },
    series,
    buckets,
    logs,
    incidents: siteIncidents,
  };
}

export async function getDashboard(db: D1Database, userId: string, now = Date.now()): Promise<DashboardData> {
  const since = now - RANGE_MS['24h'];
  const [websites, statsRow, incidents, responseSeries] = await Promise.all([
    getWebsiteList(db, userId, now),
    db
      .prepare(
        `SELECT COUNT(*) AS checks,
                SUM(CASE WHEN l.is_up = 1 THEN 1 ELSE 0 END) AS up,
                AVG(CASE WHEN l.is_up = 1 THEN l.response_time_ms END) AS avgMs,
                (SELECT COUNT(*) FROM incidents i JOIN websites w ON w.id = i.website_id WHERE w.user_id = ? AND i.status = 'open') AS openIncidents
           FROM monitoring_logs l
           JOIN websites w ON w.id = l.website_id
          WHERE w.user_id = ? AND l.checked_at >= ?`,
      )
      .bind(userId, userId, since)
      .first<{ checks: number; up: number | null; avgMs: number | null; openIncidents: number }>(),
    getRecentIncidents(db, userId, 5),
    getResponseSeries(db, { userId, range: '24h', now }),
  ]);

  const online = websites.filter((site) => site.status === 'up').length;
  const offline = websites.filter((site) => site.status === 'down').length;
  const paused = websites.filter((site) => site.status === 'paused').length;
  const unknown = websites.filter((site) => site.status === 'unknown').length;
  const checks = Number(statsRow?.checks ?? 0);
  const up = Number(statsRow?.up ?? 0);

  return {
    stats: {
      totalWebsites: websites.length,
      online,
      offline,
      paused,
      unknown,
      avgResponseMs: roundMs(statsRow?.avgMs),
      uptime24h: computeUptime(checks, up),
      checks24h: checks,
      openIncidents: Number(statsRow?.openIncidents ?? 0),
    },
    websites,
    incidents,
    responseSeries,
  };
}

export async function getNotifications(
  db: D1Database,
  userId: string,
  limit = 50,
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const rows = await db
    .prepare(
      `SELECT id, type, title, body, website_id AS websiteId, incident_id AS incidentId,
              read_at AS readAt, created_at AS createdAt
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .bind(userId, limit)
    .all<Notification>();

  const unread = await db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .bind(userId)
    .first<{ count: number }>();

  return { notifications: rows.results, unreadCount: Number(unread?.count ?? 0) };
}
