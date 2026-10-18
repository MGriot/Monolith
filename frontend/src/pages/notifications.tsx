import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, Circle, CircleDot, ExternalLink, Info, MessageSquare, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotificationPrefsGroup } from '@/components/notification-prefs';
import { useTitle } from '@/context/title-context';
import { useNotificationList, useNotificationMutations, useUnreadCount } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { mayHaveMore, NOTIFICATION_TYPES, PAGE_SIZE, typeLabel, type AppNotification } from '@/lib/notifications';

function TypeIcon({ type }: { type: string | null }) {
  if (type === 'assignment') return <MessageSquare className="w-4 h-4 text-blue-500" aria-hidden />;
  if (type === 'unblocked') return <CheckCheck className="w-4 h-4 text-emerald-500" aria-hidden />;
  return <Info className="w-4 h-4 text-fg-faint" aria-hidden />;
}

export default function NotificationsPage() {
  const { setTitle } = useTitle();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filters = { unreadOnly, type, limit };

  useEffect(() => {
    setTitle('Notifications');
    return () => setTitle(null);
  }, [setTitle]);

  const { data: notifications, isLoading, isError } = useNotificationList(filters);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { setRead, markAllRead } = useNotificationMutations();

  const open = (n: AppNotification) => {
    if (!n.is_read) setRead.mutate({ id: n.id, isRead: true });
    if (n.link) navigate(n.link);
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Notification centre</h2>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show" className="inline-flex rounded-lg border bg-subtle p-1 gap-1">
              {[
                { label: 'All', value: false },
                { label: 'Unread', value: true },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={unreadOnly === o.value}
                  onClick={() => {
                    setUnreadOnly(o.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    unreadOnly === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="notification-type">Type</label>
            <select
              id="notification-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All types</option>
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="w-4 h-4" aria-hidden />
              Mark all read
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" role="status" aria-label="Loading" />
            </div>
          ) : isError ? (
            <p className="p-8 text-center text-sm text-destructive">Could not load notifications.</p>
          ) : notifications && notifications.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn('relative flex gap-3 p-4 transition-colors hover:bg-subtle', !n.is_read && 'bg-primary/5 hover:bg-primary/10')}
                >
                  {!n.is_read && <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />}
                  <div className="mt-0.5 shrink-0">
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cn(
                          'text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded',
                          n.is_read ? 'text-fg-soft' : 'text-foreground',
                        )}
                      >
                        {n.title}
                      </button>
                      <span className="shrink-0 text-xs text-fg-faint" title={new Date(n.created_at).toLocaleString()}>
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{typeLabel(n.type)}</span>
                      {n.link && (
                        <Link to={n.link} onClick={() => !n.is_read && setRead.mutate({ id: n.id, isRead: true })} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          Open <ExternalLink className="w-3 h-3" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={n.is_read ? 'Mark as unread' : 'Mark as read'}
                    title={n.is_read ? 'Mark as unread' : 'Mark as read'}
                    disabled={setRead.isPending}
                    onClick={() => setRead.mutate({ id: n.id, isRead: !n.is_read })}
                  >
                    {n.is_read ? <Circle className="w-4 h-4" aria-hidden /> : <CircleDot className="w-4 h-4 text-primary" aria-hidden />}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-12 text-center">
              <Bell className="w-8 h-8 text-fg-ghost mx-auto mb-3" aria-hidden />
              <p className="text-sm font-medium text-foreground">{unreadOnly || type ? 'Nothing matches these filters' : 'No notifications yet'}</p>
            </div>
          )}
          {notifications && mayHaveMore(notifications.length, limit) && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, 500))}>
                Load more
              </Button>
            </div>
          )}
        </Card>

        <section aria-labelledby="email-prefs-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="email-prefs-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" aria-hidden />
              E-mail preferences
            </h2>
          </div>
          <NotificationPrefsGroup />
        </section>
      </div>
    </div>
  );
}
