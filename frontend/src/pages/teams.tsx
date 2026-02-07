import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Edit2, Users, Loader2, Mail, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import type { User } from '@/types';

interface Team {
  id: string;
  name: string;
  description?: string;
  members: User[];
  created_at: string;
}

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => (await api.get('/teams/')).data as Team[],
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users/')).data as User[],
  });

  const createMutation = useMutation({
    mutationFn: (newTeam: any) => api.post('/teams/', newTeam),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Team created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => api.put(`/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setEditingTeam(null);
      setIsDialogOpen(false);
      resetForm();
      toast.success('Team updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team deleted');
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setSelectedMemberIds([]);
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    setName(team.name);
    setDescription(team.description || '');
    setSelectedMemberIds(team.members.map(m => m.id));
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name) {
      toast.error('Name is required');
      return;
    }

    const teamData = { 
      name, 
      description, 
      member_ids: selectedMemberIds 
    };

    if (editingTeam) {
      updateMutation.mutate({ id: editingTeam.id, data: teamData });
    } else {
      createMutation.mutate(teamData);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Teams</h1>
          <p className="text-slate-500 mt-1">Define organizational units and group members.</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingTeam(null); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Create Team
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams?.map((team) => (
            <Card key={team.id} className="group hover:border-primary/30 transition-all border-slate-200 shadow-sm flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 p-0 text-slate-500 hover:text-primary" onClick={() => handleEdit(team)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 p-0 text-slate-500 hover:text-destructive" onClick={() => { if(confirm('Delete team?')) deleteMutation.mutate(team.id)}}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">{team.name}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[40px]">{team.description || 'No description provided.'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Team Members ({team.members.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {team.members.slice(0, 6).map((member) => (
                      <div 
                        key={member.id} 
                        className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm"
                        title={member.full_name || member.email}
                      >
                        {member.full_name ? member.full_name.charAt(0) : member.email.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {team.members.length > 6 && (
                      <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 border-dashed flex items-center justify-center text-[10px] font-bold text-slate-400">
                        +{team.members.length - 6}
                      </div>
                    )}
                    {team.members.length === 0 && (
                      <p className="text-xs text-slate-400 italic">Empty team</p>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-slate-50/50 p-3 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-medium italic">Created {new Date(team.created_at).toLocaleDateString()}</span>
                <Users className="w-3 h-3 text-slate-300" />
              </CardFooter>
            </Card>
          ))}
          
          {teams?.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl border-slate-200">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No teams defined yet.</p>
              <Button variant="link" onClick={() => setIsDialogOpen(true)}>Create your first team</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'Edit Team' : 'Create Team'}</DialogTitle>
            <DialogDescription>
              Define the team identity and assign members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Team Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend Engineering" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this team do?" />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Members</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 border rounded-xl bg-slate-50/50">
                {users?.map((u) => {
                  const isSelected = selectedMemberIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left group",
                        isSelected 
                          ? "bg-white border-primary shadow-sm ring-1 ring-primary/10" 
                          : "bg-slate-100/50 border-transparent hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0",
                        isSelected ? "bg-primary text-white" : "bg-white text-slate-400 border border-slate-200"
                      )}>
                        {isSelected ? <Check className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={cn("text-xs font-bold truncate", isSelected ? "text-slate-900" : "text-slate-600")}>
                          {u.full_name || 'No Name'}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate font-medium">
                          <Mail className="w-2.5 h-2.5" />
                          {u.email}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
              {editingTeam ? 'Update Team' : 'Create Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
