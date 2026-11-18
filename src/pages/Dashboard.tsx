import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  Gauge,
  Globe,
  Plus,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { WebsiteListItem } from '@shared/types';

import { AddWebsiteDialog } from '@/components/AddWebsiteDialog';
import { EmptyState, ErrorState } from '@/components/States';
import { IncidentList } from '@/components/IncidentList';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { UptimeText } from '@/components/UptimeText';
import { ResponseChart } from '@/components/charts/ResponseChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatMs, formatRelative, formatUptime } from '@/lib/format';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function WebsiteRow({ site }: { site: WebsiteListItem }) {
  const navigate = useNavigate();
  return (
    <TableRow className="cursor-pointer" onClick={() => navigate(`/websites/${site.id}`)}>
      <TableCell>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{site.name}</p>
          <p className="max-w-[24rem] truncate text-xs text-muted-foreground">{site.url}</p>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={site.status} />
      </TableCell>
      <TableCell>
        <UptimeText value={site.uptime24h} />
      </TableCell>
      <TableCell className="hidden tabular-nums text-sm text-muted-foreground sm:table-cell">
        {formatMs(site.avgResponseMs24h)}
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
        {formatRelative(site.lastCheckedAt)}
      </TableCell>
      <TableCell className="w-8">
        <ChevronRight className="size-4 text-muted-foreground/60" />
      </TableCell>
    </TableRow>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
    refetchInterval: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) {
    return (
      <>
        <PageHeader title="Overview" />
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      </>
    );
  }
  if (!data) return null;

  if (data.stats.totalWebsites === 0) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="A real-time view of every website you monitor."
          actions={<AddWebsiteDialog />}
        />
        <Card>
          <CardContent>
            <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Globe className="size-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold">Add your first website</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                UptimeGuard checks your site on a schedule, records response times and opens an incident if it
                stops responding.
              </p>
              <div className="mt-5">
                <AddWebsiteDialog>
                  <Button>
                    <Plus className="size-4" /> Add website
                  </Button>
                </AddWebsiteDialog>
              </div>
              <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-3">
                {[
                  { icon: Activity, title: 'Health checks', text: 'Every 5 minutes' },
                  { icon: Gauge, title: 'Analytics', text: 'Uptime and response time' },
                  { icon: ShieldCheck, title: 'Safe by design', text: 'SSRF protection' },
                ].map((item) => (
                  <div key={item.title} className="rounded-lg border border-border p-3">
                    <item.icon className="size-4 text-muted-foreground" />
                    <p className="mt-2 text-xs font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const { stats, websites, incidents, responseSeries } = data;
  const pausedSuffix = stats.paused > 0 ? ` · ${stats.paused} paused` : '';

  return (
    <>
      <PageHeader
        title="Overview"
        description="A real-time view of every website you monitor."
        actions={<AddWebsiteDialog />}
      />

      {stats.openIncidents > 0 ? (
        <Link
          to="/incidents"
          className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm transition-colors hover:bg-destructive/10"
        >
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">
            <span className="font-medium text-foreground">
              {stats.openIncidents} open incident{stats.openIncidents === 1 ? '' : 's'}
            </span>{' '}
            <span className="text-muted-foreground">
              — {stats.offline} website{stats.offline === 1 ? '' : 's'} currently failing checks.
            </span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Websites"
          value={stats.totalWebsites}
          hint={`${stats.totalWebsites - stats.paused} actively monitored`}
          icon={<Globe className="size-4" />}
        />
        <StatCard
          label="Online"
          value={stats.online}
          hint={`${stats.unknown} awaiting first check`}
          tone="success"
          icon={<Activity className="size-4" />}
        />
        <StatCard
          label="Offline"
          value={stats.offline}
          hint={stats.offline > 0 ? 'Investigate open incidents' : 'All clear'}
          tone={stats.offline > 0 ? 'danger' : 'muted'}
          icon={<WifiOff className="size-4" />}
        />
        <StatCard
          label="Avg response"
          value={formatMs(stats.avgResponseMs)}
          hint={`${stats.checks24h} check${stats.checks24h === 1 ? '' : 's'} in 24h`}
          icon={<Gauge className="size-4" />}
        />
        <StatCard
          label="Uptime · 24h"
          value={<UptimeText value={stats.uptime24h} className="text-2xl" />}
          hint={stats.checks24h > 0 ? `${formatUptime(stats.uptime24h)} of checks passed` : 'No checks yet'}
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Response time</CardTitle>
              <CardDescription>Average across all websites{pausedSuffix}</CardDescription>
            </div>
            <Badge variant="secondary">Last 24 hours</Badge>
          </CardHeader>
          <CardContent>
            <ResponseChart data={responseSeries} range="24h" height={250} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>Recent incidents</CardTitle>
              <CardDescription>Latest downtime events</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/incidents">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <IncidentList incidents={incidents} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Monitored websites</CardTitle>
            <CardDescription>Status and performance over the last 24 hours</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/websites">Manage</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uptime</TableHead>
                <TableHead className="hidden sm:table-cell">Avg response</TableHead>
                <TableHead className="hidden lg:table-cell">Last check</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {websites.map((site) => (
                <WebsiteRow key={site.id} site={site} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {websites.length === 0 ? <EmptyState title="No websites yet" /> : null}
    </>
  );
}
