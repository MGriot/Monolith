import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Edit2, Copy, Loader2, Globe, Lock, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectTemplate, Topic, WorkType } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichDropdown } from '@/components/ui/rich-dropdown';
import { Switch } from '@/components/ui/switch';
import { AssigneeSelector } from '@/components/assignee-selector';
import { useAuth } from '@/components/auth-provider';
import { useTitle } from '@/components/layout';

// Helper to parse indented text into hierarchical tasks
const parseTasks = (text: string) => {
  const lines = text.split('\n');
  const root: any[] = [];
  const stack: { level: number; item: any }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Calculate indentation (assume 2 spaces = 1 level)
    const match = line.match(/^(\s*)/);
    const spaces = match ? match[1].length : 0;
    const level = Math.floor(spaces / 2);

    const task = {
      title: line.trim(),
      status: 'Todo',
      priority: 'Medium',
      subtasks: []
    };

    if (level === 0) {
      root.push(task);
      stack.length = 0; // Reset stack for new root
      stack.push({ level, item: task });
    } else {
      // Find valid parent in stack
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        const parent = stack[stack.length - 1].item;
        parent.subtasks.push(task);
        stack.push({ level, item: task });
      } else {
        root.push(task);
        stack.push({ level, item: task });
      }
    }
  }
  return root;
};

