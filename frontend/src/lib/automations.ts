// Pure helpers for the project automation rules form (no React, no network): the catalog of triggers /
// conditions / actions, draft handling, client-side validation that mirrors the API, and plain-language summaries.

export const TRIGGERS = [
  { value: 'task_created', label: 'A task is created' },
  { value: 'status_changed', label: 'A task changes status' },
  { value: 'assigned', label: 'A task gets assigned' },
  { value: 'task_completed', label: 'A task is completed' },
  { value: 'due_soon', label: 'A task is due within 48 hours (checked daily, 07:00 UTC)' },
] as const;
export type Trigger = (typeof TRIGGERS)[number]['value'];

export const STATUSES = ['Backlog', 'Todo', 'In Progress', 'On hold', 'Review', 'Done'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export type ConditionOp = 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'is_set' | 'is_empty';
export type ConditionField = 'status' | 'old_status' | 'priority' | 'assignee' | 'title' | 'tags' | 'is_milestone' | 'due_date';

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  value?: string | boolean | string[];
}

export type Action =
  | { type: 'set_field'; field: 'status' | 'priority' | 'assignee'; value: string | null }
  | { type: 'assign_user'; user_id: string }
  | { type: 'notify'; to: 'assignees' | 'owner' | 'user'; user_id?: string; message: string; email: boolean }
  | { type: 'call_webhook'; webhook_id: string };

export interface RuleDraft {
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

export interface Rule extends RuleDraft {
  id: string;
  project_id: string;
}

export interface RuleRun {
  id: string;
  rule_id: string;
  task_id: string | null;
  status: 'ok' | 'error';
  message: string | null;
  ran_at: string;
}

export const MAX_CONDITIONS = 10;
export const MAX_ACTIONS = 10;

export const CONDITION_FIELDS: { value: ConditionField; label: string; ops: ConditionOp[]; onlyFor?: Trigger }[] = [
  { value: 'status', label: 'Status', ops: ['eq', 'neq', 'in', 'not_in'] },
  { value: 'old_status', label: 'Previous status', ops: ['eq', 'neq', 'in', 'not_in'], onlyFor: 'status_changed' },
  { value: 'priority', label: 'Priority', ops: ['eq', 'neq', 'in', 'not_in'] },
  { value: 'assignee', label: 'Assignee', ops: ['eq', 'neq', 'is_set', 'is_empty'] },
  { value: 'title', label: 'Title', ops: ['contains', 'eq'] },
  { value: 'tags', label: 'Tags', ops: ['contains', 'is_set', 'is_empty'] },
  { value: 'is_milestone', label: 'Milestone', ops: ['eq'] },
  { value: 'due_date', label: 'Due date', ops: ['is_set', 'is_empty'] },
];

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is any of',
  not_in: 'is none of',
  contains: 'contains',
  is_set: 'is set',
  is_empty: 'is empty',
};

export const ACTION_TYPES = [
  { value: 'set_field', label: 'Change a field' },
  { value: 'assign_user', label: 'Assign a user' },
  { value: 'notify', label: 'Send a notification' },
  { value: 'call_webhook', label: 'Call a webhook' },
] as const;

export const MESSAGE_PLACEHOLDERS = ['{task_title}', '{status}', '{priority}', '{project}'];

export const fieldsFor = (trigger: Trigger) => CONDITION_FIELDS.filter((f) => !f.onlyFor || f.onlyFor === trigger);
export const opsFor = (field: ConditionField): ConditionOp[] => CONDITION_FIELDS.find((f) => f.value === field)?.ops ?? ['eq'];
export const isMultiOp = (op: ConditionOp) => op === 'in' || op === 'not_in';
export const needsValue = (op: ConditionOp) => op !== 'is_set' && op !== 'is_empty';

export function emptyRule(): RuleDraft {
  return { name: '', enabled: true, trigger: 'status_changed', conditions: [], actions: [blankAction('notify')] };
}

function defaultValue(field: ConditionField, op: ConditionOp): string | boolean | string[] {
  if (field === 'is_milestone') return true;
  const first = field === 'status' || field === 'old_status' ? STATUSES[1] : field === 'priority' ? PRIORITIES[2] : '';
  return isMultiOp(op) ? (first ? [first] : []) : first;
}

export function blankCondition(field: ConditionField = 'status'): Condition {
  const op = opsFor(field)[0];
  return { field, op, ...(needsValue(op) ? { value: defaultValue(field, op) } : {}) };
}

/** Switching the field starts the condition over (the old value rarely makes sense for another field). */
export function changeConditionField(c: Condition, field: ConditionField): Condition {
  return c.field === field ? c : blankCondition(field);
}

/** Switching the operator keeps the value where it still fits (single <-> list), drops it for is set / is empty. */
export function changeConditionOp(c: Condition, op: ConditionOp): Condition {
  if (!needsValue(op)) return { field: c.field, op };
  const current = c.value;
  if (isMultiOp(op)) {
    return { ...c, op, value: Array.isArray(current) ? current : current === undefined || current === '' ? [] : [String(current)] };
  }
  return { ...c, op, value: Array.isArray(current) ? (current[0] ?? '') : (current ?? defaultValue(c.field, op)) };
}

export function blankAction(type: Action['type']): Action {
  switch (type) {
    case 'set_field':
      return { type, field: 'priority', value: 'High' };
    case 'assign_user':
      return { type, user_id: '' };
    case 'notify':
      return { type, to: 'assignees', message: '{task_title} needs attention', email: true };
    default:
      return { type, webhook_id: '' };
  }
}

