import { useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Subtask {
  id: string;
  title: string;
  status: string;
  start_date?: string;
  due_date?: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  subtasks?: Subtask[];
}

interface ProjectGanttProps {
  tasks: Task[];
}

export default function ProjectGantt({ tasks }: ProjectGanttProps) {
  const [showSubtasks, setShowSubtasks] = useState(false);

  const ganttItems = useMemo(() => {
    const items: (Task | Subtask & { isSubtask: boolean, parentTitle: string })[] = [];
    
    tasks.forEach(task => {
      if (task.start_date && task.due_date) {
        items.push(task);
      }
      
      if (showSubtasks && task.subtasks) {
        task.subtasks.forEach(st => {
          if (st.start_date && st.due_date) {
            items.push({ ...st, isSubtask: true, parentTitle: task.title });
          }
        });
      }
    });
    
    return items;
  }, [tasks, showSubtasks]);

  const viewWindow = useMemo(() => {
    if (ganttItems.length === 0) return null;
    const dates = ganttItems.map(t => parseISO(t.start_date!)).concat(ganttItems.map(t => parseISO(t.due_date!)));
    return {
      start: startOfMonth(min(dates)),
      end: endOfMonth(max(dates)),
    };
  }, [ganttItems]);

  const months = useMemo(() => {
    if (!viewWindow) return [];
    return eachMonthOfInterval({
      start: viewWindow.start,
      end: viewWindow.end,
    });
  }, [viewWindow]);

  if (!viewWindow || ganttItems.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 space-y-4">
        <div className="flex items-center space-x-2 mb-4">
          <Switch 
            id="show-subtasks-empty" 
            checked={showSubtasks} 
            onCheckedChange={setShowSubtasks} 
          />
          <Label htmlFor="show-subtasks-empty">Show Subtasks</Label>
        </div>
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed rounded-xl w-full">
          <p>No tasks with start and due dates found.</p>
        </div>
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

  const getBarColor = (item: any) => {
    if (item.status === 'Done' || item.status === 'done') return "bg-emerald-500 border-emerald-600";
    
    const priority = item.priority || 'Medium';
    switch (priority) {
      case 'Critical': return "bg-red-500 border-red-600";
      case 'High': return "bg-orange-500 border-orange-600";
      case 'Medium': return "bg-amber-500 border-amber-600";
      case 'Low': return "bg-blue-500 border-blue-600";
      default: return "bg-slate-500 border-slate-600";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Gantt Controls */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/30">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-subtasks" 
            checked={showSubtasks} 
            onCheckedChange={setShowSubtasks} 
          />
          <Label htmlFor="show-subtasks" className="text-sm font-medium">Include Subtasks</Label>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          {format(viewWindow.start, 'MMM yyyy')} - {format(viewWindow.end, 'MMM yyyy')}
        </div>
      </div>

      {/* Timeline Header */}
      <div className="flex border-b border-slate-200 bg-slate-50/50 sticky top-0 z-10">
        <div className="w-64 border-r border-slate-200 p-3 flex-shrink-0 font-bold text-[10px] text-slate-500 uppercase tracking-widest">
          Label
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
      <div className="flex-1 overflow-y-auto min-h-0">
        {ganttItems.map((item) => {
          const isSubtask = 'isSubtask' in item;
          return (
            <div key={item.id} className={cn(
              "flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group",
              isSubtask && "bg-slate-50/20"
            )}>
              <div className="w-64 border-r border-slate-200 p-3 flex-shrink-0 flex flex-col justify-center min-w-0">
                <span className={cn(
                  "text-xs font-semibold truncate",
                  isSubtask ? "text-slate-500 pl-4 border-l-2 border-l-slate-200" : "text-slate-900"
                )}>
                  {item.title}
                </span>
                {isSubtask && (
                  <span className="text-[9px] text-slate-400 pl-4">Parent: {(item as any).parentTitle}</span>
                )}
              </div>
              <div className="flex-1 relative h-14 py-4 min-w-[800px]">
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
                
                {/* Bar */}
                <div 
                  className={cn(
                    "absolute h-6 rounded shadow-sm transition-all group-hover:scale-[1.01] flex items-center px-2 border-l-4",
                    getBarColor(item),
                    isSubtask ? "opacity-70 h-4" : "opacity-100"
                  )}
                  style={{ 
                    left: `${getPosition(item.start_date!)}%`, 
                    width: `${getWidth(item.start_date!, item.due_date!)}%`,
                    top: isSubtask ? '20px' : '16px'
                  }}
                >
                  <span className="text-[9px] font-black text-white truncate drop-shadow-sm">
                    {Math.round(getWidth(item.start_date!, item.due_date!) / 100 * totalDays)}d
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}