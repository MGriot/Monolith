import { endOfDay, format, isAfter, parseISO } from 'date-fns';

/**
 * The API stores naive timestamps ("2025-01-05T00:00:00", no zone). Dates in this app are calendar days, so they are
 * always handled as LOCAL calendar days on the client; going through `new Date(x).toISOString()` converts to UTC and
 * shifts the day (one day earlier per save for users east of UTC).
 */

/** Parse anything the API returns (naive datetime, date-only, or with Z/offset) into a local Date. */
export function parseApiDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** API value -> `yyyy-MM-dd` for <input type="date">. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const d = parseApiDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** `yyyy-MM-dd` from <input type="date"> -> value to send to the API (naive local midnight), or null. */
export function fromDateInput(value: string | null | undefined): string | null {
  return value && value.trim() ? `${value.trim()}T00:00:00` : null;
}

/** Localised short date for display, '-' when empty. */
export function formatDisplayDate(value: string | Date | null | undefined, fallback = '-'): string {
  const d = parseApiDate(value);
  return d ? d.toLocaleDateString() : fallback;
}

/**
 * True once `check` is after the END of the due day. A task due today is not late until tomorrow
 * (comparing against local midnight flagged it as overdue all day).
 */
export function isAfterDueDay(check: Date, due: Date | null | undefined): boolean {
  return !!due && isAfter(check, endOfDay(due));
}
