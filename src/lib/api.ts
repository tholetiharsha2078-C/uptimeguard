import type {
  AuthData,
  CheckNowResult,
  DashboardData,
  IncidentsData,
  MonitoringLog,
  NotificationsData,
  ResponsePoint,
  TimeRange,
  UptimeBucket,
  User,
  WebsiteDetailData,
  WebsiteListItem,
} from '@shared/types';
import type { CreateWebsiteInput, UpdateWebsiteInput } from '@shared/schemas';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? 'request_failed',
      body?.error?.message ?? 'The request failed. Please try again.',
      body?.error?.details,
    );
  }

  return payload as T;
}

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value) };
}

export const api = {
  getMe: () => request<AuthData>('/api/auth/me'),
  login: (input: { email: string; password: string }) =>
    request<AuthData>('/api/auth/login', jsonBody(input)),
  register: (input: { name: string; email: string; password: string; confirmPassword: string }) =>
    request<AuthData>('/api/auth/register', jsonBody(input)),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  updateProfile: (input: { name: string }) =>
    request<AuthData>('/api/auth/me', { ...jsonBody(input), method: 'PATCH' }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>('/api/auth/change-password', jsonBody(input)),

  getDashboard: () => request<DashboardData>('/api/dashboard'),
  getWebsites: () => request<{ websites: WebsiteListItem[] }>('/api/websites'),
  createWebsite: (input: CreateWebsiteInput) =>
    request<{ website: WebsiteListItem }>('/api/websites', jsonBody(input)),
  getWebsite: (id: string) => request<WebsiteDetailData>(`/api/websites/${id}`),
  updateWebsite: (id: string, input: UpdateWebsiteInput) =>
    request<WebsiteDetailData>(`/api/websites/${id}`, { ...jsonBody(input), method: 'PATCH' }),
  deleteWebsite: (id: string) => request<void>(`/api/websites/${id}`, { method: 'DELETE' }),
  checkWebsite: (id: string) =>
    request<CheckNowResult>(`/api/websites/${id}/check`, { method: 'POST' }),
  getSeries: (id: string, range: TimeRange) =>
    request<{ series: ResponsePoint[]; buckets: UptimeBucket[] }>(`/api/websites/${id}/series?range=${range}`),
  getLogs: (id: string, options: { range?: TimeRange; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.range) params.set('range', options.range);
    if (options.limit) params.set('limit', String(options.limit));
    return request<{ logs: MonitoringLog[] }>(`/api/websites/${id}/logs?${params.toString()}`);
  },

  getIncidents: (options: { status?: 'open' | 'resolved' | 'all'; range?: TimeRange; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.range) params.set('range', options.range);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    return request<IncidentsData>(`/api/incidents?${params.toString()}`);
  },

  getNotifications: () => request<NotificationsData>('/api/notifications'),
  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ ok: true }>('/api/notifications/read-all', { method: 'POST' }),
};

export type { User };
