import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    defaultIntervalMinutes: integer('default_interval_minutes').notNull().default(5),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_uq').on(table.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId), index('sessions_expires_idx').on(table.expiresAt)],
);

export const websites = sqliteTable(
  'websites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    hostname: text('hostname').notNull(),
    status: text('status', { enum: ['up', 'down', 'unknown', 'paused'] })
      .notNull()
      .default('unknown'),
    isPaused: integer('is_paused', { mode: 'boolean' }).notNull().default(false),
    checkIntervalMinutes: integer('check_interval_minutes').notNull().default(5),
    lastCheckedAt: integer('last_checked_at'),
    lastStatusCode: integer('last_status_code'),
    lastResponseTimeMs: integer('last_response_time_ms'),
    lastError: text('last_error'),
    nextCheckAt: integer('next_check_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('websites_user_url_uq').on(table.userId, table.url),
    index('websites_user_idx').on(table.userId),
    index('websites_next_check_idx').on(table.isPaused, table.nextCheckAt),
  ],
);

export const monitoringLogs = sqliteTable(
  'monitoring_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    websiteId: text('website_id')
      .notNull()
      .references(() => websites.id, { onDelete: 'cascade' }),
    checkedAt: integer('checked_at').notNull(),
    statusCode: integer('status_code'),
    responseTimeMs: integer('response_time_ms'),
    result: text('result', {
      enum: ['success', 'http_error', 'timeout', 'connection_error', 'blocked', 'invalid_url'],
    }).notNull(),
    isUp: integer('is_up', { mode: 'boolean' }).notNull(),
    errorMessage: text('error_message'),
    redirectedTo: text('redirected_to'),
  },
  (table) => [
    index('logs_website_checked_idx').on(table.websiteId, table.checkedAt),
    index('logs_checked_idx').on(table.checkedAt),
  ],
);

export const incidents = sqliteTable(
  'incidents',
  {
    id: text('id').primaryKey(),
    websiteId: text('website_id')
      .notNull()
      .references(() => websites.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
    startedAt: integer('started_at').notNull(),
    resolvedAt: integer('resolved_at'),
    cause: text('cause', {
      enum: ['success', 'http_error', 'timeout', 'connection_error', 'blocked', 'invalid_url'],
    }).notNull(),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('incidents_website_started_idx').on(table.websiteId, table.startedAt),
    index('incidents_status_idx').on(table.status, table.startedAt),
    uniqueIndex('incidents_one_open_uq').on(table.websiteId).where(sql`status = 'open'`),
  ],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    websiteId: text('website_id').references(() => websites.id, { onDelete: 'cascade' }),
    incidentId: text('incident_id').references(() => incidents.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['incident_opened', 'incident_resolved', 'system'] }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: integer('read_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    index('notifications_user_read_idx').on(table.userId, table.readAt),
  ],
);

export const monitorRuns = sqliteTable('monitor_runs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  lockedUntil: integer('locked_until').notNull(),
  sitesChecked: integer('sites_checked').notNull().default(0),
  status: text('status', { enum: ['running', 'completed', 'failed', 'skipped'] })
    .notNull()
    .default('running'),
  error: text('error'),
});

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: integer('reset_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type WebsiteRow = typeof websites.$inferSelect;
export type MonitoringLogRow = typeof monitoringLogs.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
