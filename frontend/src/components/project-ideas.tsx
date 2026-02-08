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
import { 
    Lightbulb, 
    Plus, 
    Trash2, 
    ArrowUpRight, 
    Loader2, 
    User as UserIcon, 
    CheckCircle2, 
    MessageSquare, 
    Send,
    Edit3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectIdeasProps {
  projectId: string;
  onPromoteSuccess?: (task: Task) => void;
}

export default function ProjectIdeas({ projectId, onPromoteSuccess }: ProjectIdeasProps) {
  const queryClient = useQueryClient();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState({ title: '', description: '' });
  const [editIdeaData, setEditIdeaData] = useState<{
    title: string;
    description: string;
    status: Idea['status'];
  }>({ title: '', description: '', status: 'Proposed' });
  const [newComment, setNewComment] = useState('');

  const { data: ideas, isLoading } = useQuery({
    queryKey: ['ideas', projectId],
    queryFn: async () => {
      const response = await api.get(`/ideas/?project_id=${projectId}`);
      return response.data as Idea[];
    },
  });

  const selectedIdea = ideas?.find(i => i.id === selectedIdeaId) || null;

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

  const updateIdeaMutation = useMutation({
    mutationFn: async (data: Partial<Idea>) => {
      if (!selectedIdeaId) return;
      return api.put(`/ideas/${selectedIdeaId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
      setIsEditDialogOpen(false);
      setSelectedIdeaId(null);
    },
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      return api.delete(`/ideas/${ideaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
      if (selectedIdeaId) {
          setIsDetailDialogOpen(false);
          setSelectedIdeaId(null);
      }
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
      setIsDetailDialogOpen(false);
      setSelectedIdeaId(null);
      if (onPromoteSuccess) onPromoteSuccess(data);
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedIdeaId) return;
      return api.post(`/ideas/${selectedIdeaId}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', projectId] });
      setNewComment('');
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

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    createCommentMutation.mutate(newComment);
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
                "flex flex-col h-full transition-all hover:shadow-md border-slate-200", 
                idea.status === 'Converted' && "opacity-80 bg-slate-50/50"
            )}
          >
            <CardHeader className="pb-3 cursor-pointer" onClick={() => openDetailDialog(idea)}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4", getStatusColor(idea.status))}>
                  {idea.status}
                </Badge>
                <div className="flex gap-1">
                    {idea.status !== 'Converted' && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-400 hover:text-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(idea);
                            }}
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
              </div>
              <CardTitle className="text-sm font-bold leading-tight hover:text-primary transition-colors">{idea.title}</CardTitle>
              <CardDescription className="text-xs line-clamp-3 mt-1.5">
                {idea.description || 'No description provided.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-3 cursor-pointer" onClick={() => openDetailDialog(idea)}>
              <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center border border-white">
                      <UserIcon className="w-3 h-3" />
                    </div>
                    <span>By {idea.author?.full_name || 'Anonymous'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <MessageSquare className="w-3 h-3" />
                      {idea.comments?.length || 0}
                  </div>
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
                  className="w-full text-xs font-bold gap-2 h-9 shadow-sm" 
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
                        <Badge className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4 mb-2", getStatusColor(selectedIdea.status))}>
                            {selectedIdea.status}
                        </Badge>
                        <div className="flex gap-2">
                            {selectedIdea.status !== 'Converted' && (
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
                            )}
                        </div>
                    </div>
                    <DialogTitle className="text-xl font-bold">{selectedIdea.title}</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        Proposed by {selectedIdea.author?.full_name || 'Anonymous'} on {new Date(selectedIdea.created_at).toLocaleDateString()}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {selectedIdea.description || 'No description provided.'}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Activity Log & Comments ({selectedIdea.comments?.length || 0})
                        </h4>

                        <div className="space-y-4">
                            {selectedIdea.comments?.map((comment) => (
                                <div key={comment.id} className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                        <UserIcon className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-900">{comment.author?.full_name}</span>
                                            <span className="text-[10px] text-slate-400">{new Date(comment.created_at).toLocaleString()}</span>
                                        </div>
                                        <div className="bg-white border border-slate-100 p-3 rounded-lg rounded-tl-none shadow-sm">
                                            <p className="text-xs text-slate-600 leading-normal">{comment.content}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {selectedIdea.comments?.length === 0 && (
                                <p className="text-center py-8 text-xs text-slate-400 italic bg-slate-50/50 rounded-lg border border-dashed">
                                    No comments yet. Start the conversation!
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50/50">
                    <form onSubmit={handleAddComment} className="flex gap-2">
                        <Input 
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment or log update..."
                            className="bg-white text-xs h-10"
                        />
                        <Button 
                            type="submit" 
                            size="icon" 
                            disabled={!newComment.trim() || createCommentMutation.isPending}
                            className="shrink-0 h-10 w-10 shadow-sm"
                        >
                            {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </form>
                </div>

                <DialogFooter className="p-4 border-t bg-white flex flex-row justify-between items-center sm:justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setIsDetailDialogOpen(false)}>Close</Button>
                    {selectedIdea.status !== 'Converted' && (
                        <Button 
                            size="sm" 
                            className="gap-2 font-bold px-6 shadow-md shadow-primary/10"
                            onClick={() => promoteIdeaMutation.mutate(selectedIdea.id)}
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
                </DialogFooter>
              </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}