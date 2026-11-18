import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gauge,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TimeRange, WebsiteDetailData } from '@shared/types';
import { CHECK_INTERVALS } from '@shared/schemas';

import { IncidentList } from '@/components/IncidentList';
import { ErrorState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { StatCard } from '@/components/StatCard';
import { UptimeText } from '@/components/UptimeText';
import { ResponseChart } from '@/components/charts/ResponseChart';
import { UptimeBars } from '@/components/charts/UptimeBars';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime, formatMs, formatUptime, intervalLabel, liveDuration } from '@/lib/format';
import { RESULT_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

interface EditFormValues {
  name: string;
  intervalMinutes: number;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function EditWebsiteDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: WebsiteDetailData;
}) {
  const queryClient = useQueryClient();
  const site = detail.website;

  const form = useForm<EditFormValues>({
    defaultValues: { name: site.name, intervalMinutes: site.intervalMinutes },
  });

  const mutation = useMutation({
    mutationFn: (values: EditFormValues) => api.updateWebsite(site.id, values),
    onSuccess: (result) => {
      queryClient.setQueryData(['website', site.id], result);
      void queryClient.invalidateQueries({ queryKey: ['websites'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Website settings updated.');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update the website.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit website</DialogTitle>
          <DialogDescription>Change the display name or how often UptimeGuard checks this site.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Display name</Label>
            <Input
              id="edit-name"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register('name', { required: 'Enter a name.', maxLength: { value: 80, message: 'Name is too long.' } })}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Check interval</Label>
            <Controller
              control={form.control}
              name="intervalMinutes"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_INTERVALS.map((interval) => (
                      <SelectItem key={interval} value={String(interval)}>
                        {interval === 60 ? 'Every hour' : `Every ${interval} minutes`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              The next scheduled check becomes due immediately after changing the interval.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input value={site.url} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              To monitor a different URL, remove this website and add the new one.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WebsiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRange>('24h');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['website', id],
    queryFn: () => api.getWebsite(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });

  const seriesQuery = useQuery({
    queryKey: ['series', id, range],
    queryFn: () => api.getSeries(id ?? '', range),
    enabled: Boolean(id) && Boolean(data),
    refetchInterval: 30_000,
  });

  const invalidateAll = (siteId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['website', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['series', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['websites'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const checkMutation = useMutation({
    mutationFn: () => api.checkWebsite(id ?? ''),
    onSuccess: (result) => {
      if (result.log.isUp) {
        toast.success(`Responded in ${formatMs(result.log.responseTimeMs)}`);
      } else {
        toast.error('Check failed', { description: result.log.errorMessage ?? undefined });
      }
      invalidateAll(id ?? '');
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'The check could not be started.');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.updateWebsite(id ?? '', { isPaused: !data?.website.isPaused }),
    onSuccess: (result) => {
      if (result) queryClient.setQueryData(['website', id], result);
      toast.success(result.website.isPaused ? 'Monitoring paused.' : 'Monitoring resumed.');
      invalidateAll(id ?? '');
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Could not update monitoring.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWebsite(id ?? ''),
    onSuccess: () => {
      toast.success('Website removed.');
      void queryClient.invalidateQueries({ queryKey: ['websites'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/websites', { replace: true });
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Could not remove the website.');
    },
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState
          title="Website not available"
          message={error instanceof Error ? error.message : 'This website could not be loaded.'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const site = data.website;
  const series = seriesQuery.data?.series ?? data.series;
  const buckets = seriesQuery.data?.buckets ?? data.buckets;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{site.name}</h1>
            <StatusBadge status={site.status} />
          </div>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <span className="max-w-[36rem] truncate">{site.url}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
            {checkMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Check now
          </Button>
          <Button variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
            {site.isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {site.isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="icon" aria-label="Edit website" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Remove website"
            className="text-destructive hover:bg-destructive/5"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {site.isPaused ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
          <Pause className="size-4 text-muted-foreground" />
          <span>
            Monitoring is paused. No checks run until you resume it.{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => pauseMutation.mutate()}
            >
              Resume now
            </button>
          </span>
        </div>
      ) : null}

      {site.openIncident ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              Down for {liveDuration(site.openIncident.startedAt)}
            </p>
            <p className="mt-0.5 truncate text-muted-foreground">
              {site.openIncident.lastError ?? 'Health checks are failing.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Uptime · 24h"
          value={<UptimeText value={site.uptime24h} className="text-2xl" />}
          hint={`${site.checks24h} check${site.checks24h === 1 ? '' : 's'}`}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Uptime · 7 days"
          value={<UptimeText value={site.uptime7d} className="text-2xl" />}
          hint={`${site.checks7d} check${site.checks7d === 1 ? '' : 's'}`}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Uptime · 30 days"
          value={<UptimeText value={site.uptime30d} className="text-2xl" />}
          hint={`${site.checks30d} check${site.checks30d === 1 ? '' : 's'}`}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Avg response · 7d"
          value={formatMs(site.avgResponseMs7d)}
          hint={intervalLabel(site.intervalMinutes)}
          icon={<Gauge className="size-4" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uptime history</CardTitle>
          <CardDescription>Availability over the last 7 days, grouped into 6-hour blocks.</CardDescription>
        </CardHeader>
        <CardContent>
          <UptimeBars buckets={buckets} label="Uptime over the last 7 days" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Response time</CardTitle>
            <CardDescription>Average response time of successful checks.</CardDescription>
          </div>
          <Tabs value={range} onValueChange={(value) => setRange(value as TimeRange)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {seriesQuery.isLoading && !seriesQuery.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponseChart data={series} range={range} height={280} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent checks</CardTitle>
            <CardDescription>The 50 most recent results from the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.logs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <Clock className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">No checks recorded yet</p>
                <p className="text-sm text-muted-foreground">
                  Run a manual check now, or wait for the next scheduled run.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="hidden sm:table-cell">HTTP</TableHead>
                    <TableHead className="hidden sm:table-cell">Response</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(log.checkedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.isUp ? 'success' : 'destructive'} className="gap-1">
                          {log.isUp ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                          {RESULT_LABELS[log.result]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums text-muted-foreground sm:table-cell">
                        {log.statusCode ?? '—'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'hidden text-sm tabular-nums sm:table-cell',
                          log.isUp ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {formatMs(log.responseTimeMs)}
                      </TableCell>
                      <TableCell className="max-w-[18rem]">
                        <p className="truncate text-xs text-muted-foreground" title={log.errorMessage ?? undefined}>
                          {log.errorMessage ?? (log.redirectedTo ? `Redirected to ${log.redirectedTo}` : 'OK')}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>Incidents</CardTitle>
              <CardDescription>Downtime and recovery events.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/incidents">
                All <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <IncidentList
              incidents={data.incidents}
              emptyText={`${site.hostname} has not had a recorded incident.`}
            />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Uptime is calculated as successful checks divided by total checks inside each window. Last checked{' '}
        {formatDateTime(site.lastCheckedAt)}. Next check due {formatDateTime(site.nextCheckAt)}. Overall uptime
        24h: {formatUptime(site.uptime24h)}.
      </p>

      <EditWebsiteDialog open={editOpen} onOpenChange={setEditOpen} detail={data} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {site.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Monitoring stops immediately and all checks, incidents and notifications for this website are
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Removing…' : 'Remove website'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/websites"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> All websites
    </Link>
  );
}
