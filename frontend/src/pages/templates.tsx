import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Edit2, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectTemplate } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
        // Fallback if indentation is weird (e.g. level 2 without level 1)
        // Just add to root to avoid losing data
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasksText, setTasksText] = useState(''); // One task per line for simplicity

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates/')).data as ProjectTemplate[],
  });

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
  };

  const handleEdit = (template: ProjectTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || '');
    setTasksText(serializeTasks(template.tasks_json));
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name) {
      toast.error('Name is required');
      return;
    }

    const tasks_json = parseTasks(tasksText);

    const templateData = { name, description, tasks_json };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: templateData });
    } else {
      createMutation.mutate(templateData);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Project Templates</h1>
          <p className="text-slate-500 mt-1">Manage reusable project structures and task lists.</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingTemplate(null); setIsCreateDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((template) => (
            <Card key={template.id} className="group hover:border-primary/30 transition-all border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">{template.name}</CardTitle>
                  <Copy className="w-4 h-4 text-slate-300 group-hover:text-primary/50" />
                </div>
                <CardDescription className="line-clamp-2">{template.description || 'No description provided.'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Predefined Tasks ({template.tasks_json.length})</p>
                  <div className="space-y-1">
                    {template.tasks_json.slice(0, 5).map((task: any, idx: number) => (
                      <div key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        {task.title}
                      </div>
                    ))}
                    {template.tasks_json.length > 5 && (
                      <p className="text-[10px] text-slate-400 italic">+ {template.tasks_json.length - 5} more tasks</p>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-slate-50/50 flex justify-end gap-2 p-3">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-primary" onClick={() => handleEdit(template)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-destructive" onClick={() => deleteMutation.mutate(template.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
          
          {templates?.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl border-slate-200">
              <p className="text-slate-500 font-medium">No templates found.</p>
              <Button variant="link" onClick={() => setIsCreateDialogOpen(true)}>Create your first template</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Project Template'}</DialogTitle>
            <DialogDescription>
              Define a name, description, and the list of tasks to be created with this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Feature Release" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this template for?" />
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