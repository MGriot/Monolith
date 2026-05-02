import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import TaskForm, { type TaskFormValues } from '@/components/task-form';
import type { Project } from '@/types';
import { toast } from 'sonner';

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TaskCreateDialog({ open, onOpenChange }: TaskCreateDialogProps) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projects, isLoading: isProjectsLoading } = useQuery({
    queryKey: ['projects-minimal'],
    queryFn: async () => {
      const response = await api.get('/projects/');
      return response.data as Project[];
    },
    enabled: open
  });

  const createTaskMutation = useMutation({
    mutationFn: async (newTask: TaskFormValues) => {
      const formatDate = (d?: string | null) => (d && d.trim()) ? new Date(d).toISOString() : null;
      
      const formattedTask = {
        ...newTask,
        project_id: selectedProjectId === "none" ? null : selectedProjectId,
        start_date: formatDate(newTask.start_date),
        due_date: formatDate(newTask.due_date),
        deadline_at: formatDate(newTask.deadline_at),
        completed_at: formatDate(newTask.completed_at),
      };
      
      return api.post('/tasks/', formattedTask);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onOpenChange(false);
      setSelectedProjectId("");
      toast.success("Task created successfully");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Failed to create task: ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[95vh] overflow-y-auto p-0 border-none shadow-2xl bg-white rounded-2xl">
        <div className="p-8">
            <DialogHeader className="mb-6">
                <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 px-1">Quick Initiative Launch</DialogTitle>
                <DialogDescription className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">
                    Select a project (or Independent) and enter task details.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl shadow-inner">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1 block mb-2">Target Context</Label>
                    <Select onValueChange={setSelectedProjectId} value={selectedProjectId}>
                        <SelectTrigger className="h-11 bg-white border-slate-200 rounded-xl shadow-sm">
                            <SelectValue placeholder={isProjectsLoading ? "Scanning projects..." : "Associate with a Project or Portfolio"} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="none" className="font-bold">🌍 Independent Action (Global)</SelectItem>
                            {projects?.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                    📦 {project.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedProjectId && (
                    <div className="pt-6 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                        <TaskForm 
                            onSubmit={(data) => createTaskMutation.mutate(data)}
                            onCancel={() => onOpenChange(false)}
                            isLoading={createTaskMutation.isPending}
                            projectId={selectedProjectId === "none" ? undefined : selectedProjectId}
                        />
                    </div>
                )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
