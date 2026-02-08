import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Idea, Task } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Lightbulb, Plus, Trash2, ArrowUpRight, Loader2, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectIdeasProps {
  projectId: string;
  onPromoteSuccess?: (task: Task) => void;
}

export default function ProjectIdeas({ projectId, onPromoteSuccess }: ProjectIdeasProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newIdea, setNewIdea] = useState({ title: '', description: '' });

  const { data: ideas, isLoading } = useQuery({
    queryKey: ['ideas', projectId],
    queryFn: async () => {
      const response = await api.get(`/ideas/?project_id=${projectId}`);
      return response.data as Idea[];
    },
  });

  const createIdeaMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      return api.post('/ideas/', { ...data, project_id: projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
      setIsCreateDialogOpen(false);
      setNewIdea({ title: '', description: '' });
    },
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      return api.delete(`/ideas/${ideaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
    },
  });

  const promoteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await api.post(`/ideas/${ideaId}/promote`);
      return res.data;
    },
    onSuccess: (data: Task) => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      if (onPromoteSuccess) onPromoteSuccess(data);
    },
  });

  const handleCreateIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdea.title.trim()) return;
    createIdeaMutation.mutate(newIdea);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusColor = (status: Idea['status']) => {
    switch (status) {
      case 'Proposed': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Converted': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Project Ideas & Feature Requests
        </h3>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Propose Idea
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ideas?.map((idea) => (
          <Card key={idea.id} className={cn("flex flex-col h-full transition-all hover:shadow-md", idea.status === 'Converted' && "opacity-80 bg-slate-50/50")}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start gap-2 mb-2">
                <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4", getStatusColor(idea.status))}>
                  {idea.status}
                </Badge>
                {idea.status !== 'Converted' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-slate-400 hover:text-rose-600"
                    onClick={() => {
                        if (confirm('Delete this idea?')) deleteIdeaMutation.mutate(idea.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <CardTitle className="text-sm font-bold leading-tight">{idea.title}</CardTitle>
              <CardDescription className="text-xs line-clamp-3 mt-1.5">
                {idea.description || 'No description provided.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center border border-white">
                  <UserIcon className="w-3 h-3" />
                </div>
                <span>Proposed by {idea.author?.full_name || 'Anonymous'}</span>
              </div>
            </CardContent>
            <CardFooter className="pt-0 pb-4 px-4">
              {idea.status === 'Converted' ? (
                <div className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold text-slate-500 bg-slate-100/50 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Promoted to Task
                </div>
              ) : (
                <Button 
                  className="w-full text-xs font-bold gap-2 h-9" 
                  variant="outline"
                  onClick={() => promoteIdeaMutation.mutate(idea.id)}
                  disabled={promoteIdeaMutation.isPending}
                >
                  {promoteIdeaMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Promote to Task
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}

        {ideas?.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Lightbulb className="w-6 h-6 text-slate-300" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No ideas yet</h4>
            <p className="text-xs text-slate-500 mt-1">Have a feature request or a new concept? Propose it here!</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              Propose First Idea
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Propose New Idea</DialogTitle>
            <DialogDescription>
              Share a new concept or feature request for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateIdea} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</Label>
              <Input
                id="title"
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                placeholder="Brief summary of the idea"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</Label>
              <Textarea
                id="description"
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                placeholder="Explain the idea in more detail..."
                rows={4}
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createIdeaMutation.isPending}>
                {createIdeaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Idea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
