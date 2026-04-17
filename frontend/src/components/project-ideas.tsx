import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Idea, Task, Project } from '@/types';
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
import { 
    Lightbulb, 
    Plus, 
    Trash2, 
    ArrowUpRight, 
    Loader2, 
    CheckCircle2, 
    MessageSquare, 
    Edit3,
    Rocket,
    Check,
    ThumbsUp,
    ThumbsDown,
    Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/user-avatar';
import CommentSection from '@/components/comments/comment-section';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ProjectIdeasProps {
  projectId?: string;
  taskId?: string;
  onPromoteSuccess?: (task: Task) => void;
}

export default function ProjectIdeas({ projectId, taskId, onPromoteSuccess }: ProjectIdeasProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState({ title: '', description: '', project_id: projectId || '' });
  const [editIdeaData, setEditIdeaData] = useState<{
    title: string;
    description: string;
    status: Idea['status'];
  }>({ title: '', description: '', status: 'Proposed' });

  const queryKey = ['ideas', projectId || 'all', taskId || 'all'];

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
        const response = await api.get('/projects/');
        return response.data as Project[];
    },
    enabled: !projectId
  });

  const { data: ideas, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let url = '/ideas/';
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      
      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;
      
      const response = await api.get(url);
      return response.data as Idea[];
    },
  });

  const selectedIdea = ideas?.find(i => i.id === selectedIdeaId) || null;

  const createIdeaMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; project_id: string }) => {
      return api.post('/ideas/', { ...data, task_id: taskId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setIsCreateDialogOpen(false);
      setNewIdea({ title: '', description: '', project_id: projectId || '' });
      toast.success("Idea proposed successfully");
    },
  });

  const updateIdeaMutation = useMutation({
    mutationFn: async (data: Partial<Idea>) => {
      if (!selectedIdeaId) return;
      return api.put(`/ideas/${selectedIdeaId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setIsEditDialogOpen(false);
      setSelectedIdeaId(null);
      toast.success("Idea updated");
    },
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      return api.delete(`/ideas/${ideaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      if (selectedIdeaId) {
          setIsDetailDialogOpen(false);
          setSelectedIdeaId(null);
      }
      toast.success("Idea removed");
    },
  });

  const voteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      return api.post(`/ideas/${ideaId}/vote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const downvoteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      return api.post(`/ideas/${ideaId}/downvote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const promoteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await api.post(`/ideas/${ideaId}/promote`);
      return res.data;
    },
    onSuccess: (data: Task) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setIsDetailDialogOpen(false);
      setSelectedIdeaId(null);
      toast.success("Idea promoted to task");
      if (onPromoteSuccess) onPromoteSuccess(data);
    },
  });

  const promoteToProjectMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await api.post(`/ideas/${ideaId}/promote-project`);
      return res.data as Project;
    },
    onSuccess: (data: Project) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsDetailDialogOpen(false);
      setSelectedIdeaId(null);
      toast.success("Idea promoted to project!");
      navigate(`/projects/${data.id}`);
    },
  });

  const handleCreateIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdea.title.trim()) return;
    createIdeaMutation.mutate(newIdea);
  };

  const handleUpdateIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editIdeaData.title.trim()) return;
    updateIdeaMutation.mutate(editIdeaData);
  };

  const openEditDialog = (idea: Idea) => {
      setSelectedIdeaId(idea.id);
      setEditIdeaData({ title: idea.title, description: idea.description || '', status: idea.status });
      setIsEditDialogOpen(true);
  };

  const openDetailDialog = (idea: Idea) => {
      setSelectedIdeaId(idea.id);
      setIsDetailDialogOpen(true);
  };

  const handleVote = (e: React.MouseEvent, ideaId: string) => {
    e.stopPropagation();
    voteIdeaMutation.mutate(ideaId);
  };

  const handleDownvote = (e: React.MouseEvent, ideaId: string) => {
    e.stopPropagation();
    downvoteIdeaMutation.mutate(ideaId);
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
          <Card 
            key={idea.id} 
            className={cn(
                "flex flex-col h-full transition-all hover:shadow-md border-slate-200 group relative", 
                idea.status === 'Converted' && "opacity-80 bg-slate-50/50"
            )}
          >
            {/* Voting Floating Controls */}
            <div className="absolute top-2 right-2 z-10 flex gap-1">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                        "h-8 px-2 rounded-full gap-1.5 transition-all",
                        idea.has_voted ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700" : "text-slate-400 hover:bg-slate-100"
                    )}
                    onClick={(e) => handleVote(e, idea.id)}
                >
                    <ThumbsUp className={cn("w-3.5 h-3.5", idea.has_voted && "fill-current")} />
                    <span className="text-[10px] font-black">{idea.vote_count}</span>
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                        "h-8 px-2 rounded-full gap-1.5 transition-all",
                        idea.has_downvoted ? "bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700" : "text-slate-400 hover:bg-slate-100"
                    )}
                    onClick={(e) => handleDownvote(e, idea.id)}
                >
                    <ThumbsDown className={cn("w-3.5 h-3.5", idea.has_downvoted && "fill-current")} />
                    <span className="text-[10px] font-black">{idea.downvote_count}</span>
                </Button>
            </div>

            <CardHeader className="pb-3 cursor-pointer" onClick={() => openDetailDialog(idea)}>
              <div className="flex justify-between items-start gap-2 mb-2 pr-12">
                <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4", getStatusColor(idea.status))}>
                  {idea.status}
                </Badge>
              </div>
              <CardTitle className="text-sm font-bold leading-tight group-hover:text-primary transition-colors">{idea.title}</CardTitle>
              <CardDescription className="text-xs line-clamp-3 mt-1.5">
                {idea.description || 'No description provided.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-3 cursor-pointer" onClick={() => openDetailDialog(idea)}>
              <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                    <UserAvatar user={idea.author} className="w-5 h-5" />
                    <span className="truncate max-w-[120px]">By {idea.author?.full_name || 'Anonymous'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <MessageSquare className="w-3 h-3" />
                      {idea.comment_count}
                  </div>
              </div>
            </CardContent>
            <CardFooter className="pt-0 pb-4 px-4">
              {idea.status === 'Converted' ? (
                <div className="w-full flex flex-col gap-1">
                    <div className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold text-slate-500 bg-slate-100/50 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Promoted
                    </div>
                    {idea.promoted_project_id && (
                        <Button variant="ghost" size="sm" className="w-full text-[9px] h-6 text-primary font-bold" onClick={() => navigate(`/projects/${idea.promoted_project_id}`)}>
                            View Project <ArrowUpRight className="w-2.5 h-2.5 ml-1" />
                        </Button>
                    )}
                </div>
              ) : (
                <div className="flex w-full gap-2">
                    <Button 
                        className="flex-1 text-[10px] font-black uppercase gap-1.5 h-9" 
                        variant="outline"
                        onClick={(e) => {
                            e.stopPropagation();
                            promoteIdeaMutation.mutate(idea.id);
                        }}
                        disabled={promoteIdeaMutation.isPending}
                    >
                        {promoteIdeaMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Task
                    </Button>
                    <Button 
                        className="flex-1 text-[10px] font-black uppercase gap-1.5 h-9 bg-primary/5 border-primary/20 text-primary hover:bg-primary/10" 
                        variant="outline"
                        onClick={(e) => {
                            e.stopPropagation();
                            promoteToProjectMutation.mutate(idea.id);
                        }}
                        disabled={promoteToProjectMutation.isPending}
                    >
                        {promoteToProjectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                        Project
                    </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        ))}

        {ideas?.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4">
              <Lightbulb className="w-6 h-6 text-amber-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No ideas yet</h4>
            <p className="text-xs text-slate-500 mt-1">Have a feature request or a new concept? Propose it here!</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              Propose First Idea
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Propose New Idea</DialogTitle>
            <DialogDescription>
              Share a new concept or feature request.
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
            
            {!projectId && (
                <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Project</Label>
                    <select 
                        className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        value={newIdea.project_id}
                        onChange={(e) => setNewIdea({ ...newIdea, project_id: e.target.value })}
                        required
                    >
                        <option value="">Select a project...</option>
                        {projects?.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            )}

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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Idea</DialogTitle>
            <DialogDescription>Modify the idea details or status.</DialogDescription>
          </DialogHeader>
          {selectedIdea && (
              <form onSubmit={handleUpdateIdea} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</Label>
                  <Input
                    value={editIdeaData.title}
                    onChange={(e) => setEditIdeaData({ ...editIdeaData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</Label>
                  <Textarea
                    value={editIdeaData.description}
                    onChange={(e) => setEditIdeaData({ ...editIdeaData, description: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</Label>
                  <div className="flex flex-wrap gap-2">
                      {(['Proposed', 'Approved', 'Rejected'] as const).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant={editIdeaData.status === s ? 'default' : 'outline'}
                            size="sm"
                            className="text-[10px] h-7 px-3 font-bold"
                            onClick={() => setEditIdeaData({ ...editIdeaData, status: s })}
                          >
                              {s}
                          </Button>
                      ))}
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateIdeaMutation.isPending}>
                    {updateIdeaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail & Comments Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col p-0">
          {selectedIdea && (
              <>
                <DialogHeader className="p-6 pb-2">
                    <div className="flex justify-between items-start pr-6">
                        <div className="flex gap-2 mb-2">
                            <Badge className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4", getStatusColor(selectedIdea.status))}>
                                {selectedIdea.status}
                            </Badge>
                            <div className="flex bg-slate-100/50 rounded-full p-0.5">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={cn(
                                        "h-6 px-2 rounded-full text-[10px] font-black uppercase gap-1",
                                        selectedIdea.has_voted ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"
                                    )}
                                    onClick={(e) => handleVote(e, selectedIdea.id)}
                                >
                                    <ThumbsUp className={cn("w-3 h-3", selectedIdea.has_voted && "fill-current")} />
                                    {selectedIdea.vote_count}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={cn(
                                        "h-6 px-2 rounded-full text-[10px] font-black uppercase gap-1",
                                        selectedIdea.has_downvoted ? "bg-white text-rose-600 shadow-sm" : "text-slate-400"
                                    )}
                                    onClick={(e) => handleDownvote(e, selectedIdea.id)}
                                >
                                    <ThumbsDown className={cn("w-3 h-3", selectedIdea.has_downvoted && "fill-current")} />
                                    {selectedIdea.downvote_count}
                                </Button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {selectedIdea.status !== 'Converted' && (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-slate-400 hover:text-primary"
                                    onClick={() => openEditDialog(selectedIdea)}
                                >
                                    <Edit3 className="w-4 h-4" />
                                </Button>
                            )}
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-rose-600"
                                onClick={() => {
                                    if (confirm('Permanently delete this idea?')) deleteIdeaMutation.mutate(selectedIdea.id);
                                }}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <DialogTitle className="text-xl font-bold">{selectedIdea.title}</DialogTitle>
                    <div className="flex items-center gap-2 mt-2">
                        <UserAvatar user={selectedIdea.author} className="w-5 h-5" />
                        <DialogDescription className="text-xs text-slate-500">
                            Proposed by <span className="font-bold text-slate-700">{selectedIdea.author?.full_name || 'Anonymous'}</span> on {new Date(selectedIdea.created_at).toLocaleDateString()}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {selectedIdea.description || 'No description provided.'}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Idea Activity & Discussions
                        </h4>

                        <CommentSection ideaId={selectedIdea.id} />
                    </div>
                </div>

                <DialogFooter className="p-4 border-t bg-white flex flex-row justify-between items-center sm:justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setIsDetailDialogOpen(false)}>Close</Button>
                    {selectedIdea.status !== 'Converted' && (
                        <div className="flex gap-2">
                            <div className="flex gap-1 mr-2 border-r pr-2">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-50 gap-1.5"
                                    onClick={() => updateIdeaMutation.mutate({ status: 'Approved' })}
                                    disabled={updateIdeaMutation.isPending}
                                >
                                    <Check className="w-3 h-3" /> Approve
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 gap-1.5"
                                    onClick={() => updateIdeaMutation.mutate({ status: 'Rejected' })}
                                    disabled={updateIdeaMutation.isPending}
                                >
                                    <Ban className="w-3 h-3" /> Reject
                                </Button>
                            </div>

                            <Button 
                                variant="outline"
                                size="sm" 
                                className="h-8 gap-2 text-[10px] font-black uppercase px-4 border-slate-200"
                                onClick={() => promoteIdeaMutation.mutate(selectedIdea.id)}
                                disabled={promoteIdeaMutation.isPending}
                            >
                                {promoteIdeaMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                As Task
                            </Button>
                            <Button 
                                size="sm" 
                                className="h-8 gap-2 text-[10px] font-black uppercase px-4 shadow-md shadow-primary/10"
                                onClick={() => promoteToProjectMutation.mutate(selectedIdea.id)}
                                disabled={promoteToProjectMutation.isPending}
                            >
                                {promoteToProjectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                                Launch Project
                            </Button>
                        </div>
                    )}
                </DialogFooter>
              </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
