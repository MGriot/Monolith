import { Fragment, useEffect, useMemo, useState } from 'react';
import { parseISO, differenceInDays } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Milestone,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusColors, getPriorityColors } from '@/constants/colors';
import type { Task } from '@/types';
import { isAfterDueDay } from "@/lib/dates";
import { isCriticalTask } from '@/lib/gantt';
import type { TaskGroup } from '@/lib/task-filters';
import { clickSelection, headerState, pruneSelection, toggleAll, visibleIds, type SelectionState } from '@/lib/selection';

export interface ProjectTaskListProps {
  tasks: Task[];
  /** when set (and labelled), rows are rendered under a heading per group instead of from `tasks` */
  groups?: TaskGroup<Task>[];
  /** true when a filter hides tasks, to word the empty state accordingly */
  filtered?: boolean;
  onTaskClick: (task: Task) => void;
  onSubtaskClick?: (subtask: Task) => void;
  onAddSubtask?: (parentTask: Task) => void;
  onReorderTask?: (taskId: string, direction: 'up' | 'down') => void;
  onIndentTask?: (taskId: string, direction: 'indent' | 'outdent') => void;
  /** when set, a checkbox column is shown; the parent owns the state (and renders the bulk action bar) */
  selection?: { state: SelectionState; onChange: (next: SelectionState) => void };
  /** follows the Gantt's Critical Path toggle: critical rows are flagged, the rest dimmed */
  highlightCritical?: boolean;
}

interface RecursiveRowProps {
  task: Task;
  level: number;
  onTaskClick: (task: Task) => void;
  onSubtaskClick?: (subtask: Task) => void;
  onAddSubtask?: (parentTask: Task) => void;
  onReorderTask?: (taskId: string, direction: 'up' | 'down') => void;
  onIndentTask?: (taskId: string, direction: 'indent' | 'outdent') => void;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  selected?: ReadonlySet<string>;
  onSelectClick?: (id: string, shift: boolean) => void;
  highlightCritical?: boolean;
}

