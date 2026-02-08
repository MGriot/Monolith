import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User as UserIcon, Loader2, Milestone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User, Task, Topic, WorkType } from "@/types";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
  topic_id: z.string().optional().nullable(),
  type_id: z.string().optional().nullable(),
  topic_ids: z.array(z.string()).optional(),
  type_ids: z.array(z.string()).optional(),
  is_milestone: z.boolean().optional(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  deadline_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  assignee_ids: z.array(z.string()),
  sort_index: z.number().optional(),
  parent_id: z.string().optional().nullable(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  initialValues?: Partial<TaskFormValues>;
  onSubmit: (data: TaskFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  allTasks?: Task[];
  editingTaskId?: string | null;
}

export default function TaskForm({ initialValues, onSubmit, onCancel, isLoading, allTasks, editingTaskId }: TaskFormProps) {
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data as User[];
    },
  });

  const { data: topics } = useQuery({
    queryKey: ['metadata', 'topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data,
  });

  const { data: workTypes } = useQuery({
    queryKey: ['metadata', 'work-types'],
    queryFn: async () => (await api.get('/metadata/work-types')).data,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      status: "Todo",
      priority: "Medium",
      is_milestone: false,
      assignee_ids: [],
      parent_id: null,
      topic_id: null,
      type_id: null,
      topic_ids: [],
      type_ids: [],
      ...initialValues,
    },
  });

  const selectedAssignees = watch("assignee_ids") || [];
  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedParentId = watch("parent_id");

  const toggleAssignee = (userId: string) => {
    const current = [...selectedAssignees];
    const index = current.indexOf(userId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(userId);
    }
    setValue("assignee_ids", current);
  };

  const toggleTopic = (topicId: string) => {
    const current = [...selectedTopicIds];
    const index = current.indexOf(topicId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(topicId);
    }
    setValue("topic_ids", current);
  };

  const toggleType = (typeId: string) => {
    const current = [...selectedTypeIds];
    const index = current.indexOf(typeId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(typeId);
    }
    setValue("type_ids", current);
  };

  // Helper to flatten tasks for the select, excluding descendants of the current task
  const getAvailableParents = () => {
    const flat: { id: string; title: string; wbs_code?: string; level: number }[] = [];

    // Find descendants to exclude
    const descendants = new Set<string>();
    if (editingTaskId && allTasks) {
      const findDescendants = (tasks: Task[]) => {
        for (const t of tasks) {
          descendants.add(t.id);
          if (t.subtasks) findDescendants(t.subtasks);
        }
      };

      const findAndExclude = (tasks: Task[]) => {
        for (const t of tasks) {
          if (t.id === editingTaskId) {
            if (t.subtasks) findDescendants(t.subtasks);
            return true;
          }
          if (t.subtasks && findAndExclude(t.subtasks)) return true;
        }
        return false;
      };
      findAndExclude(allTasks);
      descendants.add(editingTaskId);
    }

    const recurse = (tasks: Task[], level: number) => {
      for (const t of tasks) {
        if (!descendants.has(t.id)) {
          flat.push({ id: t.id, title: t.title, wbs_code: t.wbs_code, level });
          if (t.subtasks) recurse(t.subtasks, level + 1);
        }
      }
    };

    if (allTasks) recurse(allTasks, 0);
    return flat;
  };

  const availableParents = getAvailableParents();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="parent_id">Parent Task (WBS)</Label>
        <select
          id="parent_id"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={selectedParentId || ""}
          onChange={(e) => setValue("parent_id", e.target.value || null)}
        >
          <option value="">None (Root Task)</option>
          {availableParents.map(p => (
            <option key={p.id} value={p.id}>
              {p.wbs_code ? `${p.wbs_code} ` : ""}{"  ".repeat(p.level)}{p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Task title"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Describe the task..."
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            {...register("status")}
          >
            <option value="Backlog">Backlog</option>
            <option value="Todo">Todo</option>
            <option value="In Progress">In Progress</option>
            <option value="On hold">On hold</option>
            <option value="Review">Review</option>
            <option value="Done">Done</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            {...register("priority")}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Assignees</Label>
        <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-slate-50/50 min-h-[60px]">
          {isLoadingUsers ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading team...
            </div>
          ) : (
            users?.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleAssignee(user.id)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-full text-xs border transition-all",
                  selectedAssignees.includes(user.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                <UserIcon className="w-3 h-3" />
                {user.full_name || user.email}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Topics</Label>
          <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-slate-50/50 min-h-[40px]">
            {topics?.map((t: Topic) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTopic(t.id)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold border transition-all",
                  selectedTopicIds.includes(t.id)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Types</Label>
          <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-slate-50/50 min-h-[40px]">
            {workTypes?.map((t: WorkType) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold border transition-all",
                  selectedTypeIds.includes(t.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input id="start_date" type="date" {...register("start_date")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input id="due_date" type="date" {...register("due_date")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deadline_at">Hard Deadline</Label>
          <Input id="deadline_at" type="date" {...register("deadline_at")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="completed_at">Conclusion Date</Label>
          <Input id="completed_at" type="date" {...register("completed_at")} />
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Switch
          id="is_milestone"
          checked={watch("is_milestone")}
          onCheckedChange={(checked) => setValue("is_milestone", checked)}
        />
        <Label htmlFor="is_milestone" className="flex items-center gap-1.5 cursor-pointer">
          <Milestone className="w-3.5 h-3.5 text-blue-500" />
          Mark as Milestone
        </Label>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Task"}
        </Button>
      </div>
    </form>
  );
}
