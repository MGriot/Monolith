import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { 
    User, 
    Lock, 
    Save, 
    Shield, 
    Webhook as WebhookIcon, 
    Plus, 
    Trash2, 
    Send, 
    Loader2
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTitle } from '@/context/title-context';
import { NotificationPrefsCard } from '@/components/notification-prefs';
import { ThemeSegmented } from '@/components/theme-toggle';
import { CalendarFeedCard } from '@/components/calendar-feed-card';
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
import { cn } from '@/lib/utils';

interface ProfileFormValues {
  full_name: string;
  email: string;
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

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const { setTitle } = useTitle();

  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', provider: 'slack' });

  useEffect(() => {
    setTitle("Settings");
    return () => setTitle(null);
  }, [setTitle]);

  const { data: webhooks, isLoading: isLoadingWebhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
        const res = await api.get('/webhooks/');
        return res.data as Webhook[];
    }
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: typeof webhookForm) => {
        return api.post('/webhooks/', data);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['webhooks'] });
        setIsWebhookDialogOpen(false);
        setWebhookForm({ name: '', url: '', provider: 'slack' });
        toast.success("Webhook created successfully");
    },
    onError: () => toast.error("Failed to create webhook")
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
        return api.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['webhooks'] });
        toast.success("Webhook deleted");
    }
  });

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
        return api.post(`/webhooks/${id}/test`);
    },
    onSuccess: () => toast.success("Test notification sent!"),
    onError: () => toast.error("Test failed. Check your webhook URL.")
  });

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      full_name: user?.full_name || '',
      email: user?.email || '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>();

  const onProfileSubmit = async (values: ProfileFormValues) => {
    setIsProfileLoading(true);
    try {
      await api.put('/users/me', values);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update profile');
      console.error(error);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    if (values.new_password !== values.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    setIsPasswordLoading(true);
    try {
      await api.put('/users/me', { password: values.new_password, current_password: values.current_password });
      toast.success('Password updated successfully');
      passwordForm.reset();
      await refreshUser();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update password');
      console.error(error);
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-subtle/50">
      <div className="flex-1 overflow-auto p-6 space-y-8 pb-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h2 className="text-sm font-semibold text-foreground">Personal Information</h2>
            <p className="text-xs text-muted-foreground mt-1">Update your profile details and email address.</p>
          </div>
          <div className="md:col-span-2">
            <Card className="border-border shadow-sm">
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    Profile details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input id="full_name" {...profileForm.register('full_name')} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input id="email" type="email" {...profileForm.register('email')} disabled className="bg-subtle border-border" />
                    <p className="text-[10px] text-fg-faint">Email cannot be changed currently.</p>
                  </div>
                </CardContent>
                <CardFooter className="bg-subtle/50 border-t flex justify-end p-4">
                  <Button type="submit" size="sm" className="gap-2" disabled={isProfileLoading}>
                    <Save className="w-3.5 h-3.5" />
                    {isProfileLoading ? 'Saving...' : 'Save changes'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          <div className="md:col-span-1 pt-4 border-t border-border mt-4">
            <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
            <p className="text-xs text-muted-foreground mt-1">Light, dark, or follow your device.</p>
          </div>
          <div className="md:col-span-2 pt-4 border-t border-border mt-4">
            <ThemeSegmented />
          </div>

          <div className="md:col-span-1 pt-4 border-t border-border mt-4">
            <h2 className="text-sm font-semibold text-foreground">Webhooks</h2>
            <p className="text-xs text-muted-foreground mt-1">Configure external integrations for Slack and Discord.</p>
          </div>
          <div className="md:col-span-2 pt-4 border-t border-border mt-4">
            <Card className="border-border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <WebhookIcon className="w-4 h-4 text-primary" />
                            Integration Hooks
                        </CardTitle>
                        <CardDescription>Receive project updates in your chat apps.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="gap-2 h-8" onClick={() => setIsWebhookDialogOpen(true)}>
                        <Plus className="w-3.5 h-3.5" /> Add New
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoadingWebhooks ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-border" /></div>
                    ) : webhooks && webhooks.length > 0 ? (
                        <div className="space-y-2">
                            {webhooks.map((w) => (
                                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border border-hairline bg-subtle/50 group">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center",
                                            w.provider === 'slack' ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                        )}>
                                            <WebhookIcon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-foreground">{w.name}</p>
                                            <p className="text-[10px] text-fg-faint truncate max-w-[200px]">{w.url}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-fg-faint hover:text-primary"
                                            onClick={() => testWebhookMutation.mutate(w.id)}
                                            disabled={testWebhookMutation.isPending}
                                            title="Send Test"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-fg-faint hover:text-destructive"
                                            onClick={() => {
                                                if (confirm('Delete this webhook?')) deleteWebhookMutation.mutate(w.id);
                                            }}
                                            disabled={deleteWebhookMutation.isPending}
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-subtle/50 rounded-xl border border-dashed">
                            <WebhookIcon className="w-8 h-8 text-border mx-auto mb-2" />
                            <p className="text-xs text-fg-faint">No webhooks configured yet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1 pt-4 border-t border-border mt-4">
            <h2 className="text-sm font-semibold text-foreground">Security</h2>
            <p className="text-xs text-muted-foreground mt-1">Keep your account secure by using a strong password.</p>
          </div>
          <div className="md:col-span-2 pt-4 border-t border-border mt-4 space-y-6">
            {user?.must_change_password && (
              <div role="alert" className="rounded-md border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                You are using a temporary password. Choose your own below (enter the temporary password as the current
                one) to continue using Monolith.
              </div>
            )}
            <NotificationPrefsCard />
            <CalendarFeedCard />
            <Card className="border-border shadow-sm">
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" />
                    Change password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current_password">Current Password</Label>
                    <Input id="current_password" type="password" autoComplete="current-password" {...passwordForm.register('current_password')} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new_password">New Password</Label>
                    <Input id="new_password" type="password" {...passwordForm.register('new_password')} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                    <Input id="confirm_password" type="password" {...passwordForm.register('confirm_password')} className="bg-background" />
                  </div>
                </CardContent>
                <CardFooter className="bg-subtle/50 border-t flex justify-end p-4">
                  <Button type="submit" size="sm" className="gap-2" disabled={isPasswordLoading}>
                    <Shield className="w-3.5 h-3.5" />
                    {isPasswordLoading ? 'Updating...' : 'Update password'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
        <DialogContent size="md">
            <DialogHeader>
                <DialogTitle>Add Webhook</DialogTitle>
                <DialogDescription>Configure a Slack or Discord incoming webhook.</DialogDescription>
            </DialogHeader>
            <DialogBody>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-fg-faint">Hook Name</Label>
                    <Input 
                        placeholder="e.g. My Team Slack" 
                        value={webhookForm.name}
                        onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-fg-faint">Webhook URL</Label>
                    <Input 
                        placeholder="https://hooks.slack.com/services/..." 
                        value={webhookForm.url}
                        onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-fg-faint">Provider</Label>
                    <div className="flex gap-2">
                        {['slack', 'discord', 'generic'].map((p) => (
                            <Button 
                                key={p}
                                size="sm"
                                variant={webhookForm.provider === p ? 'default' : 'outline'}
                                className="capitalize h-8 text-[10px] font-bold"
                                onClick={() => setWebhookForm({ ...webhookForm, provider: p })}
                            >
                                {p}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
            </DialogBody>
            <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setIsWebhookDialogOpen(false)}>Cancel</Button>
                <Button 
                    size="sm" 
                    onClick={() => createWebhookMutation.mutate(webhookForm)}
                    disabled={createWebhookMutation.isPending || !webhookForm.name || !webhookForm.url}
                >
                    {createWebhookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Webhook"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
