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
import { toast } from 'sonner';
import { taskPayload } from '@/hooks/use-task-mutations';
import { errorMessage } from '@/lib/api-error';
import { projectsQuery } from '@/lib/queries';

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TaskCreateDialog({ open, onOpenChange }: TaskCreateDialogProps) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projects, isLoading: isProjectsLoading } = useQuery({ ...projectsQuery, enabled: open });

  const createTaskMutation = useMutation({
    mutationFn: async (newTask: TaskFormValues) => api.post('/tasks/', {
      ...taskPayload(newTask),
      project_id: selectedProjectId === "none" ? null : selectedProjectId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onOpenChange(false);
      setSelectedProjectId("");
      toast.success("Task created successfully");
    },
    onError: (err: any) => {
      toast.error(`Failed to create task: ${errorMessage(err, err.message)}`);
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
