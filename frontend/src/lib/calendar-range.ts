import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { parseApiDate } from './dates';

/** Range maths for the schedule's month / week / day calendar. Weeks start on Sunday, matching the month grid. */
export type CalendarView = 'month' | 'week' | 'day';

export interface DateRange {
  start: Date;
  end: Date;
}

export function visibleRange(view: CalendarView, anchor: Date): DateRange {
  if (view === 'month') {
    return { start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) };
  }
  if (view === 'week') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return { start: d, end: d };
}

export const visibleDays = (view: CalendarView, anchor: Date): Date[] => eachDayOfInterval(visibleRange(view, anchor));

export function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === 'month') return addMonths(anchor, direction);
  if (view === 'week') return addWeeks(anchor, direction);
  return addDays(anchor, direction);
}

export function rangeTitle(view: CalendarView, anchor: Date): string {
  if (view === 'month') return format(anchor, 'MMMM yyyy');
  if (view === 'day') return format(anchor, 'EEEE, MMMM d, yyyy');
  const { start, end } = visibleRange('week', anchor);
  return start.getMonth() === end.getMonth()
    ? `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`
    : `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
}

/** Stable query key part: the exact days fetched, so every view and every year/month/week has its own cache entry. */
export function rangeKey(view: CalendarView, anchor: Date): string {
  const { start, end } = visibleRange(view, anchor);
  return `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`;
}

export function yearBounds(year: number): DateRange {
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
}

/**
 * Dates after dragging an item from `fromDay` to `toDay`: every date moves by the same number of days, so the
 * duration (and any deadline offset) is preserved. Values are naive API timestamps; null/empty stay untouched.
 */
export function moveItemDates(
  dates: { start_date?: string | null; due_date?: string | null; deadline_at?: string | null },
  fromDay: Date,
  toDay: Date,
): { start_date?: string | null; due_date?: string | null; deadline_at?: string | null } {
  const delta = differenceInCalendarDays(toDay, fromDay);
  const out: { start_date?: string | null; due_date?: string | null; deadline_at?: string | null } = {};
  for (const key of ['start_date', 'due_date', 'deadline_at'] as const) {
    const d = parseApiDate(dates[key]);
    if (d) out[key] = format(addDays(d, delta), "yyyy-MM-dd'T'HH:mm:ss"); // keeps a deadline's time of day
  }
  return out;
}
