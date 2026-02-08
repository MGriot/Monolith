import { useState } from 'react';
import { parseISO, isAfter } from 'date-fns';
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

export interface ProjectTaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onSubtaskClick?: (subtask: Task) => void;
  onAddSubtask?: (parentTask: Task) => void;
  onReorderTask?: (taskId: string, direction: 'up' | 'down') => void;
  onIndentTask?: (taskId: string, direction: 'indent' | 'outdent') => void;
}

interface RecursiveRowProps {
  task: Task;
  level: number;
  onTaskClick: (task: Task) => void;
  onSubtaskClick?: (subtask: Task) => void;
  onAddSubtask?: (parentTask: Task) => void;
  onReorderTask?: (taskId: string, direction: 'up' | 'down') => void;
  onIndentTask?: (taskId: string, direction: 'indent' | 'outdent') => void;
}

function RecursiveTaskRow({ task, level, onTaskClick, onSubtaskClick, onAddSubtask, onReorderTask, onIndentTask }: RecursiveRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = task.subtasks && task.subtasks.length > 0;

  // New Overdue Logic: only if (today or completed_at) > deadline_at
  const isDone = task.status === 'Done' || task.status === 'done';
  const deadlineDate = task.deadline_at ? parseISO(task.deadline_at) : null;
  const endDate = isDone
    ? (task.completed_at ? parseISO(task.completed_at) : (task.due_date ? parseISO(task.due_date) : null))
    : new Date();
  const overdue = !!(deadlineDate && endDate && isAfter(endDate, deadlineDate));

  return (
    <>
      <TableRow
        className={cn(
          "hover:bg-slate-50/50 transition-colors cursor-pointer group border-b border-slate-100",
          level > 0 && "bg-slate-50/20"
        )}
        onClick={() => {
          if (level === 0) onTaskClick(task);
          else onSubtaskClick ? onSubtaskClick(task) : onTaskClick(task);
        }}
      >
        <TableCell className="py-2" onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }
        }}>
          {hasChildren && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-primary hover:bg-primary/10">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="text-[10px] font-black text-slate-400 py-2">{task.wbs_code}</TableCell>
        <TableCell className="font-semibold text-slate-900 text-sm py-2">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 16}px` }}>
            {level > 0 && (
              <div className="flex items-center gap-2 mr-1">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </div>
            )}
            {task.is_milestone && <Milestone className={cn("w-3.5 h-3.5 text-blue-500 shrink-0", level > 0 && "w-3 h-3 text-blue-400")} />}
            <span className={cn(level > 0 && "text-xs text-slate-600 font-medium", "flex items-center gap-1.5")}>
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
              className="h-7 w-7 text-slate-400 hover:text-primary"
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
              className="h-7 w-7 text-slate-400 hover:text-primary"
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
              className="h-7 w-7 text-slate-400 hover:text-primary"
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
              className="h-7 w-7 text-slate-400 hover:text-primary"
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
        <TableCell className="py-2">
          {task.topic && <Badge variant="secondary" className="text-[9px] font-bold bg-slate-100 text-slate-600 border-none px-1.5">{task.topic}</Badge>}
        </TableCell>
        <TableCell className="py-2">
          <Badge variant="outline" className={cn(
            "capitalize text-[9px] font-bold px-1.5 h-5",
            getStatusColors(task.status).bg,
            getStatusColors(task.status).text,
            getStatusColors(task.status).border
          )}>{task.status}</Badge>
        </TableCell>
        <TableCell className="py-2">
          <Badge variant="outline" className={cn(
            "capitalize text-[9px] font-bold px-1.5 h-5",
            getPriorityColors(task.priority).bg,
            getPriorityColors(task.priority).text,
            getPriorityColors(task.priority).border
          )}>
            {task.priority}
          </Badge>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex -space-x-1.5 overflow-hidden">
            {task.assignees?.map((u) => (
              <div
                key={u.id}
                className="inline-block h-5 w-5 rounded-full bg-slate-100 border border-white flex items-center justify-center shrink-0 shadow-sm"
                title={u.full_name || u.email}
              >
                <UserIcon className="w-2.5 h-2.5 text-slate-500" />
              </div>
            ))}
          </div>
        </TableCell>
        <TableCell className="py-2">
          <span className="text-[10px] font-medium text-slate-500">
            {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '-'}
          </span>
        </TableCell>
        <TableCell className="text-right py-2">
          <div className="flex flex-col items-end">
            <span className={cn("font-bold text-slate-500", level === 0 ? "text-[11px]" : "text-[10px]")}>
              {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
            </span>
            {task.deadline_at && (
              <span className="text-[9px] font-black text-red-500 flex items-center gap-0.5">
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
        />
      ))}
    </>
  );
}

export default function ProjectTaskList({ tasks, onTaskClick, onSubtaskClick, onAddSubtask, onReorderTask, onIndentTask }: ProjectTaskListProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="border-b border-slate-100 hover:bg-slate-50">
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-16 text-[10px] font-black uppercase tracking-widest text-slate-500">WBS</TableHead>
            <TableHead className="min-w-[200px] text-[10px] font-black uppercase tracking-widest text-slate-500">Task</TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Topic</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assignees</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Concluded</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Due / Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-32 text-center text-slate-500 italic text-sm">
                No tasks found in this project.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => (
              <RecursiveTaskRow
                key={task.id}
                task={task}
                level={0}
                onTaskClick={onTaskClick}
                onSubtaskClick={onSubtaskClick}
                onAddSubtask={onAddSubtask}
                onReorderTask={onReorderTask}
                onIndentTask={onIndentTask}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
