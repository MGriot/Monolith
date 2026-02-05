import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit2, Tag, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Topic, WorkType } from '@/types';

export default function AdminMetadataPage() {
  const queryClient = useQueryClient();
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicColor, setNewTopicColor] = useState('#64748b');
  const [newTypeName, setNewTypeName] = useState('');

  // Queries
  const { data: topics } = useQuery<Topic[]>({
    queryKey: ['metadata', 'topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data,
  });

  const { data: workTypes } = useQuery<WorkType[]>({
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
    }
  });

  const updateTopicMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<Topic> }) => api.put(`/metadata/topics/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] });
      setEditingTopic(null);
      toast.success('Topic updated');
    }
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/metadata/topics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] });
      toast.success('Topic deleted');
    }
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: Partial<WorkType>) => api.post('/metadata/work-types', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      setNewTypeName('');
      toast.success('Work Type created');
    }
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/metadata/work-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] });
      toast.success('Work Type deleted');
    }
  });

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
                  <label className="text-xs font-bold uppercase text-slate-500">Name</label>
                  <Input 
                    placeholder="e.g. Backend" 
                    value={newTopicName} 
                    onChange={(e) => setNewTopicName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">Color</label>
                  <div className="flex gap-2">
                    <Input 
                      type="color" 
                      className="w-12 h-10 p-1" 
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
                  disabled={!newTopicName}
                >
                  <Plus className="w-4 h-4" />
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
                  {topics?.map((topic) => (
                    <TableRow key={topic.id}>
                      <TableCell>
                        <div 
                          className="w-6 h-6 rounded-full border border-slate-200" 
                          style={{ backgroundColor: topic.color }} 
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {editingTopic === topic.id ? (
                          <Input 
                            defaultValue={topic.name} 
                            onBlur={(e) => updateTopicMutation.mutate({ id: topic.id, data: { name: e.target.value } })}
                            autoFocus
                          />
                        ) : (
                          topic.name
                        )}
                      </TableCell>
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTopic(topic.id)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Are you sure?')) deleteTopicMutation.mutate(topic.id);
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
                  <label className="text-xs font-bold uppercase text-slate-500">Name</label>
                  <Input 
                    placeholder="e.g. Feature" 
                    value={newTypeName} 
                    onChange={(e) => setNewTypeName(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full gap-2" 
                  onClick={() => createTypeMutation.mutate({ name: newTypeName })}
                  disabled={!newTypeName}
                >
                  <Plus className="w-4 h-4" />
                  Create Work Type
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workTypes?.map((type) => (
                    <TableRow key={type.id}>
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
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Are you sure?')) deleteTypeMutation.mutate(type.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
