import { describe, expect, it } from 'vitest';
import {
  blankAction,
  blankCondition,
  changeConditionField,
  changeConditionOp,
  changeTrigger,
  describeRule,
  draftFromRule,
  emptyRule,
  fieldsFor,
  opsFor,
  runSummary,
  setFieldAction,
  toPayload,
  validateRule,
  type Rule,
  type RuleDraft,
  type RuleRun,
} from './automations';

const UID = '123e4567-e89b-42d3-a456-426614174000';

const valid = (extra: Partial<RuleDraft> = {}): RuleDraft => ({ ...emptyRule(), name: 'Escalate', ...extra });

describe('catalog', () => {
  it('offers the previous status only for status_changed', () => {
    expect(fieldsFor('status_changed').map((f) => f.value)).toContain('old_status');
    expect(fieldsFor('task_created').map((f) => f.value)).not.toContain('old_status');
  });

  it('knows which operators fit a field', () => {
    expect(opsFor('status')).toContain('in');
    expect(opsFor('is_milestone')).toEqual(['eq']);
    expect(opsFor('title')).toContain('contains');
  });
});

describe('condition editing', () => {
  it('starts with a sensible value', () => {
    expect(blankCondition('status')).toEqual({ field: 'status', op: 'eq', value: 'Todo' });
    expect(blankCondition('priority')).toEqual({ field: 'priority', op: 'eq', value: 'High' });
    expect(blankCondition('is_milestone')).toEqual({ field: 'is_milestone', op: 'eq', value: true });
    expect(blankCondition('due_date')).toEqual({ field: 'due_date', op: 'is_set' });
  });

  it('resets when the field changes, keeps when it does not', () => {
    const c = { field: 'status' as const, op: 'eq' as const, value: 'Done' };
    expect(changeConditionField(c, 'status')).toBe(c);
    expect(changeConditionField(c, 'priority')).toEqual({ field: 'priority', op: 'eq', value: 'High' });
  });

  it('converts between single value and list when the operator changes', () => {
    const single = { field: 'status' as const, op: 'eq' as const, value: 'Done' };
    const multi = changeConditionOp(single, 'in');
    expect(multi).toEqual({ field: 'status', op: 'in', value: ['Done'] });
    expect(changeConditionOp(multi, 'eq')).toEqual({ field: 'status', op: 'eq', value: 'Done' });
    expect(changeConditionOp(single, 'neq').value).toBe('Done');
  });

  it('drops the value for is set / is empty', () => {
    expect(changeConditionOp({ field: 'assignee', op: 'eq', value: UID }, 'is_empty')).toEqual({ field: 'assignee', op: 'is_empty' });
  });

  it('removes conditions that do not exist for the new trigger', () => {
    const d = valid({ trigger: 'status_changed', conditions: [{ field: 'old_status', op: 'eq', value: 'Todo' }, { field: 'status', op: 'eq', value: 'Done' }] });
    expect(changeTrigger(d, 'task_created').conditions).toEqual([{ field: 'status', op: 'eq', value: 'Done' }]);
    expect(changeTrigger(d, 'status_changed').conditions).toHaveLength(2);
  });
});

