import { Archive, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBulkTasks, type BulkRequest } from '@/hooks/use-bulk-tasks';

const STATUSES = ['Backlog', 'Todo', 'In Progress', 'On hold', 'Review', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export interface BulkAssigneeOption {
  id: string;
  label: string;
}

interface Props {
  ids: string[];
  assignees: BulkAssigneeOption[];
  onClear: () => void;
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/** Sticky bar shown while tasks are selected: change status / priority / assignee, archive, delete. */
export default function BulkActionBar({ ids, assignees, onClear }: Props) {
  const bulk = useBulkTasks(() => onClear());
  if (ids.length === 0) return null;

  const run = (req: Omit<BulkRequest, 'ids'>) => bulk.mutate({ ids, ...req });
  const n = ids.length;

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${n} selected task${n === 1 ? '' : 's'}`}
      className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg"
    >
      <span className="text-sm font-semibold text-foreground" aria-live="polite">
        {n} selected
      </span>

      <label className="sr-only" htmlFor="bulk-status">Set status</label>
      <select
        id="bulk-status"
        className={selectClass}
        value=""
        disabled={bulk.isPending}
        onChange={(e) => e.target.value && run({ patch: { status: e.target.value } })}
      >
        <option value="">Status...</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="bulk-priority">Set priority</label>
      <select
        id="bulk-priority"
        className={selectClass}
        value=""
        disabled={bulk.isPending}
        onChange={(e) => e.target.value && run({ patch: { priority: e.target.value } })}
      >
        <option value="">Priority...</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="bulk-assignee">Assign to</label>
      <select
        id="bulk-assignee"
        className={selectClass}
        value=""
        disabled={bulk.isPending}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          run({ patch: { assignee_ids: v === '__none__' ? [] : [v] } });
        }}
      >
        <option value="">Assign to...</option>
        <option value="__none__">Nobody (unassign)</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={bulk.isPending}
        onClick={() => {
          if (window.confirm(`Archive ${n} task${n === 1 ? '' : 's'}?`)) run({ action: 'archive' });
        }}
      >
        <Archive className="w-3.5 h-3.5" aria-hidden /> Archive
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-destructive hover:text-destructive"
        disabled={bulk.isPending}
        onClick={() => {
          if (window.confirm(`Permanently delete ${n} task${n === 1 ? '' : 's'}? This cannot be undone.`)) run({ action: 'delete' });
        }}
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete
      </Button>

      {bulk.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label="Working" />}
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Clear selection" onClick={onClear} disabled={bulk.isPending}>
        <X className="w-4 h-4" aria-hidden />
      </Button>
    </div>
  );
}
