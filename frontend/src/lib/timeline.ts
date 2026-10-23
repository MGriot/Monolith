import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

// Pixel math shared by the timeline views (Gantt, resource load). Each view keeps its own zoom scales (px per day).

const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (value: string | Date) => (typeof value === 'string' ? parseISO(value) : value);
const dayFraction = (date: Date) => (date.getTime() - startOfDay(date).getTime()) / DAY_MS;

/** Offset of `value` from `windowStart`: whole calendar days (no drift across DST changes) plus the time of day. */
export function positionPx(value: string | Date, windowStart: Date, dayWidth: number): number {
  const date = toDate(value);
  return (differenceInCalendarDays(date, windowStart) + dayFraction(date)) * dayWidth;
}

/** Width of a bar from `start` to `end`, both days included. */
export function widthPx(start: string | Date, end: string | Date, dayWidth: number): number {
  const s = toDate(start);
  const e = toDate(end);
  return (differenceInCalendarDays(e, s) + 1 + dayFraction(e) - dayFraction(s)) * dayWidth;
}

/** Neighbouring zoom level: 'in' moves towards the first (most detailed) level; stays put at either end. */
export function stepZoom<L>(levels: readonly L[], current: L, direction: 'in' | 'out'): L {
  const i = levels.indexOf(current);
  if (direction === 'in' && i > 0) return levels[i - 1];
  if (direction === 'out' && i >= 0 && i < levels.length - 1) return levels[i + 1];
  return current;
}
