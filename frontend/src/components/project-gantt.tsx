import { useMemo } from 'react';
import { 
  format, 
  differenceInDays, 
  startOfMonth, 
  endOfMonth, 
  eachMonthOfInterval,
  parseISO,
  min,
  max
} from 'date-fns';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  status: string;
  start_date?: string;
  due_date?: string;
}

interface ProjectGanttProps {
  tasks: Task[];
}

export default function ProjectGantt({ tasks }: ProjectGanttProps) {
  const ganttTasks = useMemo(() => {
    return tasks.filter(t => t.start_date && t.due_date);
  }, [tasks]);

  const viewWindow = useMemo(() => {
    if (ganttTasks.length === 0) return null;
    const starts = ganttTasks.map(t => parseISO(t.start_date!));
    const ends = ganttTasks.map(t => parseISO(t.due_date!));
    return {
      start: startOfMonth(min(starts)),
      end: endOfMonth(max(ends)),
    };
  }, [ganttTasks]);

  const months = useMemo(() => {
    if (!viewWindow) return [];
    return eachMonthOfInterval({
      start: viewWindow.start,
      end: viewWindow.end,
    });
  }, [viewWindow]);

  if (!viewWindow || ganttTasks.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500">
        <p>No tasks with start and due dates found.</p>
      </div>
    );
  }

  const totalDays = differenceInDays(viewWindow.end, viewWindow.start) + 1;

  const getPosition = (dateStr: string) => {
    const date = parseISO(dateStr);
    const daysFromStart = differenceInDays(date, viewWindow.start);
    return Math.max(0, Math.min(100, (daysFromStart / totalDays) * 100));
  };

  const getWidth = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const duration = differenceInDays(end, start) + 1;
    return Math.max(1, (duration / totalDays) * 100);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Timeline Header */}
      <div className="flex border-b border-slate-200 bg-slate-50/50">
        <div className="w-48 border-r border-slate-200 p-3 flex-shrink-0 font-semibold text-xs text-slate-500 uppercase">
          Task
        </div>
        <div className="flex-1 relative h-10 flex items-center">
          {months.map((month) => {
            const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
            return (
              <div 
                key={month.toISOString()} 
                className="absolute border-l border-slate-200 h-full flex items-center pl-2 text-[10px] font-bold text-slate-400 uppercase"
                style={{ left: `${left}%` }}
              >
                {format(month, 'MMM')}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Content */}
      <div className="overflow-y-auto max-h-[500px]">
        {ganttTasks.map((task) => (
          <div key={task.id} className="flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
            <div className="w-48 border-r border-slate-200 p-3 flex-shrink-0 flex items-center">
              <span className="text-xs font-medium text-slate-700 truncate">{task.title}</span>
            </div>
            <div className="flex-1 relative h-12 py-3">
              {/* Grid lines */}
              {months.map((month) => {
                const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
                return (
                  <div 
                    key={month.toISOString()} 
                    className="absolute top-0 bottom-0 border-l border-slate-100 h-full"
                    style={{ left: `${left}%` }}
                  />
                );
              })}
              
              {/* Task Bar */}
              <div 
                className={cn(
                  "absolute h-6 rounded border flex items-center px-2 shadow-sm transition-transform group-hover:scale-[1.01]",
                  task.status === 'done' ? "bg-green-50 border-green-200" : "bg-primary/5 border-primary/20"
                )}
                style={{ 
                  left: `${getPosition(task.start_date!)}%`, 
                  width: `${getWidth(task.start_date!, task.due_date!)}%` 
                }}
              >
                <span className="text-[9px] font-bold text-primary truncate">
                  {task.title}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
