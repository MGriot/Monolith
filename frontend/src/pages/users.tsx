import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { User as UserIcon, Mail, ShieldCheck, Shield } from 'lucide-react';

interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

export default function UsersPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data as User[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[300px]">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">ID</TableHead>
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
                <TableCell className="text-right font-mono text-[10px] text-slate-400">
                  {user.id}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
