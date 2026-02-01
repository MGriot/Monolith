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
  priority: string;
  start_date?: string;
  due_date?: string;
  blocked_by_ids?: string[];
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  blocked_by_ids?: string[];
  subtasks?: Subtask[];
}

interface ProjectGanttProps {
  tasks: Task[];
  projectStartDate?: string;
  projectDueDate?: string;
  initialShowSubtasks?: boolean;
}

type GanttItem = (Task | (Subtask & { isSubtask: boolean, parentTitle: string, parentId: string })) & { rowIndex: number };

export default function ProjectGantt({ tasks, projectStartDate, projectDueDate, initialShowSubtasks = false }: ProjectGanttProps) {
  const [showSubtasks, setShowSubtasks] = useState(initialShowSubtasks);

  const ganttItems = useMemo(() => {
    const items: GanttItem[] = [];
    let currentRow = 0;
    
    tasks.forEach(task => {
      if (task.start_date && task.due_date) {
        items.push({ ...task, rowIndex: currentRow++ });
      }
      
      if (showSubtasks && task.subtasks) {
        task.subtasks.forEach(st => {
          if (st.start_date && st.due_date) {
            items.push({ ...st, isSubtask: true, parentTitle: task.title, parentId: task.id, rowIndex: currentRow++ });
          }
        });
      }
    });
    
    return items;
  }, [tasks, showSubtasks]);

  const viewWindow = useMemo(() => {
    const dates: Date[] = [];
    
    ganttItems.forEach(item => {
      if (item.start_date) dates.push(parseISO(item.start_date));
      if (item.due_date) dates.push(parseISO(item.due_date));
    });

    if (projectStartDate) dates.push(parseISO(projectStartDate));
    if (projectDueDate) dates.push(parseISO(projectDueDate));

    if (dates.length === 0) return null;

    const start = startOfMonth(min(dates));
    const end = endOfMonth(max(dates));

    return { start, end };
  }, [ganttItems, projectStartDate, projectDueDate]);

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
    return (daysFromStart / totalDays) * 100;
  };

  const getWidth = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const duration = differenceInDays(end, start) + 1;
    return (duration / totalDays) * 100;
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

  const getPriorityColorHex = (item: any) => {
    if (item.status === 'Done' || item.status === 'done') return "#10b981"; // emerald-500
    
    const priority = item.priority || 'Medium';
    switch (priority) {
      case 'Critical': return "#ef4444"; // red-500
      case 'High': return "#f97316"; // orange-500
      case 'Medium': return "#f59e0b"; // amber-500
      case 'Low': return "#3b82f6"; // blue-500
      default: return "#64748b"; // slate-500
    }
  };

  const getProgressWidth = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'done') return '100%';
    if (s === 'in progress' || s === 'review') return '50%';
    return '0%';
  };

  const isMilestone = (item: any) => {
    return item.start_date === item.due_date;
  };

  const todayPos = getPosition(new Date().toISOString());
  const rowHeight = 56;
  const svgHeight = ganttItems.length * rowHeight;

  return (
    <div className="flex flex-col bg-white overflow-x-auto">
      {/* Gantt Controls */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/30 sticky left-0">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-subtasks" 
            checked={showSubtasks} 
            onCheckedChange={setShowSubtasks} 
          />
          <Label htmlFor="show-subtasks" className="text-sm font-medium">Include Subtasks</Label>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Done</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Critical</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
                {format(viewWindow.start, 'MMM yyyy')} - {format(viewWindow.end, 'MMM yyyy')}
            </div>
        </div>
      </div>

      <div className="relative flex-1 min-w-[1000px]">
        {/* Timeline Header */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 sticky top-0 z-20">
            <div className="w-64 border-r border-slate-200 p-3 flex-shrink-0 font-bold text-[10px] text-slate-500 uppercase tracking-widest bg-slate-50/50 sticky left-0 z-30">
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
        <div className="relative">
            {/* Dependency Lines Layer */}
            <svg 
                className="absolute inset-0 pointer-events-none z-10" 
                viewBox={`0 0 1000 ${svgHeight}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: `${svgHeight}px` }}
            >
                <defs>
                    <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto">
                        <polygon points="0 0, 12 4, 0 8" fill="#94a3b8" />
                    </marker>
                </defs>

                {/* Hierarchy Lines (Parent -> First Subtask) */}
                {tasks.map(task => {
                    if (!showSubtasks || !task.subtasks || task.subtasks.length === 0) return null;
                    if (!task.start_date || !task.due_date) return null;

                    const parentItem = ganttItems.find(i => i.id === task.id);
                    if (!parentItem) return null;

                    // Find the first subtask that actually has dates and is in ganttItems
                    const firstSubtask = task.subtasks.find(st => st.start_date && st.due_date);
                    if (!firstSubtask) return null;

                    const subtaskItem = ganttItems.find(i => i.id === firstSubtask.id);
                    if (!subtaskItem) return null;

                    const startX = getPosition(task.start_date) * 10;
                    const startY = parentItem.rowIndex * rowHeight + (rowHeight / 2);
                    const endX = getPosition(firstSubtask.start_date!) * 10;
                    const endY = subtaskItem.rowIndex * rowHeight + (rowHeight / 2);

                    const color = getPriorityColorHex(task);

                    // Path: Start at Parent Start-Left -> Down to Subtask Row -> Right to Subtask Start-Left
                    return (
                        <path 
                            key={`hier-${task.id}`}
                            d={`M ${startX} ${startY} V ${endY} H ${endX}`}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.5"
                            strokeOpacity="0.4"
                            strokeDasharray="4 2"
                            shapeRendering="crispEdges"
                        />
                    );
                })}

                {/* Dependency Lines (Predecessor -> Successor) */}
                {ganttItems.map((item) => {
                    if (!item.blocked_by_ids || item.blocked_by_ids.length === 0) return null;
                    
                    return item.blocked_by_ids.map(blockerId => {
                        const blocker = ganttItems.find(i => i.id === blockerId);
                        if (!blocker) return null;

                        // Start at end of blocker (using 1000-unit scale for X)
                        const startX = getPosition(blocker.due_date!) * 10;
                        const startY = blocker.rowIndex * rowHeight + (rowHeight / 2);
                        
                        // End at start of current item
                        const endX = getPosition(item.start_date!) * 10;
                        const endY = item.rowIndex * rowHeight + (rowHeight / 2);

                        // Path: horizontal out -> vertical to row -> horizontal in
                        const yMid = startY + (endY - startY) / 2;
                        const color = getPriorityColorHex(blocker);

                        return (
                            <path 
                                key={`${item.id}-${blockerId}`}
                                d={`M ${startX} ${startY} V ${yMid} H ${endX} V ${endY}`}
                                fill="none"
                                stroke={color}
                                strokeWidth="2"
                                strokeOpacity="0.6"
                                shapeRendering="crispEdges"
                                markerEnd="url(#arrowhead)"
                            />
                        );
                    });
                })}
            </svg>

            {/* Today Line */}
            {todayPos >= 0 && todayPos <= 100 && (
                <div 
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-20 pointer-events-none opacity-50"
                    style={{ left: `${todayPos}%` }}
                >
                    <div className="bg-red-400 text-white text-[8px] font-bold px-1 py-0.5 rounded-b-sm whitespace-nowrap">
                        TODAY
                    </div>
                </div>
            )}

            {ganttItems.map((item) => {
            const isSub = 'isSubtask' in item;
            const milestone = isMilestone(item);
            
            return (
                <div key={item.id} className={cn(
                "flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group relative",
                isSub && "bg-slate-50/20"
                )}>
                <div className="w-64 border-r border-slate-200 p-3 flex-shrink-0 flex flex-col justify-center min-w-0 sticky left-0 bg-inherit z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <span className={cn(
                    "text-xs font-semibold truncate",
                    isSub ? "text-slate-500 pl-4 border-l-2 border-l-slate-200" : "text-slate-900"
                    )}>
                    {item.title}
                    </span>
                    {isSub && (
                    <span className="text-[9px] text-slate-400 pl-4 truncate">Parent: {(item as any).parentTitle}</span>
                    )}
                </div>
                <div className="flex-1 relative h-14 py-4">
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
                    
                    {/* Bar or Milestone */}
                    {milestone ? (
                        <div 
                            className={cn(
                                "absolute w-4 h-4 rotate-45 border-2 border-white shadow-md z-10",
                                getBarColor(item)
                            )}
                            style={{ 
                                left: `calc(${getPosition(item.start_date!)}% - 8px)`,
                                top: '20px'
                            }}
                            title={`${item.title} (Milestone)`}
                        />
                    ) : (
                        <div 
                            className={cn(
                                "absolute h-6 rounded shadow-sm transition-all group-hover:scale-[1.01] flex items-center px-2 border-l-4 border-white/20 overflow-hidden",
                                getBarColor(item),
                                isSub ? "opacity-80 h-4 mt-1" : "opacity-100"
                            )}
                            style={{ 
                                left: `${getPosition(item.start_date!)}%`, 
                                width: `${getWidth(item.start_date!, item.due_date!)}%`,
                                top: isSub ? '20px' : '16px'
                            }}
                        >
                            {/* Progress Fill */}
                            <div 
                                className="absolute left-0 top-0 bottom-0 bg-black/10 transition-all"
                                style={{ width: getProgressWidth(item.status) }}
                            />
                            
                            <span className="text-[9px] font-black text-white truncate drop-shadow-sm z-10">
                                {Math.round(getWidth(item.start_date!, item.due_date!) / 100 * totalDays)}d
                            </span>
                        </div>
                    )}
                </div>
                </div>
            );
            })}
        </div>
      </div>
    </div>
  );
}
