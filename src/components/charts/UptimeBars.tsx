import type { UptimeBucket } from '@shared/types';
import { formatDateTime, formatUptime, uptimeTone } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE_CLASS = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  muted: 'bg-muted',
} as const;

export function UptimeBars({ buckets, label }: { buckets: UptimeBucket[]; label?: string }) {
  return (
    <div>
      <div className="flex h-9 items-stretch gap-1" role="img" aria-label={label ?? 'Uptime history'}>
        {buckets.map((bucket) => {
          const tone = uptimeTone(bucket.uptime);
          return (
            <div
              key={bucket.timestamp}
              title={`${formatDateTime(bucket.timestamp)} — ${formatUptime(bucket.uptime)} uptime, ${bucket.checks} check${bucket.checks === 1 ? '' : 's'}`}
              className={cn(
                'min-w-0 flex-1 rounded-[3px] transition-opacity hover:opacity-75',
                TONE_CLASS[tone],
                bucket.checks === 0 && 'opacity-40',
              )}
            />
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{buckets[0] ? formatDateTime(buckets[0].timestamp) : '—'}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-success" /> Up
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-warning" /> Degraded
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-destructive" /> Down
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-muted" /> No data
          </span>
        </span>
      </div>
    </div>
  );
}
