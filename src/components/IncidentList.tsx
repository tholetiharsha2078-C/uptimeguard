import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Incident } from '@shared/types';
import { CAUSE_LABELS } from '@/lib/labels';
import { formatDateTime, liveDuration } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function IncidentList({ incidents, emptyText }: { incidents: Incident[]; emptyText?: string }) {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <CheckCircle2 className="size-6 text-success" />
        <p className="text-sm font-medium">No incidents recorded</p>
        <p className="text-sm text-muted-foreground">{emptyText ?? 'Everything has been running smoothly.'}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {incidents.map((incident) => {
        const open = incident.status === 'open';
        return (
          <li key={incident.id} className="px-5 py-3.5">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                  open ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                )}
              >
                {open ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to={`/websites/${incident.websiteId}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {incident.websiteName}
                  </Link>
                  <Badge variant={open ? 'destructive' : 'secondary'} className="text-[10px]">
                    {open ? 'Ongoing' : 'Resolved'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {CAUSE_LABELS[incident.cause]}
                  {incident.lastStatusCode ? ` · HTTP ${incident.lastStatusCode}` : ''} ·{' '}
                  {formatDateTime(incident.startedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {liveDuration(incident.startedAt, incident.resolvedAt)}
                </span>
                <ArrowUpRight className="size-3.5 text-muted-foreground/60" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
