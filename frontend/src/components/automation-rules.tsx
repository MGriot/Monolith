import type React from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ACTION_TYPES,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  MESSAGE_PLACEHOLDERS,
  OP_LABELS,
  PRIORITIES,
  RUN_STATUS_LABEL,
  STATUSES,
  TRIGGERS,
  blankAction,
  blankCondition,
  changeConditionField,
  changeConditionOp,
  changeTrigger,
  describeRule,
  draftFromRule,
  emptyRule,
  fieldsFor,
  isMultiOp,
  needsValue,
  opsFor,
  runSummary,
  setFieldAction,
  toPayload,
  validateRule,
  type Action,
  type Condition,
  type NameLookup,
  type Rule,
  type RuleDraft,
  type RuleRun,
  type Trigger,
} from '@/lib/automations';

interface Member {
  user_id: string;
  email: string;
  full_name?: string | null;
}
interface ProjectWebhook {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

const PROVIDERS = [
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'generic', label: 'Generic JSON' },
];

/** Project settings: automation rules (trigger, conditions, actions), their run history, and the project's webhooks. */
export default function AutomationRules({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const base = `/projects/${projectId}/automations`;
  const [editing, setEditing] = useState<{ id: string | null; draft: RuleDraft } | null>(null);
  const [openRuns, setOpenRuns] = useState<string | null>(null);

  const rules = useQuery({ queryKey: ['automations', projectId], queryFn: async () => (await api.get<Rule[]>(base)).data });
  const members = useQuery({ queryKey: ['project-members', projectId], queryFn: async () => (await api.get<Member[]>(`/projects/${projectId}/members`)).data });
  const hooks = useQuery({
    queryKey: ['project-webhooks', projectId],
    queryFn: async () => (await api.get<ProjectWebhook[]>('/webhooks/', { params: { project_id: projectId } })).data,
  });

  const lookup: NameLookup = (kind, id) => {
    if (kind === 'user') {
      const m = members.data?.find((x) => x.user_id === id);
      return m ? m.full_name || m.email : id.slice(0, 8);
    }
    return hooks.data?.find((h) => h.id === id)?.name ?? id.slice(0, 8);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['automations', projectId] });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: RuleDraft }) =>
      id ? (await api.put(`${base}/${id}`, toPayload(draft))).data : (await api.post(base, toPayload(draft))).data,
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success('Rule saved');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the rule')),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => (await api.put(`${base}/${id}`, { enabled })).data,
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, 'Could not change the rule')),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Rule deleted');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not delete the rule')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Rules &amp; automation</CardTitle>
        <CardDescription>
          When something happens to a task, check conditions and run actions. A rule never changes anything outside this project and a failing rule never blocks your edit; every run is listed in its history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.isLoading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        {rules.data?.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={rule.enabled} onCheckedChange={(enabled) => toggle.mutate({ id: rule.id, enabled })} aria-label={`Enable ${rule.name}`} />
              <span className={`flex-1 font-bold text-sm ${rule.enabled ? '' : 'text-slate-400'}`}>{rule.name}</span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${rule.name}`} onClick={() => setEditing({ id: rule.id, draft: draftFromRule(rule) })}>
                <Pencil className="w-4 h-4" />
              </Button>
              <button
                type="button"
                aria-label={`Delete ${rule.name}`}
                onClick={() => window.confirm(`Delete the rule “${rule.name}” and its history?`) && remove.mutate(rule.id)}
                className="p-2 text-slate-300 hover:text-rose-500 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">{describeRule(rule, lookup)}</p>
            <button
              type="button"
              onClick={() => setOpenRuns(openRuns === rule.id ? null : rule.id)}
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
              aria-expanded={openRuns === rule.id}
            >
              {openRuns === rule.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Run history
            </button>
            {openRuns === rule.id && <RunHistory projectId={projectId} ruleId={rule.id} />}
          </div>
        ))}
        {rules.data?.length === 0 && !editing && <p className="text-sm text-slate-400">No rules yet.</p>}

        {editing ? (
          <RuleForm
            draft={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            members={members.data ?? []}
            webhooks={hooks.data ?? []}
            saving={save.isPending}
            onCancel={() => setEditing(null)}
            onSave={() => save.mutate(editing)}
            isNew={editing.id === null}
          />
        ) : (
          <Button type="button" className="gap-2" onClick={() => setEditing({ id: null, draft: emptyRule() })}>
            <Plus className="w-4 h-4" /> New rule
          </Button>
        )}

        <ProjectWebhooks projectId={projectId} hooks={hooks.data ?? []} loading={hooks.isLoading} />
      </CardContent>
    </Card>
  );
}

function RunHistory({ projectId, ruleId }: { projectId: string; ruleId: string }) {
  const runs = useQuery({
    queryKey: ['automation-runs', ruleId],
    queryFn: async () => (await api.get<RuleRun[]>(`/projects/${projectId}/automations/${ruleId}/runs`)).data,
  });
  if (runs.isLoading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  const list = runs.data ?? [];
  if (list.length === 0) return <p className="text-xs text-slate-400">It has not run yet.</p>;
  const s = runSummary(list);
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-slate-400">
        Last {list.length} runs: {s.ok} done, {s.error} failed
      </p>
      <ul className="max-h-48 overflow-auto divide-y divide-slate-100 rounded-lg border bg-white text-xs">
        {list.map((run) => (
          <li key={run.id} className="flex items-start gap-2 p-2">
            <Badge variant={run.status === 'ok' ? 'secondary' : 'destructive'}>{RUN_STATUS_LABEL[run.status]}</Badge>
            <span className="flex-1 text-slate-600 break-words">{run.message || '-'}</span>
            <time className="text-slate-400 whitespace-nowrap" dateTime={run.ran_at}>
              {new Date(run.ran_at + (run.ran_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FormProps {
  draft: RuleDraft;
  onChange: (d: RuleDraft) => void;
  members: Member[];
  webhooks: ProjectWebhook[];
  saving: boolean;
  isNew: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function RuleForm({ draft, onChange, members, webhooks, saving, isNew, onSave, onCancel }: FormProps) {
  const error = validateRule(draft);
  const setCondition = (i: number, c: Condition) => onChange({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });
  const setAction = (i: number, a: Action) => onChange({ ...draft, actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  const person = (value: string, onPick: (v: string) => void, label: string, allowNone = false) => (
    <select value={value} onChange={(e) => onPick(e.target.value)} className={selectClass} aria-label={label}>
      <option value="">{allowNone ? 'Nobody' : 'Pick a person…'}</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5 rounded-xl border-2 border-slate-200 p-4" role="form" aria-label={isNew ? 'New rule' : 'Edit rule'}>
      <div className="flex gap-2">
        <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Rule name, e.g. Escalate blocked work" maxLength={120} aria-label="Rule name" />
      </div>

      <section className="space-y-2">
        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">When</Label>
        <select value={draft.trigger} onChange={(e) => onChange(changeTrigger(draft, e.target.value as Trigger))} className={`${selectClass} w-full`} aria-label="Trigger">
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-2">
        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Only if (all must match)</Label>
        {draft.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select value={c.field} onChange={(e) => setCondition(i, changeConditionField(c, e.target.value as Condition['field']))} className={selectClass} aria-label="Condition field">
              {fieldsFor(draft.trigger).map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select value={c.op} onChange={(e) => setCondition(i, changeConditionOp(c, e.target.value as Condition['op']))} className={selectClass} aria-label="Condition operator">
              {opsFor(c.field).map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            {needsValue(c.op) && <ConditionValue c={c} onChange={(next) => setCondition(i, next)} person={person} />}
            <button type="button" aria-label="Remove condition" className="p-1 text-slate-300 hover:text-rose-500" onClick={() => onChange({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="gap-1" disabled={draft.conditions.length >= MAX_CONDITIONS} onClick={() => onChange({ ...draft, conditions: [...draft.conditions, blankCondition('status')] })}>
          <Plus className="w-3 h-3" /> Condition
        </Button>
      </section>

      <section className="space-y-2">
        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Then</Label>
        {draft.actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg bg-slate-50 p-2">
            <select value={a.type} onChange={(e) => setAction(i, blankAction(e.target.value as Action['type']))} className={selectClass} aria-label="Action type">
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ActionFields a={a} onChange={(next) => setAction(i, next)} person={person} webhooks={webhooks} />
            <button type="button" aria-label="Remove action" className="p-1 text-slate-300 hover:text-rose-500" onClick={() => onChange({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="gap-1" disabled={draft.actions.length >= MAX_ACTIONS} onClick={() => onChange({ ...draft, actions: [...draft.actions, blankAction('notify')] })}>
          <Plus className="w-3 h-3" /> Action
        </Button>
      </section>

      <div className="flex items-center gap-3">
        <Switch checked={draft.enabled} onCheckedChange={(enabled) => onChange({ ...draft, enabled })} aria-label="Rule enabled" />
        <span className="text-sm text-slate-600">{draft.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={!!error || saving} onClick={onSave}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save rule
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type PersonPicker = (value: string, onPick: (v: string) => void, label: string, allowNone?: boolean) => React.ReactElement;

function ConditionValue({ c, onChange, person }: { c: Condition; onChange: (c: Condition) => void; person: PersonPicker }) {
  if (c.field === 'assignee') return person(String(c.value ?? ''), (v) => onChange({ ...c, value: v }), 'Assignee value');
  if (c.field === 'is_milestone') {
    return (
      <select value={c.value ? 'yes' : 'no'} onChange={(e) => onChange({ ...c, value: e.target.value === 'yes' })} className={selectClass} aria-label="Milestone value">
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  const options = c.field === 'priority' ? PRIORITIES : c.field === 'status' || c.field === 'old_status' ? STATUSES : null;
  if (!options) {
    return <Input value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })} className="h-9 w-48" placeholder="Text" maxLength={200} aria-label="Condition value" />;
  }
  if (isMultiOp(c.op)) {
    const chosen = Array.isArray(c.value) ? c.value : [];
    return (
      <div className="flex flex-wrap gap-1" role="group" aria-label="Condition values">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={chosen.includes(o)}
            onClick={() => onChange({ ...c, value: chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o] })}
            className={`rounded-full border px-2 py-0.5 text-xs ${chosen.includes(o) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600'}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })} className={selectClass} aria-label="Condition value">
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ActionFields({ a, onChange, person, webhooks }: { a: Action; onChange: (a: Action) => void; person: PersonPicker; webhooks: ProjectWebhook[] }) {
  if (a.type === 'set_field') {
    return (
      <>
        <select value={a.field} onChange={(e) => onChange(setFieldAction(e.target.value as 'status' | 'priority' | 'assignee'))} className={selectClass} aria-label="Field to change">
          <option value="status">Status</option>
          <option value="priority">Priority</option>
          <option value="assignee">Assignee</option>
        </select>
        {a.field === 'assignee' ? (
          person(a.value ?? '', (v) => onChange({ ...a, value: v || null }), 'New assignee', true)
        ) : (
          <select value={a.value ?? ''} onChange={(e) => onChange({ ...a, value: e.target.value })} className={selectClass} aria-label="New value">
            {(a.field === 'status' ? STATUSES : PRIORITIES).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </>
    );
  }
  if (a.type === 'assign_user') return person(a.user_id, (v) => onChange({ ...a, user_id: v }), 'User to assign');
  if (a.type === 'call_webhook') {
    return (
      <select value={a.webhook_id} onChange={(e) => onChange({ ...a, webhook_id: e.target.value })} className={selectClass} aria-label="Webhook">
        <option value="">{webhooks.length ? 'Pick a webhook…' : 'Add a webhook below first'}</option>
        {webhooks.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name} ({h.provider})
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className="flex-1 min-w-[16rem] space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={a.to} onChange={(e) => onChange({ ...a, to: e.target.value as 'assignees' | 'owner' | 'user' })} className={selectClass} aria-label="Notify">
          <option value="assignees">The assignees</option>
          <option value="owner">The task owner</option>
          <option value="user">A specific person</option>
        </select>
        {a.to === 'user' && person(a.user_id ?? '', (v) => onChange({ ...a, user_id: v }), 'Person to notify')}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={a.email} onChange={(e) => onChange({ ...a, email: e.target.checked })} /> also e-mail
        </label>
      </div>
      <Input value={a.message} onChange={(e) => onChange({ ...a, message: e.target.value })} maxLength={500} placeholder="Message" aria-label="Notification message" />
      <p className="text-[10px] text-slate-400">Placeholders: {MESSAGE_PLACEHOLDERS.join(' ')}</p>
    </div>
  );
}

function ProjectWebhooks({ projectId, hooks, loading }: { projectId: string; hooks: ProjectWebhook[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', url: '', provider: 'slack' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['project-webhooks', projectId] });
  const create = useMutation({
    mutationFn: async () => (await api.post('/webhooks/', { ...form, name: form.name.trim(), url: form.url.trim(), project_id: projectId })).data,
    onSuccess: () => {
      setForm({ name: '', url: '', provider: form.provider });
      refresh();
      toast.success('Webhook added');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add the webhook')),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, 'Could not delete the webhook')),
  });
  const test = useMutation({
    mutationFn: async (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: () => toast.success('Test message sent'),
    onError: (e) => toast.error(errorMessage(e, 'The test message could not be delivered')),
  });
  const urlOk = /^https?:\/\/\S+$/i.test(form.url.trim());

  return (
    <div className="space-y-3 border-t pt-4">
      <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Project webhooks</Label>
      <p className="text-xs text-slate-500">
        Every active webhook receives this project&apos;s events: task created, status changed, assigned and completed. Rules can also call one on demand.
      </p>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      {hooks.map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          <span className="flex-1 text-sm font-bold">{h.name}</span>
          <Badge variant="secondary">{h.provider}</Badge>
          <Button type="button" size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate(h.id)}>
            Test
          </Button>
          <button type="button" aria-label={`Delete webhook ${h.name}`} className="p-2 text-slate-300 hover:text-rose-500" onClick={() => window.confirm(`Delete the webhook “${h.name}”?`) && remove.mutate(h.id)}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-40" aria-label="Webhook name" />
        <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.slack.com/…" className="flex-1 min-w-[14rem]" aria-label="Webhook URL" />
        <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={selectClass} aria-label="Webhook format">
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <Button type="button" disabled={!form.name.trim() || !urlOk || create.isPending} onClick={() => create.mutate()}>
          Add
        </Button>
      </div>
    </div>
  );
}
