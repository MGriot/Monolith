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
  isAfter,
} from 'date-fns';
import { toPng } from 'html-to-image';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, AlertTriangle, Download, Folder, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { getGanttBarColor as getBarColor } from '@/constants/colors';
import type { Task, Subtask } from '@/types';

interface ProjectGanttProps {
  tasks: Task[];
  projectStartDate?: string;
  projectDueDate?: string;
  initialShowSubtasks?: boolean;
}

type GanttItem = (Task | (Subtask & { isSubtask: boolean, parentTitle: string, parentId: string })) & { rowIndex: number, projectName?: string };
type ZoomLevel = 'day' | 'week' | 'month' | 'year';

const ZOOM_CONFIG = {
  day: { scale: 120, label: 'Days' },
  week: { scale: 40, label: 'Weeks' },
  month: { scale: 12, label: 'Months' },
  year: { scale: 2, label: 'Years' }
};

/**
 * Generates a path with fixed-dimension corners to prevent distortion during zoom.
 */
const getOrthogonalPath = (
  startSide: 'left' | 'right',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  overrideSpineX?: number
) => {
  const r = 8; // Smaller radius for tighter gutter turns
  const indent = 20;
  const gutterOffset = 22; // Offset from row center to travel in the white space between bars (ROW_HEIGHT is 56, bar is ~24)

  // 1. EXITING LEFT (Hierarchy)
  if (startSide === 'left') {
    const spineX = overrideSpineX ?? (Math.min(x1, x2) - indent);
    const ry = y2 > y1 ? r : -r;

    return `
      M ${x1} ${y1}
      H ${spineX + r}
      Q ${spineX} ${y1} ${spineX} ${y1 + ry}
      V ${y2 - ry}
      Q ${spineX} ${y2} ${spineX + r} ${y2}
      H ${x2}
    `.replace(/\s+/g, ' ');
  }

  // 2. EXITING RIGHT (Dependency)
  else {
    const buffer = 20;
    const isConflict = x2 < x1 + buffer;
    const ry = y2 > y1 ? r : -r;
    const transitY = y1 + (y2 > y1 ? gutterOffset : -gutterOffset);

    if (!isConflict) {
      const midX = x1 + buffer;

      return `
         M ${x1} ${y1}
         H ${midX - r}
         Q ${midX} ${y1} ${midX} ${y1 + ry}
         V ${y2 - ry}
         Q ${midX} ${y2} ${midX + r} ${y2}
         H ${x2}
       `.replace(/\s+/g, ' ');
    }

    // BACKWARDS / CONFLICT PATH (Loops back through gutters)
    const loopX = x1 + buffer;
    const backX = x2 - buffer;

    return `
      M ${x1} ${y1}
      H ${loopX - r}
      Q ${loopX} ${y1} ${loopX} ${y1 + ry}
      V ${transitY - ry}
      Q ${loopX} ${transitY} ${loopX - r} ${transitY}
      H ${backX + r}
      Q ${backX} ${transitY} ${backX} ${transitY + ry}
      V ${y2 - ry}
      Q ${backX} ${y2} ${backX + r} ${y2}
      H ${x2}
    `.replace(/\s+/g, ' ');
  }
};

const SIDEBAR_WIDTH = 256;
const ROW_HEIGHT = 56;

