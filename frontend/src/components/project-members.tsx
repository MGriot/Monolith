import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { isProjectRole, PROJECT_ROLES, ROLE_HINTS, ROLE_LABELS, type ProjectRole } from '@/lib/roles';

interface Member {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: ProjectRole;
  is_owner: boolean;
}

interface UserOption {
  id: string;
  email: string;
  full_name?: string | null;
  is_active?: boolean;
}

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

/** Members of a project with their role. Everybody can look; project admins can add, change and remove. */
export function ProjectMembersCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState<ProjectRole>('editor');

  const members = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => (await api.get<Member[]>(`/projects/${projectId}/members`)).data,
  });
  const users = useQuery({
    queryKey: ['users-for-members'],
    enabled: canManage,
    queryFn: async () => (await api.get<UserOption[]>('/users/', { params: { limit: 500 } })).data,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: ProjectRole }) =>
      api.put(`/projects/${projectId}/members/${userId}`, { role }),
    onSuccess: () => {
      refresh();
      setNewUser('');
      toast.success('Member updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update the member')),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => api.delete(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      refresh();
      toast.success('Member removed');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not remove the member')),
  });

  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const candidates = (users.data ?? []).filter((u) => u.is_active !== false && !memberIds.has(u.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" aria-hidden="true" /> Members and roles
        </CardTitle>
        <CardDescription>
          {canManage
            ? 'Choose what each person may do in this project.'
            : 'Who can see and change this project. Only project admins can edit this list.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the members.
          </p>
        )}
        <ul className="divide-y rounded-lg border" aria-label="Project members">
          {(members.data ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.full_name || m.email}{' '}
                  {m.is_owner && (
                    <Badge variant="secondary" className="ml-1">
                      Owner
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.is_owner || !canManage ? (
                <Badge variant="outline">{ROLE_LABELS[m.role] ?? m.role}</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                    Role of {m.full_name || m.email}
                  </label>
                  <select
                    id={`role-${m.user_id}`}
                    className={selectClass}
                    value={m.role}
                    disabled={setRole.isPending}
                    onChange={(e) => isProjectRole(e.target.value) && setRole.mutate({ userId: m.user_id, role: e.target.value })}
                  >
                    {PROJECT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.full_name || m.email} from the project`}
                    disabled={remove.isPending}
                    onClick={() => confirm(`Remove ${m.full_name || m.email} from this project?`) && remove.mutate(m.user_id)}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newUser) setRole.mutate({ userId: newUser, role: newRole });
            }}
          >
            <Label htmlFor="new-member">Add a member</Label>
            <div className="flex flex-wrap items-center gap-2">
              <select id="new-member" className={`${selectClass} min-w-[14rem]`} value={newUser} onChange={(e) => setNewUser(e.target.value)}>
                <option value="">Choose a person...</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="new-member-role">
                Role for the new member
              </label>
              <select
                id="new-member-role"
                className={selectClass}
                value={newRole}
                onChange={(e) => isProjectRole(e.target.value) && setNewRole(e.target.value)}
              >
                {PROJECT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" className="gap-2" disabled={!newUser || setRole.isPending}>
                <UserPlus className="w-4 h-4" aria-hidden="true" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{ROLE_HINTS[newRole]}</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
