import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
    Milestone, 
    Calculator, 
    CalendarDays, 
    Link as LinkIcon,
    Plus,
    Sparkles,
    X,
    CheckSquare,
    AlertCircle,
    Timer,
    SlidersHorizontal,
    Repeat
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RichDropdown, type RichDropdownItem } from "@/components/ui/rich-dropdown";
import { AssigneeSelector } from "@/components/assignee-selector";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import DependencyManager from "./dependency-manager";
import { EntityEditor, EditorTitle, RailGroup, RiskCostPanel, type EditorTab } from "@/components/entity-editor";
import { Section } from "@/components/ui/section";
import { Field, selectClass } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import TaskTimeTracker from "./task-time-tracker";
import TaskCustomFields, { useCustomFieldDefs } from "./task-custom-fields";
import { RecurrenceField } from "./recurrence-field";
import { sanitizeCustomValues, validateCustomValues, type CustomValues } from "@/lib/custom-fields";
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
  custom_values: z.record(z.string(), z.any()).optional(),
  recurrence_rule: z.string().nullable().optional(),
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
  /** extra sections (attachments, activity, ...) shown as tabs after the built-in ones */
  extraTabs?: TaskFormTab[];
  /** left side of the footer, e.g. created/modified info and archive/delete actions */
  footerStart?: ReactNode;
  submitLabel?: string;
}

export type TaskFormTab = EditorTab;

/**
 * Two-pane task editor meant to fill a DialogContent (see TaskDialog): title, description and
 * tabbed sections on the left, a properties rail on the right, a fixed footer.
 */

