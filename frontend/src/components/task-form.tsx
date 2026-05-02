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
    Link as LinkIcon,
    Plus,
    Sparkles,
    Database,
    X,
    CheckSquare,
    AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  budget: z.number().optional(),
  real_cost: z.number().optional(),
  risk_probability: z.number().min(1).max(5).optional(),
  risk_impact: z.number().min(1).max(5).optional(),
  checklist: z.array(z.object({
    id: z.string(),
    text: z.string(),
    is_done: z.boolean()
  })).optional(),
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
    const formatDate = (dateStr?: string | null) => {
      if (!dateStr) return "";
      try {
        // Only return the date part YYYY-MM-DD
        return format(parseISO(dateStr), "yyyy-MM-dd");
      } catch (e) {
        return "";
      }
    };

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
      budget: 0,
      real_cost: 0,
      risk_probability: 1,
      risk_impact: 1,
      checklist: [],
      subtasks: [],
      ...initialValues,
      start_date: formatDate(initialValues?.start_date),
      due_date: formatDate(initialValues?.due_date),
      deadline_at: formatDate(initialValues?.deadline_at),
      completed_at: formatDate(initialValues?.completed_at),
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
    reset,
    control,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: processedInitialValues as any,
  });

  // Sync form state when initialValues change (essential for Dialog reuse)
  useEffect(() => {
    reset(processedInitialValues);
  }, [processedInitialValues, reset]);

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
  const deadlineAt = watch("deadline_at");
  const completedAt = watch("completed_at");
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
      try {
        const start = parseISO(startDate);
        const end = parseISO(dueDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
        
        const diff = differenceInDays(end, start) + 1;
        if (diff >= 0 && diff !== durationDays) {
          setValue("duration_days", diff);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }, [startDate, dueDate, planningMode, setValue, durationDays]);

  const handleDurationChange = (val: number) => {
    setValue("duration_days", val);
    if (planningMode === "duration" && startDate && val > 0) {
      try {
        const start = parseISO(startDate);
        if (isNaN(start.getTime())) return;
        
        const newEnd = addDays(start, val - 1);
        setValue("due_date", format(newEnd, "yyyy-MM-dd"));
      } catch (e) {
        // Ignore calculation errors
      }
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

    // Auto-calculations
    if (cleanedData.start_date && cleanedData.due_date) {
        const start = parseISO(cleanedData.start_date);
        const end = parseISO(cleanedData.due_date);
        cleanedData.duration_days = differenceInDays(end, start) + 1;
    } else if (cleanedData.start_date && cleanedData.duration_days && !cleanedData.due_date) {
        const start = parseISO(cleanedData.start_date);
        const end = addDays(start, cleanedData.duration_days - 1);
        cleanedData.due_date = format(end, "yyyy-MM-dd");
    }

    // PERT logic
    if (cleanedData.optimistic_days && cleanedData.normal_days && cleanedData.pessimistic_days) {
        const pert = (cleanedData.optimistic_days + (4 * cleanedData.normal_days) + cleanedData.pessimistic_days) / 6;
        if (!cleanedData.duration_days) {
            cleanedData.duration_days = Math.round(pert);
        }
    }

    onSubmit(cleanedData);
  };

  const handleSuggestPERT = () => {
    if (!startDate) {
        toast.error("Set Start Date first");
        return;
    }

    try {
        const start = parseISO(startDate);
        if (isNaN(start.getTime())) return;

        // 1. Most Likely (Normal)
        let normal = durationDays || 0;
        if (dueDate) {
            const end = parseISO(dueDate);
            if (!isNaN(end.getTime())) {
                normal = Math.max(1, differenceInDays(end, start) + 1);
            }
        }

        if (normal === 0) {
            toast.error("Set Due Date or Duration first");
            return;
        }

        // 2. Pessimistic
        let pessimistic = Math.round(normal * 1.5);
        if (deadlineAt) {
            const dl = parseISO(deadlineAt);
            if (!isNaN(dl.getTime())) {
                pessimistic = Math.max(normal, differenceInDays(dl, start) + 1);
            }
        }
        if (completedAt) {
            const comp = parseISO(completedAt);
            if (!isNaN(comp.getTime())) {
                const actual = differenceInDays(comp, start) + 1;
                if (actual > normal) pessimistic = Math.max(pessimistic, actual);
            }
        }

        // 3. Optimistic
        let optimistic = Math.round(normal * 0.8);
        if (completedAt) {
            const comp = parseISO(completedAt);
            if (!isNaN(comp.getTime())) {
                const actual = differenceInDays(comp, start) + 1;
                if (actual < normal && actual > 0) optimistic = actual;
            }
        }

        setValue("normal_days", normal);
        setValue("pessimistic_days", pessimistic);
        setValue("optimistic_days", optimistic);
        toast.success("PERT values suggested from timeline");
    } catch (e) {
        toast.error("Could not calculate suggestions");
    }
  };

  const handleSyncFromChildren = () => {
    if (!taskObject?.subtasks || taskObject.subtasks.length === 0) return;
    
    let minStart: Date | null = null;
    let maxDue: Date | null = null;

    const traverse = (subtasks: Task[]) => {
        subtasks.forEach(st => {
            if (st.start_date) {
                try {
                    const d = parseISO(st.start_date);
                    if (!isNaN(d.getTime())) {
                        if (!minStart || d < minStart) minStart = d;
                    }
                } catch (e) {}
            }
            if (st.due_date) {
                try {
                    const d = parseISO(st.due_date);
                    if (!isNaN(d.getTime())) {
                        if (!maxDue || d > maxDue) maxDue = d;
                    }
                } catch (e) {}
            }
            if (st.subtasks && st.subtasks.length > 0) {
                traverse(st.subtasks);
            }
        });
    };

    traverse(taskObject.subtasks);

    if (minStart && !isNaN(minStart.getTime())) {
        setValue("start_date", format(minStart, "yyyy-MM-dd"));
    }
    if (maxDue && !isNaN(maxDue.getTime())) {
        setValue("due_date", format(maxDue, "yyyy-MM-dd"));
    }
    
    toast.success("Dates synced from all descendants");
  };

  const availableParents = getAvailableParents();

  const colorPresets = [
    { name: "Blue", value: "#3b82f6" },
    { name: "Indigo", value: "#6366f1" },
    { name: "Purple", value: "#a855f7" },
    { name: "Rose", value: "#f43f5e" },
    { name: "Orange", value: "#f97316" },
    { name: "Amber", value: "#f59e0b" },
    { name: "Emerald", value: "#10b981" },
    { name: "Slate", value: "#64748b" },
  ];

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-0 h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-6 scrollbar-hide">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-5 w-full bg-slate-100/80 p-1 rounded-xl mb-8 border border-slate-200 shadow-sm sticky top-0 z-50 backdrop-blur-sm">
            <TabsTrigger value="general" className="text-[10px] font-black uppercase tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg py-2">Essentials</TabsTrigger>
            <TabsTrigger value="scheduling" className="text-[10px] font-black uppercase tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg py-2">Timeline</TabsTrigger>
            <TabsTrigger value="checklist" className="text-[10px] font-black uppercase tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg py-2 flex gap-1.5 justify-center items-center">
              <CheckSquare className="w-3 h-3" /> List
            </TabsTrigger>
            <TabsTrigger value="risk" className="text-[10px] font-black uppercase tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg py-2 flex gap-1.5 justify-center items-center">
              <AlertCircle className="w-3 h-3" /> Risk & $
            </TabsTrigger>
            <TabsTrigger value="dependencies" disabled={!editingTaskId} className="text-[10px] font-black uppercase tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg py-2 flex gap-1.5 justify-center items-center">
              <LinkIcon className="w-3 h-3" /> Deps
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400 focus-visible:outline-none">
            {/* Row 1: Title & Essentials */}
            <div className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="title" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] px-1">Primary Objective</Label>
                    <Input
                        id="title"
                        placeholder="Define the task objective..."
                        className="h-12 text-lg font-bold border-slate-200 focus:border-primary shadow-sm rounded-xl px-4 transition-all"
                        {...register("title")}
                    />
                    {errors.title && (
                        <p className="text-xs font-bold text-red-500 mt-1 px-1">{errors.title.message}</p>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-6 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
                    <div className="space-y-2">
                        <Label htmlFor="status" className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Status</Label>
                        <select
                            id="status"
                            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
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
                        <Label htmlFor="priority" className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Priority</Label>
                        <select
                            id="priority"
                            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                            {...register("priority")}
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                        </select>
                    </div>

                    <div className="flex flex-col justify-end pb-1 pl-4">
                        <div className="flex items-center space-x-3">
                            <Switch
                                id="is_milestone"
                                checked={watch("is_milestone")}
                                onCheckedChange={(checked) => setValue("is_milestone", checked)}
                                className="data-[state=checked]:bg-blue-500"
                            />
                            <Label htmlFor="is_milestone" className="flex items-center gap-2 cursor-pointer text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                                <Milestone className="w-3.5 h-3.5 text-blue-500" />
                                Milestone
                            </Label>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] px-1">Context & Documentation</Label>
                    <textarea
                        id="description"
                        className="flex min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed ring-offset-background placeholder:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all focus:border-primary shadow-sm resize-none"
                        placeholder="Detailed scope, technical requirements, or context..."
                        {...register("description")}
                    />
                </div>

                {/* People Section */}
                <div className="pt-2">
                    <AssigneeSelector 
                        label="Project Workforce (Assignees)"
                        selectedValues={selectedAssignees}
                        onSelect={(id) => toggleItem("assignee_ids", id)}
                        onRemove={(id) => removeItem("assignee_ids", id)}
                        placeholder="Who is accountable?"
                    />
                </div>

                {/* Organization Row */}
                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Taxonomy (Topics)</Label>
                        <RichDropdown 
                            items={topicItems}
                            selectedValues={selectedTopicIds}
                            onSelect={(id) => toggleItem("topic_ids", id)}
                            onRemove={(id) => removeItem("topic_ids", id)}
                            onCreate={projectId ? (name) => createTopicMutation.mutate(name) : undefined}
                            multi={true}
                            isLoading={isLoadingTopics}
                            placeholder="Categorize..."
                            searchPlaceholder="Search categories..."
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Functional Type</Label>
                        <RichDropdown 
                            items={typeItems}
                            selectedValues={selectedTypeIds}
                            onSelect={(id) => toggleItem("type_ids", id)}
                            onRemove={(id) => removeItem("type_ids", id)}
                            onCreate={projectId ? (name) => createWorkTypeMutation.mutate(name) : undefined}
                            multi={true}
                            isLoading={isLoadingTypes}
                            placeholder="Activity types..."
                            searchPlaceholder="Search types..."
                        />
                    </div>
                </div>

                {/* Structure Section */}
                <div className="grid grid-cols-2 gap-8 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] shadow-sm">
                    <div className="space-y-3">
                        <Label htmlFor="parent_id" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">WBS Hierarchy (Parent)</Label>
                        <select
                            id="parent_id"
                            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-medium ring-offset-background focus-visible:outline-none transition-all focus:ring-2 focus:ring-primary/10"
                            value={selectedParentId || ""}
                            onChange={(e) => setValue("parent_id", e.target.value || null)}
                        >
                            <option value="">None (Root Level Task)</option>
                            {availableParents.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.wbs_code ? `${p.wbs_code} ` : ""}{"  ".repeat(p.level)}{p.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-3">
                        <Label htmlFor="color" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Visual Label (Gantt Color)</Label>
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-2">
                                {colorPresets.map((cp) => (
                                    <button
                                        key={cp.value}
                                        type="button"
                                        className={cn(
                                            "w-7 h-7 rounded-full border-2 transition-all hover:scale-125 shadow-sm",
                                            selectedColor === cp.value ? "border-slate-900 scale-110" : "border-white"
                                        )}
                                        style={{ backgroundColor: cp.value }}
                                        onClick={() => setValue("color", cp.value)}
                                        title={cp.name}
                                    />
                                ))}
                                <button
                                    type="button"
                                    className={cn(
                                        "w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center transition-all hover:border-slate-500",
                                        !colorPresets.find(cp => cp.value === selectedColor) && selectedColor ? "border-slate-900 bg-white" : ""
                                    )}
                                    onClick={() => document.getElementById('custom-color-picker')?.click()}
                                >
                                    <Plus className="w-4 h-4 text-slate-400" />
                                </button>
                                <input
                                    type="color"
                                    id="custom-color-picker"
                                    className="sr-only"
                                    value={selectedColor || "#ffffff"}
                                    onChange={(e) => setValue("color", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </TabsContent>

          <TabsContent value="scheduling" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400 focus-visible:outline-none">
            <div className="space-y-8">
                {/* Main Scheduling Section */}
                <div className="space-y-6 p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <CalendarDays className="w-24 h-24 text-slate-900" />
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <CalendarDays className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <Label className="text-sm font-black uppercase text-slate-800 tracking-widest leading-none">Task Chronology</Label>
                                <p className="text-[10px] text-slate-400 mt-1">Define project start and target deadlines.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {taskObject?.subtasks && taskObject.subtasks.length > 0 && (
                                <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-9 text-[10px] font-black uppercase text-primary hover:bg-primary/5 gap-2 px-4 border border-primary/20 rounded-xl bg-white shadow-sm"
                                    onClick={handleSyncFromChildren}
                                >
                                    <Plus className="w-4 h-4" /> Roll-up Dates
                                </Button>
                            )}
                            <Tabs value={planningMode} onValueChange={(v: any) => setPlanningMode(v)}>
                                <TabsList className="h-9 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                                    <TabsTrigger value="dates" className="text-[10px] font-black uppercase h-7 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Dates</TabsTrigger>
                                    <TabsTrigger value="duration" className="text-[10px] font-black uppercase h-7 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Duration</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-8">
                        <div className="space-y-2.5">
                            <Label htmlFor="start_date" className="text-[10px] font-black uppercase text-slate-400 tracking-tighter px-1 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                Start Date
                            </Label>
                            <Input id="start_date" type="date" {...register("start_date")} className="h-11 text-sm font-bold border-slate-200 focus:border-primary rounded-xl px-4 shadow-sm bg-slate-50/30" />
                        </div>
                        
                        <div className="space-y-2.5">
                            <Label htmlFor="duration_days" className="text-[10px] font-black uppercase text-slate-400 tracking-tighter px-1 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Span (Days)
                            </Label>
                            <div className="relative">
                                <Input 
                                    id="duration_days" 
                                    type="number" 
                                    value={durationDays}
                                    onChange={(e) => handleDurationChange(parseInt(e.target.value) || 0)}
                                    className={cn(
                                        "h-11 text-sm font-bold border-slate-200 focus:border-primary rounded-xl px-4 shadow-sm transition-all", 
                                        planningMode === "dates" ? "bg-slate-100 italic text-slate-400 border-dashed" : "bg-white"
                                    )}
                                    disabled={planningMode === "dates"}
                                />
                                <div className="absolute right-3 top-3 text-[10px] font-black text-slate-300">DAYS</div>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <Label htmlFor="due_date" className="text-[10px] font-black uppercase text-slate-400 tracking-tighter px-1 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Due Date
                            </Label>
                            <Input 
                                id="due_date" 
                                type="date" 
                                {...register("due_date")} 
                                className={cn(
                                    "h-11 text-sm font-bold border-slate-200 focus:border-primary rounded-xl px-4 shadow-sm transition-all", 
                                    planningMode === "duration" ? "bg-slate-100 italic text-slate-400 border-dashed" : "bg-white"
                                )}
                                disabled={planningMode === "duration"}
                            />
                        </div>
                    </div>
                </div>

                {/* Constraints Grid */}
                <div className="grid grid-cols-2 gap-8">
                    <div className="p-6 rounded-[2rem] border border-rose-100 bg-rose-50/10 space-y-4 shadow-sm group hover:border-rose-200 transition-all">
                        <div className="flex items-center gap-3 border-b border-rose-50 pb-3">
                            <div className="p-2 bg-rose-100 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-rose-500" />
                            </div>
                            <Label htmlFor="deadline_at" className="text-[10px] font-black uppercase text-rose-500 tracking-[0.15em]">Hard Deadline</Label>
                        </div>
                        <Input id="deadline_at" type="date" {...register("deadline_at")} className="h-11 text-sm font-bold border-rose-200 bg-white focus:border-rose-400 rounded-xl px-4 shadow-sm" />
                    </div>

                    <div className="p-6 rounded-[2rem] border border-emerald-100 bg-emerald-50/10 space-y-4 shadow-sm group hover:border-emerald-200 transition-all">
                        <div className="flex items-center gap-3 border-b border-emerald-50 pb-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <CheckSquare className="w-4 h-4 text-emerald-500" />
                            </div>
                            <Label htmlFor="completed_at" className="text-[10px] font-black uppercase text-emerald-600 tracking-[0.15em]">Actual Conclusion</Label>
                        </div>
                        <Input id="completed_at" type="date" {...register("completed_at")} className="h-11 text-sm font-bold border-emerald-200 bg-white focus:border-emerald-400 rounded-xl px-4 shadow-sm" />
                    </div>
                </div>

                {/* PERT Scientific Section */}
                <div className="p-6 rounded-[2rem] border border-indigo-100 bg-indigo-50/10 space-y-6 shadow-md border-t-4 border-t-indigo-400 transition-all">
                    <div className="flex items-center justify-between border-b border-indigo-50 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-200">
                                <Calculator className="w-5 h-5" />
                            </div>
                            <div>
                                <Label className="text-sm font-black uppercase text-indigo-900 tracking-widest leading-none">PERT Estimations</Label>
                                <p className="text-[10px] text-indigo-400 mt-1 uppercase font-black">Probabilistic weighted analysis</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button 
                                type="button"
                                variant="ghost" 
                                size="sm" 
                                className="h-9 text-[10px] font-black uppercase text-indigo-600 hover:bg-white hover:shadow-sm gap-2 px-4 border border-indigo-200/50 rounded-xl bg-indigo-50 transition-all"
                                onClick={handleSuggestPERT}
                            >
                                <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> Suggest Values
                            </Button>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-indigo-300 uppercase leading-none mb-1">Calculated Te</span>
                                <div className="text-lg font-black text-indigo-700 leading-none">
                                    {expectedDuration}<span className="text-[10px] ml-0.5">DAYS</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-8 px-2">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <Label htmlFor="optimistic_days" className="text-[10px] font-black uppercase text-indigo-400 tracking-tighter">Optimistic (O)</Label>
                                <Badge variant="outline" className="h-4 text-[8px] border-indigo-100 text-indigo-400 bg-white">Best Case</Badge>
                            </div>
                            <Input 
                                id="optimistic_days" 
                                type="number" 
                                {...register("optimistic_days", { valueAsNumber: true })} 
                                className="h-11 text-base font-black text-indigo-700 border-indigo-200 bg-white focus:border-indigo-500 rounded-xl px-4 shadow-sm"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <Label htmlFor="normal_days" className="text-[10px] font-black uppercase text-indigo-400 tracking-tighter">Most Likely (M)</Label>
                                <Badge variant="outline" className="h-4 text-[8px] border-indigo-100 text-indigo-400 bg-white">Average</Badge>
                            </div>
                            <Input 
                                id="normal_days" 
                                type="number" 
                                {...register("normal_days", { valueAsNumber: true })} 
                                className="h-11 text-base font-black text-indigo-700 border-indigo-200 bg-white focus:border-indigo-500 rounded-xl px-4 shadow-sm"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <Label htmlFor="pessimistic_days" className="text-[10px] font-black uppercase text-indigo-400 tracking-tighter">Pessimistic (P)</Label>
                                <Badge variant="outline" className="h-4 text-[8px] border-indigo-100 text-indigo-400 bg-white">Worst Case</Badge>
                            </div>
                            <Input 
                                id="pessimistic_days" 
                                type="number" 
                                {...register("pessimistic_days", { valueAsNumber: true })} 
                                className="h-11 text-base font-black text-indigo-700 border-indigo-200 bg-white focus:border-indigo-500 rounded-xl px-4 shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>
          </TabsContent>

          <TabsContent value="checklist" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400 focus-visible:outline-none">
                <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md relative overflow-hidden">
                    <div className="flex items-center justify-between border-b pb-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-100">
                                <CheckSquare className="w-5 h-5" />
                            </div>
                            <div>
                                <Label className="text-sm font-black uppercase text-slate-800 tracking-widest leading-none">Execution Steps</Label>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Micro-task tracking system</p>
                            </div>
                        </div>
                        <Button 
                            type="button" 
                            size="sm" 
                            className="h-9 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-100 gap-2 font-bold text-[11px] uppercase tracking-wider"
                            onClick={() => {
                                const current = watch("checklist") || [];
                                const newId = Math.random().toString(36).substring(2, 9);
                                setValue("checklist", [...current, { id: newId, text: "", is_done: false }]);
                            }}
                        >
                            <Plus className="w-4 h-4" /> Add Action Item
                        </Button>
                    </div>
                    
                    <div className="space-y-3 max-h-[400px] overflow-auto pr-2 scrollbar-hide">
                        {(watch("checklist") || []).map((item, index) => (
                            <div key={item.id} className="flex items-center gap-4 group bg-slate-50/50 p-3 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:border-primary/20 hover:shadow-sm">
                                <div className="relative flex items-center justify-center">
                                    <input 
                                        type="checkbox"
                                        checked={item.is_done}
                                        onChange={(e) => {
                                            const current = [...(watch("checklist") || [])];
                                            current[index].is_done = e.target.checked;
                                            setValue("checklist", current);
                                        }}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-primary focus:ring-primary/20 cursor-pointer appearance-none checked:bg-primary checked:border-primary transition-all border-2"
                                    />
                                    {item.is_done && <CheckSquare className="absolute w-3.5 h-3.5 text-white pointer-events-none" />}
                                </div>
                                <Input 
                                    className={cn(
                                        "flex-1 h-9 text-sm border-none bg-transparent focus-visible:ring-0 px-0 font-medium transition-all",
                                        item.is_done ? "text-slate-400 line-through decoration-2" : "text-slate-700"
                                    )}
                                    placeholder="Define sub-step activity..."
                                    value={item.text}
                                    onChange={(e) => {
                                        const current = [...(watch("checklist") || [])];
                                        current[index].text = e.target.value;
                                        setValue("checklist", current);
                                    }}
                                />
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const current = [...(watch("checklist") || [])];
                                        setValue("checklist", current.filter((_, i) => i !== index));
                                    }}
                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {(watch("checklist") || []).length === 0 && (
                            <div className="py-16 text-center border-2 border-dashed rounded-[2rem] border-slate-100 flex flex-col items-center gap-4 grayscale opacity-40">
                                <div className="p-4 bg-slate-50 rounded-full">
                                    <CheckSquare className="w-10 h-10 text-slate-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-black uppercase text-slate-400 tracking-widest">No Action Items</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Break down this task into smaller chunks for better progress.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400 focus-visible:outline-none">
            <div className="grid grid-cols-2 gap-8">
                {/* Risk Section */}
                <div className="p-8 rounded-[2.5rem] border border-amber-200 bg-amber-50/10 space-y-8 shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <AlertCircle className="w-24 h-24 text-amber-900" />
                    </div>
                    
                    <div className="flex items-center gap-4 border-b border-amber-100 pb-4">
                        <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-200">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black uppercase text-amber-900 tracking-widest leading-none">Risk Profile</h4>
                            <p className="text-[10px] text-amber-600 mt-1 font-black uppercase">Probability x Impact</p>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-[11px] text-amber-900 uppercase font-black tracking-widest">Probability</Label>
                                <span className="text-sm font-black bg-white px-3 py-1 rounded-xl border-2 border-amber-200 text-amber-700 shadow-sm">{watch("risk_probability")} / 5</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" max="5" 
                                className="w-full h-2 bg-amber-200 rounded-full appearance-none cursor-pointer accent-amber-600 shadow-inner"
                                {...register("risk_probability", { valueAsNumber: true })}
                            />
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-[11px] text-amber-900 uppercase font-black tracking-widest">Severity / Impact</Label>
                                <span className="text-sm font-black bg-white px-3 py-1 rounded-xl border-2 border-amber-200 text-amber-700 shadow-sm">{watch("risk_impact")} / 5</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" max="5" 
                                className="w-full h-2 bg-amber-200 rounded-full appearance-none cursor-pointer accent-amber-600 shadow-inner"
                                {...register("risk_impact", { valueAsNumber: true })}
                            />
                        </div>
                    </div>
                    
                    <div className="p-4 bg-amber-900 text-white rounded-2xl flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest">Exposure Score</span>
                        <span className="text-xl font-black">{(watch("risk_probability") || 0) * (watch("risk_impact") || 0)}</span>
                    </div>
                </div>

                {/* Financials Section */}
                <div className="p-8 rounded-[2.5rem] border border-blue-200 bg-blue-50/10 space-y-8 shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Database className="w-24 h-24 text-blue-900" />
                    </div>

                    <div className="flex items-center gap-4 border-b border-blue-100 pb-4">
                        <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black uppercase text-blue-900 tracking-widest leading-none">Resource Cost</h4>
                            <p className="text-[10px] text-blue-600 mt-1 font-black uppercase">Financial auditing</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2.5">
                            <Label className="text-[11px] text-blue-900 uppercase font-black tracking-widest px-1">Planned Budget</Label>
                            <div className="relative">
                                <Input 
                                    type="number" 
                                    step="0.01"
                                    {...register("budget", { valueAsNumber: true })}
                                    className="h-12 text-lg font-black border-blue-200 bg-white focus:border-blue-500 rounded-2xl px-10 shadow-sm transition-all"
                                />
                                <div className="absolute left-4 top-3.5 text-blue-400 font-bold">$</div>
                            </div>
                        </div>
                        <div className="space-y-2.5">
                            <Label className="text-[11px] text-blue-900 uppercase font-black tracking-widest px-1">Actual Expenditure</Label>
                            <div className="relative">
                                <Input 
                                    type="number" 
                                    step="0.01"
                                    {...register("real_cost", { valueAsNumber: true })}
                                    className="h-12 text-lg font-black border-blue-200 bg-white focus:border-blue-500 rounded-2xl px-10 shadow-sm transition-all"
                                />
                                <div className="absolute left-4 top-3.5 text-blue-400 font-bold">$</div>
                            </div>
                        </div>
                    </div>

                    <div className={cn(
                        "p-4 rounded-2xl flex items-center justify-between border-2 transition-all",
                        (watch("real_cost") || 0) > (watch("budget") || 0) 
                            ? "bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-200" 
                            : "bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200"
                    )}>
                        <span className="text-[10px] font-black uppercase tracking-widest">Variance</span>
                        <span className="text-xl font-black">
                            {(watch("budget") || 0) - (watch("real_cost") || 0) >= 0 ? "+" : "-"}$
                            {Math.abs((watch("budget") || 0) - (watch("real_cost") || 0)).toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
          </TabsContent>

          <TabsContent value="dependencies" className="animate-in fade-in slide-in-from-bottom-2 duration-400 focus-visible:outline-none">
            <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md">
                <div className="flex items-center gap-3 border-b pb-4 mb-2">
                    <div className="p-2 bg-slate-900 text-white rounded-lg">
                        <LinkIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <Label className="text-sm font-black uppercase text-slate-800 tracking-widest leading-none">Chain of Command</Label>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Successor & Predecessor logic</p>
                    </div>
                </div>

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
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 border border-dashed rounded-[2rem] bg-slate-50 grayscale">
                    <LinkIcon className="w-12 h-12 opacity-10" />
                    <div className="text-center">
                        <p className="text-sm font-black uppercase tracking-widest">Network Locked</p>
                        <p className="text-[10px] mt-1 font-medium">Dependencies can be defined once the task object is initialized.</p>
                    </div>
                    </div>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex justify-end gap-3 pt-6 mt-4 border-t sticky bottom-0 bg-white/90 backdrop-blur-md z-50 -mx-1">
        <Button 
            type="button" 
            variant="ghost" 
            className="px-8 h-12 rounded-xl text-slate-500 font-bold uppercase text-xs tracking-widest hover:bg-slate-50"
            onClick={onCancel}
        >
          Cancel
        </Button>
        <Button 
            type="submit" 
            disabled={isLoading}
            className="px-10 h-12 rounded-xl bg-primary text-primary-foreground font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authorize & Save"}
        </Button>
      </div>
    </form>
  );
}
