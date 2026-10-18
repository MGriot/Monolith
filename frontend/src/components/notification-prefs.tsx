import { useState } from 'react';
import { MailCheck, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';

type PrefKey = 'notify_email_assignments' | 'notify_email_digest';

const PREFS: { key: PrefKey; label: string; hint: string }[] = [
  { key: 'notify_email_assignments', label: 'Assignments and deadline reminders', hint: 'An e-mail when you are assigned to a task and when one of yours is due within 48 hours.' },
  { key: 'notify_email_digest', label: 'Weekly digest', hint: 'Monday summary of your open tasks, plus team and project reports you own.' },
];

/** Verified / not verified badge with a "Send link" action; sits next to the e-mail address. */
export function EmailVerificationStatus() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  if (!user) return null;
  const verified = !!user.email_verified_at;

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
    <span className="inline-flex flex-wrap items-center gap-2">
      {verified ? (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-medium text-success">
          <MailCheck className="h-3.5 w-3.5" aria-hidden /> Verified
        </span>
      ) : (
        <>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-xs font-medium text-warning">
            <MailWarning className="h-3.5 w-3.5" aria-hidden /> Not verified
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={sendVerification} disabled={sending}>
            {sending ? 'Sending…' : 'Send verification link'}
          </Button>
        </>
      )}
    </span>
  );
}

/** Per-type e-mail opt-outs (in-app notifications are not affected). Each switch saves on its own. */
export function NotificationPrefsGroup() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState<PrefKey | null>(null);

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

  return (
    <SettingsGroup>
      {!verified && (
        <SettingsRow
          className="bg-warning-soft/60"
          label={<span className="inline-flex items-center gap-2 text-warning"><MailWarning className="h-4 w-4" aria-hidden /> E-mails are paused</span>}
          description={`Verify ${user.email} to receive these e-mails. The verification link is sent from your profile.`}
        />
      )}
      {PREFS.map(({ key, label, hint }) => (
        <SettingsRow key={key} htmlFor={key} label={label} description={<span id={`${key}-hint`}>{hint}</span>}>
          <Switch
            id={key}
            aria-describedby={`${key}-hint`}
            checked={user[key] !== false}
            disabled={saving === key}
            onCheckedChange={(v) => toggle(key, v)}
          />
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}
