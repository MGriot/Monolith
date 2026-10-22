import { describe, expect, it } from 'vitest';
import { PRIORITY_RANK, STATUS_RANK } from '@/lib/task-filters';
import { PRIORITIES, STATUSES, isDoneStatus, statusLabel } from './statuses';

describe('statuses', () => {
  it('every status and priority has a sort rank', () => {
    expect(STATUSES.map((s) => s.toLowerCase()).sort()).toEqual(Object.keys(STATUS_RANK).sort());
    expect(PRIORITIES.map((p) => p.toLowerCase()).sort()).toEqual(Object.keys(PRIORITY_RANK).sort());
  });

  it('labels and done checks', () => {
    expect(statusLabel('On hold')).toBe('On Hold');
    expect(statusLabel('In Progress')).toBe('In Progress');
    expect(isDoneStatus('Done')).toBe(true);
    expect(isDoneStatus('done')).toBe(true);
    expect(isDoneStatus('Review')).toBe(false);
    expect(isDoneStatus(undefined)).toBe(false);
  });
});