export default function TaskForm({ 
  initialValues, 
  taskObject,
  onSubmit, 
  onCancel, 
  isLoading, 
  allTasks, 
  editingTaskId, 
  projectId,
  extraTabs,
  footerStart,
  submitLabel
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

  const { data: customFieldDefs } = useCustomFieldDefs(projectId);

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
      custom_values: taskObject?.custom_values ?? {},
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
  }, [initialValues, taskObject?.custom_values]);

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

  // Sync form state when the initial values change (essential for Dialog reuse). Callers pass a fresh object literal
  // on every render, so compare by content: resetting on identity wiped what the user was typing whenever a
  // background refetch re-rendered the parent.
  const initialValuesKey = JSON.stringify(processedInitialValues);
  const lastInitialValuesKey = useRef(initialValuesKey);
  useEffect(() => {
    if (lastInitialValuesKey.current === initialValuesKey) return;
    lastInitialValuesKey.current = initialValuesKey;
    reset(processedInitialValues);
  }, [initialValuesKey, processedInitialValues, reset]);

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
    // Drop values whose field was deleted or that are invalid, so the API doesn't reject the whole task
    const customDefs = customFieldDefs ?? [];
    if (Object.keys(validateCustomValues(customDefs, data.custom_values)).length > 0) {
      toast.error("Fix the highlighted custom fields first");
      return;
    }
    const cleanedData = {
      ...data,
      ...(projectId && customFieldDefs ? { custom_values: sanitizeCustomValues(customDefs, data.custom_values) } : { custom_values: undefined }),
      parent_id: data.parent_id === "" ? null : data.parent_id,
      color: data.color === "" ? null : data.color,
      description: data.description === "" ? null : data.description,
      recurrence_rule: data.recurrence_rule || null,
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

    // minStart/maxDue are assigned inside the traverse() closure, so TS narrows them to `never` here.
    const syncedStart = minStart as Date | null;
    const syncedDue = maxDue as Date | null;
    if (syncedStart && !isNaN(syncedStart.getTime())) {
        setValue("start_date", format(syncedStart, "yyyy-MM-dd"));
    }
    if (syncedDue && !isNaN(syncedDue.getTime())) {
        setValue("due_date", format(syncedDue, "yyyy-MM-dd"));
    }
    
    toast.success("Dates synced from all descendants");
  };

  const availableParents = getAvailableParents();

  const checklist = watch("checklist") || [];
  const dependencyCount = (taskObject?.blocked_by?.length || 0) + (taskObject?.blocking?.length || 0);

  const tabs: EditorTab[] = [
    {
      value: "scheduling",
      label: "Timeline",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      content: (
        <>
          <Section
            icon={<CalendarDays className="h-4 w-4" />}
            title="Schedule"
            actions={
              <div className="flex items-center gap-2">
                {taskObject?.subtasks && taskObject.subtasks.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSyncFromChildren}>
                    <Plus className="h-3.5 w-3.5" /> Roll-up dates
                  </Button>
                )}
                <Tabs value={planningMode} onValueChange={(v) => setPlanningMode(v as "dates" | "duration")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="dates" className="h-6 px-3 text-xs">Dates</TabsTrigger>
                    <TabsTrigger value="duration" className="h-6 px-3 text-xs">Duration</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start date" htmlFor="start_date">
                <Input id="start_date" type="date" className="h-9" {...register("start_date")} />
              </Field>
              <Field label="Duration (days)" htmlFor="duration_days">
                <Input
                  id="duration_days"
                  type="number"
                  className={cn("h-9", planningMode === "dates" && "border-dashed bg-muted text-fg-faint")}
                  value={durationDays}
                  onChange={(e) => handleDurationChange(parseInt(e.target.value) || 0)}
                  disabled={planningMode === "dates"}
                />
              </Field>
              <Field label="Due date" htmlFor="due_date">
                <Input
                  id="due_date"
                  type="date"
                  className={cn("h-9", planningMode === "duration" && "border-dashed bg-muted text-fg-faint")}
                  {...register("due_date")}
                  disabled={planningMode === "duration"}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hard deadline" htmlFor="deadline_at" hint="Late if not done by this day">
                <Input id="deadline_at" type="date" className="h-9" {...register("deadline_at")} />
              </Field>
              <Field label="Actually completed" htmlFor="completed_at">
                <Input id="completed_at" type="date" className="h-9" {...register("completed_at")} />
              </Field>
            </div>
          </Section>

          <Section icon={<Repeat className="h-4 w-4" />} title="Repeat">
            <RecurrenceField value={watch("recurrence_rule")} onChange={(rule) => setValue("recurrence_rule", rule, { shouldDirty: true })} />
          </Section>

          <Section
            icon={<Calculator className="h-4 w-4" />}
            title="PERT estimate"
            description="Weighted from optimistic, most likely and pessimistic durations."
            actions={
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSuggestPERT}>
                  <Sparkles className="h-3.5 w-3.5 text-review" /> Suggest
                </Button>
                <div className="text-right leading-none">
                  <div className="text-[11px] text-muted-foreground">Expected</div>
                  <div className="text-base font-semibold tabular-nums">{expectedDuration}<span className="ml-0.5 text-xs font-normal text-muted-foreground">d</span></div>
                </div>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Optimistic" htmlFor="optimistic_days">
                <Input id="optimistic_days" type="number" className="h-9" {...register("optimistic_days", { valueAsNumber: true })} />
              </Field>
              <Field label="Most likely" htmlFor="normal_days">
                <Input id="normal_days" type="number" className="h-9" {...register("normal_days", { valueAsNumber: true })} />
              </Field>
              <Field label="Pessimistic" htmlFor="pessimistic_days">
                <Input id="pessimistic_days" type="number" className="h-9" {...register("pessimistic_days", { valueAsNumber: true })} />
              </Field>
            </div>
          </Section>
        </>
      ),
    },
    {
      value: "checklist",
      label: "Checklist",
      icon: <CheckSquare className="h-3.5 w-3.5" />,
      badge: checklist.length > 0 ? `${checklist.filter(c => c.is_done).length}/${checklist.length}` : undefined,
      content: (
        <Section
          icon={<CheckSquare className="h-4 w-4" />}
          title="Checklist"
          actions={
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                const newId = Math.random().toString(36).substring(2, 9);
                setValue("checklist", [...checklist, { id: newId, text: "", is_done: false }]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
          }
        >
          <div className="space-y-1.5">
            {checklist.map((item, index) => (
              <div key={item.id} className="group flex items-center gap-3 rounded-md border bg-background px-3 py-1.5">
                <input
                  type="checkbox"
                  aria-label={`Done: ${item.text || 'item'}`}
                  checked={item.is_done}
                  onChange={(e) => {
                    const current = [...checklist];
                    current[index].is_done = e.target.checked;
                    setValue("checklist", current);
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                />
                <Input
                  className={cn(
                    "h-8 flex-1 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0",
                    item.is_done && "text-fg-faint line-through"
                  )}
                  placeholder="Describe the step..."
                  value={item.text}
                  onChange={(e) => {
                    const current = [...checklist];
                    current[index].text = e.target.value;
                    setValue("checklist", current);
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => setValue("checklist", checklist.filter((_, i) => i !== index))}
                  className="rounded p-1 text-fg-ghost opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {checklist.length === 0 && (
              <EmptyState icon={<CheckSquare />} title="No checklist items" text="Break the task into smaller steps to track progress." />
            )}
          </div>
        </Section>
      ),
    },
    {
      value: "risk",
      label: "Risk & cost",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      content: (
        <RiskCostPanel
          probability={watch("risk_probability")}
          impact={watch("risk_impact")}
          budget={watch("budget") || 0}
          realCost={watch("real_cost") || 0}
          fields={{
            probability: register("risk_probability", { valueAsNumber: true }),
            impact: register("risk_impact", { valueAsNumber: true }),
            budget: register("budget", { valueAsNumber: true }),
            realCost: register("real_cost", { valueAsNumber: true }),
          }}
        />
      ),
    },
    {
      value: "dependencies",
      label: "Dependencies",
      icon: <LinkIcon className="h-3.5 w-3.5" />,
      badge: dependencyCount || undefined,
      disabled: !editingTaskId,
      disabledReason: "Save the task first",
      content: (
        <Section icon={<LinkIcon className="h-4 w-4" />} title="Dependencies" description="Tasks this one waits for, and tasks waiting for it.">
          {editingTaskId && taskObject ? (
            <DependencyManager
              item={taskObject}
              allPossibleBlockers={(() => {
                const flat: Task[] = [];
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
          ) : (
            <EmptyState icon={<LinkIcon />} title="Save the task first" text="Dependencies can be added once the task exists." />
          )}
        </Section>
      ),
    },
    {
      value: "time",
      label: "Time",
      icon: <Timer className="h-3.5 w-3.5" />,
      disabled: !editingTaskId,
      disabledReason: "Save the task first",
      content: editingTaskId ? <TaskTimeTracker taskId={editingTaskId} /> : null,
    },
    {
      value: "fields",
      label: "Fields",
      icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
      disabled: !projectId,
      disabledReason: "Only for tasks in a project",
      content: (
        <TaskCustomFields
          projectId={projectId}
          values={(watch("custom_values") || {}) as CustomValues}
          onChange={(values) => setValue("custom_values", values, { shouldDirty: true })}
        />
      ),
    },
    ...(extraTabs || []),
  ];

  const rail = (
    <>
      <RailGroup title="Properties">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="status">
            <select id="status" className={selectClass} {...register("status")}>
              <option value="Backlog">Backlog</option>
              <option value="Todo">Todo</option>
              <option value="In Progress">In Progress</option>
              <option value="On hold">On Hold</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>
          </Field>
          <Field label="Priority" htmlFor="priority">
            <select id="priority" className={selectClass} {...register("priority")}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </Field>
        </div>
        <Field label="Parent (WBS)" htmlFor="parent_id">
          <select
            id="parent_id"
            className={selectClass}
            value={selectedParentId || ""}
            onChange={(e) => setValue("parent_id", e.target.value || null)}
          >
            <option value="">None (root task)</option>
            {availableParents.map(p => (
              <option key={p.id} value={p.id}>
                {p.wbs_code ? `${p.wbs_code} ` : ""}{"  ".repeat(p.level)}{p.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <Label htmlFor="is_milestone" className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Milestone className="h-4 w-4 text-info" />
            Milestone
          </Label>
          <Switch
            id="is_milestone"
            checked={watch("is_milestone")}
            onCheckedChange={(checked) => setValue("is_milestone", checked)}
          />
        </div>
      </RailGroup>

      <RailGroup title="People">
        <AssigneeSelector
          label="Assignees"
          selectedValues={selectedAssignees}
          onSelect={(id) => toggleItem("assignee_ids", id)}
          onRemove={(id) => removeItem("assignee_ids", id)}
          placeholder="Assign someone"
        />
      </RailGroup>

      <RailGroup title="Classification">
        <Field label="Topics">
          <RichDropdown
            items={topicItems}
            selectedValues={selectedTopicIds}
            onSelect={(id) => toggleItem("topic_ids", id)}
            onRemove={(id) => removeItem("topic_ids", id)}
            onCreate={projectId ? (name) => createTopicMutation.mutate(name) : undefined}
            multi={true}
            isLoading={isLoadingTopics}
            placeholder="Add topics..."
            searchPlaceholder="Search topics..."
          />
        </Field>
        <Field label="Work type">
          <RichDropdown
            items={typeItems}
            selectedValues={selectedTypeIds}
            onSelect={(id) => toggleItem("type_ids", id)}
            onRemove={(id) => removeItem("type_ids", id)}
            onCreate={projectId ? (name) => createWorkTypeMutation.mutate(name) : undefined}
            multi={true}
            isLoading={isLoadingTypes}
            placeholder="Add types..."
            searchPlaceholder="Search types..."
          />
        </Field>
      </RailGroup>

      <RailGroup title="Appearance">
        <Field label="Gantt colour">
          <ColorSwatchPicker value={selectedColor} onChange={(c) => setValue("color", c)} size="sm" />
        </Field>
      </RailGroup>
    </>
  );

  return (
    <EntityEditor
      onSubmit={handleSubmit(handleFormSubmit)}
      main={
        <>
          <EditorTitle id="title" placeholder="Task title" registration={register("title")} error={errors.title?.message} />
          <div>
            <Label htmlFor="description" className="sr-only">Description</Label>
            <Textarea
              id="description"
              rows={3}
              className="max-h-48 min-h-[72px] resize-y text-sm leading-relaxed"
              placeholder="Add a description, scope or context..."
              {...register("description")}
            />
          </div>
        </>
      }
      rail={rail}
      tabs={tabs}
      defaultTab="scheduling"
      footerStart={footerStart}
      onCancel={onCancel}
      submitLabel={submitLabel ?? (editingTaskId ? "Save changes" : "Create task")}
      isSubmitting={isLoading}
    />
  );
}
