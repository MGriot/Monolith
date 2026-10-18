import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Archive, Clock, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types';
import { confirmDialog } from '@/lib/confirm';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** small line under the title, e.g. "Website Relaunch › 1.2" */
  subtitle?: ReactNode;
  /** extra header content, e.g. a project picker */
  headerExtra?: ReactNode;
  /** normally a TaskForm, which fills the remaining height */
  children: ReactNode;
}

/** Shell for creating / editing a task: a wide, fixed-height dialog whose body is the two-pane TaskForm. */
export default function TaskDialog({ open, onOpenChange, title, subtitle, headerExtra, children }: TaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="h-[90vh] md:h-[85vh]">
        <DialogHeader className="pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={subtitle ? 'text-xs' : 'sr-only'}>
            {subtitle || title}
          </DialogDescription>
          {headerExtra}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const formatStamp = (value?: string | null) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  return isNaN(d.getTime()) ? 'N/A' : format(d, 'PP p');
};

interface TaskFooterMetaProps {
  task: Task;
  onArchive: () => void;
  onDelete: () => void;
  archiving?: boolean;
  deleting?: boolean;
}

/** Left side of the task form footer: timestamps plus archive / delete. */
export function TaskFooterMeta({ task, onArchive, onDelete, archiving, deleting }: TaskFooterMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
          onClick={() => {
            void confirmDialog({ title: `Archive the task “${task.title}”?`, description: 'You can restore it from the Archive page.', confirmLabel: 'Archive' }).then((ok) => { if (ok) { onArchive(); } });
          }}
          disabled={archiving}
        >
          {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          Archive
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          onClick={() => {
            void confirmDialog({ title: `Delete the task “${task.title}”?`, description: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }).then((ok) => { if (ok) { onDelete(); } });
          }}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete
        </Button>
      </div>
      <div className="hidden items-center gap-1.5 text-[11px] text-fg-faint lg:flex" title={`Modified ${formatStamp(task.updated_at)}`}>
        <Clock className="h-3 w-3" />
        Created {formatStamp(task.created_at)}
      </div>
    </div>
  );
}
