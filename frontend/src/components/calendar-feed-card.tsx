import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import { confirmDialog } from '@/lib/confirm';

interface Feed { enabled: boolean; url: string | null }

/** Personal iCalendar subscription link. The URL is a secret: rotating or revoking it kills the old one at once. */
export function CalendarFeedGroup() {
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
  const revoke = async () => {
    if (!(await confirmDialog({ title: 'Revoke the calendar link?', description: 'Apps subscribed to it will stop updating.', confirmLabel: 'Revoke', tone: 'danger' }))) return;
    return run(async () => { await api.delete('/users/me/calendar-feed'); return { enabled: false, url: null }; }, 'Calendar link revoked');
  };
  const rotate = async () => {
    if (!(await confirmDialog({ title: 'Create a new link?', description: 'The current one stops working immediately.', confirmLabel: 'Create new link' }))) return;
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

  const enabled = !!(feed?.enabled && feed.url);

  return (
    <SettingsGroup>
      <div data-testid="calendar-feed-card">
        <SettingsRow
          label="Subscription link"
          description="Your assigned tasks with a start or due date, for Google Calendar, Outlook or Apple Calendar. Anyone with the link can see those task titles."
        >
          {enabled ? (
            <span className="inline-flex h-6 items-center rounded-full bg-success-soft px-2.5 text-xs font-medium text-success">Active</span>
          ) : (
            <Button type="button" size="sm" disabled={busy || feed === null} onClick={create}>Create link</Button>
          )}
        </SettingsRow>
        {enabled && (
          <div className="space-y-3 border-t border-hairline px-5 py-4">
            <div className="flex gap-2">
              <Input readOnly aria-label="Calendar feed link" value={feed!.url!} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={rotate} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> New link</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={revoke} className="gap-1.5 text-danger hover:bg-danger-soft hover:text-danger"><Trash2 className="h-3.5 w-3.5" /> Revoke</Button>
            </div>
          </div>
        )}
      </div>
    </SettingsGroup>
  );
}
