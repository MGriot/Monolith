import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit2, Tag, Briefcase, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Topic, WorkType } from '@/types';

export default function AdminMetadataPage() {
  const queryClient = useQueryClient();
  
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
    queryKey: ['metadata', 'topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data,
  });

  const { data: workTypes, isLoading: typesLoading } = useQuery<WorkType[]>({
    queryKey: ['metadata', 'work-types'],
    queryFn: async () => (await api.get('/metadata/work-types')).data,
  });

  // Mutations
  const createTopicMutation = useMutation({
    mutationFn: (data: Partial<Topic>) => api.post('/metadata/topics', data),
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
    mutationFn: (data: Partial<WorkType>) => api.post('/metadata/work-types', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      setNewTypeName('');
      setNewTypeColor('#64748b');
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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Metadata Management</h1>
        <p className="text-slate-500">Configure global Topics and Work Types for projects and tasks.</p>
      </div>

      <Tabs defaultValue="topics" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="topics" className="gap-2">
            <Tag className="w-4 h-4" />
            Topics
          </TabsTrigger>
          <TabsTrigger value="work-types" className="gap-2">
            <Briefcase className="w-4 h-4" />
            Work Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topics">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1 h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Add New Topic</CardTitle>
                <CardDescription>Create a new category label.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Name</Label>
                  <Input
                    placeholder="e.g. Backend"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-12 h-10 p-1 cursor-pointer"
                      value={newTopicColor}
                      onChange={(e) => setNewTopicColor(e.target.value)}
                    />
                    <Input
                      value={newTopicColor}
                      onChange={(e) => setNewTopicColor(e.target.value)}
                      placeholder="#64748b"
                    />
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => createTopicMutation.mutate({ name: newTopicName, color: newTopicColor })}
                  disabled={!newTopicName || createTopicMutation.isPending}
                >
                  {createTopicMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Topic
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Color</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topicsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : topics?.map((topic) => (
                    <TableRow key={topic.id}>
                      <TableCell>
                        <div
                          className="w-6 h-6 rounded-full border border-slate-200"
                          style={{ backgroundColor: topic.color }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{topic.name}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          topic.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {topic.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTopic(topic)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this topic?')) deleteTopicMutation.mutate(topic.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1 h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Add New Work Type</CardTitle>
                <CardDescription>Define a type of activity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Name</Label>
                  <Input
                    placeholder="e.g. Development"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-12 h-10 p-1 cursor-pointer"
                      value={newTypeColor}
                      onChange={(e) => setNewTypeColor(e.target.value)}
                    />
                    <Input
                      value={newTypeColor}
                      onChange={(e) => setNewTypeColor(e.target.value)}
                      placeholder="#64748b"
                    />
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => createTypeMutation.mutate({ name: newTypeName, color: newTypeColor })}
                  disabled={!newTypeName || createTypeMutation.isPending}
                >
                  {createTypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Work Type
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Color</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typesLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : workTypes?.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell>
                        <div
                          className="w-6 h-6 rounded-full border border-slate-200"
                          style={{ backgroundColor: type.color }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          type.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {type.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingWorkType(type)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this work type?')) deleteTypeMutation.mutate(type.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Topic</DialogTitle>
            <DialogDescription>Modify topic details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTopic} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editingTopic?.name || ''} 
                onChange={(e) => setEditingTopic(prev => prev ? ({...prev, name: e.target.value}) : null)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  className="w-12 h-10 p-1 cursor-pointer"
                  value={editingTopic?.color || '#000000'} 
                  onChange={(e) => setEditingTopic(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
                <Input 
                  value={editingTopic?.color || ''} 
                  onChange={(e) => setEditingTopic(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active Status</Label>
              <Switch 
                checked={editingTopic?.is_active || false} 
                onCheckedChange={(checked) => setEditingTopic(prev => prev ? ({...prev, is_active: checked}) : null)} 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingTopic(null)}>Cancel</Button>
              <Button type="submit" disabled={updateTopicMutation.isPending}>
                {updateTopicMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Work Type Dialog */}
      <Dialog open={!!editingWorkType} onOpenChange={(open) => !open && setEditingWorkType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Work Type</DialogTitle>
            <DialogDescription>Modify work type details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateWorkType} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editingWorkType?.name || ''} 
                onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, name: e.target.value}) : null)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  className="w-12 h-10 p-1 cursor-pointer"
                  value={editingWorkType?.color || '#000000'} 
                  onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
                <Input 
                  value={editingWorkType?.color || ''} 
                  onChange={(e) => setEditingWorkType(prev => prev ? ({...prev, color: e.target.value}) : null)} 
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active Status</Label>
              <Switch 
                checked={editingWorkType?.is_active || false} 
                onCheckedChange={(checked) => setEditingWorkType(prev => prev ? ({...prev, is_active: checked}) : null)} 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingWorkType(null)}>Cancel</Button>
              <Button type="submit" disabled={updateTypeMutation.isPending}>
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
