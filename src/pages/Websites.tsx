import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WebsiteListItem } from '@shared/types';

import { AddWebsiteDialog } from '@/components/AddWebsiteDialog';
import { EmptyState, ErrorState } from '@/components/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { UptimeText } from '@/components/UptimeText';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatMs, formatRelative, intervalLabel, liveDuration } from '@/lib/format';

function ActionsMenu({
  site,
  onDelete,
  onCheck,
  onTogglePause,
  checking,
  toggling,
}: {
  site: WebsiteListItem;
  onDelete: () => void;
  onCheck: () => void;
  onTogglePause: () => void;
  checking: boolean;
  toggling: boolean;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${site.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/websites/${site.id}`)}>
          <Eye /> View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCheck} disabled={checking}>
          <RefreshCw /> {checking ? 'Checking…' : 'Check now'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePause} disabled={toggling}>
          {site.isPaused ? <Play /> : <Pause />}
          {site.isPaused ? 'Resume monitoring' : 'Pause monitoring'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Remove website
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Websites() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<WebsiteListItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['websites'],
    queryFn: api.getWebsites,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['websites'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const checkMutation = useMutation({
    mutationFn: (site: WebsiteListItem) => api.checkWebsite(site.id),
    onSuccess: (result, site) => {
      if (result.log.isUp) {
        toast.success(`${site.name} responded in ${formatMs(result.log.responseTimeMs)}`);
      } else {
        toast.error(`${site.name} check failed`, { description: result.log.errorMessage ?? undefined });
      }
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['website', site.id] });
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'The check could not be started.');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (site: WebsiteListItem) => api.updateWebsite(site.id, { isPaused: !site.isPaused }),
    onSuccess: (result, site) => {
      toast.success(site.isPaused ? `Resumed monitoring for ${site.name}.` : `Paused monitoring for ${site.name}.`);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['website', site.id] });
      if (result) void queryClient.setQueryData(['website', site.id], result);
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Could not update monitoring.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (site: WebsiteListItem) => api.deleteWebsite(site.id),
    onSuccess: (_, site) => {
      toast.success(`${site.name} was removed.`);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Could not remove the website.');
    },
  });

  const websites = data?.websites ?? [];

  return (
    <>
      <PageHeader
        title="Websites"
        description={
          data ? `${websites.length} monitored website${websites.length === 1 ? '' : 's'}` : 'Manage your monitored websites.'
        }
        actions={<AddWebsiteDialog />}
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : websites.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Globe className="size-5" />}
              title="No websites yet"
              description="Add a public website URL and UptimeGuard will begin checking it within a few minutes."
              action={
                <AddWebsiteDialog>
                  <Button>
                    <Plus className="size-4" /> Add website
                  </Button>
                </AddWebsiteDialog>
              }
            />
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
                    <TableHead>Uptime · 24h</TableHead>
                    <TableHead className="hidden xl:table-cell">Avg response</TableHead>
                    <TableHead className="hidden xl:table-cell">Interval</TableHead>
                    <TableHead>Last check</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {websites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <Link to={`/websites/${site.id}`} className="font-medium hover:underline">
                            {site.name}
                          </Link>
                          <p className="max-w-[22rem] truncate text-xs text-muted-foreground">{site.url}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadge status={site.status} />
                          {site.openIncidentStartedAt ? (
                            <p className="text-[11px] text-destructive">
                              Down for {liveDuration(site.openIncidentStartedAt)}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <UptimeText value={site.uptime24h} />
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-sm text-muted-foreground xl:table-cell">
                        {formatMs(site.avgResponseMs24h)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{intervalLabel(site.intervalMinutes)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatRelative(site.lastCheckedAt)}</TableCell>
                      <TableCell>
                        <ActionsMenu
                          site={site}
                          checking={checkMutation.isPending && checkMutation.variables?.id === site.id}
                          toggling={pauseMutation.isPending && pauseMutation.variables?.id === site.id}
                          onDelete={() => setDeleteTarget(site)}
                          onCheck={() => checkMutation.mutate(site)}
                          onTogglePause={() => pauseMutation.mutate(site)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {websites.map((site) => (
                <li key={site.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/websites/${site.id}`} className="text-sm font-medium hover:underline">
                        {site.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{site.url}</p>
                    </div>
                    <ActionsMenu
                      site={site}
                      checking={checkMutation.isPending && checkMutation.variables?.id === site.id}
                      toggling={pauseMutation.isPending && pauseMutation.variables?.id === site.id}
                      onDelete={() => setDeleteTarget(site)}
                      onCheck={() => checkMutation.mutate(site)}
                      onTogglePause={() => pauseMutation.mutate(site)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <StatusBadge status={site.status} />
                    <span>
                      Uptime <UptimeText value={site.uptime24h} />
                    </span>
                    <span>{formatMs(site.avgResponseMs24h)} avg</span>
                    <span>{intervalLabel(site.intervalMinutes)}</span>
                    <span>{formatRelative(site.lastCheckedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Monitoring stops immediately and all checks, incidents and notifications for this website are
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Removing…' : 'Remove website'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
