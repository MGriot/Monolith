import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fromDateInput, toDateInputValue } from './dates';

/**
 * Pure logic behind the interactive Gantt: day snapping, drag/resize maths, keyboard moves, dependency checks.
 * Everything works on local calendar days as `yyyy-MM-dd` strings (see dates.ts), never on UTC instants.
 */

export type DragMode = 'move' | 'start' | 'end';
export type DepType = 'FS' | 'SS' | 'FF' | 'SF';
export type BarSide = 'start' | 'end';

/** Inclusive day range, both ends `yyyy-MM-dd`. */
export interface DayRange {
  start: string;
  end: string;
}

export interface DepEdge {
  predecessor_id: string;
  successor_id: string;
  type: DepType | string;
  lag_days: number;
}

const toDate = (day: string) => parseISO(day);
const toDay = (date: Date) => format(date, 'yyyy-MM-dd');

export const shiftDay = (day: string, delta: number): string => toDay(addDays(toDate(day), delta));

/** Inclusive length in days (a one-day task is 1). */
export const rangeLength = (r: DayRange): number => differenceInCalendarDays(toDate(r.end), toDate(r.start)) + 1;

/** API timestamp -> `yyyy-MM-dd`, or '' when empty. */
export const apiToDay = (value: string | null | undefined): string => toDateInputValue(value);

/** Values for PUT /tasks/{id}. */
export const rangeToApi = (r: DayRange) => ({ start_date: fromDateInput(r.start), due_date: fromDateInput(r.end) });

export const sameRange = (a: DayRange, b: DayRange) => a.start === b.start && a.end === b.end;

/** Pointer travel in pixels -> whole days (snapped to the nearest day). */
export function snapDelta(px: number, dayWidth: number): number {
  if (!dayWidth || !Number.isFinite(px)) return 0;
  const d = Math.round(px / dayWidth);
  return d === 0 ? 0 : d; // avoid -0
}

/**
 * Apply a drag of `deltaDays` to a range. `move` shifts both ends, `start`/`end` resize and never go below one day:
 * the dragged edge stops at the opposite edge.
 */
export function applyDrag(range: DayRange, mode: DragMode, deltaDays: number): DayRange {
  if (mode === 'move') return { start: shiftDay(range.start, deltaDays), end: shiftDay(range.end, deltaDays) };
  if (mode === 'start') {
    const start = shiftDay(range.start, deltaDays);
    return { start: start > range.end ? range.end : start, end: range.end };
  }
  const end = shiftDay(range.end, deltaDays);
  return { start: range.start, end: end < range.start ? range.start : end };
}

/** Keyboard alternative: arrows move by a day, Shift+arrows resize the end, Alt+Shift+arrows resize the start. */
export function keyboardAdjust(
  key: string,
  mods: { shift?: boolean; alt?: boolean } = {},
): { mode: DragMode; delta: number } | null {
  const delta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  if (!delta) return null;
  if (!mods.shift) return { mode: 'move', delta };
  return { mode: mods.alt ? 'start' : 'end', delta };
}

/** The API uses 'Critical'/'High'/..., older code compared lowercase. Compare through this. */
export const normalizePriority = (p: string | null | undefined): string => (p || '').trim().toLowerCase();

/**
 * On the critical path only when the backend's CPM says so. `slack_days` is not consulted:
 * endpoints that skip CPM leave it unset, and 0 used to be its default.
 */
export const isCriticalTask = (t: { is_critical?: boolean | null } | null | undefined): boolean => t?.is_critical === true;

/** Empty days kept before the first and after the last task, per zoom level. */
export const VIEW_BUFFER_DAYS = { day: 2, week: 2, month: 3, quarter: 7, year: 14 } as const;

/** Dependencies as edges, merging the rich `blocked_by` list with the bare `blocked_by_ids` (treated as FS, no lag). */
export function collectDependencies(
  items: { id: string; blocked_by?: { predecessor_id: string; type?: string; lag_days?: number }[] | null; blocked_by_ids?: string[] | null }[],
): DepEdge[] {
  const edges: DepEdge[] = [];
  for (const item of items) {
    const seen = new Set<string>();
    for (const d of item.blocked_by || []) {
      seen.add(d.predecessor_id);
      edges.push({ predecessor_id: d.predecessor_id, successor_id: item.id, type: d.type || 'FS', lag_days: d.lag_days || 0 });
    }
    for (const pid of item.blocked_by_ids || []) {
      if (!seen.has(pid)) edges.push({ predecessor_id: pid, successor_id: item.id, type: 'FS', lag_days: 0 });
    }
  }
  return edges;
}

