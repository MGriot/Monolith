export type DeadlineState = "none" | "ok" | "at-risk" | "overdue";

/**
 * Where a hard deadline stands: overdue once it has passed (unless done),
 * at risk when the planned due date already lands after it.
 */
export function deadlineState(
  deadline: string | null | undefined,
  due: string | null | undefined,
  done: boolean,
  now: Date = new Date(),
): DeadlineState {
  if (!deadline) return "none";
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return "none";
  if (done) return "ok";
  if (d.getTime() < now.getTime()) return "overdue";
  if (due && new Date(due).getTime() > d.getTime()) return "at-risk";
  return "ok";
}
