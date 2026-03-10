import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { User, Lock, Save, Shield, Settings } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useTitle } from '@/components/layout';

interface ProfileFormValues {
  full_name: string;
  email: string;
}

interface PasswordFormValues {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const { setTitle } = useTitle();

  useEffect(() => {
    setTitle("Settings");
    return () => setTitle(null);
  }, [setTitle]);

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
      await axios.put('/api/v1/users/me', values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
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
      await axios.put('/api/v1/users/me', { password: values.new_password }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Password updated successfully');
      passwordForm.reset();
    } catch (error) {
      toast.error('Failed to update password');
      console.error(error);
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
      <div className="flex-1 overflow-auto p-6 space-y-8 pb-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <h2 className="text-sm font-semibold text-slate-900">Personal Information</h2>
            <p className="text-xs text-slate-500 mt-1">Update your profile details and email address.</p>
          </div>
          <div className="md:col-span-2">
            <Card className="border-slate-200 shadow-sm">
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
                    <Input id="full_name" {...profileForm.register('full_name')} className="bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input id="email" type="email" {...profileForm.register('email')} disabled className="bg-slate-50 border-slate-200" />
                    <p className="text-[10px] text-slate-400">Email cannot be changed currently.</p>
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t flex justify-end p-4">
                  <Button type="submit" size="sm" className="gap-2" disabled={isProfileLoading}>
                    <Save className="w-3.5 h-3.5" />
                    {isProfileLoading ? 'Saving...' : 'Save changes'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          <div className="md:col-span-1 pt-4">
            <h2 className="text-sm font-semibold text-slate-900">Security</h2>
            <p className="text-xs text-slate-500 mt-1">Keep your account secure by using a strong password.</p>
          </div>
          <div className="md:col-span-2">
            <Card className="border-slate-200 shadow-sm">
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" />
                    Change password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">New Password</Label>
                    <Input id="new_password" type="password" {...passwordForm.register('new_password')} className="bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                    <Input id="confirm_password" type="password" {...passwordForm.register('confirm_password')} className="bg-white" />
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t flex justify-end p-4">
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
    </div>
  );
}
