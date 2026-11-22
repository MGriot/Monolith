import { toast } from "sonner";
import type { TaskFormValues } from "@/components/task-form";
import type { Task } from "@/types";

/**
 * register() options for a number input. `valueAsNumber` turns a cleared input into NaN, which fails the schema and
 * blocks the whole save without a visible message (the field often sits on another tab); a blank becomes `fallback`.
 */
export const numberField = (fallback?: number) => ({
  setValueAs: (v: unknown) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  },
});

/** handleSubmit's invalid callback: name the fields that stopped the save, wherever they are in the editor. */
export function reportInvalidFields(errors: Record<string, { message?: unknown } | undefined>) {
  const names = Object.keys(errors).map((k) => k.replace(/_/g, " "));
  if (names.length === 0) return;
  toast.error("Not saved: check the highlighted fields", { description: names.join(", ") });
}

/**
 * A stored task -> the edit form's initial values. Every field the form can save must be here: a field left out
 * starts at the form default (0 budget, empty checklist, no recurrence...) and the next save overwrites the stored
 * value with it.
 */
export function taskFormValues(task: Task): Partial<TaskFormValues> {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    topic_ids: task.topic_ids || task.topics?.map((t) => t.id) || [],
    type_ids: task.type_ids || task.types?.map((t) => t.id) || [],
    is_milestone: task.is_milestone ?? false,
    start_date: task.start_date || '',
    due_date: task.due_date || '',
    deadline_at: task.deadline_at || '',
    completed_at: task.completed_at || '',
    assignee_ids: task.assignees?.map((u) => u.id) || task.assignee_ids || [],
    parent_id: task.parent_id ?? null,
    color: task.color ?? null,
    optimistic_days: task.optimistic_days ?? 0,
    normal_days: task.normal_days ?? 0,
    pessimistic_days: task.pessimistic_days ?? 0,
    duration_days: task.duration_days ?? 0,
    budget: task.budget ?? 0,
    real_cost: task.real_cost ?? 0,
    risk_probability: task.risk_probability ?? 1,
    risk_impact: task.risk_impact ?? 1,
    // Items written by the API/MCP may lack an id or use another text key; the form needs both
    checklist: (task.checklist || []).map((item, i) => ({
      id: String(item.id ?? `item-${i}`),
      text: String(item.text ?? (item as { content?: string }).content ?? ''),
      is_done: !!item.is_done,
    })),
    recurrence_rule: task.recurrence_rule ?? null,
  };
}
