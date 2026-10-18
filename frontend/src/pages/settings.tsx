import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { Loader2, MoreHorizontal, Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTitle } from '@/context/title-context';
import { EmailVerificationStatus, NotificationPrefsGroup } from '@/components/notification-prefs';
import { ThemeSegmented } from '@/components/theme-toggle';
import { CalendarFeedGroup } from '@/components/calendar-feed-card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageBody, PageHeader } from '@/components/ui/page-header';
import { SettingsGroup, SettingsRow, SettingsSection } from '@/components/ui/settings-group';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm';

interface ProfileFormValues {
  full_name: string;
}

interface PasswordFormValues {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

interface Webhook {
    id: string;
    name: string;
    url: string;
    provider: string;
    is_active: boolean;
    created_at: string;
}

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'calendar', label: 'Calendar feed' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Security' },
] as const;

const PROVIDERS = [
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'generic', label: 'Other (JSON)' },
] as const;

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

/** Hide the middle of a webhook URL: it is a secret, but the host and the last characters help tell hooks apart. */
const maskUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.host}/…/••••${url.slice(-4)}`;
  } catch {
    return `••••${url.slice(-4)}`;
  }
};

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { setTitle } = useTitle();
  const [active, setActive] = useState<string>('profile');
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', provider: 'slack' });
  const [passwordOpen, setPasswordOpen] = useState(!!user?.must_change_password);

  useEffect(() => {
    setTitle("Settings");
    return () => setTitle(null);
  }, [setTitle]);

  // Scroll-spy: highlight the section nearest the top of the page.
  useEffect(() => {
    const els = SECTIONS.map(s => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!('IntersectionObserver' in window) || !els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Deep links (#security) land on their section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const goTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  };

  const { data: webhooks, isLoading: isLoadingWebhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => (await api.get('/webhooks/')).data as Webhook[],
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: typeof webhookForm) => api.post('/webhooks/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setIsWebhookDialogOpen(false);
      setWebhookForm({ name: '', url: '', provider: 'slack' });
      toast.success("Webhook added");
    },
    onError: (err) => toast.error(errorText(err, "Could not add the webhook. Check the URL.")),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success("Webhook deleted");
    }
  });

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: () => toast.success("Test message sent"),
    onError: () => toast.error("The test failed. Check the webhook URL.")
  });

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: { full_name: user?.full_name || '' },
  });

  const passwordForm = useForm<PasswordFormValues>();

  const onProfileSubmit = async (values: ProfileFormValues) => {
    try {
      await api.put('/users/me', values);
      await refreshUser();
      profileForm.reset(values);
      toast.success('Profile saved');
    } catch (error) {
      toast.error(errorText(error, 'Could not save the profile'));
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    if (values.new_password !== values.confirm_password) {
      passwordForm.setError('confirm_password', { message: 'The two new passwords are different' });
      return;
    }
    try {
      await api.put('/users/me', { password: values.new_password, current_password: values.current_password });
      toast.success('Password changed');
      passwordForm.reset();
      setPasswordOpen(false);
      await refreshUser();
    } catch (error) {
      toast.error(errorText(error, 'Could not change the password'));
    }
  };

  const profileDirty = profileForm.formState.isDirty;

  return (
    <PageBody className="max-w-5xl">
      <PageHeader title="Settings" description="Your profile, notifications and connected apps." />

      {/* Narrow screens: sections as a chip row */}
      <nav aria-label="Settings sections" className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 lg:hidden">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(s.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
              active === s.id ? 'border-foreground bg-foreground text-background' : 'bg-card text-fg-soft hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-0 space-y-0.5">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    active === s.id ? 'bg-card font-medium text-foreground ring-1 ring-border' : 'text-fg-soft hover:bg-card hover:text-foreground'
                  )}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-2xl space-y-10 pb-16">
          {user?.must_change_password && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
              You are using a temporary password. Choose your own under Security (enter the temporary password as the current
              one) to continue using Monolith.
            </div>
          )}

          <SettingsSection id="profile" title="Profile" description="How your name appears to teammates.">
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <SettingsGroup
                footer={profileDirty ? (
                  <>
                    <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => profileForm.reset()}>Discard</Button>
                    <Button type="submit" size="sm" disabled={profileForm.formState.isSubmitting}>
                      {profileForm.formState.isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save
                    </Button>
                  </>
                ) : undefined}
              >
                <SettingsRow label="Full name" htmlFor="full_name">
                  <Input id="full_name" {...profileForm.register('full_name')} className="h-9 w-full sm:w-72" />
                </SettingsRow>
                <SettingsRow label="Email" description="Used for sign-in and notifications. It can't be changed here.">
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="text-sm">{user?.email}</span>
                    <EmailVerificationStatus />
                  </div>
                </SettingsRow>
              </SettingsGroup>
            </form>
          </SettingsSection>

          <SettingsSection id="appearance" title="Appearance">
            <SettingsGroup>
              <SettingsRow label="Theme" description="Light, dark, or follow your device. Saved in this browser.">
                <ThemeSegmented />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="notifications" title="Notifications" description="Choose which e-mails you get. In-app notifications always stay on.">
            <NotificationPrefsGroup />
          </SettingsSection>

          <SettingsSection id="calendar" title="Calendar feed" description="See your tasks in the calendar app you already use.">
            <CalendarFeedGroup />
          </SettingsSection>

          <SettingsSection id="integrations" title="Integrations" description="Post project updates to Slack, Discord or any service that accepts JSON webhooks.">
            <SettingsGroup>
              {isLoadingWebhooks ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-fg-faint" /></div>
              ) : (
                webhooks?.map((w) => (
                  <SettingsRow
                    key={w.id}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', w.provider === 'slack' ? 'bg-review-soft text-review' : 'bg-info-soft text-info')}>
                          <WebhookIcon className="h-3.5 w-3.5" />
                        </span>
                        {w.name}
                      </span>
                    }
                    description={<span className="font-mono">{PROVIDERS.find(p => p.value === w.provider)?.label ?? w.provider} · {maskUrl(w.url)}</span>}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => testWebhookMutation.mutate(w.id)}
                      disabled={testWebhookMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5" /> Send test
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-fg-faint" aria-label={`More actions for ${w.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-danger focus:text-danger"
                          onSelect={() => {
                            void confirmDialog({ title: `Delete the webhook “${w.name}”?`, description: 'The channel stops receiving updates.', confirmLabel: 'Delete', tone: 'danger' })
                              .then((ok) => { if (ok) deleteWebhookMutation.mutate(w.id); });
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SettingsRow>
                ))
              )}
              <button
                type="button"
                onClick={() => setIsWebhookDialogOpen(true)}
                className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-medium text-fg-soft transition-colors hover:bg-subtle hover:text-foreground"
              >
                <Plus className="h-4 w-4" /> Add webhook
              </button>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="security" title="Security">
            <SettingsGroup>
              <SettingsRow label="Password" description="Use at least 8 characters that you don't use anywhere else.">
                {!passwordOpen && (
                  <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>Change password</Button>
                )}
              </SettingsRow>
              {passwordOpen && (
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 px-5 py-4">
                  <Field label="Current password" htmlFor="current_password">
                    <Input id="current_password" type="password" autoComplete="current-password" className="h-9 sm:w-80" {...passwordForm.register('current_password', { required: true })} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="New password" htmlFor="new_password">
                      <Input id="new_password" type="password" autoComplete="new-password" className="h-9" {...passwordForm.register('new_password', { required: true })} />
                    </Field>
                    <Field label="Repeat new password" htmlFor="confirm_password" error={passwordForm.formState.errors.confirm_password?.message}>
                      <Input id="confirm_password" type="password" autoComplete="new-password" className="h-9" {...passwordForm.register('confirm_password', { required: true })} />
                    </Field>
                  </div>
                  <div className="flex justify-end gap-2">
                    {!user?.must_change_password && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => { passwordForm.reset(); setPasswordOpen(false); }}>Cancel</Button>
                    )}
                    <Button type="submit" size="sm" disabled={passwordForm.formState.isSubmitting}>
                      {passwordForm.formState.isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Change password
                    </Button>
                  </div>
                </form>
              )}
            </SettingsGroup>
          </SettingsSection>
        </div>
      </div>

      <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add webhook</DialogTitle>
            <DialogDescription>Paste the incoming-webhook URL from your channel settings.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); createWebhookMutation.mutate(webhookForm); }}
          >
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">App</Label>
                <div role="radiogroup" aria-label="App" className="inline-flex gap-1 rounded-lg border bg-subtle p-1">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={webhookForm.provider === p.value}
                      onClick={() => setWebhookForm({ ...webhookForm, provider: p.value })}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        webhookForm.provider === p.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Name" htmlFor="webhook_name" hint="Shown in this list only, e.g. the channel name.">
                <Input
                  id="webhook_name"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  placeholder="#releases"
                  className="h-9"
                />
              </Field>
              <Field label="Webhook URL" htmlFor="webhook_url">
                <Input
                  id="webhook_url"
                  type="url"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  placeholder={webhookForm.provider === 'slack' ? 'https://hooks.slack.com/services/…' : webhookForm.provider === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://…'}
                  className="h-9 font-mono text-xs"
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsWebhookDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="min-w-[120px]" disabled={!webhookForm.name || !webhookForm.url || createWebhookMutation.isPending}>
                {createWebhookMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add webhook'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
