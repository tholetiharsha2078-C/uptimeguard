import type { WebsiteStatus } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<WebsiteStatus, { label: string; variant: 'success' | 'destructive' | 'secondary' | 'outline'; dot: string }> = {
  up: { label: 'Operational', variant: 'success', dot: 'bg-success' },
  down: { label: 'Down', variant: 'destructive', dot: 'bg-destructive' },
  paused: { label: 'Paused', variant: 'secondary', dot: 'bg-muted-foreground' },
  unknown: { label: 'Awaiting check', variant: 'outline', dot: 'bg-warning' },
};

export function StatusBadge({ status, className }: { status: WebsiteStatus; className?: string }) {
  const config = STATUS_MAP[status];
  return (
    <Badge variant={config.variant} className={cn('gap-1.5', className)}>
      <span className={cn('size-1.5 rounded-full', config.dot)} aria-hidden />
      {config.label}
    </Badge>
  );
}

export function StatusDot({ status }: { status: WebsiteStatus }) {
  return <span className={cn('size-2 rounded-full', STATUS_MAP[status].dot)} aria-label={STATUS_MAP[status].label} />;
}
