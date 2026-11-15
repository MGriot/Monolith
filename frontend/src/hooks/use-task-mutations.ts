import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/lib/api-error';
import { fromDateInput } from '@/lib/dates';
import { patchTask } from '@/lib/tasks';
import type { TaskFormValues } from '@/components/task-form';
import type { Task } from '@/types';

/** Task form values -> API payload: the date inputs become naive local midnights (or null). */
export function taskPayload<T extends Partial<TaskFormValues>>(data: T) {
  return {
    ...data,
    start_date: fromDateInput(data.start_date),
    due_date: fromDateInput(data.due_date),
    deadline_at: fromDateInput(data.deadline_at),
    completed_at: fromDateInput(data.completed_at),
  };
}

interface Options {
  /** Query holding the task tree the page shows; moves update it optimistically. */
  listKey: QueryKey;
  /** Other queries that depend on the tasks (project, project statistics...). */
  relatedKeys?: QueryKey[];
  /** Project new tasks are created in. */
  projectId?: string;
  /** After a create, update, delete or archive succeeded (e.g. close the dialog). */
  onSaved?: () => void;
}

/** Create / update / delete / archive / move for a page that shows one task tree. */
export function useTaskMutations({ listKey, relatedKeys = [], projectId, onSaved }: Options) {
  const queryClient = useQueryClient();
  const refresh = () => {
    for (const queryKey of [listKey, ...relatedKeys]) queryClient.invalidateQueries({ queryKey });
  };
  const saved = (message: string) => () => {
    refresh();
    onSaved?.();
    toast.success(message);
  };

  const createTask = useMutation({
    mutationFn: async (data: Partial<TaskFormValues>) => (await api.post('/tasks/', { ...data, project_id: projectId })).data,
    onSuccess: saved('Task created successfully'),
  });

  const updateTask = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskFormValues> }) =>
      (await api.put(`/tasks/${taskId}`, data)).data,
    onSuccess: saved('Task updated successfully'),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: saved('Task deleted successfully'),
  });

  const archiveTask = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/archive`),
    onSuccess: saved('Task archived successfully'),
  });

  // The board moves the card at once; the cached tree follows (subtasks included) and rolls back if the API refuses.
  const moveTask = useMutation({
    mutationFn: ({ taskId, newStatus, sortIndex }: { taskId: string; newStatus: string; sortIndex?: number }) =>
      api.put(`/tasks/${taskId}`, { status: newStatus, ...(sortIndex !== undefined && { sort_index: sortIndex }) }),
    onMutate: async ({ taskId, newStatus, sortIndex }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousTasks = queryClient.getQueryData<Task[]>(listKey);
      queryClient.setQueryData<Task[]>(listKey, (old) =>
        old && patchTask(old, taskId, { status: newStatus, ...(sortIndex !== undefined && { sort_index: sortIndex }) }));
      return { previousTasks };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(listKey, context?.previousTasks);
      toast.error(errorMessage(error, 'Could not move the task'));
    },
    onSettled: refresh,
  });

  return { createTask, updateTask, deleteTask, archiveTask, moveTask };
}
