import { describe, expect, it } from 'vitest';
import { numberField, taskFormValues } from './form-fields';
import type { Task } from '@/types';

const base: Task = {
  id: 't1', title: 'Pour concrete', status: 'In Progress', priority: 'High',
  created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
};

describe('taskFormValues', () => {
  it('carries every saved field, so a save does not reset it to the form default', () => {
    const v = taskFormValues({
      ...base,
      budget: 1200, real_cost: 300, risk_probability: 4, risk_impact: 5,
      checklist: [{ id: 'a', text: 'Order mix', is_done: true }],
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      duration_days: 3, color: '#ff0000',
    });
    expect(v).toMatchObject({
      budget: 1200, real_cost: 300, risk_probability: 4, risk_impact: 5,
      checklist: [{ id: 'a', text: 'Order mix', is_done: true }],
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', duration_days: 3, color: '#ff0000',
    });
  });

  it('repairs checklist items written without an id or under another text key', () => {
    const v = taskFormValues({ ...base, checklist: [{ content: 'Legacy', is_done: false } as never] });
    expect(v.checklist).toEqual([{ id: 'item-0', text: 'Legacy', is_done: false }]);
  });
});

describe('numberField', () => {
  it('turns a cleared input into the fallback instead of NaN', () => {
    expect(numberField(0).setValueAs('')).toBe(0);
    expect(numberField().setValueAs('')).toBeUndefined();
    expect(numberField(0).setValueAs('12,5')).toBe(12.5);
    expect(numberField(0).setValueAs('7')).toBe(7);
  });
});
