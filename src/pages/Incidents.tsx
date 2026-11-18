import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { TimeRange } from '@shared/types';

import { ErrorState } from '@/components/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDateTime, liveDuration } from '@/lib/format';
import { CAUSE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'open' | 'resolved';
type RangeFilter = TimeRange | 'all';

function IncidentStatusBadge({ status }: { status: 'open' | 'resolved' }) {
  return (
    <Badge variant={status === 'open' ? 'destructive' : 'secondary'} className="gap-1">
      {status === 'open' ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
      {status === 'open' ? 'Ongoing' : 'Resolved'}
    </Badge>
  );
}

export function Incidents() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [range, setRange] = useState<RangeFilter>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['incidents', 'all', range],
    queryFn: () => api.getIncidents({ status: 'all', range: range === 'all' ? undefined : range, limit: 200 }),
    refetchInterval: 30_000,
  });

  const incidents = data?.incidents ?? [];
  const counts = useMemo(
    () => ({
      all: incidents.length,
      open: incidents.filter((incident) => incident.status === 'open').length,
      resolved: incidents.filter((incident) => incident.status === 'resolved').length,
    }),
    [incidents],
  );

  const visible = status === 'all' ? incidents : incidents.filter((incident) => incident.status === status);

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Every downtime event detected by the monitoring engine, with its cause and recovery time."
        actions={
          <Select value={range} onValueChange={(value) => setRange(value as RangeFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="open">Ongoing ({counts.open})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({counts.resolved})</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {data && data.total > incidents.length
            ? `Showing the latest ${incidents.length} of ${data.total} incidents`
            : `${counts.all} incident${counts.all === 1 ? '' : 's'}`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <CheckCircle2 className="size-7 text-success" />
              <h2 className="text-sm font-semibold">No incidents in this view</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                {status === 'open'
                  ? 'No websites are currently down.'
                  : 'Your monitored websites have stayed online in the selected period.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Website</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="hidden lg:table-cell">Cause</TableHead>
                    <TableHead className="hidden xl:table-cell">Last error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell>
                        <Link to={`/websites/${incident.websiteId}`} className="font-medium hover:underline">
                          {incident.websiteName}
                        </Link>
                        <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{incident.websiteUrl}</p>
                      </TableCell>
                      <TableCell>
                        <IncidentStatusBadge status={incident.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(incident.startedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {liveDuration(incident.startedAt, incident.resolvedAt)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{CAUSE_LABELS[incident.cause]}</TableCell>
                      <TableCell className="hidden max-w-[20rem] xl:table-cell">
                        <p className="truncate text-xs text-muted-foreground" title={incident.lastError ?? undefined}>
                          {incident.lastError ?? '—'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {visible.map((incident) => (
                <li key={incident.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/websites/${incident.websiteId}`} className="text-sm font-medium hover:underline">
                      {incident.websiteName}
                    </Link>
                    <IncidentStatusBadge status={incident.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{incident.lastError ?? CAUSE_LABELS[incident.cause]}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {formatDateTime(incident.startedAt)}
                    </span>
                    <span className={cn('tabular-nums', incident.status === 'open' && 'font-medium text-destructive')}>
                      {liveDuration(incident.startedAt, incident.resolvedAt)}
                    </span>
                    <span>{CAUSE_LABELS[incident.cause]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data && data.total > incidents.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Older incidents are retained for up to 180 days. Narrow the date range to see a specific period.
        </p>
      ) : null}
    </>
  );
}
