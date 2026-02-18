import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Tag, Briefcase, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { Topic, WorkType } from '@/types';

interface ScopedTaxonomyManagerProps {
  projectId?: string;
  taskId?: string;
  title?: string;
  description?: string;
}

export default function ScopedTaxonomyManager({ projectId, taskId, title, description }: ScopedTaxonomyManagerProps) {
  const queryClient = useQueryClient();
  const scope = projectId ? { project_id: projectId } : taskId ? { task_id: taskId } : {};
  
  // State
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editingWorkType, setEditingWorkType] = useState<WorkType | null>(null);
  
  // Create Form State
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicColor, setNewTopicColor] = useState('#64748b');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#64748b');

  // Queries
  const { data: topics, isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ['metadata', 'topics', projectId, taskId],
    queryFn: async () => {
        const params = projectId ? { project_id: projectId } : taskId ? { task_id: taskId } : {};
        return (await api.get('/metadata/topics', { params })).data;
    }
  });

  const { data: workTypes, isLoading: typesLoading } = useQuery<WorkType[]>({
    queryKey: ['metadata', 'work-types', projectId, taskId],
    queryFn: async () => {
        const params = projectId ? { project_id: projectId } : taskId ? { task_id: taskId } : {};
        return (await api.get('/metadata/work-types', { params })).data;
    }
  });

  // Mutations
  const createTopicMutation = useMutation({
    mutationFn: (data: Partial<Topic>) => api.post('/metadata/topics', { ...data, ...scope }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] });
      setNewTopicName('');
      toast.success('Topic created');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create topic')
  });

  const updateTopicMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<Topic> }) => api.put(`/metadata/topics/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] });
      setEditingTopic(null);
      toast.success('Topic updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update topic')
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/metadata/topics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] });
      toast.success('Topic deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete topic')
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: Partial<WorkType>) => api.post('/metadata/work-types', { ...data, ...scope }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      setNewTypeName('');
      toast.success('Work Type created');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create work type')
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<WorkType> }) => api.put(`/metadata/work-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      setEditingWorkType(null);
      toast.success('Work Type updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update work type')
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/metadata/work-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      toast.success('Work Type deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete work type')
  });

  const handleUpdateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTopic) return;
    updateTopicMutation.mutate({ 
      id: editingTopic.id, 
      data: { 
        name: editingTopic.name, 
        color: editingTopic.color,
        is_active: editingTopic.is_active 
      } 
    });
  };

  const handleUpdateWorkType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkType) return;
    updateTypeMutation.mutate({ 
      id: editingWorkType.id, 
      data: { 
        name: editingWorkType.name, 
        color: editingWorkType.color,
        is_active: editingWorkType.is_active 
      } 
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
            <h2 className="text-xl font-bold text-slate-900">{title || "Project Taxonomy"}</h2>
            <p className="text-sm text-slate-500">{description || "Manage project-specific categories and activity types."}</p>
        </div>
        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg border border-blue-100 max-w-xs flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-tight">Project-scoped labels are only visible within this project and won't clutter the global list.</p>
        </div>
      </div>

      <Tabs defaultValue="topics" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="topics" className="gap-2">
            <Tag className="w-4 h-4" />
            Project Topics
          </TabsTrigger>
          <TabsTrigger value="work-types" className="gap-2">
            <Briefcase className="w-4 h-4" />
            Project Work Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topics">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-bold">Add Scoped Topic</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Name</Label>
                  <Input
                    placeholder="e.g. Phase 1"
                    className="h-8 text-xs"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-10 h-8 p-1 cursor-pointer"
                      value={newTopicColor}
                      onChange={(e) => setNewTopicColor(e.target.value)}
                    />
                    <Input
                      className="h-8 text-xs font-mono"
                      value={newTopicColor}
                      onChange={(e) => setNewTopicColor(e.target.value)}
                      placeholder="#64748b"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2 text-xs font-bold"
                  onClick={() => createTopicMutation.mutate({ name: newTopicName, color: newTopicColor })}
                  disabled={!newTopicName || createTopicMutation.isPending}
                >
                  {createTopicMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add to Project
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Name</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topicsLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : topics?.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-xs text-slate-400 italic">
                            No project-specific topics defined yet.
                        </TableCell>
                    </TableRow>
                  ) : topics?.map((topic) => (
                    <TableRow key={topic.id}>
                      <TableCell>
                        <div
                          className="w-4 h-4 rounded-full border border-slate-200"
                          style={{ backgroundColor: topic.color }}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-bold">{topic.name}</TableCell>
                      <TableCell className="text-right p-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTopic(topic)}>
                            <Edit2 className="w-3 h-3 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() => {
                              if (window.confirm('Delete this scoped topic?')) deleteTopicMutation.mutate(topic.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="work-types">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-bold">Add Scoped Work Type</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Name</Label>
                  <Input
                    placeholder="e.g. Lab Testing"
                    className="h-8 text-xs"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-10 h-8 p-1 cursor-pointer"
                      value={newTypeColor}
                      onChange={(e) => setNewTypeColor(e.target.value)}
                    />
                    <Input
                      className="h-8 text-xs font-mono"
                      value={newTypeColor}
                      onChange={(e) => setNewTypeColor(e.target.value)}
                      placeholder="#64748b"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2 text-xs font-bold"
                  onClick={() => createTypeMutation.mutate({ name: newTypeName, color: newTypeColor })}
                  disabled={!newTypeName || createTypeMutation.isPending}
                >
                  {createTypeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add to Project
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Name</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typesLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : workTypes?.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-xs text-slate-400 italic">
                            No project-specific work types defined yet.
                        </TableCell>
                    </TableRow>
                  ) : workTypes?.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell>
                        <div
                          className="w-4 h-4 rounded-full border border-slate-200"
                          style={{ backgroundColor: type.color }}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-bold">{type.name}</TableCell>
                      <TableCell className="text-right p-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingWorkType(type)}>
                            <Edit2 className="w-3 h-3 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() => {
                              if (window.confirm('Delete this scoped work type?')) deleteTypeMutation.mutate(type.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Topic Dialog */}
      <Dialog open={!!editingTopic} onOpenChange={(open) => !open && setEditingTopic(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Edit Scoped Topic</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateTopic} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Name</Label>
              <Input 
                className="h-8 text-xs"
                value={editingTopic?.name || ''} 
                onChange={(e) => setEditingTopic(prev => prev ? ({...prev, name: e.target.value}) : null)} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Color</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  className="w-10 h-8 p-1 cursor-pointer"
                  value={editingTopic?.color || '#000000'} 
                  onChange={(e) => setEditingTopic(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
                <Input 
                  className="h-8 text-xs font-mono"
                  value={editingTopic?.color || ''} 
                  onChange={(e) => setEditingTopic(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setEditingTopic(null)}>Cancel</Button>
              <Button type="submit" size="sm" className="text-xs font-bold" disabled={updateTopicMutation.isPending}>
                {updateTopicMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Work Type Dialog */}
      <Dialog open={!!editingWorkType} onOpenChange={(open) => !open && setEditingWorkType(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Edit Scoped Work Type</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateWorkType} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Name</Label>
              <Input 
                className="h-8 text-xs"
                value={editingWorkType?.name || ''} 
                onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, name: e.target.value}) : null)} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-slate-400">Color</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  className="w-10 h-8 p-1 cursor-pointer"
                  value={editingWorkType?.color || '#000000'} 
                  onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
                <Input 
                  className="h-8 text-xs font-mono"
                  value={editingWorkType?.color || ''} 
                  onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setEditingWorkType(null)}>Cancel</Button>
              <Button type="submit" size="sm" className="text-xs font-bold" disabled={updateTypeMutation.isPending}>
                {updateTypeMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
