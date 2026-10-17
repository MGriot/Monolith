import { useState } from 'react';
import { Bell, MailCheck, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type PrefKey = 'notify_email_assignments' | 'notify_email_digest';

const PREFS: { key: PrefKey; label: string; hint: string }[] = [
  { key: 'notify_email_assignments', label: 'Assignments and deadline reminders', hint: 'An e-mail when you are assigned to a task and when one of yours is due within 48 hours.' },
  { key: 'notify_email_digest', label: 'Weekly digest', hint: 'Monday summary of your open tasks, plus team and project reports you own.' },
];

/** E-mail verification status and per-type e-mail opt-outs (in-app notifications are not affected). */
export function NotificationPrefsCard() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState<PrefKey | null>(null);
  const [sending, setSending] = useState(false);

  if (!user) return null;
  const verified = !!user.email_verified_at;

  const toggle = async (key: PrefKey, value: boolean) => {
    setSaving(key);
    try {
      await api.put('/users/me', { [key]: value });
      await refreshUser();
      toast.success('Preference saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the preference'));
    } finally {
      setSaving(null);
    }
  };

  const sendVerification = async () => {
    setSending(true);
    try {
      const r = await api.post('/auth/request-email-verification');
      toast.success(r.data?.detail || 'Verification e-mail sent');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the verification e-mail'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" aria-hidden="true" />
          Notifications
        </CardTitle>
        <CardDescription>Choose which e-mails you get. In-app notifications always stay on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-sm">
            {verified ? (
              <MailCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <MailWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            )}
            <span>
              {user.email} - <b>{verified ? 'verified' : 'not verified'}</b>
            </span>
          </div>
          {!verified && (
            <Button type="button" size="sm" variant="outline" onClick={sendVerification} disabled={sending}>
              {sending ? 'Sending...' : 'Send verification e-mail'}
            </Button>
          )}
        </div>

        {PREFS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={key}>{label}</Label>
              <p id={`${key}-hint`} className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              id={key}
              aria-describedby={`${key}-hint`}
              checked={user[key] !== false}
              disabled={saving === key}
              onCheckedChange={(v) => toggle(key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
