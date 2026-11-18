const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return dateFormatter.format(new Date(timestamp));
}

export function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return timeFormatter.format(new Date(timestamp));
}

export function formatRelative(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return 'Just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatDate(timestamp);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'Ongoing';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function liveDuration(startedAt: number, resolvedAt?: number | null): string {
  const end = resolvedAt ?? Date.now();
  return formatDuration(Math.max(0, (end - startedAt) / 1000));
}

export function formatUptime(uptime: number | null | undefined): string {
  if (uptime === null || uptime === undefined) return '—';
  if (uptime === 100) return '100%';
  return `${uptime.toFixed(2)}%`;
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
}

export function uptimeTone(uptime: number | null | undefined): 'good' | 'warn' | 'bad' | 'muted' {
  if (uptime === null || uptime === undefined) return 'muted';
  if (uptime >= 99.5) return 'good';
  if (uptime >= 95) return 'warn';
  return 'bad';
}

export function intervalLabel(minutes: number): string {
  if (minutes === 60) return 'Every hour';
  return `Every ${minutes} min`;
}

export function truncateError(message: string | null | undefined, max = 90): string {
  if (!message) return '—';
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}
