export type WebsiteStatus = 'up' | 'down' | 'unknown' | 'paused';

export type TimeRange = '24h' | '7d' | '30d';

export type CheckResult =
  | 'success'
  | 'http_error'
  | 'timeout'
  | 'connection_error'
  | 'blocked'
  | 'invalid_url';

export type NotificationType = 'incident_opened' | 'incident_resolved' | 'system';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: number;
}

export interface Website {
  id: string;
  name: string;
  url: string;
  hostname: string;
  status: WebsiteStatus;
  isPaused: boolean;
  intervalMinutes: number;
  lastCheckedAt: number | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastError: string | null;
  nextCheckAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WebsiteListItem extends Website {
  uptime24h: number | null;
  checks24h: number;
  avgResponseMs24h: number | null;
  openIncidentStartedAt: number | null;
}

export interface WebsiteDetail extends WebsiteListItem {
  uptime7d: number | null;
  uptime30d: number | null;
  checks7d: number;
  checks30d: number;
  avgResponseMs7d: number | null;
  openIncident: Incident | null;
}

export interface MonitoringLog {
  id: number;
  websiteId: string;
  checkedAt: number;
  statusCode: number | null;
  responseTimeMs: number | null;
  result: CheckResult;
  isUp: boolean;
  errorMessage: string | null;
  redirectedTo: string | null;
}

export interface Incident {
  id: string;
  websiteId: string;
  websiteName: string;
  websiteUrl: string;
  status: 'open' | 'resolved';
  startedAt: number;
  resolvedAt: number | null;
  durationSeconds: number | null;
  cause: CheckResult;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  websiteId: string | null;
  incidentId: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface DashboardStats {
  totalWebsites: number;
  online: number;
  offline: number;
  paused: number;
  unknown: number;
  avgResponseMs: number | null;
  uptime24h: number | null;
  checks24h: number;
  openIncidents: number;
}

export interface DashboardData {
  stats: DashboardStats;
  websites: WebsiteListItem[];
  incidents: Incident[];
  responseSeries: ResponsePoint[];
}

export interface ResponsePoint {
  timestamp: number;
  avgMs: number | null;
  checks: number;
}

export interface UptimeBucket {
  timestamp: number;
  uptime: number | null;
  checks: number;
  avgMs: number | null;
  downChecks: number;
}

export interface WebsiteDetailData {
  website: WebsiteDetail;
  series: ResponsePoint[];
  buckets: UptimeBucket[];
  logs: MonitoringLog[];
  incidents: Incident[];
}

export interface IncidentsData {
  incidents: Incident[];
  total: number;
}

export interface NotificationsData {
  notifications: Notification[];
  unreadCount: number;
}

export interface AuthData {
  user: User;
}

export interface CheckNowResult {
  log: MonitoringLog;
  website: WebsiteDetail;
}
