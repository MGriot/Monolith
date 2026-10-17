// Pure helpers for the time tracker. The API stores naive UTC timestamps (no "Z"), so they are parsed as UTC here.

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  duration_seconds: number;
  user?: { id?: string; full_name?: string | null; email?: string | null } | null;
}

export interface TaskTimeSummary {
  task_id: string;
  total_seconds: number;
  entry_count: number;
  running: boolean;
  estimate_hours: number;
  actual_hours: number;
  variance_hours: number;
  percent_of_estimate: number | null;
}

/** Parse a server timestamp; a string without an offset is UTC. */
export function parseServerDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

/** Whole seconds a timer has been running (never negative). */
export function elapsedSeconds(startedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - parseServerDate(startedAt).getTime()) / 1000));
}

/** "1:05:09" — for the live timer display. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(sec)}`;
}

/** "2h 05m", "45m", "0m" — for totals and lists (seconds are rounded to the nearest minute). */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Parse what a person types for a duration into seconds: "1h 30m", "90m", "1.5h", "1:30", "45" (minutes).
 * Returns null when it cannot be understood or is not positive.
 */
export function parseDurationInput(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  let seconds: number | null = null;

  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  if (clock) {
    seconds = Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  } else if (/^\d+(\.\d+)?$/.test(text)) {
    seconds = Number(text) * 60; // bare number = minutes
  } else {
    const parts = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
    if (parts && (parts[1] || parts[2])) {
      seconds = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60;
    }
  }
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds);
}

/** A manual entry that ended at `end` and lasted `seconds`, as the ISO strings the API expects (UTC). */
export function manualEntryRange(end: Date, seconds: number): { started_at: string; ended_at: string } {
  return { started_at: new Date(end.getTime() - seconds * 1000).toISOString(), ended_at: end.toISOString() };
}

/** Tone for the estimate-vs-actual bar. */
export function estimateStatus(summary: Pick<TaskTimeSummary, 'estimate_hours' | 'percent_of_estimate'>): 'none' | 'ok' | 'warn' | 'over' {
  if (!summary.estimate_hours || summary.percent_of_estimate === null) return 'none';
  if (summary.percent_of_estimate > 100) return 'over';
  if (summary.percent_of_estimate >= 80) return 'warn';
  return 'ok';
}

/** "+2.5h over" / "1h left" / "" when there is no estimate. */
export function describeVariance(summary: Pick<TaskTimeSummary, 'estimate_hours' | 'variance_hours'>): string {
  if (!summary.estimate_hours) return '';
  const v = Math.round(summary.variance_hours * 10) / 10;
  if (v === 0) return 'on estimate';
  return v > 0 ? `${v}h over` : `${Math.abs(v)}h left`;
}
