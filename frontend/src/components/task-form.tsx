import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User as UserIcon, Loader2, Plus, Trash2, Milestone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
  topic: z.string().optional(),
  type: z.string().optional(),
  is_milestone: z.boolean().optional(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  deadline_at: z.string().optional().nullable(),
  assignee_ids: z.array(z.string()),
  sort_index: z.number().optional(),
  subtasks: z.array(z.object({
    title: z.string().min(1, "Subtask title is required"),
    status: z.string().min(1, "Subtask status is required"),
    priority: z.string().min(1, "Subtask priority is required"),
    is_milestone: z.boolean().optional(),
    start_date: z.string().optional().nullable(),
    due_date: z.string().optional().nullable(),
    deadline_at: z.string().optional().nullable(),
    assignee_ids: z.array(z.string()).optional(),
    sort_index: z.number().optional()
  })).optional()
});

export type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  initialValues?: Partial<TaskFormValues>;
  onSubmit: (data: TaskFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function TaskForm({ initialValues, onSubmit, onCancel, isLoading }: TaskFormProps) {
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data as User[];
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      status: "Todo",
      priority: "Medium",
      assignee_ids: [],
      subtasks: [],
      ...initialValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "subtasks"
  });

  const selectedAssignees = watch("assignee_ids") || [];

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

  const toggleSubtaskAssignee = (subtaskIndex: number, userId: string) => {
    const currentSubtasks = watch("subtasks") || [];
    const currentAssignees = currentSubtasks[subtaskIndex]?.assignee_ids || [];
    const newAssignees = [...currentAssignees];
    const index = newAssignees.indexOf(userId);
    
    if (index > -1) {
      newAssignees.splice(index, 1);
    } else {
      newAssignees.push(userId);
    }
    
    setValue(`subtasks.${subtaskIndex}.assignee_ids`, newAssignees);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" placeholder="e.g. Backend" {...register("topic")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Input id="type" placeholder="e.g. Feature" {...register("type")} />
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
        <div className="flex items-center space-x-2 pt-8">
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
      </div>

      {/* Subtasks Section */}
      {!initialValues?.title && ( // Only show on creation
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-900">Initial Subtasks</Label>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="h-7 text-[10px] gap-1"
              onClick={() => append({ title: "", status: "Todo", priority: "Medium", assignee_ids: [] })}
            >
              <Plus className="w-3 h-3" /> Add Subtask
            </Button>
          </div>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="p-3 border rounded-lg bg-slate-50/50 space-y-3 relative group">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-2 right-2 h-6 w-6 text-slate-400 hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[9px] uppercase font-bold text-slate-400">Title</Label>
                    <Input
                      {...register(`subtasks.${index}.title` as const)}
                      placeholder="Subtask title..."
                      className="h-8 text-xs bg-white"
                    />
                    {errors.subtasks?.[index]?.title && (
                      <p className="text-[10px] text-destructive">{errors.subtasks[index]?.title?.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-bold text-slate-400">Priority</Label>
                    <select
                      {...register(`subtasks.${index}.priority` as const)}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-[10px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase font-bold text-slate-400">Start</Label>
                      <Input
                        type="date"
                        {...register(`subtasks.${index}.start_date` as const)}
                        className="h-8 text-[10px] bg-white px-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase font-bold text-slate-400">Due</Label>
                      <Input
                        type="date"
                        {...register(`subtasks.${index}.due_date` as const)}
                        className="h-8 text-[10px] bg-white px-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase font-bold text-slate-400">Hard Deadline</Label>
                      <Input
                        type="date"
                        {...register(`subtasks.${index}.deadline_at` as const)}
                        className="h-8 text-[10px] bg-white px-1"
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-4">
                      <Switch
                        id={`st-milestone-${index}`}
                        checked={watch(`subtasks.${index}.is_milestone`)}
                        onCheckedChange={(checked) => setValue(`subtasks.${index}.is_milestone`, checked)}
                        className="h-4 w-7 scale-75"
                      />
                      <Label htmlFor={`st-milestone-${index}`} className="text-[9px] font-bold text-slate-500 cursor-pointer">
                        Milestone
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[9px] uppercase font-bold text-slate-400">Assignees</Label>
                  <div className="flex flex-wrap gap-1 p-2 bg-white border rounded-md min-h-[32px]">
                    {users?.map(user => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleSubtaskAssignee(index, user.id)}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] border transition-all",
                          (watch(`subtasks.${index}.assignee_ids`) || []).includes(user.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {user.full_name || user.email}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {fields.length === 0 && (
              <p className="text-[10px] text-slate-400 italic">No subtasks added yet.</p>
            )}
          </div>
        </div>
      )}
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
