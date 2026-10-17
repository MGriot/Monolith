import { afterEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { moveItemDates, rangeKey, rangeTitle, shiftAnchor, visibleDays, visibleRange, yearBounds } from './calendar-range';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const ZONES = ['UTC', 'Europe/Rome', 'Asia/Tokyo', 'Pacific/Auckland', 'America/New_York', 'Pacific/Honolulu'];
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const f = (x: Date) => format(x, 'yyyy-MM-dd');

describe.each(ZONES)('calendar ranges in %s', (tz) => {
  it('month range is whole Sunday-based weeks', () => {
    process.env.TZ = tz;
    const r = visibleRange('month', d(2025, 3, 15)); // March 2025 starts on Saturday
    expect(f(r.start)).toBe('2025-02-23');
    expect(f(r.end)).toBe('2025-04-05');
    expect(visibleDays('month', d(2025, 3, 15))).toHaveLength(42);
  });

  it('week range runs Sunday..Saturday, across a month and year boundary', () => {
    process.env.TZ = tz;
    const r = visibleRange('week', d(2025, 12, 31));
    expect(f(r.start)).toBe('2025-12-28');
    expect(f(r.end)).toBe('2026-01-03');
    expect(visibleDays('week', d(2025, 12, 31))).toHaveLength(7);
  });

  it('week range holds 7 days over a DST change', () => {
    process.env.TZ = tz;
    expect(visibleDays('week', d(2025, 3, 9))).toHaveLength(7);
    expect(visibleDays('week', d(2025, 10, 26))).toHaveLength(7);
  });

  it('day range is a single day', () => {
    process.env.TZ = tz;
    const days = visibleDays('day', new Date(2025, 5, 10, 18, 30));
    expect(days.map(f)).toEqual(['2025-06-10']);
  });
});

describe('navigation', () => {
  it('shifts by the view unit', () => {
    expect(f(shiftAnchor('month', d(2025, 1, 31), 1))).toBe('2025-02-28');
    expect(f(shiftAnchor('week', d(2025, 1, 1), -1))).toBe('2024-12-25');
    expect(f(shiftAnchor('day', d(2025, 3, 1), -1))).toBe('2025-02-28');
  });
  it('titles and keys differ per view and period', () => {
    expect(rangeTitle('month', d(2025, 3, 15))).toBe('March 2025');
    expect(rangeTitle('week', d(2025, 3, 12))).toBe('Mar 9 - 15, 2025');
    expect(rangeTitle('week', d(2025, 12, 31))).toBe('Dec 28 - Jan 3, 2026');
    expect(rangeTitle('day', d(2025, 3, 12))).toBe('Wednesday, March 12, 2025');
    expect(rangeKey('week', d(2025, 3, 12))).toBe('2025-03-09_2025-03-15');
    expect(rangeKey('week', d(2025, 3, 12))).not.toBe(rangeKey('week', d(2025, 3, 19)));
  });
  it('year bounds', () => {
    const b = yearBounds(2026);
    expect([f(b.start), f(b.end)]).toEqual(['2026-01-01', '2026-12-31']);
  });
});

describe.each(ZONES)('moveItemDates in %s', (tz) => {
  it('shifts all dates by the same days and keeps the deadline time', () => {
    process.env.TZ = tz;
    const out = moveItemDates(
      { start_date: '2025-03-08T00:00:00', due_date: '2025-03-10T00:00:00', deadline_at: '2025-03-12T17:30:00' },
      d(2025, 3, 10),
      d(2025, 3, 13),
    );
    expect(out).toEqual({
      start_date: '2025-03-11T00:00:00',
      due_date: '2025-03-13T00:00:00',
      deadline_at: '2025-03-15T17:30:00',
    });
  });
  it('skips empty fields and supports moving backwards', () => {
    process.env.TZ = tz;
    expect(moveItemDates({ start_date: null, due_date: '2025-01-01T00:00:00' }, d(2025, 1, 1), d(2024, 12, 31))).toEqual({
      due_date: '2024-12-31T00:00:00',
    });
  });
});