export function setFieldAction(field: 'status' | 'priority' | 'assignee'): Action {
  return { type: 'set_field', field, value: field === 'status' ? 'In Progress' : field === 'priority' ? 'High' : null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function conditionError(c: Condition, trigger: Trigger): string | null {
  if (!fieldsFor(trigger).some((f) => f.value === c.field)) return `"${c.field}" is not available for this trigger`;
  if (!opsFor(c.field).includes(c.op)) return `"${OP_LABELS[c.op]}" does not work with ${c.field}`;
  if (!needsValue(c.op)) return null;
  if (isMultiOp(c.op)) return Array.isArray(c.value) && c.value.length > 0 ? null : 'Pick at least one value for each condition';
  if (c.field === 'is_milestone') return typeof c.value === 'boolean' ? null : 'Choose yes or no';
  if (c.field === 'assignee') return typeof c.value === 'string' && UUID_RE.test(c.value) ? null : 'Pick a person for the assignee condition';
  return typeof c.value === 'string' && c.value.trim() ? null : 'Fill in every condition';
}

function actionError(a: Action): string | null {
  switch (a.type) {
    case 'set_field':
      if (a.field === 'assignee') return a.value === null || UUID_RE.test(a.value) ? null : 'Pick who to assign';
      return a.value ? null : `Pick a ${a.field}`;
    case 'assign_user':
      return UUID_RE.test(a.user_id) ? null : 'Pick the user to assign';
    case 'notify':
      if (!a.message.trim()) return 'Write the notification message';
      if (a.message.length > 500) return 'The message is limited to 500 characters';
      return a.to === 'user' && !UUID_RE.test(a.user_id ?? '') ? 'Pick who to notify' : null;
    default:
      return UUID_RE.test(a.webhook_id) ? null : 'Pick the webhook to call';
  }
}

/** First problem with the draft (or null when it can be saved). Mirrors the API's validation. */
export function validateRule(d: RuleDraft): string | null {
  if (!d.name.trim()) return 'Give the rule a name';
  if (d.name.trim().length > 120) return 'The name is limited to 120 characters';
  if (d.conditions.length > MAX_CONDITIONS) return `At most ${MAX_CONDITIONS} conditions`;
  if (d.actions.length === 0) return 'Add at least one action';
  if (d.actions.length > MAX_ACTIONS) return `At most ${MAX_ACTIONS} actions`;
  for (const c of d.conditions) {
    const e = conditionError(c, d.trigger);
    if (e) return e;
  }
  for (const a of d.actions) {
    const e = actionError(a);
    if (e) return e;
  }
  return null;
}

/** The body sent to the API: trimmed text. */
export function toPayload(d: RuleDraft): RuleDraft {
  return {
    ...d,
    name: d.name.trim(),
    conditions: d.conditions.map((c) => (typeof c.value === 'string' ? { ...c, value: c.value.trim() } : c)),
    actions: d.actions.map((a) => (a.type === 'notify' ? { ...a, message: a.message.trim() } : a)),
  };
}

/** Changing the trigger removes conditions that only exist for another trigger. */
export function changeTrigger(d: RuleDraft, trigger: Trigger): RuleDraft {
  return { ...d, trigger, conditions: d.conditions.filter((c) => fieldsFor(trigger).some((f) => f.value === c.field)) };
}

export type NameLookup = (kind: 'user' | 'webhook', id: string) => string;
const fallbackLookup: NameLookup = (_kind, id) => id.slice(0, 8);

export function describeCondition(c: Condition, lookup: NameLookup = fallbackLookup): string {
  const label = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field;
  const show = (v: unknown) => (c.field === 'assignee' ? lookup('user', String(v)) : c.field === 'is_milestone' ? (v ? 'yes' : 'no') : String(v));
  const value = needsValue(c.op) ? (Array.isArray(c.value) ? c.value.map(show).join(', ') : show(c.value)) : '';
  return [label.toLowerCase(), OP_LABELS[c.op], value].filter(Boolean).join(' ');
}

export function describeAction(a: Action, lookup: NameLookup = fallbackLookup): string {
  switch (a.type) {
    case 'set_field':
      return `set ${a.field} to ${a.field === 'assignee' ? (a.value ? lookup('user', a.value) : 'nobody') : a.value}`;
    case 'assign_user':
      return `assign ${lookup('user', a.user_id)}`;
    case 'notify': {
      const who = a.to === 'user' ? lookup('user', a.user_id ?? '') : a.to === 'owner' ? 'the owner' : 'the assignees';
      return `notify ${who}${a.email ? ' (in-app + e-mail)' : ' (in-app)'}`;
    }
    default:
      return `call webhook ${lookup('webhook', a.webhook_id)}`;
  }
}

export function describeRule(r: RuleDraft, lookup: NameLookup = fallbackLookup): string {
  const when = (TRIGGERS.find((t) => t.value === r.trigger)?.label ?? r.trigger).replace(/ \(.*\)$/, '').toLowerCase();
  const ifs = r.conditions.length ? `, if ${r.conditions.map((c) => describeCondition(c, lookup)).join(' and ')}` : '';
  return `When ${when}${ifs} → ${r.actions.map((a) => describeAction(a, lookup)).join(', ')}`;
}

export function draftFromRule(r: Rule): RuleDraft {
  return {
    name: r.name,
    enabled: r.enabled,
    trigger: r.trigger,
    conditions: r.conditions.map((c) => ({ ...c })),
    actions: r.actions.map((a) => ({ ...a })),
  };
}

export function runSummary(runs: RuleRun[]): { ok: number; error: number; last: string | null } {
  const ok = runs.filter((r) => r.status === 'ok').length;
  return { ok, error: runs.length - ok, last: runs.length ? runs[0].ran_at : null };
}

export const RUN_STATUS_LABEL: Record<RuleRun['status'], string> = { ok: 'Done', error: 'Failed' };
