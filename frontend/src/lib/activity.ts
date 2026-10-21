import type { Comment, User } from '@/types';

/** One line of the change log (GET /projects/{id}/activity, GET /tasks/{id}/activity). */
export interface ActivityEvent {
  id: string;
  project_id: string;
  task_id: string | null;
  task_title: string | null;
  actor: User | null;
  actor_label: string | null;
  kind: string;
  summary: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export type ActivityFilter = 'all' | 'comments' | 'changes';

export type TimelineItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'comment'; key: string; at: Date; comment: Comment }
  | { type: 'event'; key: string; at: Date; event: ActivityEvent };

/** The API stores naive UTC timestamps: read them as UTC. */
export function parseUtc(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayLabel(day: Date, now: Date = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(day, now)) return 'Today';
  if (sameDay(day, yesterday)) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', ...(day.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Who made a change: a person's name, or the automatic source ("Automation: …", "Automatic (from subtasks)"). */
export function actorName(event: ActivityEvent, currentUserId?: string): string {
  if (event.actor_label) return event.actor_label;
  if (!event.actor) return 'Someone';
  if (currentUserId && event.actor.id === currentUserId) return 'You';
  return event.actor.full_name || event.actor.email || 'Someone';
}

export const isAutomatic = (event: ActivityEvent) => !!event.actor_label;

/** Comments and change-log lines in one chronological list (oldest first), with a separator per day. */
export function buildTimeline(
  comments: readonly Comment[],
  events: readonly ActivityEvent[],
  filter: ActivityFilter = 'all',
  now: Date = new Date(),
): TimelineItem[] {
  const items: Exclude<TimelineItem, { type: 'day' }>[] = [];
  if (filter !== 'changes') {
    for (const comment of comments) items.push({ type: 'comment', key: `c-${comment.id}`, at: parseUtc(comment.created_at), comment });
  }
  if (filter !== 'comments') {
    for (const event of events) items.push({ type: 'event', key: `e-${event.id}`, at: parseUtc(event.created_at), event });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: TimelineItem[] = [];
  let last: Date | null = null;
  for (const item of items) {
    if (!last || !sameDay(last, item.at)) out.push({ type: 'day', key: `d-${item.at.toDateString()}`, label: dayLabel(item.at, now) });
    out.push(item);
    last = item.at;
  }
  return out;
}
