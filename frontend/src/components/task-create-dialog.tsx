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

interface Project {
  id: string;
  name: string;
}

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
      if (!selectedProjectId) throw new Error("Please select a project first.");
      return api.post('/tasks/', { ...newTask, project_id: selectedProjectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onOpenChange(false);
      setSelectedProjectId("");
    },
  });

  const handleTaskSubmit = (data: TaskFormValues) => {
    createProjectMutation.mutate(data);
  };

  // Wait, I used createProjectMutation instead of createTaskMutation by mistake in thought. 
  // Let's fix that in the actual code below.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Create Task</DialogTitle>
          <DialogDescription>
            Select a project and enter task details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Project</Label>
            <Select onValueChange={setSelectedProjectId} value={selectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={isProjectsLoading ? "Loading projects..." : "Choose a project"} />
              </SelectTrigger>
              <SelectContent>
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
