import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDrag,
  collectDependencies,
  dependencyBound,
  dependencyTypeFor,
  dependencyViolations,
  describeViolation,
  isCriticalTask,
  keyboardAdjust,
  normalizePriority,
  rangeLength,
  rangeToApi,
  shiftDay,
  sideAt,
  snapDelta,
  validateLink,
  wouldCreateCycle,
  type DayRange,
  type DepEdge,
} from './gantt';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const ZONES = ['UTC', 'Europe/Rome', 'Asia/Tokyo', 'Pacific/Auckland', 'America/New_York', 'Pacific/Honolulu'];

describe.each(ZONES)('day maths in %s', (tz) => {
  it('shifts across DST changes and month ends without drifting', () => {
    process.env.TZ = tz;
    expect(shiftDay('2025-03-08', 1)).toBe('2025-03-09'); // US spring-forward
    expect(shiftDay('2025-03-09', 1)).toBe('2025-03-10');
    expect(shiftDay('2025-03-29', 1)).toBe('2025-03-30'); // EU spring-forward
    expect(shiftDay('2025-10-26', 1)).toBe('2025-10-27');
    expect(shiftDay('2025-01-31', 1)).toBe('2025-02-01');
    expect(shiftDay('2024-02-28', 2)).toBe('2024-03-01');
    expect(shiftDay('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('moves a range and writes naive local midnight', () => {
    process.env.TZ = tz;
    const moved = applyDrag({ start: '2025-03-08', end: '2025-03-10' }, 'move', 2);
    expect(moved).toEqual({ start: '2025-03-10', end: '2025-03-12' });
    expect(rangeToApi(moved)).toEqual({ start_date: '2025-03-10T00:00:00', due_date: '2025-03-12T00:00:00' });
    expect(rangeLength(moved)).toBe(3);
  });
});

describe('snapDelta', () => {
  it('rounds to the nearest whole day', () => {
    expect(snapDelta(0, 30)).toBe(0);
    expect(snapDelta(14, 30)).toBe(0);
    expect(snapDelta(15, 30)).toBe(1);
    expect(snapDelta(44, 30)).toBe(1);
    expect(snapDelta(-16, 30)).toBe(-1);
    expect(Object.is(snapDelta(-14, 30), 0)).toBe(true);
  });
  it('is safe with bad input', () => {
    expect(snapDelta(100, 0)).toBe(0);
    expect(snapDelta(NaN, 30)).toBe(0);
  });
});

describe('applyDrag', () => {
  const r: DayRange = { start: '2025-05-10', end: '2025-05-14' };
  it('resizes the end and start', () => {
    expect(applyDrag(r, 'end', 3)).toEqual({ start: '2025-05-10', end: '2025-05-17' });
    expect(applyDrag(r, 'start', -2)).toEqual({ start: '2025-05-08', end: '2025-05-14' });
  });
  it('never goes below one day', () => {
    expect(applyDrag(r, 'end', -10)).toEqual({ start: '2025-05-10', end: '2025-05-10' });
    expect(applyDrag(r, 'start', 10)).toEqual({ start: '2025-05-14', end: '2025-05-14' });
  });
  it('a zero move is the identity', () => {
    expect(applyDrag(r, 'move', 0)).toEqual(r);
  });
});

describe('keyboardAdjust', () => {
  it('maps arrows to move, shift to resize end, alt+shift to resize start', () => {
    expect(keyboardAdjust('ArrowRight')).toEqual({ mode: 'move', delta: 1 });
    expect(keyboardAdjust('ArrowLeft')).toEqual({ mode: 'move', delta: -1 });
    expect(keyboardAdjust('ArrowRight', { shift: true })).toEqual({ mode: 'end', delta: 1 });
    expect(keyboardAdjust('ArrowLeft', { shift: true, alt: true })).toEqual({ mode: 'start', delta: -1 });
    expect(keyboardAdjust('Enter')).toBeNull();
    expect(keyboardAdjust('ArrowUp')).toBeNull();
  });
});

describe('normalizePriority', () => {
  it('matches the API casing', () => {
    expect(normalizePriority('Critical')).toBe('critical');
    expect(normalizePriority('High')).toBe('high');
    expect(normalizePriority(undefined)).toBe('');
  });
});

const edge = (p: string, s: string, type = 'FS', lag_days = 0): DepEdge => ({
  predecessor_id: p,
  successor_id: s,
  type,
  lag_days,
});

describe('dependencies', () => {
  const pred: DayRange = { start: '2025-06-02', end: '2025-06-06' };
  it('computes the bound per type, with lag', () => {
    expect(dependencyBound({ type: 'FS', lag_days: 0 }, pred)).toEqual({ side: 'start', day: '2025-06-07' });
    expect(dependencyBound({ type: 'FS', lag_days: 2 }, pred)).toEqual({ side: 'start', day: '2025-06-09' });
    expect(dependencyBound({ type: 'SS', lag_days: 1 }, pred)).toEqual({ side: 'start', day: '2025-06-03' });
    expect(dependencyBound({ type: 'FF', lag_days: 0 }, pred)).toEqual({ side: 'end', day: '2025-06-06' });
    expect(dependencyBound({ type: 'SF', lag_days: 0 }, pred)).toEqual({ side: 'end', day: '2025-06-02' });
  });

  it('flags a successor dragged before its FS predecessor finishes', () => {
    const ranges = new Map<string, DayRange>([
      ['a', pred],
      ['b', { start: '2025-06-09', end: '2025-06-10' }],
    ]);
    const edges = [edge('a', 'b')];
    expect(dependencyViolations('b', { start: '2025-06-09', end: '2025-06-10' }, ranges, edges)).toEqual([]);
    const v = dependencyViolations('b', { start: '2025-06-05', end: '2025-06-06' }, ranges, edges);
    expect(v).toHaveLength(1);
    expect(v[0].shortBy).toBe(2);
    expect(describeViolation(v[0], (id) => id.toUpperCase())).toBe('FS "A" -> "B": 2 days too early');
  });

  it('flags the predecessor being pushed past its successor', () => {
    const ranges = new Map<string, DayRange>([
      ['a', pred],
      ['b', { start: '2025-06-09', end: '2025-06-10' }],
    ]);
    const v = dependencyViolations('a', { start: '2025-06-04', end: '2025-06-09' }, ranges, [edge('a', 'b')]);
    expect(v.map((x) => x.taskId)).toEqual(['b']);
    expect(v[0].shortBy).toBe(1);
  });

  it('checks FF on the end side and ignores unrelated or unknown tasks', () => {
    const ranges = new Map<string, DayRange>([
      ['a', pred],
      ['b', { start: '2025-06-01', end: '2025-06-08' }],
    ]);
    expect(dependencyViolations('b', { start: '2025-06-01', end: '2025-06-05' }, ranges, [edge('a', 'b', 'FF')])).toHaveLength(1);
    expect(dependencyViolations('b', { start: '2025-06-01', end: '2025-06-06' }, ranges, [edge('a', 'b', 'FF')])).toHaveLength(0);
    expect(dependencyViolations('c', pred, ranges, [edge('a', 'b')])).toEqual([]);
    expect(dependencyViolations('b', pred, new Map(), [edge('x', 'b')])).toEqual([]);
  });

  it('merges blocked_by and blocked_by_ids without duplicates', () => {
    const edges = collectDependencies([
      { id: 'b', blocked_by: [{ predecessor_id: 'a', type: 'SS', lag_days: 2 }], blocked_by_ids: ['a', 'c'] },
      { id: 'c' },
    ]);
    expect(edges).toEqual([edge('a', 'b', 'SS', 2), edge('c', 'b')]);
  });
});

describe('link validation', () => {
  const edges = [edge('a', 'b'), edge('b', 'c')];
  it('detects cycles through the chain', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });
  it('refuses self, duplicate and circular links with a reason', () => {
    expect(validateLink(edges, 'a', 'a')).toMatchObject({ ok: false });
    expect(validateLink(edges, 'a', 'b')).toMatchObject({ ok: false, reason: expect.stringContaining('already') });
    expect(validateLink(edges, 'c', 'a')).toMatchObject({ ok: false, reason: expect.stringContaining('circular') });
    expect(validateLink(edges, 'a', 'd')).toEqual({ ok: true });
  });
  it('survives an existing loop without hanging', () => {
    expect(wouldCreateCycle([edge('x', 'y'), edge('y', 'x')], 'q', 'x')).toBe(false);
  });
  it('picks the dependency type from the handles', () => {
    expect(dependencyTypeFor('end', 'start')).toBe('FS');
    expect(dependencyTypeFor('start', 'start')).toBe('SS');
    expect(dependencyTypeFor('end', 'end')).toBe('FF');
    expect(dependencyTypeFor('start', 'end')).toBe('SF');
    expect(sideAt(10, 0, 100)).toBe('start');
    expect(sideAt(60, 0, 100)).toBe('end');
  });
});

describe('isCriticalTask', () => {
  it('trusts only an explicit is_critical flag', () => {
    expect(isCriticalTask({ is_critical: true })).toBe(true);
    expect(isCriticalTask({ is_critical: false })).toBe(false);
    expect(isCriticalTask({})).toBe(false);
    expect(isCriticalTask(null)).toBe(false);
  });

  it('ignores slack_days, which is unset when CPM did not run', () => {
    expect(isCriticalTask({ is_critical: false, slack_days: 0 } as { is_critical: boolean })).toBe(false);
  });
});