function RecursiveTaskRow({ task, level, onTaskClick, onSubtaskClick, onAddSubtask, onReorderTask, onIndentTask, collapsed, onToggleCollapse, selected, onSelectClick, highlightCritical }: RecursiveRowProps) {
  const isExpanded = !collapsed.has(task.id);
  const hasChildren = task.subtasks && task.subtasks.length > 0;

  // Refined Alert Logic: 
  // 1. If concluded, show alert ONLY if concluded late (past both due date and deadline if present).
  // 2. If not concluded, show alert if Today is past due date or deadline.
  // 3. User spec: "If Conclusion Date <= Due Date OR Conclusion Date <= Hard Deadline, do NOT show."
  const conclusionDate = task.completed_at ? parseISO(task.completed_at) : null;
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const deadlineAt = task.deadline_at ? parseISO(task.deadline_at) : null;
  const today = new Date();

  const checkDate = conclusionDate || today;
  
  // Is it past due?
  const isPastDue = isAfterDueDay(checkDate, dueDate);
  // Is it past deadline?
  const isPastDeadline = isAfterDueDay(checkDate, deadlineAt);

  // Apply "on-time" grace: if finished on or before EITHER date, it's NOT overdue.
  const finishedOnTime = conclusionDate && (
    (dueDate && !isAfterDueDay(conclusionDate, dueDate)) || 
    (deadlineAt && !isAfterDueDay(conclusionDate, deadlineAt))
  );

  const overdue = !finishedOnTime && (isPastDue || isPastDeadline);

  const duration = task.start_date && task.due_date 
    ? differenceInDays(parseISO(task.due_date), parseISO(task.start_date)) + 1
    : 0;

  const critical = highlightCritical && isCriticalTask(task);

  return (
    <>
      <TableRow
        data-state={selected?.has(task.id) ? 'selected' : undefined}
        className={cn(
          "hover:bg-subtle/50 transition-colors cursor-pointer group border-b border-hairline",
          level > 0 && "bg-subtle/20",
          critical && "bg-red-500/5 hover:bg-red-500/10 [&>td:first-child]:shadow-[inset_3px_0_0_#ef4444]",
          highlightCritical && !critical && "opacity-50"
        )}
        onClick={() => {
          if (level === 0) onTaskClick(task);
          else onSubtaskClick ? onSubtaskClick(task) : onTaskClick(task);
        }}
      >
        {onSelectClick && (
          <TableCell className="w-8 py-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
              aria-label={`Select ${task.title}`}
              checked={selected?.has(task.id) ?? false}
              onChange={() => undefined}
              onClick={(e) => onSelectClick(task.id, e.shiftKey)}
            />
          </TableCell>
        )}
        <TableCell className="py-2" onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            onToggleCollapse(task.id);
          }
        }}>
          {hasChildren && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-fg-faint hover:text-primary hover:bg-primary/10">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="text-[11px] font-semibold text-fg-faint py-2">
          <div className="flex items-center gap-1.5">
            {task.wbs_code}
            {critical && (
              <span className="rounded bg-red-500/10 px-1 py-px text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400" title="On the critical path">
                Critical
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="font-semibold text-foreground text-sm py-2">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 16}px` }}>
            {level > 0 && (
              <div className="flex items-center gap-2 mr-1">
                <div className="w-1.5 h-1.5 rounded-full bg-fg-ghost" />
              </div>
            )}
            {task.is_milestone && <Milestone className={cn("w-3.5 h-3.5 text-blue-500 shrink-0", level > 0 && "w-3 h-3 text-blue-400")} />}
            <span className={cn(level > 0 && "text-xs text-fg-soft font-medium", "flex items-center gap-1.5")}>
              {task.title}
              {overdue && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
              )}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-2 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-fg-faint hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onReorderTask?.(task.id, 'up');
              }}
              title="Move Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-fg-faint hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onReorderTask?.(task.id, 'down');
              }}
              title="Move Down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-fg-faint hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                // Indent (make subtask)
                onIndentTask?.(task.id, 'indent');
              }}
              title="Indent (Make Subtask)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-fg-faint hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                // Outdent (promote to parent)
                onIndentTask?.(task.id, 'outdent');
              }}
              title="Outdent (Move to Parent Level)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        </TableCell>
        <TableCell className="py-2 text-center">
          {(task.topics && task.topics.length > 0) ? (
            <div className="flex flex-wrap gap-1 justify-center">
              {task.topics.map(t => (
                <Badge key={t.id} variant="secondary" className="text-[11px] font-bold bg-muted border-none px-1.5" style={{ color: t.color }}>{t.name}</Badge>
              ))}
            </div>
          ) : (
            (task.topic_ref?.name || task.topic) && (
              <Badge variant="secondary" className="text-[11px] font-bold bg-muted text-fg-soft border-none px-1.5" style={{ color: task.topic_ref?.color }}>
                {task.topic_ref?.name || task.topic}
              </Badge>
            )
          )}
        </TableCell>
        <TableCell className="py-2 text-center">
          {(task.types && task.types.length > 0) ? (
            <div className="flex flex-wrap gap-1 justify-center">
              {task.types.map(t => (
                <Badge key={t.id} variant="outline" className="text-[11px] font-bold px-1.5 h-5">{t.name}</Badge>
              ))}
            </div>
          ) : (
            (task.type_ref?.name || task.type) && (
              <Badge variant="outline" className="text-[11px] font-bold px-1.5 h-5">
                {task.type_ref?.name || task.type}
              </Badge>
            )
          )}
        </TableCell>
        <TableCell className="py-2 text-center">
          <Badge variant="outline" className={cn(
            "capitalize text-[11px] font-bold px-1.5 h-5",
            getStatusColors(task.status).bg,
            getStatusColors(task.status).text,
            getStatusColors(task.status).border
          )}>{task.status}</Badge>
        </TableCell>
        <TableCell className="py-2 text-center">
          <Badge variant="outline" className={cn(
            "capitalize text-[11px] font-bold px-1.5 h-5",
            getPriorityColors(task.priority).bg,
            getPriorityColors(task.priority).text,
            getPriorityColors(task.priority).border
          )}>
            {task.priority}
          </Badge>
        </TableCell>
        <TableCell className="py-2 text-center">
          <div className="flex -space-x-1.5 overflow-hidden justify-center">
            {task.assignees && task.assignees.length > 0 ? task.assignees.map((u) => (
              <div
                key={u.id}
                className="inline-block h-5 w-5 rounded-full bg-muted border border-background flex items-center justify-center shrink-0 shadow-sm"
                title={u.full_name || u.email}
              >
                <UserIcon className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
            )) : (
              <span className="text-[11px] text-fg-faint italic">Unassigned</span>
            )}
          </div>
        </TableCell>
        <TableCell className="py-2 text-center">
            {task.checklist && task.checklist.length > 0 ? (
                <Badge variant="secondary" className="text-[11px] font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-500/20">
                    {task.checklist.filter(i => i.is_done).length}/{task.checklist.length}
                </Badge>
            ) : <span className="text-fg-ghost">-</span>}
        </TableCell>
        <TableCell className="py-2 text-center">
            <span className={cn(
                "text-[11px] font-bold",
                (task.real_cost || 0) > (task.budget || 0) ? "text-red-500" : "text-fg-body"
            )}>
                {task.real_cost ? `$${task.real_cost.toLocaleString()}` : '-'}
            </span>
        </TableCell>
        <TableCell className="py-2 text-center">
          <span className="text-[11px] font-semibold text-muted-foreground">{duration > 0 ? `${duration}d` : '-'}</span>
        </TableCell>
        <TableCell className="py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {task.start_date ? new Date(task.start_date).toLocaleDateString() : '-'}
          </span>
        </TableCell>
        <TableCell className="py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '-'}
          </span>
        </TableCell>
        <TableCell className="text-right py-2">
          <div className="flex flex-col items-end">
            <span className={cn("font-bold text-muted-foreground", level === 0 ? "text-[11px]" : "text-[11px]")}>
              {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
            </span>
            {task.deadline_at && (
              <span className="text-[11px] font-semibold text-red-500 flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {new Date(task.deadline_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>
      {hasChildren && isExpanded && task.subtasks?.map(sub => (
        <RecursiveTaskRow
          key={sub.id}
          task={sub}
          level={level + 1}
          onTaskClick={onTaskClick}
          onSubtaskClick={onSubtaskClick}
          onAddSubtask={onAddSubtask}
          onReorderTask={onReorderTask}
          onIndentTask={onIndentTask}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          selected={selected}
          onSelectClick={onSelectClick}
          highlightCritical={highlightCritical}
        />
      ))}
    </>
  );
}

export default function ProjectTaskList({ tasks, groups, filtered, onTaskClick, onSubtaskClick, onAddSubtask, onReorderTask, onIndentTask, selection, highlightCritical }: ProjectTaskListProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const shownGroups = groups && groups.length > 0 && groups[0].label ? groups : [{ key: 'all', label: '', tasks }];
  // rows as displayed, top to bottom: what a shift-click range runs over
  const order = useMemo(() => shownGroups.flatMap((g) => visibleIds(g.tasks, collapsed)), [shownGroups, collapsed]);
  const selectionState = selection?.state;
  const onSelectionChange = selection?.onChange;
  useEffect(() => {
    // a filter or a deletion can remove selected rows from view; they must not be acted on invisibly
    if (!selectionState || !onSelectionChange) return;
    const pruned = pruneSelection(selectionState, order);
    if (pruned !== selectionState) onSelectionChange(pruned);
  }, [order, selectionState, onSelectionChange]);

  const header = selectionState ? headerState(selectionState, order) : 'none';
  const colCount = selection ? 16 : 15;

  return (
    <div className="rounded-md border border-border bg-background overflow-hidden shadow-sm">
      <div className="table-container">
        <Table>
          <TableHeader className="bg-subtle">
          <TableRow className="border-b border-hairline hover:bg-subtle">
            {selection && (
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                  aria-label="Select all tasks"
                  checked={header === 'all'}
                  ref={(el) => { if (el) el.indeterminate = header === 'some'; }}
                  onChange={() => selectionState && selection.onChange(toggleAll(selectionState, order))}
                />
              </TableHead>
            )}
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-16 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">WBS</TableHead>
            <TableHead className="min-w-[200px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Task</TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Topic</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Type</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Status</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Priority</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Assignees</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">List</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Cost ($)</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Days</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start</TableHead>
            <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Concluded</TableHead>
            <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Due / Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="h-32 text-center text-muted-foreground italic text-sm">
                {filtered ? 'No tasks match the current filters.' : 'No tasks found in this project.'}
              </TableCell>
            </TableRow>
          ) : (
            shownGroups.map((group) => (
              <Fragment key={group.key}>
                {group.label && (
                  <TableRow className="bg-subtle hover:bg-subtle">
                    <TableCell colSpan={colCount} className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span role="heading" aria-level={4}>{group.label} <span className="font-semibold text-fg-faint">({group.tasks.length})</span></span>
                    </TableCell>
                  </TableRow>
                )}
                {group.tasks.map((task) => (
                  <RecursiveTaskRow
                    key={task.id}
                    task={task}
                    level={0}
                    onTaskClick={onTaskClick}
                    onSubtaskClick={onSubtaskClick}
                    onAddSubtask={onAddSubtask}
                    onReorderTask={onReorderTask}
                    onIndentTask={onIndentTask}
                    collapsed={collapsed}
                    onToggleCollapse={toggleCollapse}
                    selected={selectionState?.selected}
                    onSelectClick={selectionState && onSelectionChange ? (id, shift) => onSelectionChange(clickSelection(selectionState, order, id, shift)) : undefined}
                    highlightCritical={highlightCritical}
                  />
                ))}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
