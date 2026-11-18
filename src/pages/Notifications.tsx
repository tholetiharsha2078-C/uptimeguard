import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification } from '@shared/types';

import { EmptyState, ErrorState } from '@/components/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

function NotificationIcon({ type }: { type: Notification['type'] }) {
  if (type === 'incident_opened') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-4" />
      </span>
    );
  }
  if (type === 'incident_resolved') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Bell className="size-4" />
    </span>
  );
}

export function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: api.getNotifications,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      toast.success('All notifications marked as read.');
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Could not update notifications.');
    },
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const openNotification = (notification: Notification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.websiteId) navigate(`/websites/${notification.websiteId}`);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Incident alerts and recovery events for your websites."
        actions={
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            disabled={unread === 0 || markAll.isPending}
          >
            {markAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            Mark all read
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Bell className="size-5" />}
              title="No notifications yet"
              description="When a website goes down or recovers, the event will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="divide-y divide-border">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40',
                      !notification.readAt && 'bg-primary/[0.025]',
                    )}
                  >
                    <NotificationIcon type={notification.type} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate text-sm', notification.readAt ? 'font-medium' : 'font-semibold')}>
                          {notification.title}
                        </span>
                        {!notification.readAt ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{notification.body}</span>
                      <span className="mt-1 block text-xs text-muted-foreground" title={formatDateTime(notification.createdAt)}>
                        {formatRelative(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {unread > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {unread} unread notification{unread === 1 ? '' : 's'}. Clicking a notification opens the website details.
        </p>
      ) : null}
    </>
  );
}
