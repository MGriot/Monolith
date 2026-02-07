import { useMemo, useState, useRef } from 'react';
import { 
  format, 
  differenceInDays, 
  startOfMonth, 
  endOfMonth, 
  eachMonthOfInterval,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  startOfYear,
  endOfYear,
  parseISO,
  min,
  max,
} from 'date-fns';
import { toPng } from 'html-to-image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, User as UserIcon, Download, Folder } from 'lucide-react';
import { toast } from 'sonner';
import type { Task, User } from '@/types';

interface ResourceTimelineProps {
  tasks: Task[];
  users?: User[];
  title?: string;
}

type ZoomLevel = 'day' | 'week' | 'month' | 'year';

const ZOOM_CONFIG = {
  day: { scale: 120, label: 'Days' },
  week: { scale: 40, label: 'Weeks' },
  month: { scale: 12, label: 'Months' },
  year: { scale: 12, label: 'Years' }
};

export default function ResourceTimeline({ tasks, users, title = "Resource Load" }: ResourceTimelineProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  const [isExporting, setIsExporting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const exportTimeline = async () => {
    if (!timelineRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(timelineRef.current, { 
        backgroundColor: '#ffffff',
        style: { overflow: 'visible' }
      });
      const link = document.createElement('a');
      link.download = `resource-timeline-${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Timeline exported as PNG');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export timeline');
    } finally {
      setIsExporting(false);
    }
  };

  const getEffectiveEndDate = (item: any) => {
    return item.due_date || item.deadline_at || item.start_date;
  };

  // Group tasks by user
  const userResources = useMemo(() => {
    const resourceMap: Record<string, { user: User; tasks: Task[] }> = {};
    const unassigned: Task[] = [];

    // Initialize map if users are provided
    if (users) {
      users.forEach(u => {
        resourceMap[u.id] = { user: u, tasks: [] };
      });
    }

    const processTask = (task: Task) => {
      if (task.start_date && getEffectiveEndDate(task)) {
        if (task.assignees && task.assignees.length > 0) {
          task.assignees.forEach(assignee => {
            if (!resourceMap[assignee.id]) {
              resourceMap[assignee.id] = { user: assignee, tasks: [] };
            }
            resourceMap[assignee.id].tasks.push(task);
          });
        } else {
          unassigned.push(task);
        }
      }
      if (task.subtasks) {
        task.subtasks.forEach(processTask);
      }
    };

    tasks.forEach(processTask);

    const result = Object.values(resourceMap).filter(r => r.tasks.length > 0 || (users && users.some(u => u.id === r.user.id)));
    
    // Add "Unassigned" group if there are unassigned tasks
    if (unassigned.length > 0) {
      result.push({
        user: { id: 'unassigned', full_name: 'Unassigned', email: '' },
        tasks: unassigned
      });
    }

    return result;
  }, [tasks, users]);

  const viewWindow = useMemo(() => {
    const dates: Date[] = [];
    
    tasks.forEach(task => {
      const recurse = (t: Task) => {
        if (t.start_date) dates.push(parseISO(t.start_date));
        const end = getEffectiveEndDate(t);
        if (end) dates.push(parseISO(end));
        if (t.subtasks) t.subtasks.forEach(recurse);
      };
      recurse(task);
    });

    if (dates.length === 0) return null;

    let start = min(dates);
    let end = max(dates);

    if (zoomLevel === 'year') {
        start = startOfYear(start);
        end = endOfYear(end);
    } else {
        start = startOfMonth(start);
        end = endOfMonth(end);
    }

    return { start, end };
  }, [tasks, zoomLevel]);

  const timeTicks = useMemo(() => {
    if (!viewWindow) return [];
    const interval = { start: viewWindow.start, end: viewWindow.end };
    
    switch (zoomLevel) {
      case 'day': return eachDayOfInterval(interval);
      case 'week': return eachWeekOfInterval(interval);
      case 'month': return eachMonthOfInterval(interval);
      case 'year': return eachYearOfInterval(interval);
    }
  }, [viewWindow, zoomLevel]);

  if (!viewWindow || userResources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-xl h-64 text-slate-400">
        <UserIcon className="w-8 h-8 mb-2 opacity-20" />
        <p className="font-medium">No assigned tasks with dates found.</p>
      </div>
    );
  }

  const totalDays = differenceInDays(viewWindow.end, viewWindow.start) + 1;
  const dayWidth = ZOOM_CONFIG[zoomLevel].scale;
  const containerWidth = totalDays * dayWidth;

  const getPositionPercent = (dateStr: string) => {
    const date = parseISO(dateStr);
    const daysFromStart = differenceInDays(date, viewWindow.start);
    return (daysFromStart / totalDays) * 100;
  };

  const getWidthPercent = (startStr: string, endStr: string) => {
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

  const handleZoom = (direction: 'in' | 'out') => {
    const levels: ZoomLevel[] = ['day', 'week', 'month', 'year'];
    const currentIndex = levels.indexOf(zoomLevel);
    if (direction === 'in' && currentIndex > 0) setZoomLevel(levels[currentIndex - 1]);
    if (direction === 'out' && currentIndex < levels.length - 1) setZoomLevel(levels[currentIndex + 1]);
  };

  const todayPos = getPositionPercent(new Date().toISOString());

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-primary" />
            {title}
          </h3>
          <div className="flex items-center gap-1 border rounded-md bg-white p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('in')} disabled={zoomLevel === 'day'}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <span className="text-[9px] font-black uppercase w-12 text-center text-slate-500">{zoomLevel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('out')} disabled={zoomLevel === 'year'}>
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportTimeline} disabled={isExporting}>
          <Download className="w-3.5 h-3.5" />
          {isExporting ? '...' : 'PNG'}
        </Button>
      </div>

      <div className="overflow-x-auto relative" ref={timelineRef}>
        <div style={{ width: `${containerWidth + 200}px` }} className="relative min-w-full bg-white">
          {/* Header */}
          <div className="flex border-b border-slate-200 bg-slate-50/30 sticky top-0 z-20">
            <div className="w-48 border-r border-slate-200 p-3 flex-shrink-0 font-bold text-[10px] text-slate-500 uppercase tracking-widest bg-slate-50/50 sticky left-0 z-30">
              Person
            </div>
            <div className="flex-1 relative h-10 flex items-center">
              {timeTicks.map((tick) => {
                const left = getPositionPercent(tick.toISOString());
                let label = format(tick, 'MMM');
                if (zoomLevel === 'day') label = format(tick, 'dd MMM');
                if (zoomLevel === 'week') label = `W${format(tick, 'ww')}`;
                if (zoomLevel === 'year') label = format(tick, 'yyyy');

                return (
                  <div 
                    key={tick.toISOString()} 
                    className="absolute border-l border-slate-200 h-full flex items-center pl-2 text-[9px] font-bold text-slate-400 uppercase"
                    style={{ left: `${left}%` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Today Line */}
            {todayPos >= 0 && todayPos <= 100 && (
              <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none ml-48"
                style={{ left: `${todayPos}%` }}
              />
            )}

            {userResources.map((res) => (
              <div key={res.user.id} className="flex border-b border-slate-100 hover:bg-slate-50/30 transition-colors group">
                <div className="w-48 border-r border-slate-200 p-3 flex-shrink-0 flex items-center gap-2.5 sticky left-0 bg-white z-20 shadow-sm">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0 group-hover:scale-110 transition-transform">
                    <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-900 truncate">{res.user.full_name || res.user.email}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">{res.tasks.length} tasks</span>
                  </div>
                </div>
                
                <div className="flex-1 relative h-16 py-3">
                  {/* Grid lines */}
                  {timeTicks.map((tick) => (
                    <div 
                      key={tick.toISOString()} 
                      className="absolute top-0 bottom-0 border-l border-slate-50 h-full"
                      style={{ left: `${getPositionPercent(tick.toISOString())}%` }}
                    />
                  ))}

                  {/* Task Bars */}
                  {res.tasks.map((task, idx) => {
                    const pos = getPositionPercent(task.start_date!);
                    const width = getWidthPercent(task.start_date!, getEffectiveEndDate(task)!);
                    const isM = task.is_milestone || task.start_date === getEffectiveEndDate(task);
                    
                    // Simple overlap adjustment (stacking bars if they overlap)
                    // In a real production app, we'd use a more complex packing algorithm
                    const top = (idx % 2 === 0) ? '10px' : '30px';
                    const height = '18px';

                    return (
                      <div 
                        key={`${res.user.id}-${task.id}`}
                        className={cn(
                          "absolute rounded-sm shadow-sm border-l-2 border-white/20 transition-all hover:z-30 hover:scale-[1.02] flex items-center px-1.5 overflow-hidden group/bar",
                          getBarColor(task),
                          isM && "w-3 h-3 rotate-45 border-none"
                        )}
                        style={{ 
                          left: `${pos}%`, 
                          width: isM ? '12px' : `${width}%`,
                          top: isM ? '22px' : top,
                          height: isM ? '12px' : height,
                          opacity: 0.9
                        }}
                        title={`${task.title} (${task.project?.name || 'Task'})`}
                      >
                        {!isM && (
                          <span className="text-[8px] font-black text-white truncate whitespace-nowrap">
                            {task.title}
                          </span>
                        )}
                        
                        {/* Hover detail tooltip-like */}
                        <div className="absolute hidden group-hover/bar:flex bottom-full mb-1 left-0 bg-slate-900 text-white p-2 rounded text-[9px] z-50 whitespace-nowrap pointer-events-none">
                           <p className="font-black">{task.title}</p>
                           <p className="opacity-70 flex items-center gap-1"><Folder className="w-2.5 h-2.5" /> {task.project?.name}</p>
                           <p className="opacity-70">{format(parseISO(task.start_date!), 'MMM d')} - {format(parseISO(getEffectiveEndDate(task)!), 'MMM d')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
