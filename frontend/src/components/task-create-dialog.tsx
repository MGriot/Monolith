import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import TaskForm, { type TaskFormValues } from '@/components/task-form';
import TaskDialog from '@/components/task-dialog';
import type { Project } from '@/types';
import { toast } from 'sonner';
import { fromDateInput } from "@/lib/dates";

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
      const formatDate = fromDateInput;
      
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
    <TaskDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      subtitle="Pick a project (or Independent), then fill in the task."
      headerExtra={
        <div className="flex items-center gap-3 pt-2">
          <Label htmlFor="task-create-project" className="shrink-0 text-xs font-medium text-muted-foreground">Project</Label>
          <Select onValueChange={setSelectedProjectId} value={selectedProjectId}>
            <SelectTrigger id="task-create-project" className="h-9 max-w-sm">
              <SelectValue placeholder={isProjectsLoading ? "Loading projects..." : "Choose a project"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Independent task (no project)</SelectItem>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {selectedProjectId ? (
        <TaskForm
          key={selectedProjectId}
          onSubmit={(data) => createTaskMutation.mutate(data)}
          onCancel={() => onOpenChange(false)}
          isLoading={createTaskMutation.isPending}
          projectId={selectedProjectId === "none" ? undefined : selectedProjectId}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
          Choose a project above to start.
        </div>
      )}
    </TaskDialog>
  );
}
