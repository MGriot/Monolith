/** Recurring tasks: the UI model for the backend's RRULE subset (see backend/app/core/recurrence.py). */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type MonthlyMode = 'day' | 'last' | 'nth';

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export const WEEKDAY_LABELS: Record<string, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
};

export interface RecurrenceModel {
  freq: Freq;
  interval: number;
  /** WEEKLY: weekdays to repeat on (empty = same weekday as the task) */
  byDay: string[];
  /** MONTHLY */
  monthlyMode: MonthlyMode;
  monthDay: number;
  /** MONTHLY nth weekday, e.g. 1MO, -1FR */
  nth: string;
  /** yyyy-MM-dd or '' */
  until: string;
}

export const DEFAULT_MODEL: RecurrenceModel = {
  freq: 'WEEKLY', interval: 1, byDay: [], monthlyMode: 'day', monthDay: 1, nth: '1MO', until: '',
};

/** Build the rule string; null means "does not repeat". */
export function buildRule(m: RecurrenceModel | null): string | null {
  if (!m) return null;
  const interval = Math.min(365, Math.max(1, Math.floor(m.interval) || 1));
  const parts = [`FREQ=${m.freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (m.freq === 'WEEKLY' && m.byDay.length) {
    parts.push(`BYDAY=${WEEKDAYS.filter((d) => m.byDay.includes(d)).join(',')}`);
  }
  if (m.freq === 'MONTHLY') {
    if (m.monthlyMode === 'last') parts.push('BYMONTHDAY=-1');
    else if (m.monthlyMode === 'nth') parts.push(`BYDAY=${m.nth}`);
    else parts.push(`BYMONTHDAY=${Math.min(31, Math.max(1, Math.floor(m.monthDay) || 1))}`);
  }
  if (m.until) parts.push(`UNTIL=${m.until.replace(/-/g, '')}`);
  return parts.join(';');
}

/** Parse a stored rule into the UI model; null when empty. Unknown shapes fall back to defaults for the freq. */
export function parseRule(rule: string | null | undefined): RecurrenceModel | null {
  if (!rule || !rule.trim()) return null;
  const map: Record<string, string> = {};
  for (const chunk of rule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) map[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(map.FREQ)) return null;
  const m: RecurrenceModel = { ...DEFAULT_MODEL, freq: map.FREQ as Freq, byDay: [] };
  m.interval = Number(map.INTERVAL) > 0 ? Number(map.INTERVAL) : 1;
  if (map.FREQ === 'WEEKLY' && map.BYDAY) m.byDay = map.BYDAY.split(',').filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  if (map.FREQ === 'MONTHLY') {
    if (map.BYMONTHDAY === '-1') m.monthlyMode = 'last';
    else if (map.BYMONTHDAY) { m.monthlyMode = 'day'; m.monthDay = Number(map.BYMONTHDAY) || 1; }
    else if (map.BYDAY) { m.monthlyMode = 'nth'; m.nth = map.BYDAY.split(',')[0]; }
  }
  if (map.UNTIL && /^\d{8}/.test(map.UNTIL)) m.until = `${map.UNTIL.slice(0, 4)}-${map.UNTIL.slice(4, 6)}-${map.UNTIL.slice(6, 8)}`;
  return m;
}

const ORDINALS: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth', '-1': 'last' };
const FULL_DAYS: Record<string, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };

/** "Every 2 weeks on Mon, Wed" */
export function describeRule(rule: string | null | undefined): string {
  const m = parseRule(rule);
  if (!m) return 'Does not repeat';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[m.freq];
  let text = m.interval === 1 ? `Every ${unit}` : `Every ${m.interval} ${unit}s`;
  if (m.freq === 'WEEKLY' && m.byDay.length) text += ` on ${m.byDay.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
  if (m.freq === 'MONTHLY') {
    if (m.monthlyMode === 'last') text += ' on the last day';
    else if (m.monthlyMode === 'nth') {
      const match = m.nth.match(/^([+-]?\d)(\w\w)$/);
      text += match ? ` on the ${ORDINALS[String(Number(match[1]))] ?? match[1]} ${FULL_DAYS[match[2]] ?? match[2]}` : '';
    } else text += ` on day ${m.monthDay}`;
  }
  if (m.until) text += ` until ${m.until}`;
  return text;
}
