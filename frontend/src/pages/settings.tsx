import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { User, Lock, Save, Shield } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

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
      // In a real app, we might want to refresh the user data in AuthContext
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
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm">Manage your account settings and preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Personal Information</h2>
          <p className="text-xs text-slate-500 mt-1">Update your profile details and email address.</p>
        </div>
        <div className="md:col-span-2">
          <Card>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  Profile details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" {...profileForm.register('full_name')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" {...profileForm.register('email')} disabled />
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
          <Card>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  Change password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <Input id="new_password" type="password" {...passwordForm.register('new_password')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input id="confirm_password" type="password" {...passwordForm.register('confirm_password')} />
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
  );
}
