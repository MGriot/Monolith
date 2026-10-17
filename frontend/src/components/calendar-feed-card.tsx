import { useEffect, useState } from 'react';
import { CalendarDays, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Feed { enabled: boolean; url: string | null }

/** Personal iCalendar subscription link. The URL is a secret: rotating or revoking it kills the old one at once. */
export function CalendarFeedCard() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Feed>('/users/me/calendar-feed').then((r) => setFeed(r.data)).catch(() => setFeed({ enabled: false, url: null }));
  }, []);

  const run = async (fn: () => Promise<Feed>, ok: string) => {
    setBusy(true);
    try {
      setFeed(await fn());
      toast.success(ok);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the calendar link'));
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => (await api.post<Feed>('/users/me/calendar-feed')).data, 'Calendar link ready');
  const revoke = () => {
    if (!window.confirm('Revoke the calendar link? Apps subscribed to it will stop updating.')) return Promise.resolve();
    return run(async () => { await api.delete('/users/me/calendar-feed'); return { enabled: false, url: null }; }, 'Calendar link revoked');
  };
  const rotate = () => {
    if (!window.confirm('Create a new link? The current one stops working immediately.')) return Promise.resolve();
    return create();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feed?.url ?? '');
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it manually');
    }
  };

  return (
    <Card className="border-border shadow-sm" data-testid="calendar-feed-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Calendar feed</CardTitle>
        <CardDescription>
          Subscribe to your assigned tasks (with a start or due date) from Google Calendar, Outlook or Apple Calendar. Anyone with the link can see
          those task titles, so keep it private.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {feed?.enabled && feed.url ? (
          <>
            <div className="flex gap-2">
              <Input readOnly aria-label="Calendar feed link" value={feed.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={copy} aria-label="Copy link"><Copy className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rotate}><RefreshCw className="w-4 h-4 mr-1" /> New link</Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={revoke} className="text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4 mr-1" /> Revoke</Button>
            </div>
          </>
        ) : (
          <Button type="button" disabled={busy || feed === null} onClick={create}>Create calendar link</Button>
        )}
      </CardContent>
    </Card>
  );
}
