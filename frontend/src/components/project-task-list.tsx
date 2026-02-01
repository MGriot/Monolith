import React, { useState } from 'react';
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
  User as UserIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Subtask {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  topic?: string;
  type?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  topic?: string;
  type?: string;
  start_date?: string;
  due_date?: string;
  blocked_by_ids?: string[];
  attachments?: string[];
  assignees?: { id: string; full_name: string; email: string }[];
  subtasks?: Subtask[];
}

interface ProjectTaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export default function ProjectTaskList({ tasks, onTaskClick }: ProjectTaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="border-b border-slate-100 hover:bg-slate-50">
            <TableHead className="w-10"></TableHead>
            <TableHead className="min-w-[200px] text-[10px] font-black uppercase tracking-widest text-slate-500">Task</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Topic</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assignees</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Due Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-slate-500 italic text-sm">
                No tasks found in this project.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => (
              <React.Fragment key={task.id}>
                <TableRow 
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer group border-b border-slate-100"
                  onClick={() => onTaskClick(task)}
                >
                  <TableCell className="py-2" onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskExpansion(task.id);
                  }}>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-primary hover:bg-primary/10">
                      {expandedTasks.has(task.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 text-sm py-2">{task.title}</TableCell>
                  <TableCell className="py-2">
                    {task.topic && <Badge variant="secondary" className="text-[9px] font-bold bg-slate-100 text-slate-600 border-none px-1.5">{task.topic}</Badge>}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className={cn(
                      "capitalize text-[9px] font-bold px-1.5 h-5",
                      task.status === 'Done' || task.status === 'done' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white"
                    )}>{task.status}</Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[9px] font-black px-1.5 h-5">
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
                  <TableCell className="text-right text-[11px] font-bold text-slate-500 py-2">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
                {expandedTasks.has(task.id) && task.subtasks?.map(st => (
                  <TableRow key={st.id} className="bg-slate-50/30 border-b border-slate-100">
                    <TableCell></TableCell>
                    <TableCell className="pl-8 text-xs text-slate-600 py-2">
                      <div className="flex items-center gap-2 relative">
                        <div className="absolute -left-4 top-1/2 w-3 h-[1px] bg-slate-300" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        {st.title}
                      </div>
                    </TableCell>
                    <TableCell colSpan={2} className="py-2">
                      <div className="flex items-center gap-2">
                        <Badge className="text-[8px] h-4 bg-slate-100 text-slate-500 hover:bg-slate-100 border-none px-1.5 font-bold uppercase">{st.status}</Badge>
                        <Badge variant={st.priority === 'High' || st.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[8px] h-4 px-1.5 font-black uppercase">
                          {st.priority}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell colSpan={2} className="py-2"></TableCell>
                    <TableCell className="text-right text-[10px] text-slate-400 font-medium py-2">
                      {st.due_date ? new Date(st.due_date).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
