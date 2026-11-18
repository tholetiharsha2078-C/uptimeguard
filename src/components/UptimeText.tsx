import { formatUptime, uptimeTone } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE_TEXT = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  muted: 'text-muted-foreground',
} as const;

export function UptimeText({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span className={cn('tabular-nums font-medium', TONE_TEXT[uptimeTone(value)], className)}>
      {formatUptime(value)}
    </span>
  );
}
