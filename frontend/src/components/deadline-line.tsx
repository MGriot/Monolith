import { deadlineState } from "@/lib/deadline";
import { cn } from "@/lib/utils";

const LABEL = { ok: "", "at-risk": "at risk", overdue: "overdue" } as const;

/** One-line hard-deadline readout for a project's timeline card. */
export function DeadlineLine({ deadline, due, done }: { deadline?: string | null; due?: string | null; done: boolean }) {
  const state = deadlineState(deadline, due, done);
  if (state === "none") return <p className="text-[11px] text-muted-foreground font-medium">Deadline: -</p>;
  return (
    <p
      className={cn(
        "text-[11px] font-bold",
        state === "ok" && "text-fg-body",
        state === "at-risk" && "text-amber-600 dark:text-amber-400",
        state === "overdue" && "text-danger",
      )}
    >
      Deadline: {new Date(deadline!).toLocaleDateString()}
      {LABEL[state] && <span className="ml-1 uppercase">· {LABEL[state]}</span>}
    </p>
  );
}
