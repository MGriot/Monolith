import { useEffect, useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { AlertCircle, CalendarDays } from "lucide-react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichDropdown, type RichDropdownItem } from "@/components/ui/rich-dropdown";
import { AssigneeSelector } from "@/components/assignee-selector";
import { Section } from "@/components/ui/section";
import { Field, selectClass } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { EntityEditor, EditorTitle, RailGroup, RiskCostPanel, type EditorTab } from "@/components/entity-editor";
import type { Topic, WorkType, Project } from "@/types";
import { toDateInputValue } from "@/lib/dates";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  topic_ids: z.array(z.string()).optional(),
  type_ids: z.array(z.string()).optional(),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  deadline_at: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  member_ids: z.array(z.string()).optional(),
  budget: z.number().optional(),
  real_cost: z.number().optional(),
  risk_probability: z.number().min(1).max(5).optional(),
  risk_impact: z.number().min(1).max(5).optional(),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  initialValues?: Partial<Project> & { topic_ids?: string[], type_ids?: string[], member_ids?: string[] };
  onSubmit: (data: ProjectFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  projectId?: string;
  /** dialog: inside a 2xl DialogContent; page: inline in project settings, with a save bar while dirty */
  variant?: "dialog" | "page";
  footerStart?: ReactNode;
  submitLabel?: string;
}

/** Two-pane project editor, built on the same EntityEditor as the task editor. */
export default function ProjectForm({
  initialValues,
  onSubmit,
  onCancel,
  isLoading,
  projectId,
  variant = "dialog",
  footerStart,
  submitLabel,
}: ProjectFormProps) {
  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ['metadata', 'topics', projectId],
    queryFn: async () => (await api.get('/metadata/topics', {
      params: { project_id: projectId, include_global: true }
    })).data as Topic[],
  });

  const { data: workTypes, isLoading: typesLoading } = useQuery({
    queryKey: ['metadata', 'work-types', projectId],
    queryFn: async () => (await api.get('/metadata/work-types', {
      params: { project_id: projectId, include_global: true }
    })).data as WorkType[],
  });

  const processedInitialValues: ProjectFormValues = useMemo(() => {
    const v = initialValues || {};
    return {
      name: v.name || "",
      description: v.description || "",
      status: v.status || "Todo",
      priority: v.priority || "Medium",
      topic_ids: v.topic_ids || v.topics?.map(t => t.id) || [],
      type_ids: v.type_ids || v.types?.map(t => t.id) || [],
      member_ids: v.member_ids || v.members?.map(m => m.id) || [],
      start_date: toDateInputValue(v.start_date),
      due_date: toDateInputValue(v.due_date),
      deadline_at: toDateInputValue(v.deadline_at),
      tags: Array.isArray(v.tags) ? v.tags : [],
      budget: v.budget || 0,
      real_cost: v.real_cost || 0,
      risk_probability: v.risk_probability || 1,
      risk_impact: v.risk_impact || 1,
    };
  }, [initialValues]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: processedInitialValues,
  });

  // On the settings page the project refetches after a save: take the saved values as the new clean state.
  const snapshot = JSON.stringify(processedInitialValues);
  useEffect(() => {
    if (variant === "page") reset(JSON.parse(snapshot));
  }, [snapshot, variant, reset]);

  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedMemberIds = watch("member_ids") || [];
  const startDate = watch("start_date");
  const dueDate = watch("due_date");
  const deadline = watch("deadline_at");
  const dueAfterDeadline = !!(dueDate && deadline && dueDate > deadline);

  const toggleItem = (field: "topic_ids" | "type_ids" | "member_ids", id: string) => {
    const current = watch(field) || [];
    setValue(field, current.includes(id) ? current.filter(x => x !== id) : [...current, id], { shouldDirty: true });
  };

  const removeItem = (field: "topic_ids" | "type_ids" | "member_ids", id: string) => {
    setValue(field, (watch(field) || []).filter(item => item !== id), { shouldDirty: true });
  };

  const topicItems: RichDropdownItem[] = useMemo(() =>
    topics?.map((t) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [topics]);

  const typeItems: RichDropdownItem[] = useMemo(() =>
    workTypes?.map((t) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [workTypes]);

  const spanDays = useMemo(() => {
    if (!startDate || !dueDate) return null;
    const d = differenceInCalendarDays(parseISO(dueDate), parseISO(startDate));
    return isNaN(d) ? null : d + 1;
  }, [startDate, dueDate]);

  const tabs: EditorTab[] = [
    {
      value: "timeline",
      label: "Timeline",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      content: (
        <Section
          icon={<CalendarDays className="h-4 w-4" />}
          title="Schedule"
          description="Tasks without their own dates fall back to this window."
          actions={spanDays !== null && (
            <div className="text-right leading-none">
              <div className="text-[11px] text-muted-foreground">Span</div>
              <div className={spanDays < 1 ? "text-base font-semibold tabular-nums text-danger" : "text-base font-semibold tabular-nums"}>
                {spanDays}<span className="ml-0.5 text-xs font-normal text-muted-foreground">d</span>
              </div>
            </div>
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start date" htmlFor="project_start_date">
              <Input id="project_start_date" type="date" className="h-9" {...register("start_date")} />
            </Field>
            <Field
              label="Due date"
              htmlFor="project_due_date"
              error={spanDays !== null && spanDays < 1 ? "Due date is before the start date" : undefined}
            >
              <Input id="project_due_date" type="date" className="h-9" {...register("due_date")} />
            </Field>
            <Field
              label="Hard deadline"
              htmlFor="project_deadline_at"
              error={dueAfterDeadline ? "Planned due date is after the deadline" : undefined}
            >
              <Input id="project_deadline_at" type="date" className="h-9" {...register("deadline_at")} />
            </Field>
          </div>
        </Section>
      ),
    },
    {
      value: "risk",
      label: "Budget & risk",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      content: (
        <RiskCostPanel
          idPrefix="project_"
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
  ];

  const rail = (
    <>
      <RailGroup title="Properties">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="project_status">
            <select id="project_status" className={selectClass} {...register("status")}>
              <option value="Backlog">Backlog</option>
              <option value="Todo">Todo</option>
              <option value="In Progress">In Progress</option>
              <option value="On hold">On Hold</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>
          </Field>
          <Field label="Priority" htmlFor="project_priority">
            <select id="project_priority" className={selectClass} {...register("priority")}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </Field>
        </div>
      </RailGroup>

      <RailGroup title="People">
        <AssigneeSelector
          label="Members"
          selectedValues={selectedMemberIds}
          onSelect={(id) => toggleItem("member_ids", id)}
          onRemove={(id) => removeItem("member_ids", id)}
          placeholder="Add members"
        />
        <p className="text-[11px] text-fg-faint">Members can open this project and see all of its tasks.</p>
      </RailGroup>

      <RailGroup title="Classification">
        <Field label="Topics">
          <RichDropdown
            items={topicItems}
            selectedValues={selectedTopicIds}
            onSelect={(id) => toggleItem("topic_ids", id)}
            onRemove={(id) => removeItem("topic_ids", id)}
            multi={true}
            isLoading={topicsLoading}
            placeholder="Add topics..."
            searchPlaceholder="Search topics..."
          />
        </Field>
        <Field label="Work types">
          <RichDropdown
            items={typeItems}
            selectedValues={selectedTypeIds}
            onSelect={(id) => toggleItem("type_ids", id)}
            onRemove={(id) => removeItem("type_ids", id)}
            multi={true}
            isLoading={typesLoading}
            placeholder="Add types..."
            searchPlaceholder="Search types..."
          />
        </Field>
        <Field label="Tags" htmlFor="project_tags" hint="Enter or comma adds a tag">
          <TagInput
            id="project_tags"
            value={watch("tags") || []}
            onChange={(tags) => setValue("tags", tags, { shouldDirty: true })}
            placeholder="critical, web…"
          />
        </Field>
      </RailGroup>
    </>
  );

  return (
    <EntityEditor
      variant={variant}
      isDirty={isDirty}
      onSubmit={handleSubmit(onSubmit)}
      main={
        <>
          <EditorTitle id="name" placeholder="Project name" registration={register("name")} error={errors.name?.message} />
          <div>
            <Label htmlFor="project_description" className="sr-only">Description</Label>
            <Textarea
              id="project_description"
              rows={3}
              className="max-h-48 min-h-[72px] resize-y text-sm leading-relaxed"
              placeholder="Goals, scope and context (Markdown supported)..."
              {...register("description")}
            />
          </div>
        </>
      }
      rail={rail}
      tabs={tabs}
      footerStart={footerStart}
      onCancel={variant === "page" ? () => reset(processedInitialValues) : onCancel}
      submitLabel={submitLabel ?? (variant === "page" ? "Save changes" : "Create project")}
      isSubmitting={isLoading}
    />
  );
}
