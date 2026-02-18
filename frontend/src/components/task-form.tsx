import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Milestone, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichDropdown, type RichDropdownItem } from "@/components/ui/rich-dropdown";
import { AssigneeSelector } from "@/components/assignee-selector";
import type { Task, Topic, WorkType } from "@/types";

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
  color: z.string().optional().nullable(),
  optimistic_days: z.number().optional(),
  normal_days: z.number().optional(),
  pessimistic_days: z.number().optional(),
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
  const { data: topics, isLoading: isLoadingTopics } = useQuery({
    queryKey: ['metadata', 'topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data,
  });

  const { data: workTypes, isLoading: isLoadingTypes } = useQuery({
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
    defaultValues: useMemo(() => ({
      status: "Todo",
      priority: "Medium",
      is_milestone: false,
      assignee_ids: [],
      parent_id: null,
      topic_id: null,
      type_id: null,
      topic_ids: [],
      type_ids: [],
      color: null,
      optimistic_days: 0,
      normal_days: 0,
      pessimistic_days: 0,
      ...initialValues,
      start_date: initialValues?.start_date?.split('T')[0] || null,
      due_date: initialValues?.due_date?.split('T')[0] || null,
      deadline_at: initialValues?.deadline_at?.split('T')[0] || null,
      completed_at: initialValues?.completed_at?.split('T')[0] || null,
    }), [initialValues]),
  });

  const selectedAssignees = watch("assignee_ids") || [];
  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedParentId = watch("parent_id");
  const selectedColor = watch("color");

  const optDays = watch("optimistic_days") || 0;
  const normDays = watch("normal_days") || 0;
  const pessDays = watch("pessimistic_days") || 0;

  const expectedDuration = useMemo(() => {
    if (optDays === 0 && normDays === 0 && pessDays === 0) return 0;
    return Math.round(((optDays + (4 * normDays) + pessDays) / 6) * 100) / 100;
  }, [optDays, normDays, pessDays]);

  const toggleItem = (field: "assignee_ids" | "topic_ids" | "type_ids", id: string) => {
    const current = [...(watch(field) || [])];
    const index = current.indexOf(id);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    setValue(field, current);
  };

  const removeItem = (field: "assignee_ids" | "topic_ids" | "type_ids", id: string) => {
    const current = [...(watch(field) || [])];
    const filtered = current.filter(item => item !== id);
    setValue(field, filtered);
  };

  // Transformation for RichDropdown
  const topicItems: RichDropdownItem[] = useMemo(() => 
    topics?.map((t: Topic) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [topics]);

  const typeItems: RichDropdownItem[] = useMemo(() => 
    workTypes?.map((t: WorkType) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [workTypes]);

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
      <div className="grid grid-cols-2 gap-4">
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
          <Label htmlFor="color">Row Color (Gantt)</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              id="color-picker"
              className="w-12 h-10 p-1 cursor-pointer"
              value={selectedColor || "#ffffff"}
              onChange={(e) => setValue("color", e.target.value)}
            />
            <Input
              id="color"
              placeholder="#ffffff"
              {...register("color")}
            />
          </div>
        </div>
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
        <AssigneeSelector 
          label="Assignees"
          selectedValues={selectedAssignees}
          onSelect={(id) => toggleItem("assignee_ids", id)}
          onRemove={(id) => removeItem("assignee_ids", id)}
          placeholder="Assign users or teams..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Topics</Label>
          <RichDropdown 
            items={topicItems}
            selectedValues={selectedTopicIds}
            onSelect={(id) => toggleItem("topic_ids", id)}
            onRemove={(id) => removeItem("topic_ids", id)}
            multi={true}
            isLoading={isLoadingTopics}
            placeholder="Select topics..."
            searchPlaceholder="Search categories..."
          />
        </div>
        <div className="space-y-2">
          <Label>Types</Label>
          <RichDropdown 
            items={typeItems}
            selectedValues={selectedTypeIds}
            onSelect={(id) => toggleItem("type_ids", id)}
            onRemove={(id) => removeItem("type_ids", id)}
            multi={true}
            isLoading={isLoadingTypes}
            placeholder="Select work types..."
            searchPlaceholder="Search types..."
          />
        </div>
      </div>

      <div className="p-3 border rounded-lg bg-slate-50/50 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-slate-700">
            <Calculator className="w-3.5 h-3.5" />
            PERT Estimation (Days)
          </Label>
          <div className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            Expected: {expectedDuration}d
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="optimistic_days" className="text-[10px] text-slate-500 uppercase">Optimistic</Label>
            <Input 
              id="optimistic_days" 
              type="number" 
              {...register("optimistic_days", { valueAsNumber: true })} 
              className="h-8 text-xs bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="normal_days" className="text-[10px] text-slate-500 uppercase">Most Likely</Label>
            <Input 
              id="normal_days" 
              type="number" 
              {...register("normal_days", { valueAsNumber: true })} 
              className="h-8 text-xs bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pessimistic_days" className="text-[10px] text-slate-500 uppercase">Pessimistic</Label>
            <Input 
              id="pessimistic_days" 
              type="number" 
              {...register("pessimistic_days", { valueAsNumber: true })} 
              className="h-8 text-xs bg-white"
            />
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
