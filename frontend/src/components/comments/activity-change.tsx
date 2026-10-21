import { Archive, ArchiveRestore, Bot, GitBranch, Pencil, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { actorName, isAutomatic, parseUtc, type ActivityEvent } from '@/lib/activity';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof Pencil> = {
  created: Plus,
  updated: Pencil,
  status_changed: RefreshCw,
  assigned: UserPlus,
  archived: Archive,
  restored: ArchiveRestore,
  deleted: Trash2,
  dependency_added: GitBranch,
  dependency_removed: GitBranch,
};

/** One change-log line: "Sam Rivera changed status Todo → In Progress on Wave 1 · 14:02". */
export function ActivityChange({
  event,
  currentUserId,
  showTask = true,
  onOpenTask,
}: {
  event: ActivityEvent;
  currentUserId?: string;
  showTask?: boolean;
  onOpenTask?: (taskId: string) => void;
}) {
  const auto = isAutomatic(event);
  const Icon = auto ? Bot : ICONS[event.kind] ?? Pencil;
  const at = parseUtc(event.created_at);
  const canOpen = !!(onOpenTask && event.task_id && event.kind !== 'deleted');

  return (
    <div className="flex items-start gap-2.5 px-1 text-xs text-fg-soft" data-testid="activity-change">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          auto ? 'bg-review-soft text-review' : event.kind === 'deleted' ? 'bg-danger-soft text-danger' : 'bg-muted text-fg-soft',
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </span>
      <p className="min-w-0 flex-1 leading-5">
        <span className="font-medium text-foreground">{actorName(event, currentUserId)}</span> {event.summary}
        {showTask && event.task_title && (
          <>
            {' on '}
            {canOpen ? (
              <button type="button" onClick={() => onOpenTask!(event.task_id!)} className="font-medium text-foreground underline-offset-2 hover:underline">
                {event.task_title}
              </button>
            ) : (
              <span className="font-medium text-foreground">{event.task_title}</span>
            )}
          </>
        )}
      </p>
      <time dateTime={at.toISOString()} title={at.toLocaleString()} className="shrink-0 tabular-nums text-fg-faint">
        {at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
  );
}