describe('validateRule', () => {
  it('accepts the default notify rule once it has a name', () => {
    expect(validateRule(emptyRule())).toMatch(/name/i);
    expect(validateRule(valid())).toBeNull();
  });

  it('needs at least one action', () => {
    expect(validateRule(valid({ actions: [] }))).toMatch(/action/i);
  });

  it('checks every condition', () => {
    expect(validateRule(valid({ conditions: [{ field: 'title', op: 'contains', value: '  ' }] }))).toMatch(/condition/i);
    expect(validateRule(valid({ conditions: [{ field: 'status', op: 'in', value: [] }] }))).toMatch(/at least one/i);
    expect(validateRule(valid({ conditions: [{ field: 'assignee', op: 'eq', value: 'nobody' }] }))).toMatch(/person/i);
    expect(validateRule(valid({ conditions: [{ field: 'assignee', op: 'eq', value: UID }] }))).toBeNull();
    expect(validateRule(valid({ conditions: [{ field: 'due_date', op: 'is_set' }] }))).toBeNull();
    expect(validateRule(valid({ conditions: [{ field: 'status', op: 'contains', value: 'x' }] }))).toMatch(/does not work/);
  });

  it('rejects the previous status outside status_changed', () => {
    const c = [{ field: 'old_status' as const, op: 'eq' as const, value: 'Todo' }];
    expect(validateRule(valid({ trigger: 'task_created', conditions: c }))).toMatch(/not available/);
    expect(validateRule(valid({ trigger: 'status_changed', conditions: c }))).toBeNull();
  });

  it('checks the actions', () => {
    expect(validateRule(valid({ actions: [blankAction('assign_user')] }))).toMatch(/user/i);
    expect(validateRule(valid({ actions: [{ type: 'assign_user', user_id: UID }] }))).toBeNull();
    expect(validateRule(valid({ actions: [blankAction('call_webhook')] }))).toMatch(/webhook/i);
    expect(validateRule(valid({ actions: [{ type: 'notify', to: 'user', message: 'hi', email: true }] }))).toMatch(/who to notify/i);
    expect(validateRule(valid({ actions: [{ type: 'notify', to: 'owner', message: ' ', email: true }] }))).toMatch(/message/i);
    expect(validateRule(valid({ actions: [{ type: 'notify', to: 'owner', message: 'x'.repeat(501), email: true }] }))).toMatch(/500/);
    expect(validateRule(valid({ actions: [setFieldAction('assignee')] }))).toBeNull(); // clears the assignee
    expect(validateRule(valid({ actions: [{ type: 'set_field', field: 'status', value: null }] }))).toMatch(/status/);
  });

  it('enforces the size limits', () => {
    expect(validateRule(valid({ actions: Array.from({ length: 11 }, () => blankAction('notify')) }))).toMatch(/at most 10/i);
    expect(validateRule(valid({ conditions: Array.from({ length: 11 }, () => blankCondition('status')) }))).toMatch(/at most 10/i);
    expect(validateRule(valid({ name: 'x'.repeat(121) }))).toMatch(/120/);
  });
});

describe('payload and summaries', () => {
  it('trims text before sending', () => {
    const p = toPayload(valid({ name: '  Escalate ', conditions: [{ field: 'title', op: 'contains', value: ' bug ' }], actions: [{ type: 'notify', to: 'owner', message: ' hi ', email: false }] }));
    expect(p.name).toBe('Escalate');
    expect(p.conditions[0].value).toBe('bug');
    expect(p.actions[0]).toMatchObject({ message: 'hi' });
  });

  it('describes a rule in plain language', () => {
    const d = valid({
      trigger: 'status_changed',
      conditions: [{ field: 'status', op: 'eq', value: 'Done' }, { field: 'priority', op: 'in', value: ['High', 'Critical'] }],
      actions: [{ type: 'set_field', field: 'priority', value: 'Low' }, { type: 'notify', to: 'owner', message: 'x', email: true }],
    });
    expect(describeRule(d)).toBe(
      'When a task changes status, if status is Done and priority is any of High, Critical → set priority to Low, notify the owner (in-app + e-mail)',
    );
  });

  it('resolves people and webhooks through the lookup', () => {
    const d = valid({ trigger: 'assigned', actions: [{ type: 'assign_user', user_id: UID }, { type: 'call_webhook', webhook_id: 'w1w1w1w1-x' }] });
    const lookup = (kind: 'user' | 'webhook', id: string) => (kind === 'user' ? 'Ada' : `hook:${id}`);
    expect(describeRule(d, lookup)).toBe('When a task gets assigned → assign Ada, call webhook hook:w1w1w1w1-x');
    expect(describeRule(d)).toContain('123e4567'); // without a lookup: short id
  });

  it('summarises runs', () => {
    const run = (status: RuleRun['status'], ran_at: string): RuleRun => ({ id: ran_at, rule_id: 'r', task_id: null, status, message: null, ran_at });
    expect(runSummary([])).toEqual({ ok: 0, error: 0, last: null });
    expect(runSummary([run('ok', '2025-01-02'), run('error', '2025-01-01'), run('ok', '2025-01-01')])).toEqual({ ok: 2, error: 1, last: '2025-01-02' });
  });

  it('copies a stored rule into an editable draft', () => {
    const rule: Rule = { ...valid(), id: 'a', project_id: 'p', conditions: [{ field: 'status', op: 'eq', value: 'Done' }] };
    const draft = draftFromRule(rule);
    draft.conditions[0].value = 'Todo';
    expect(rule.conditions[0].value).toBe('Done');
    expect('id' in draft).toBe(false);
  });
});
