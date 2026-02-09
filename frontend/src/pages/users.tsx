import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { Navigate } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { 
  User as UserIcon, 
  Mail, 
  ShieldCheck, 
  Shield, 
  Key, 
  ShieldAlert,
  Loader2,
  Archive
} from 'lucide-react';
import { toast } from 'sonner';
import ResourceTimeline from '@/components/resource-timeline';

interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data as User[];
    },
  });

  const { data: calendarData } = useQuery({
    queryKey: ['calendar-events', 'admin-all'],
    queryFn: async () => {
      const response = await api.get('/calendar/');
      return response.data;
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => {
      const newPassword = prompt("Enter new password for this user:");
      if (!newPassword) throw new Error("Cancelled");
      return api.put(`/users/${userId}`, { password: newPassword });
    },
    onSuccess: () => toast.success("Password updated"),
    onError: (err: any) => err.message !== "Cancelled" && toast.error("Failed to update password")
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ userId, is_superuser }: { userId: string, is_superuser: boolean }) => 
      api.put(`/users/${userId}`, { is_superuser }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success("User role updated");
    }
  });

  const autoArchiveMutation = useMutation({
    mutationFn: () => api.post('/projects/auto-archive?days_threshold=7'),
    onSuccess: (res) => {
        const count = res.data.length;
        toast.success(`Auto-archive complete. Archived ${count} projects.`);
    },
    onError: () => toast.error("Failed to run auto-archive")
  });

  if (!currentUser?.is_superuser) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users & Team</h1>
          <p className="text-slate-500">Manage your team members and their roles.</p>
        </div>
        <Button 
            variant="outline" 
            onClick={() => {
                if (confirm("Run auto-archive? This will archive all DONE projects older than 7 days.")) {
                    autoArchiveMutation.mutate();
                }
            }}
            disabled={autoArchiveMutation.isPending}
            className="gap-2"
        >
            {autoArchiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Run Auto-Archive
        </Button>
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="w-[300px]">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => (
                <TableRow key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 shrink-0">
                        <UserIcon className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-slate-900 truncate">{user.full_name || 'No Name'}</span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_superuser ? (
                      <Badge variant="default" className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">
                        <ShieldCheck className="w-3 h-3" /> Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-600 border-none">
                        <Shield className="w-3 h-3" /> Member
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        Inactive
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => resetPasswordMutation.mutate(user.id)}
                      >
                        <Key className="w-3 h-3" /> Reset
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => toggleAdminMutation.mutate({ 
                          userId: user.id, 
                          is_superuser: !user.is_superuser 
                        })}
                      >
                        <ShieldAlert className="w-3 h-3" /> 
                        {user.is_superuser ? "Demote" : "Make Admin"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              Organizational Capacity (Super View)
            </h3>
            <p className="text-[10px] text-slate-500 uppercase font-black mt-1">Cross-project resource allocation</p>
          </div>
          <div className="flex-1 min-h-[500px]">
            <ResourceTimeline 
                tasks={(calendarData?.items || []).filter((i: any) => i.item_type !== 'project').map((i: any) => ({
                    ...i,
                    project: { name: i.project_name }
                }))} 
                users={users as any}
                title="Global Capacity Planning"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