// Helper to serialize hierarchical tasks back to text
const serializeTasks = (tasks: any[], level = 0): string => {
  let output = '';
  const indent = '  '.repeat(level);
  for (const task of tasks) {
    output += `${indent}${task.title}\n`;
    if (task.subtasks && task.subtasks.length > 0) {
      output += serializeTasks(task.subtasks, level + 1);
    }
  }
  return output;
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | null>(null);
  const { setActions } = useTitle();
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasksText, setTasksText] = useState('');
  const [allowedTopics, setAllowedTopics] = useState<string[]>([]);
  const [allowedWorkTypes, setAllowedWorkTypes] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [sharedWithIds, setSharedWithIds] = useState<string[]>([]);

  useEffect(() => {
    setActions(
      <Button size="sm" onClick={() => { resetForm(); setIsCreateDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20 h-9">
        <Plus className="w-4 h-4" /> Create Template
      </Button>
    );
    return () => setActions(null);
  }, [setActions]);

  // Queries
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates/')).data as ProjectTemplate[],
  });

  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data as Topic[],
  });

  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: async () => (await api.get('/metadata/work-types')).data as WorkType[],
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newTemplate: any) => api.post('/templates/', newTemplate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Template created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => api.put(`/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setEditingTemplate(null);
      resetForm();
      toast.success('Template updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTasksText('');
    setAllowedTopics([]);
    setAllowedWorkTypes([]);
    setIsPublic(false);
    setSharedWithIds([]);
  };

  const handleEdit = (template: ProjectTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || '');
    setTasksText(serializeTasks(template.tasks_json));
    setAllowedTopics(template.allowed_global_topics || []);
    setAllowedWorkTypes(template.allowed_global_work_types || []);
    setIsPublic(template.is_public || false);
    setSharedWithIds(template.shared_with?.map(u => u.id) || []);
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name) {
      toast.error('Name is required');
      return;
    }

    const tasks_json = parseTasks(tasksText);

    const templateData = { 
      name, 
      description, 
      tasks_json,
      allowed_global_topics: allowedTopics,
      allowed_global_work_types: allowedWorkTypes,
      is_public: isPublic,
      shared_with_ids: sharedWithIds
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: templateData });
    } else {
      createMutation.mutate(templateData);
    }
  };

  const topicItems = useMemo(() => topics?.map(t => ({ id: t.id, label: t.name, color: t.color })) || [], [topics]);
  const workTypeItems = useMemo(() => workTypes?.map(w => ({ id: w.id, label: w.name, color: w.color })) || [], [workTypes]);

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
      <div className="flex-1 overflow-auto p-6 space-y-8 pb-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates?.map((template) => {
              const isOwner = user?.id === template.owner_id;
              const canEdit = isOwner || user?.is_superuser;
              
              return (
                <Card key={template.id} className="group hover:border-primary/30 transition-all border-slate-200 shadow-sm relative flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                          <CardTitle className="text-lg group-hover:text-primary transition-colors flex items-center gap-2">
                              {template.name}
                              {template.is_public ? (
                                  <span title="Public"><Globe className="w-3 h-3 text-blue-500" /></span>
                              ) : (
                                  <span title="Private"><Lock className="w-3 h-3 text-slate-400" /></span>
                              )}
                          </CardTitle>
                          <CardDescription className="line-clamp-2 min-h-[40px]">{template.description || 'No description provided.'}</CardDescription>
                      </div>
                      <Copy className="w-4 h-4 text-slate-300 group-hover:text-primary/50 shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Predefined Tasks ({template.tasks_json.length})</p>
                      <div className="space-y-1">
                        {template.tasks_json.slice(0, 5).map((task: any, idx: number) => (
                          <div key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="truncate">{task.title}</span>
                          </div>
                        ))}
                        {template.tasks_json.length > 5 && (
                          <p className="text-[10px] text-slate-400 italic">+ {template.tasks_json.length - 5} more tasks</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t bg-slate-50/50 flex justify-between items-center p-3">
                    <div className="flex -space-x-2 overflow-hidden">
                      {template.shared_with?.slice(0, 3).map((u) => (
                          <div key={u.id} className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-bold" title={`Shared with ${u.full_name}`}>
                              {u.full_name?.charAt(0) || 'U'}
                          </div>
                      ))}
                      {template.shared_with && template.shared_with.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">
                              +{template.shared_with.length - 3}
                          </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {canEdit && (
                          <>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-primary" onClick={() => handleEdit(template)}>
                                  <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-destructive" onClick={() => {
                                  if (confirm('Delete this template?')) deleteMutation.mutate(template.id);
                              }}>
                                  <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                          </>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
            
            {templates?.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl border-slate-200 bg-white">
                <p className="text-slate-500 font-medium">No templates found.</p>
                <Button variant="link" onClick={() => setIsCreateDialogOpen(true)}>Create your first template</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Project Template'}</DialogTitle>
            <DialogDescription>
              Define structure, whitelist, and visibility.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4 border-b pb-6">
                <div className="space-y-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Feature Release" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this template for?" rows={2} />
                </div>
            </div>

            <div className="space-y-4 border-b pb-6 bg-slate-50 p-4 rounded-lg border">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> Sharing & Access
                </h4>
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-sm">Make Public</Label>
                        <p className="text-[10px] text-muted-foreground">Visible to all users, but only you can edit.</p>
                    </div>
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>
                <div className="space-y-2">
                    <Label className="text-sm">Share Property (Co-Owners)</Label>
                    <AssigneeSelector
                        selectedValues={sharedWithIds}
                        onSelect={(id) => setSharedWithIds([...sharedWithIds, id])}
                        onRemove={(id) => setSharedWithIds(sharedWithIds.filter(uid => uid !== id))}
                        placeholder="Select users to share with..."
                    />
                    <p className="text-[10px] text-muted-foreground">Shared users can also modify this template.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-b pb-6">
                <div className="space-y-2">
                    <Label>Allowed Topics (Whitelist)</Label>
                    <RichDropdown
                        items={topicItems}
                        selectedValues={allowedTopics}
                        onSelect={(id) => setAllowedTopics([...allowedTopics, id])}
                        onRemove={(id) => setAllowedTopics(allowedTopics.filter(tid => tid !== id))}
                        multi
                        placeholder="Select allowed topics..."
                        emptyText="No topics found"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Allowed Work Types (Whitelist)</Label>
                    <RichDropdown
                        items={workTypeItems}
                        selectedValues={allowedWorkTypes}
                        onSelect={(id) => setAllowedWorkTypes([...allowedWorkTypes, id])}
                        onRemove={(id) => setAllowedWorkTypes(allowedWorkTypes.filter(tid => tid !== id))}
                        multi
                        placeholder="Select allowed types..."
                        emptyText="No work types found"
                    />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tasks">Tasks (use indentation for subtasks)</Label>
              <Textarea 
                id="tasks" 
                value={tasksText} 
                onChange={(e) => setTasksText(e.target.value)} 
                placeholder="Phase 1&#10;  Task 1.1&#10;  Task 1.2&#10;Phase 2&#10;  Task 2.1"
                className="min-h-[150px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
              {editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