/** Earliest allowed day for the successor's start (FS/SS) or end (FF/SF), given the predecessor range. */
export function dependencyBound(edge: Pick<DepEdge, 'type' | 'lag_days'>, pred: DayRange): { side: BarSide; day: string } {
  const lag = edge.lag_days || 0;
  switch (edge.type) {
    case 'SS':
      return { side: 'start', day: shiftDay(pred.start, lag) };
    case 'FF':
      return { side: 'end', day: shiftDay(pred.end, lag) };
    case 'SF':
      return { side: 'end', day: shiftDay(pred.start, lag) };
    default:
      // FS: the successor starts the day after the predecessor finishes (+ lag).
      return { side: 'start', day: shiftDay(pred.end, 1 + lag) };
  }
}

export interface DependencyViolation {
  edge: DepEdge;
  /** The task whose dates are too early. */
  taskId: string;
  /** Days the successor is early by. */
  shortBy: number;
}

/**
 * Violations involving `taskId` when it occupies `range` and everyone else keeps `ranges`. Checks both the
 * constraints that bind the task (as successor) and those it imposes on others (as predecessor).
 */
export function dependencyViolations(
  taskId: string,
  range: DayRange,
  ranges: ReadonlyMap<string, DayRange>,
  edges: readonly DepEdge[],
): DependencyViolation[] {
  const out: DependencyViolation[] = [];
  for (const edge of edges) {
    if (edge.successor_id !== taskId && edge.predecessor_id !== taskId) continue;
    const pred = edge.predecessor_id === taskId ? range : ranges.get(edge.predecessor_id);
    const succ = edge.successor_id === taskId ? range : ranges.get(edge.successor_id);
    if (!pred || !succ) continue;
    const bound = dependencyBound(edge, pred);
    const actual = bound.side === 'start' ? succ.start : succ.end;
    if (actual < bound.day) {
      out.push({
        edge,
        taskId: edge.successor_id,
        shortBy: differenceInCalendarDays(toDate(bound.day), toDate(actual)),
      });
    }
  }
  return out;
}

/** True when adding predecessor -> successor would close a loop (successor already reaches predecessor). */
export function wouldCreateCycle(edges: readonly DepEdge[], predecessorId: string, successorId: string): boolean {
  if (predecessorId === successorId) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const list = next.get(e.predecessor_id);
    if (list) list.push(e.successor_id);
    else next.set(e.predecessor_id, [e.successor_id]);
  }
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === predecessorId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) || []));
  }
  return false;
}

export type LinkCheck = { ok: true } | { ok: false; reason: string };

/** Client-side pre-check so an impossible link is refused visually before a request is made. */
export function validateLink(edges: readonly DepEdge[], predecessorId: string, successorId: string): LinkCheck {
  if (predecessorId === successorId) return { ok: false, reason: 'A task cannot depend on itself' };
  if (edges.some((e) => e.predecessor_id === predecessorId && e.successor_id === successorId)) {
    return { ok: false, reason: 'These tasks are already linked' };
  }
  if (wouldCreateCycle(edges, predecessorId, successorId)) {
    return { ok: false, reason: 'That link would create a circular dependency' };
  }
  return { ok: true };
}

/** Dragging from `from` side of the predecessor onto `to` side of the successor. */
export function dependencyTypeFor(from: BarSide, to: BarSide): DepType {
  if (from === 'end') return to === 'start' ? 'FS' : 'FF';
  return to === 'start' ? 'SS' : 'SF';
}

/** Which side of a bar a pointer is over, from its x within the bar. */
export function sideAt(x: number, barLeft: number, barWidth: number): BarSide {
  return x < barLeft + barWidth / 2 ? 'start' : 'end';
}

/** Short human text for a violation, used in the preview badge and the commit toast. */
export function describeViolation(v: DependencyViolation, titleOf: (id: string) => string): string {
  const n = v.shortBy;
  return `${v.edge.type} "${titleOf(v.edge.predecessor_id)}" -> "${titleOf(v.edge.successor_id)}": ${n} day${n === 1 ? '' : 's'} too early`;
}
