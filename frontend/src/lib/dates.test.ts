import { afterEach, describe, expect, it } from 'vitest';
import { formatDisplayDate, fromDateInput, isAfterDueDay, parseApiDate, toDateInputValue } from './dates';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// The bug these guard against: new Date(x).toISOString().split('T')[0] shifted the day by one for users east of UTC
// every time a project was edited and saved.
const ZONES = ['UTC', 'Europe/Rome', 'Asia/Tokyo', 'Pacific/Auckland', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu'];

describe.each(ZONES)('calendar days are stable in %s', (tz) => {
  it('API value -> input value -> API value never moves the day', () => {
    process.env.TZ = tz;
    const stored = '2025-03-09T00:00:00'; // naive timestamp as returned by the API (also a DST change day in the US)
    const input = toDateInputValue(stored);
    expect(input).toBe('2025-03-09');
    expect(fromDateInput(input)).toBe('2025-03-09T00:00:00');
    expect(toDateInputValue(fromDateInput(input))).toBe('2025-03-09');
  });

  it('repeated edit/save cycles do not drift', () => {
    process.env.TZ = tz;
    let value: string | null = '2025-12-31T00:00:00';
    for (let i = 0; i < 5; i++) value = fromDateInput(toDateInputValue(value));
    expect(value).toBe('2025-12-31T00:00:00');
  });

  it('date-only strings are local calendar days too', () => {
    process.env.TZ = tz;
    expect(toDateInputValue('2025-01-05')).toBe('2025-01-05');
  });
});

describe('parseApiDate', () => {
  it('handles empty / invalid input', () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate(undefined)).toBeNull();
    expect(parseApiDate('')).toBeNull();
    expect(parseApiDate('not a date')).toBeNull();
    expect(toDateInputValue('garbage')).toBe('');
    expect(formatDisplayDate(null)).toBe('-');
    expect(formatDisplayDate('garbage', 'n/a')).toBe('n/a');
  });

  it('keeps zone-qualified timestamps as real instants', () => {
    process.env.TZ = 'UTC';
    expect(parseApiDate('2025-01-05T10:00:00Z')?.getTime()).toBe(Date.UTC(2025, 0, 5, 10));
  });
});

describe('fromDateInput', () => {
  it('returns null for empty values', () => {
    expect(fromDateInput('')).toBeNull();
    expect(fromDateInput('   ')).toBeNull();
    expect(fromDateInput(null)).toBeNull();
    expect(fromDateInput(undefined)).toBeNull();
  });
});

describe('isAfterDueDay', () => {
  it('is not overdue during the whole due day', () => {
    process.env.TZ = 'Europe/Rome';
    const due = parseApiDate('2025-06-10T00:00:00');
    expect(isAfterDueDay(new Date(2025, 5, 10, 0, 0, 1), due)).toBe(false);
    expect(isAfterDueDay(new Date(2025, 5, 10, 12, 0), due)).toBe(false);
    expect(isAfterDueDay(new Date(2025, 5, 10, 23, 59, 59), due)).toBe(false);
  });

  it('is overdue from the next day on', () => {
    process.env.TZ = 'Europe/Rome';
    const due = parseApiDate('2025-06-10T00:00:00');
    expect(isAfterDueDay(new Date(2025, 5, 11, 0, 0, 1), due)).toBe(true);
  });

  it('is false without a due date', () => {
    expect(isAfterDueDay(new Date(), null)).toBe(false);
    expect(isAfterDueDay(new Date(), undefined)).toBe(false);
  });
});
