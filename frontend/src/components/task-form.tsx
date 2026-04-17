import { useMemo, useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
    Milestone, 
    Calculator, 
    CalendarDays, 
    Clock, 
    Link as LinkIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichDropdown, type RichDropdownItem } from "@/components/ui/rich-dropdown";
import { AssigneeSelector } from "@/components/assignee-selector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import DependencyManager from "./dependency-manager";
import type { Task, Topic, WorkType, Project } from "@/types";

const subtaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
});

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
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
  duration_days: z.number().min(0).optional(),
  subtasks: z.array(subtaskSchema).optional(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  initialValues?: Partial<TaskFormValues> & { topics?: Topic[], types?: WorkType[] };
  taskObject?: Task | null;
  onSubmit: (data: TaskFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  allTasks?: Task[];
  editingTaskId?: string | null;
  projectId?: string;
}

export default function TaskForm({ 
  initialValues, 
  taskObject,
  onSubmit, 
  onCancel, 
  isLoading, 
  allTasks, 
  editingTaskId, 
  projectId 
}: TaskFormProps) {
  const queryClient = useQueryClient();
  const [planningMode, setPlanningMode] = useState<"dates" | "duration">("dates");

  // Fetch Project to check for whitelist
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await api.get(`/projects/${projectId}`);
      return response.data as Project;
    },
    enabled: !!projectId,
  });

  const { data: topics, isLoading: isLoadingTopics } = useQuery({
    queryKey: ['metadata', 'topics', projectId, editingTaskId],
    queryFn: async () => (await api.get('/metadata/topics', { 
      params: { 
        project_id: projectId, 
        task_id: editingTaskId,
        include_global: true 
      } 
    })).data as Topic[],
  });

  const { data: workTypes, isLoading: isLoadingTypes } = useQuery({
    queryKey: ['metadata', 'work-types', projectId, editingTaskId],
    queryFn: async () => (await api.get('/metadata/work-types', {
      params: { 
        project_id: projectId, 
        task_id: editingTaskId,
        include_global: true 
      }
    })).data as WorkType[],
  });

  const createTopicMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.post('/metadata/topics', { name, project_id: projectId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['metadata', 'topics'] })
  });

  const createWorkTypeMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.post('/metadata/work-types', { name, project_id: projectId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['metadata', 'work-types'] })
  });

  const processedInitialValues = useMemo(() => {
    const vals = {
      status: "Todo",
      priority: "Medium",
      is_milestone: false,
      assignee_ids: [],
      parent_id: null,
      topic_ids: [],
      type_ids: [],
      color: null,
      optimistic_days: 0,
      normal_days: 0,
      pessimistic_days: 0,
      duration_days: 0,
      subtasks: [],
      ...initialValues,
    };

    if (initialValues?.topics && vals.topic_ids?.length === 0) {
        vals.topic_ids = initialValues.topics.map(t => t.id);
    }
    if (initialValues?.types && vals.type_ids?.length === 0) {
        vals.type_ids = initialValues.types.map(t => t.id);
    }

    return vals;
  }, [initialValues]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: processedInitialValues as any,
  });

  useFieldArray({
    control,
    name: "subtasks",
  });

  const selectedAssignees = watch("assignee_ids") || [];
  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedParentId = watch("parent_id");
  const selectedColor = watch("color");

  const startDate = watch("start_date");
  const dueDate = watch("due_date");
  const durationDays = watch("duration_days") || 0;

  const optDays = watch("optimistic_days") || 0;
  const normDays = watch("normal_days") || 0;
  const pessDays = watch("pessimistic_days") || 0;

  const expectedDuration = useMemo(() => {
    if (optDays === 0 && normDays === 0 && pessDays === 0) return 0;
    return Math.round(((optDays + (4 * normDays) + pessDays) / 6) * 100) / 100;
  }, [optDays, normDays, pessDays]);

  // Sync logic for the UI
  useEffect(() => {
    if (planningMode === "dates" && startDate && dueDate) {
      const start = parseISO(startDate);
      const end = parseISO(dueDate);
      const diff = differenceInDays(end, start) + 1;
      if (diff >= 0 && diff !== durationDays) {
        setValue("duration_days", diff);
      }
    }
  }, [startDate, dueDate, planningMode, setValue, durationDays]);

  const handleDurationChange = (val: number) => {
    setValue("duration_days", val);
    if (planningMode === "duration" && startDate && val > 0) {
      const start = parseISO(startDate);
      const newEnd = addDays(start, val - 1);
      setValue("due_date", format(newEnd, "yyyy-MM-dd"));
    }
  };

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

  // Transformation for RichDropdown with Whitelist Logic
  const topicItems: RichDropdownItem[] = useMemo(() => {
    if (!topics) return [];
    let filtered = topics;
    
    // Apply whitelist if present
    if (project?.allowed_global_topics && (project.allowed_global_topics as any).length > 0) {
      const whitelist = new Set(project.allowed_global_topics as any);
      filtered = filtered.filter((t: Topic) => {
        // Always allow scoped topics (project or task specific)
        if (t.project_id || t.task_id) return true;
        // Check whitelist for globals
        return whitelist.has(t.id);
      });
    }
    
    return filtered.map((t: Topic) => ({ id: t.id, label: t.name, color: t.color }));
  }, [topics, project]);

  const typeItems: RichDropdownItem[] = useMemo(() => {
    if (!workTypes) return [];
    let filtered = workTypes;
    
    if (project?.allowed_global_work_types && (project.allowed_global_work_types as any).length > 0) {
      const whitelist = new Set(project.allowed_global_work_types as any);
      filtered = filtered.filter((t: WorkType) => {
        if (t.project_id || t.task_id) return true;
        return whitelist.has(t.id);
      });
    }
    
    return filtered.map((t: WorkType) => ({ id: t.id, label: t.name, color: t.color }));
  }, [workTypes, project]);

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

  const handleFormSubmit = (data: TaskFormValues) => {
    const cleanedData = {
      ...data,
      parent_id: data.parent_id === "" ? null : data.parent_id,
      color: data.color === "" ? null : data.color,
      description: data.description === "" ? null : data.description,
    };
    onSubmit(cleanedData);
  };

  const availableParents = getAvailableParents();

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-4">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid grid-cols-3 w-full mb-6">
          <TabsTrigger value="general" className="text-[10px] font-black uppercase tracking-tight">General</TabsTrigger>
          <TabsTrigger value="scheduling" className="text-[10px] font-black uppercase tracking-tight">Timeline</TabsTrigger>
          <TabsTrigger value="dependencies" disabled={!editingTaskId} className="text-[10px] font-black uppercase tracking-tight gap-1.5">
            <LinkIcon className="w-3 h-3" /> Deps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
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
                <option value="On hold">On Hold</option>
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
                onCreate={projectId ? (name) => createTopicMutation.mutate(name) : undefined}
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
                onCreate={projectId ? (name) => createWorkTypeMutation.mutate(name) : undefined}
                multi={true}
                isLoading={isLoadingTypes}
                placeholder="Select work types..."
                searchPlaceholder="Search types..."
              />
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
        </TabsContent>

        <TabsContent value="scheduling" className="space-y-4">
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

          <div className="space-y-3 p-3 border rounded-lg bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-slate-700">
                <CalendarDays className="w-3.5 h-3.5" />
                Scheduling & Timeline
              </Label>
              <Tabs value={planningMode} onValueChange={(v: any) => setPlanningMode(v)}>
                <TabsList className="h-7 p-0.5 bg-slate-200/50">
                  <TabsTrigger value="dates" className="text-[10px] h-6 px-2">Fixed Dates</TabsTrigger>
                  <TabsTrigger value="duration" className="text-[10px] h-6 px-2">Duration Based</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_date" className="text-[10px] text-slate-500 uppercase">Start Date</Label>
                <Input id="start_date" type="date" {...register("start_date")} className="h-8 text-xs bg-white" />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="duration_days" className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Duration
                </Label>
                <Input 
                  id="duration_days" 
                  type="number" 
                  value={durationDays}
                  onChange={(e) => handleDurationChange(parseInt(e.target.value) || 0)}
                  className={cn("h-8 text-xs bg-white", planningMode === "dates" && "bg-slate-100 italic text-slate-400")}
                  disabled={planningMode === "dates"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due_date" className="text-[10px] text-slate-500 uppercase">Due Date</Label>
                <Input 
                  id="due_date" 
                  type="date" 
                  {...register("due_date")} 
                  className={cn("h-8 text-xs bg-white", planningMode === "duration" && "bg-slate-100 italic text-slate-400")}
                  disabled={planningMode === "duration"}
                />
              </div>
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
        </TabsContent>

        <TabsContent value="dependencies" className="pt-2">
          {editingTaskId && taskObject && (
            <DependencyManager
              item={taskObject}
              allPossibleBlockers={(() => {
                const flat: any[] = [];
                const recurse = (list: Task[], prefix = "") => {
                  list.forEach(t => {
                    const title = prefix ? `${prefix} > ${t.title}` : t.title;
                    flat.push({ ...t, title });
                    if (t.subtasks) recurse(t.subtasks, title);
                  });
                };
                recurse(allTasks || []);
                return flat;
              })()}
            />
          )}
          {!editingTaskId && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 border border-dashed rounded-lg">
              <LinkIcon className="w-8 h-8 opacity-20" />
              <p className="text-xs font-medium">Dependencies can be added after the task is created.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t">
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
