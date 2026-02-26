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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Create Task</DialogTitle>
          <DialogDescription>
            Select a project (or Independent) and enter task details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Context</Label>
            <Select onValueChange={setSelectedProjectId} value={selectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={isProjectsLoading ? "Loading projects..." : "Choose a project or independent"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Independent Task (No Project)</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProjectId && (
            <div className="pt-4 border-t border-slate-100">
              <TaskForm 
                onSubmit={(data) => createTaskMutation.mutate(data)}
                onCancel={() => onOpenChange(false)}
                isLoading={createTaskMutation.isPending}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