export default function ProjectGantt({ tasks, projectStartDate, projectDueDate, initialShowSubtasks = false }: ProjectGanttProps) {
  const [showSubtasks, setShowSubtasks] = useState(initialShowSubtasks);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  const [isExporting, setIsExporting] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);

  const exportGantt = async () => {
    if (!ganttRef.current) return;
    setIsExporting(true);
    try {
      // Increase DPI for high-quality export (3x scale)
      const dataUrl = await toPng(ganttRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        style: {
          overflow: 'visible'
        }
      });
      
      const link = document.createElement('a');
      link.download = `gantt-export-${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Gantt exported as high-DPI PNG');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Gantt');
    } finally {
      setIsExporting(false);
    }
  };

  const getEffectiveEndDate = (item: any) => {
    return item.due_date || item.deadline_at || item.start_date;
  };

  const ganttItems = useMemo(() => {
    const items: GanttItem[] = [];
    let currentRow = 0;

    const flattenTasks = (taskList: Task[], level: number = 0, parent?: Task) => {
      const sorted = [...taskList].sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));

      sorted.forEach(task => {
        if (task.start_date && (task.due_date || task.deadline_at)) {
          items.push({
            ...task,
            isSubtask: level > 0,
            parentTitle: parent?.title || "",
            parentId: parent?.id || "",
            projectName: task.project?.name || parent?.project?.name || "",
            rowIndex: currentRow++
          } as any);
        }

        if (showSubtasks && task.subtasks && task.subtasks.length > 0) {
          flattenTasks(task.subtasks, level + 1, task);
        }
      });
    };

    flattenTasks(tasks);
    return items;
  }, [tasks, showSubtasks]);

  const viewWindow = useMemo(() => {
    const dates: Date[] = [];

    ganttItems.forEach(item => {
      if (item.start_date) dates.push(parseISO(item.start_date));
      const effectiveEnd = getEffectiveEndDate(item);
      if (effectiveEnd) dates.push(parseISO(effectiveEnd));
    });

    if (projectStartDate) dates.push(parseISO(projectStartDate));
    if (projectDueDate) dates.push(parseISO(projectDueDate));

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

    // Add some padding
    return { start, end };
  }, [ganttItems, projectStartDate, projectDueDate, zoomLevel]);

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

  const minorTicks = useMemo(() => {
    if (!viewWindow) return [];
    const interval = { start: viewWindow.start, end: viewWindow.end };

    switch (zoomLevel) {
      case 'week': return eachDayOfInterval(interval);
      case 'month': return eachWeekOfInterval(interval);
      case 'year': return eachMonthOfInterval(interval);
      case 'day': return []; // No minor ticks for day view yet
      default: return [];
    }
  }, [viewWindow, zoomLevel]);

  if (!viewWindow || ganttItems.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 space-y-4 text-center">
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed rounded-xl w-full max-w-2xl">
          <p className="font-medium">No schedule data available.</p>
          <p className="text-xs opacity-70 mt-1">Ensure tasks have start dates and either due dates or deadlines.</p>
        </div>
      </div>
    );
  }

  const totalDays = differenceInDays(viewWindow.end, viewWindow.start) + 1;
  const dayWidth = ZOOM_CONFIG[zoomLevel].scale;
  const containerWidth = totalDays * dayWidth;

  const getPositionPx = (dateStr: string) => {
    const date = parseISO(dateStr);
    const daysFromStart = differenceInDays(date, viewWindow.start);
    return daysFromStart * dayWidth;
  };

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


  const getProgressWidth = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'done') return '100%';
    if (s === 'in progress' || s === 'review') return '50%';
    return '0%';
  };

  const isMilestone = (item: any) => {
    return item.is_milestone || (item.start_date && item.start_date === getEffectiveEndDate(item));
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const levels: ZoomLevel[] = ['day', 'week', 'month', 'year'];
    const currentIndex = levels.indexOf(zoomLevel);
    if (direction === 'in' && currentIndex > 0) setZoomLevel(levels[currentIndex - 1]);
    if (direction === 'out' && currentIndex < levels.length - 1) setZoomLevel(levels[currentIndex + 1]);
  };

  const todayPos = getPositionPercent(new Date().toISOString());
  const svgHeight = ganttItems.length * ROW_HEIGHT;

  return (
    <div className="flex flex-col bg-white">
      {/* Gantt Controls */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/30 sticky left-0 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-subtasks"
              checked={showSubtasks}
              onCheckedChange={setShowSubtasks}
            />
            <Label htmlFor="show-subtasks" className="text-sm font-medium">Include Subtasks</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-cpm"
              checked={showCriticalPath}
              onCheckedChange={setShowCriticalPath}
            />
            <Label htmlFor="show-cpm" className="text-sm font-medium text-red-500">Critical Path</Label>
          </div>
          <div className="flex items-center gap-1 border rounded-md bg-white p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('in')} disabled={zoomLevel === 'day'}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <span className="text-[10px] font-black uppercase w-16 text-center text-slate-500">{ZOOM_CONFIG[zoomLevel].label}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('out')} disabled={zoomLevel === 'year'}>
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={exportGantt}
            disabled={isExporting}
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting...' : 'Export PNG'}
          </Button>
        </div>
        {/* Floating Legend */}
        <div className="absolute top-24 right-4 flex flex-col gap-2 p-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-md shadow-sm z-50">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status (Fill)</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Backlog</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Todo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">On Hold</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Done</span>
            </div>
          </div>

          <div className="my-1 border-t border-slate-100" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Priority (Border)</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-blue-600" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-amber-600" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-orange-600" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-red-600" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Critical</span>
            </div>
          </div>

          <div className="text-[9px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-100 text-center">
            {format(viewWindow.start, 'MMM yyyy')} - {format(viewWindow.end, 'MMM yyyy')}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={ganttRef}>
        <div style={{ width: `${containerWidth + SIDEBAR_WIDTH}px` }} className="relative min-w-full bg-white">
          {/* Timeline Header */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 sticky top-0 z-20">
            <div
              style={{ width: `${SIDEBAR_WIDTH}px` }}
              className="border-r border-slate-200 p-3 flex-shrink-0 font-bold text-[10px] text-slate-500 uppercase tracking-widest bg-slate-50/50 sticky left-0 z-30"
            >
              Task
            </div>
            <div className="flex-1 relative h-10 flex items-center">
              {/* Minor Ticks */}
              {minorTicks?.map((tick) => {
                const left = getPositionPercent(tick.toISOString());
                let label = '';
                if (zoomLevel === 'week') label = format(tick, 'd');
                if (zoomLevel === 'month') label = format(tick, 'd');
                if (zoomLevel === 'year') label = format(tick, 'MMM');
                // day view has no minor ticks in current logic

                return (
                  <div
                    key={`minor-${tick.toISOString()}`}
                    className="absolute border-l border-slate-200/50 h-4 bottom-0 flex items-end pl-1 pb-0.5"
                    style={{ left: `${left}%` }}
                  >
                    <span className="text-[8px] text-slate-400 font-medium leading-none">{label}</span>
                  </div>
                );
              })}

              {/* Major Ticks */}
              {timeTicks?.map((tick) => {
                const left = getPositionPercent(tick.toISOString());
                let label = format(tick, 'MMM');
                if (zoomLevel === 'day') label = format(tick, 'dd MMM');
                if (zoomLevel === 'week') label = `W${format(tick, 'ww')}`;
                if (zoomLevel === 'year') label = format(tick, 'yyyy');

                return (
                  <div
                    key={tick.toISOString()}
                    className="absolute border-l border-slate-200 h-full flex items-center pl-2 text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap"
                    style={{ left: `${left}%` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Content */}
          <div className="relative">
            {/* Dependency Lines Layer - Offset by SIDEBAR_WIDTH to align with timeline */}
            <div
              style={{ left: `${SIDEBAR_WIDTH}px` }}
              className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
            >
              <svg
                className="w-full h-full"
                viewBox={`0 0 ${containerWidth} ${svgHeight}`}
                preserveAspectRatio="none"
                shapeRendering="geometricPrecision"
              >
                <defs>
                  <marker id="arrowhead-blue" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <path d="M 0 0 L 6 2 L 0 4 Z" fill="#2563eb" />
                  </marker>
                  <marker id="arrowhead-red" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <path d="M 0 0 L 6 2 L 0 4 Z" fill="#ef4444" />
                  </marker>
                  <marker id="arrowhead-amber" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <path d="M 0 0 L 6 2 L 0 4 Z" fill="#f59e0b" />
                  </marker>
                </defs>

                {/* Hierarchy Lines (Parent -> Subtasks) - Recursive */}
                {(() => {
                  const lines: React.ReactNode[] = [];
                  const drawHierarchy = (taskList: Task[]) => {
                    taskList.forEach(task => {
                      if (!showSubtasks || !task.subtasks || task.subtasks.length === 0) return;

                      const parentItem = ganttItems.find(i => i.id === task.id);
                      if (!parentItem) return;

                      const startX = getPositionPx(task.start_date!);
                      const startY = (parentItem as any).rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);

                      // Filter subtasks that have enough data to be rendered
                      const renderedSubtasks = task.subtasks
                        .map(st => ganttItems.find(i => i.id === st.id))
                        .filter((st): st is GanttItem => !!st && !!st.start_date);

                      if (renderedSubtasks.length === 0) return;

                      // Use a shared spineX at the leftmost point among parent and all children
                      const minChildX = Math.min(...renderedSubtasks.map(st => getPositionPx(st.start_date!)));
                      const sharedSpineX = Math.min(startX, minChildX) - 20;

                      lines.push(
                        <g key={`hier-group-${task.id}`}>
                          {/* Each subtask gets its own smooth curved connection from parent start */}
                          {renderedSubtasks.map(st => {
                            const childY = st.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);
                            const childX = getPositionPx(st.start_date!);

                            return (
                              <path
                                key={`hier-branch-${st.id}`}
                                d={getOrthogonalPath('left', startX, startY, childX, childY, sharedSpineX)}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                                strokeOpacity="0.5"
                                vectorEffect="non-scaling-stroke"
                                className="transition-all duration-300"
                              />
                            );
                          })}
                        </g>
                      );

                      // Recurse
                      drawHierarchy(task.subtasks);
                    });
                  };
                  drawHierarchy(tasks);
                  return lines;
                })()}

                {/* Dependency Lines (Predecessor -> Successor) */}
                {ganttItems.map((item) => {
                  const combinedDeps = [...(item.blocked_by || [])];
                  const existingPredIds = new Set(combinedDeps.map(d => d.predecessor_id));

                  if (item.blocked_by_ids) {
                    item.blocked_by_ids.forEach(bid => {
                      if (!existingPredIds.has(bid)) {
                        combinedDeps.push({
                          id: `synth-${bid}`,
                          successor_id: item.id,
                          predecessor_id: bid,
                          type: 'FS',
                          lag_days: 0
                        });
                        existingPredIds.add(bid);
                      }
                    });
                  }

                  if (combinedDeps.length === 0) return null;

                  return combinedDeps.map(dep => {
                    const blocker = ganttItems.find(i => i.id === dep.predecessor_id);
                    if (!blocker) return null;

                    const blockerEndDate = getEffectiveEndDate(blocker);
                    const sX = getPositionPx(blockerEndDate!) + dayWidth;
                    const eX = getPositionPx(item.start_date!);
                    const sY = blocker.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);
                    const eY = item.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);

                    const lagOffset = (dep.lag_days || 0) * dayWidth;
                    const adjustedSX = sX + lagOffset;
                    const isConflict = eX < adjustedSX;

                    const isCritical = showCriticalPath && item.is_critical && blocker.is_critical;
                    const color = isCritical ? "#ef4444" : (isConflict ? "#f59e0b" : "#2563eb");
                    const markerId = isCritical ? "arrowhead-red" : (isConflict ? "arrowhead-amber" : "arrowhead-blue");

                    return (
                      <g key={`${item.id}-${dep.predecessor_id}`}>
                        {/* Glow Effect for Critical Path */}
                        {isCritical && (
                          <path
                            d={getOrthogonalPath('right', sX, sY, eX, eY)}
                            fill="none"
                            stroke={color}
                            strokeWidth="8"
                            vectorEffect="non-scaling-stroke"
                            className="animate-pulse opacity-60"
                          />
                        )}
                        <path
                          d={getOrthogonalPath('right', sX, sY, eX, eY)}
                          fill="none"
                          stroke={color}
                          strokeWidth={isCritical ? "3" : "2"}
                          strokeOpacity={isCritical ? "1" : (isConflict ? "0.6" : "0.8")}
                          strokeDasharray={isConflict ? "4 2" : "none"}
                          vectorEffect="non-scaling-stroke"
                          markerEnd={`url(#${markerId})`}
                          className={cn("transition-all duration-300", isCritical && "animate-pulse")}
                        />
                        {dep.lag_days !== 0 && (
                          <text
                            x={(sX + eX) / 2}
                            y={(sY + eY) / 2 - 5}
                            fontSize="8"
                            fontWeight="bold"
                            fill={color}
                            textAnchor="middle"
                            className="drop-shadow-sm pointer-events-none"
                          >
                            {dep.lag_days > 0 ? `+${dep.lag_days}d` : `${dep.lag_days}d`}
                          </text>
                        )}
                      </g>
                    );
                  });
                })}
              </svg>
            </div>

            {/* Today Line */}
            {todayPos >= 0 && todayPos <= 100 && (
              <div
                style={{ left: `${todayPos}%`, marginLeft: `${SIDEBAR_WIDTH}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm w-max">
                  TODAY
                </div>
              </div>
            )}

            {ganttItems.map((item) => {
              const isSub = 'isSubtask' in item;
              const milestone = isMilestone(item);

              // New Overdue Logic: only if (today or completed_at) > deadline_at
              const isDone = item.status === 'Done' || item.status === 'done';
              const deadlineDate = item.deadline_at ? parseISO(item.deadline_at) : null;
              const endDate = isDone
                ? (item.completed_at ? parseISO(item.completed_at) : (item.due_date ? parseISO(item.due_date) : null))
                : new Date();
              const overdue = !!(deadlineDate && endDate && isAfter(endDate, deadlineDate));

              const hasDeadline = !!item.deadline_at;

              return (
                <div key={item.id} className={cn(
                  "flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group relative",
                  isSub && "bg-slate-50/20"
                )}>
                  <div
                    style={{ width: `${SIDEBAR_WIDTH}px` }}
                    className="border-r border-slate-200 p-3 flex-shrink-0 flex flex-col justify-center min-w-0 sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-slate-400 w-6 shrink-0">{item.wbs_code}</span>
                      <span className={cn(
                        "text-xs font-semibold truncate flex items-center gap-1",
                        isSub ? "text-slate-500 pl-2 border-l-2 border-l-slate-200" : "text-slate-900"
                      )}>
                        {item.title}
                        {overdue && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                        {((item.blocked_by_ids && item.blocked_by_ids.length > 0) || (item.blocking && item.blocking.length > 0)) && (
                          <span title="Has dependencies">
                            <Link2 className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pl-8 mt-0.5">
                      {item.projectName && (
                        <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-1">
                          <Folder className="w-2 h-2" /> {item.projectName}
                        </span>
                      )}
                      {isSub && (
                        <span className="text-[8px] text-slate-400 font-medium">/ {item.parentTitle}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 relative h-14 py-4">
                    {/* Minor Grid lines */}
                    {minorTicks?.map((tick) => {
                      const left = getPositionPercent(tick.toISOString());
                      return (
                        <div
                          key={`minor-grid-${tick.toISOString()}`}
                          className="absolute top-0 bottom-0 border-l border-slate-50/50 h-full"
                          style={{ left: `${left}%` }}
                        />
                      );
                    })}

                    {/* Major Grid lines */}
                    {timeTicks?.map((tick) => {
                      const left = getPositionPercent(tick.toISOString());
                      return (
                        <div
                          key={tick.toISOString()}
                          className="absolute top-0 bottom-0 border-l border-slate-100 h-full"
                          style={{ left: `${left}%` }}
                        />
                      );
                    })}

                    {/* Deadline Indicator */}
                    {hasDeadline && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-10 pointer-events-none opacity-40"
                        style={{ left: `${getPositionPercent(item.deadline_at!)}%` }}
                        title={`Deadline: ${format(parseISO(item.deadline_at!), 'PPP')}`}
                      />
                    )}

                    {/* Bar or Milestone */}
                    {milestone ? (
                      <div
                        className={cn(
                          "absolute w-4 h-4 rotate-45 border-2 border-white shadow-md z-10",
                          getBarColor(item)
                        )}
                        style={{
                          left: `calc(${getPositionPercent(item.start_date!)}% - 8px)`,
                          top: '20px'
                        }}
                        title={`${item.title} (Milestone)`}
                      />
                    ) : (
                      <div
                        className={cn(
                          "absolute h-6 rounded shadow-sm transition-all group-hover:scale-[1.01] flex items-center px-2 overflow-hidden",
                          getBarColor(item),
                          isSub ? "opacity-80 h-4 mt-1" : "opacity-100",
                          overdue && "ring-2 ring-red-500 ring-offset-1",
                          showCriticalPath && item.is_critical && "ring-2 ring-red-400 ring-offset-2 animate-pulse"
                        )}
                        style={{
                          left: `${getPositionPercent(item.start_date!)}%`,
                          width: `${getWidthPercent(item.start_date!, getEffectiveEndDate(item)!)}%`,
                          top: isSub ? '20px' : '16px'
                        }}
                      >
                        {/* Progress Fill */}
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-black/10 transition-all"
                          style={{ width: getProgressWidth(item.status) }}
                        />

                        <span className="text-[9px] font-black text-white truncate drop-shadow-sm z-10">
                          {Math.round(getWidthPercent(item.start_date!, getEffectiveEndDate(item)!) / 100 * totalDays)}d
                        </span>

                        {overdue && (
                          <div className="absolute right-1 top-1 text-[8px] animate-pulse">
                            ⚠️
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}