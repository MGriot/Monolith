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
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { 
    ZoomIn, 
    ZoomOut, 
    Download, 
    Settings2, 
    Calendar, 
    Circle,
    ArrowUp,
    ArrowDown,
    Plus,
    Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { getGanttBarColor as getBarColor } from '@/constants/colors';
import type { Task, Subtask } from '@/types';

interface ProjectGanttProps {
  tasks: Task[];
  projectStartDate?: string;
  projectDueDate?: string;
  initialShowSubtasks?: boolean;
  projectId?: string;
  initialRegions?: TimeRegion[];
  onRegionsChange?: (regions: TimeRegion[]) => void;
}

type GanttItem = (Task | (Subtask & { isSubtask: boolean, parentTitle: string, parentId: string })) & { rowIndex: number, projectName?: string };
type ZoomLevel = 'day' | 'week' | 'month' | 'year';

export interface TimeRegion {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    color: string;
    text_color?: string;
    label_position?: 'top' | 'middle' | 'bottom';
    label_rotation?: number;
}

type ColumnId = 'wbs' | 'title' | 'assignee' | 'start_date' | 'end_date' | 'duration' | 'status' | 'priority';

interface ColumnConfig {
  id: ColumnId;
  label: string;
  width: number;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'wbs', label: 'WBS', width: 50, visible: true },
  { id: 'title', label: 'Task', width: 250, visible: true },
  { id: 'assignee', label: 'Assignee', width: 100, visible: false },
  { id: 'start_date', label: 'Start', width: 90, visible: false },
  { id: 'end_date', label: 'End', width: 90, visible: false },
  { id: 'duration', label: 'Days', width: 50, visible: false },
  { id: 'status', label: 'Status', width: 100, visible: false },
  { id: 'priority', label: 'Pri.', width: 80, visible: false },
];

const ZOOM_CONFIG = {
  day: { scale: 120, label: 'Days' },
  week: { scale: 40, label: 'Weeks' },
  month: { scale: 12, label: 'Months' },
  year: { scale: 2, label: 'Years' }
};

const getOrthogonalPath = (
  startSide: 'left' | 'right',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  overrideSpineX?: number
) => {
  const r = 8;
  const indent = 20;
  const gutterOffset = 22;

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
  } else {
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

const ROW_HEIGHT = 56;

export default function ProjectGantt({ 
    tasks, 
    projectStartDate, 
    projectDueDate, 
    initialShowSubtasks = false,
    initialRegions = [],
    onRegionsChange
}: ProjectGanttProps) {
  const [showSubtasks, setShowSubtasks] = useState(initialShowSubtasks);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  const [isExporting, setIsExporting] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);

  // Column State
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  
  // Time Regions State
  const [timeRegions, setTimeRegions] = useState<TimeRegion[]>(initialRegions);
  const [isRegionDialogOpen, setIsRegionDialogOpen] = useState(false);
  const [regionFormView, setRegionFormView] = useState<'list' | 'form'>('list');
  const [editingRegion, setEditingRegion] = useState<TimeRegion | null>(null);
  const [newRegion, setNewRegion] = useState<Partial<TimeRegion>>({ 
    color: '#e2e8f0',
    text_color: '#000000',
    label_position: 'middle',
    label_rotation: -90
  });

  // Calculate dynamic sidebar width
  const sidebarWidth = useMemo(() => {
      return columns.reduce((acc, col) => acc + (col.visible ? col.width : 0), 0);
  }, [columns]);

  const handleSaveRegion = () => {
    if(!newRegion.name || !newRegion.start_date || !newRegion.end_date) return;
    
    let updatedRegions: TimeRegion[] = [];
    if (editingRegion) {
        updatedRegions = timeRegions.map(r => r.id === editingRegion.id ? { ...newRegion, id: r.id } as TimeRegion : r);
    } else {
        updatedRegions = [...timeRegions, { ...newRegion, id: crypto.randomUUID() } as TimeRegion];
    }
    
    setTimeRegions(updatedRegions);
    onRegionsChange?.(updatedRegions);
    
    setRegionFormView('list');
    setEditingRegion(null);
    setNewRegion({ color: '#e2e8f0', text_color: '#000000', label_position: 'middle', label_rotation: -90 });
  };

  const handleEditRegion = (region: TimeRegion) => {
      setEditingRegion(region);
      setNewRegion(region);
      setRegionFormView('form');
  };

  const handleDeleteRegion = (id: string) => {
      const updatedRegions = timeRegions.filter(r => r.id !== id);
      setTimeRegions(updatedRegions);
      onRegionsChange?.(updatedRegions);
  };

  const exportGantt = async () => {
    if (!ganttRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(ganttRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        style: { overflow: 'visible' }
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
    
    timeRegions.forEach(r => {
        if(r.start_date) dates.push(parseISO(r.start_date));
        if(r.end_date) dates.push(parseISO(r.end_date));
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
  }, [ganttItems, projectStartDate, projectDueDate, zoomLevel, timeRegions]);

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

  const getProgressWidth = (item: any) => {
    if (item.percent_complete !== undefined && item.percent_complete !== null) {
        return `${Math.min(100, Math.max(0, item.percent_complete))}%`;
    }
    const s = item.status.toLowerCase();
    if (s === 'done') return '100%';
    if (s === 'in progress' || s === 'review') return '50%';
    return '0%';
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const levels: ZoomLevel[] = ['day', 'week', 'month', 'year'];
    const currentIndex = levels.indexOf(zoomLevel);
    if (direction === 'in' && currentIndex > 0) setZoomLevel(levels[currentIndex - 1]);
    if (direction === 'out' && currentIndex < levels.length - 1) setZoomLevel(levels[currentIndex + 1]);
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
      const newCols = [...columns];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newCols.length) return;
      
      [newCols[index], newCols[targetIndex]] = [newCols[targetIndex], newCols[index]];
      setColumns(newCols);
  };

  const toggleColumn = (id: ColumnId) => {
      setColumns(columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  const todayPos = getPositionPercent(new Date().toISOString());
  const svgHeight = ganttItems.length * ROW_HEIGHT;

  return (
    <div className="flex flex-col bg-white">
      {/* Gantt Controls */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/30 sticky left-0 z-40">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center space-x-2">
            <Switch id="show-subtasks" checked={showSubtasks} onCheckedChange={setShowSubtasks} />
            <Label htmlFor="show-subtasks" className="text-xs font-medium">Subtasks</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="show-cpm" checked={showCriticalPath} onCheckedChange={setShowCriticalPath} />
            <Label htmlFor="show-cpm" className="text-xs font-medium text-red-500">Critical Path</Label>
          </div>
          
          <div className="h-4 w-px bg-slate-300 mx-2" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border rounded-md bg-white p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('in')} disabled={zoomLevel === 'day'}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <span className="text-[10px] font-black uppercase w-16 text-center text-slate-500">{ZOOM_CONFIG[zoomLevel].label}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleZoom('out')} disabled={zoomLevel === 'year'}>
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-2" />
          
          {/* Column Settings */}
          <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                    <Settings2 className="w-3.5 h-3.5" /> Columns
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-2">
                    <h4 className="font-bold text-xs uppercase text-slate-500 mb-2">Configure Columns</h4>
                    {columns.map((col, idx) => (
                        <div key={col.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-md">
                            <div className="flex items-center gap-2">
                                <Switch 
                                    id={`col-${col.id}`} 
                                    checked={col.visible} 
                                    onCheckedChange={() => toggleColumn(col.id)} 
                                    className="scale-75"
                                />
                                <Label htmlFor={`col-${col.id}`} className="text-xs font-medium cursor-pointer">{col.label}</Label>
                            </div>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveColumn(idx, 'up')}>
                                    <ArrowUp className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === columns.length - 1} onClick={() => moveColumn(idx, 'down')}>
                                    <ArrowDown className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </PopoverContent>
          </Popover>

          {/* Time Regions */}
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setIsRegionDialogOpen(true)}>
            <Calendar className="w-3.5 h-3.5" /> Regions
          </Button>

          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportGantt} disabled={isExporting}>
            <Download className="w-3.5 h-3.5" /> {isExporting ? '...' : 'PNG'}
          </Button>
        </div>

        {/* Floating Legend */}
        <div className="absolute top-24 right-4 flex flex-col gap-2 p-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-md shadow-sm z-50 pointer-events-none">
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
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={ganttRef}>
        <div style={{ width: `${containerWidth + sidebarWidth}px` }} className="relative min-w-full bg-white">
          {/* Header Row */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 sticky top-0 z-30">
            {/* Sidebar Header */}
            <div className="sticky left-0 z-40 flex bg-slate-50/50">
                {columns.filter(c => c.visible).map(col => (
                    <div 
                        key={col.id} 
                        style={{ width: `${col.width}px` }}
                        className={cn(
                            "border-r border-slate-200 p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0 flex items-center",
                            ['wbs', 'duration', 'status', 'priority', 'start_date', 'end_date'].includes(col.id) ? "justify-center text-center" : "justify-start"
                        )}
                    >
                        {col.label}
                    </div>
                ))}
            </div>

            {/* Timeline Header */}
            <div className="flex-1 relative h-10 flex items-center">
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
                    className="absolute border-l border-slate-200 h-full flex flex-col justify-start pt-1 pl-2 text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap z-10"
                    style={{ left: `${left}%` }}
                  >
                    {label}
                  </div>
                );
              })}

              {/* Minor Ticks */}
              {minorTicks?.map((tick) => {
                const left = getPositionPercent(tick.toISOString());
                let label = "";
                if (zoomLevel === 'week') label = format(tick, 'd');
                if (zoomLevel === 'month') label = format(tick, 'd');
                if (zoomLevel === 'year') label = format(tick, 'MMM');

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
            </div>
          </div>

          {/* Content Rows */}
          <div className="relative">
             {/* Time Regions Layer - Offset by Sidebar */}
             <div style={{ left: `${sidebarWidth}px`, right: 0 }} className="absolute top-0 bottom-0 pointer-events-none z-0 overflow-hidden">
                 {timeRegions.map(region => {
                    const startP = getPositionPercent(region.start_date);
                    const endP = getPositionPercent(region.end_date);
                    const width = endP - startP;
                    
                    if (width <= 0) return null;

                    return (
                        <div 
                            key={region.id}
                            className={cn(
                                "absolute top-0 bottom-0 opacity-30 flex flex-col pt-2 border-l border-r border-black/5",
                                region.label_position === 'top' ? "items-center" : 
                                region.label_position === 'bottom' ? "items-center justify-end pb-8" : 
                                "items-center justify-center"
                            )}
                            style={{ left: `${startP}%`, width: `${width}%`, backgroundColor: region.color }}
                        >
                            <span 
                                className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                                style={{ 
                                    color: region.text_color || '#000', 
                                    transform: `rotate(${region.label_rotation ?? -90}deg)`,
                                    opacity: 0.8
                                }}
                            >
                                {region.name}
                            </span>
                        </div>
                    );
                })}
             </div>

            {/* SVG Layer */}
            <div style={{ left: `${sidebarWidth}px` }} className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
              <svg className="w-full h-full" viewBox={`0 0 ${containerWidth} ${svgHeight}`} preserveAspectRatio="none">
                 <defs>
                  <marker id="arrowhead-blue" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M 0 0 L 6 2 L 0 4 Z" fill="#2563eb" /></marker>
                  <marker id="arrowhead-red" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M 0 0 L 6 2 L 0 4 Z" fill="#ef4444" /></marker>
                  <marker id="arrowhead-amber" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M 0 0 L 6 2 L 0 4 Z" fill="#f59e0b" /></marker>
                </defs>
                {/* Lines Logic */}
                {(() => {
                  const lines: React.ReactNode[] = [];
                  const drawHierarchy = (taskList: Task[]) => {
                    taskList.forEach(task => {
                      if (!showSubtasks || !task.subtasks || task.subtasks.length === 0) return;
                      const parentItem = ganttItems.find(i => i.id === task.id);
                      if (!parentItem) return;
                      const startX = getPositionPx(task.start_date!);
                      const startY = (parentItem as any).rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);
                      const renderedSubtasks = task.subtasks.map(st => ganttItems.find(i => i.id === st.id)).filter((st): st is GanttItem => !!st && !!st.start_date);
                      if (renderedSubtasks.length === 0) return;
                      const minChildX = Math.min(...renderedSubtasks.map(st => getPositionPx(st.start_date!)));
                      const sharedSpineX = Math.min(startX, minChildX) - 20;
                      lines.push(<g key={`hier-group-${task.id}`}>{renderedSubtasks.map(st => (
                          <path key={`hier-branch-${st.id}`} d={getOrthogonalPath('left', startX, startY, getPositionPx(st.start_date!), st.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2), sharedSpineX)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="3 3" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
                      ))}</g>);
                      drawHierarchy(task.subtasks);
                    });
                  };
                  drawHierarchy(tasks);
                  return lines;
                })()}

                {/* Dependencies */}
                {ganttItems.map((item: any) => {
                    const combinedDeps = [...(item.blocked_by || [])];
                    if (item.blocked_by_ids) {
                        const existing = new Set(combinedDeps.map(d => d.predecessor_id));
                        item.blocked_by_ids.forEach((bid: string) => { if(!existing.has(bid)) combinedDeps.push({ id: `synth-${bid}`, successor_id: item.id, predecessor_id: bid, type: 'FS', lag_days: 0 }); });
                    }
                    return combinedDeps.map(dep => {
                        const blocker = ganttItems.find(i => i.id === dep.predecessor_id);
                        if (!blocker) return null;
                        const sX = getPositionPx(getEffectiveEndDate(blocker)!) + dayWidth;
                        const eX = getPositionPx(item.start_date!);
                        const isConflict = eX < sX + (dep.lag_days||0)*dayWidth;
                        const isCritical = showCriticalPath && item.is_critical && blocker.is_critical;
                        const color = isCritical ? "#ef4444" : (isConflict ? "#f59e0b" : "#2563eb");
                        return (
                            <g key={`${item.id}-${dep.predecessor_id}`}>
                                {isCritical && (
                                    <path 
                                        d={getOrthogonalPath('right', sX, blocker.rowIndex * ROW_HEIGHT + ROW_HEIGHT/2, eX, item.rowIndex * ROW_HEIGHT + ROW_HEIGHT/2)} 
                                        fill="none" 
                                        stroke={color} 
                                        strokeWidth="8" 
                                        vectorEffect="non-scaling-stroke" 
                                        className="animate-pulse opacity-20"
                                    />
                                )}
                                <path 
                                    d={getOrthogonalPath('right', sX, blocker.rowIndex * ROW_HEIGHT + ROW_HEIGHT/2, eX, item.rowIndex * ROW_HEIGHT + ROW_HEIGHT/2)} 
                                    fill="none" 
                                    stroke={color} 
                                    strokeWidth={isCritical?"3":"2"} 
                                    markerEnd={`url(#arrowhead-${isCritical?'red':(isConflict?'amber':'blue')})`} 
                                    vectorEffect="non-scaling-stroke" 
                                />
                            </g>
                        );
                    });
                })}
              </svg>
            </div>

            {/* Today Line */}
            {todayPos >= 0 && todayPos <= 100 && (
              <div
                style={{ left: `${todayPos}%`, marginLeft: `${sidebarWidth}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm w-max">
                  TODAY
                </div>
              </div>
            )}

            {/* Rows */}
            {ganttItems.map((item: any) => {
              const isSub = 'isSubtask' in item;
              const isWbsRoot = !isSub && !item.parent_id;
              
              return (
                <div 
                    key={item.id} 
                    className={cn(
                        "flex border-b border-slate-100 hover:bg-slate-50 transition-colors group relative",
                        (!isWbsRoot || !item.color) && (isWbsRoot ? "bg-slate-50/40" : "")
                    )}
                    style={isWbsRoot && item.color ? { backgroundColor: `${item.color}33` } : {}}
                >
                  {/* Sidebar Cells */}
                  <div className="sticky left-0 z-20 flex bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    {columns.filter(c => c.visible).map(col => (
                        <div 
                            key={col.id} 
                            style={{ width: `${col.width}px` }} 
                            className={cn(
                                "border-r border-slate-200 p-2 flex items-center min-w-0 shrink-0 text-xs",
                                ['wbs', 'duration', 'status', 'priority', 'start_date', 'end_date'].includes(col.id) ? "justify-center" : "justify-start"
                            )}
                        >
                            {col.id === 'wbs' && <span className="font-mono text-[10px] text-slate-400">{item.wbs_code}</span>}
                            {col.id === 'title' && (
                                <div className="flex flex-col min-w-0">
                                    <span className={cn("truncate font-medium", isSub ? "pl-4 text-slate-600" : "text-slate-900")}>
                                        {item.title}
                                    </span>
                                    {isSub && <span className="text-[8px] text-slate-400 pl-4 truncate">In {item.projectName}</span>}
                                </div>
                            )}
                            {col.id === 'assignee' && (
                                <div className="flex -space-x-1">
                                    {item.assignees?.slice(0, 3).map((u: any) => (
                                        <div key={u.id} className="w-5 h-5 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[8px] font-bold text-slate-600" title={u.full_name}>
                                            {u.full_name?.[0] || 'U'}
                                        </div>
                                    ))}
                                    {(!item.assignees || item.assignees.length === 0) && <span className="text-slate-300">-</span>}
                                </div>
                            )}
                            {col.id === 'start_date' && <span className="text-slate-500">{item.start_date ? format(parseISO(item.start_date), 'MMM d') : '-'}</span>}
                            {col.id === 'end_date' && <span className="text-slate-500">{item.due_date ? format(parseISO(item.due_date), 'MMM d') : '-'}</span>}
                            {col.id === 'duration' && <span className="text-slate-500">{item.start_date ? differenceInDays(parseISO(getEffectiveEndDate(item)!), parseISO(item.start_date)) + 1 : '-'}</span>}
                            {col.id === 'status' && (
                                <div className="flex items-center gap-1.5">
                                    <Circle className={cn("w-2 h-2 fill-current", 
                                        item.status === 'done' ? "text-emerald-500" : 
                                        item.status === 'in progress' ? "text-blue-500" : "text-slate-300"
                                    )} />
                                    <span className="capitalize text-[10px]">{item.status}</span>
                                </div>
                            )}
                            {col.id === 'priority' && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                                    item.priority === 'critical' ? "bg-red-100 text-red-700" :
                                    item.priority === 'high' ? "bg-orange-100 text-orange-700" :
                                    "bg-slate-100 text-slate-500"
                                )}>
                                    {item.priority}
                                </span>
                            )}
                        </div>
                    ))}
                  </div>

                  {/* Timeline Row */}
                  <div className="flex-1 relative h-14 py-4">
                    {/* Grid Lines (Major) */}
                    {timeTicks?.map(tick => (
                        <div key={tick.toISOString()} className="absolute top-0 bottom-0 border-l border-slate-100 h-full z-0" style={{ left: `${getPositionPercent(tick.toISOString())}%` }} />
                    ))}
                    
                    {/* Grid Lines (Minor) */}
                    {minorTicks?.map(tick => (
                        <div key={`grid-minor-${tick.toISOString()}`} className="absolute top-0 bottom-0 border-l border-slate-50 h-full z-0 opacity-50" style={{ left: `${getPositionPercent(tick.toISOString())}%` }} />
                    ))}

                    {/* Deadline Indicator */}
                    {item.deadline_at && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-10 pointer-events-none opacity-40"
                        style={{ left: `${getPositionPercent(item.deadline_at)}%` }}
                        title={`Deadline: ${format(parseISO(item.deadline_at), 'PPP')}`}
                      />
                    )}

                    {/* Bar or Milestone */}
                    {(item.is_milestone || (item.start_date && item.start_date === getEffectiveEndDate(item))) ? (
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
                        <div className="relative h-full flex items-center">
                            {/* Visual Bar Extension to Deadline (Gray) */}
                            {item.deadline_at && item.due_date && isAfter(parseISO(item.deadline_at), parseISO(item.due_date)) && (
                                <div 
                                    className="absolute h-6 bg-slate-200/50 border-r-2 border-slate-300 rounded-r-sm z-0"
                                    style={{
                                        left: `${getPositionPercent(item.due_date)}%`,
                                        width: `${getPositionPercent(item.deadline_at) - getPositionPercent(item.due_date)}%`,
                                        top: isSub ? '4px' : '0px'
                                    }}
                                />
                            )}

                            {/* Main Task Bar */}
                            <div 
                                className={cn(
                                    "absolute h-6 rounded shadow-sm flex items-center px-2 overflow-hidden z-10",
                                    getBarColor(item),
                                    isSub ? "h-4 mt-1 opacity-90" : "opacity-100",
                                    (item.deadline_at && isAfter(new Date(), parseISO(item.deadline_at)) && item.status !== 'done') && "ring-2 ring-red-500 ring-offset-1",
                                    showCriticalPath && item.is_critical && "ring-2 ring-red-400 ring-offset-2 animate-pulse"
                                )}
                                style={{
                                    left: `${getPositionPercent(item.start_date!)}%`,
                                    width: `${getWidthPercent(item.start_date!, (item.due_date || item.start_date))}%`,
                                    top: isSub ? '4px' : '0px'
                                }}
                            >
                                {/* Progress */}
                                <div className="absolute left-0 top-0 bottom-0 bg-black/10 transition-all" style={{ width: getProgressWidth(item) }} />
                                <span className="text-[9px] font-black text-white truncate z-10 sticky left-0 px-1">
                                    {item.title}
                                </span>

                                {(item.deadline_at && isAfter(new Date(), parseISO(item.deadline_at)) && item.status !== 'done') && (
                                    <div className="absolute right-1 top-1 text-[8px] animate-pulse">⚠️</div>
                                )}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Time Region Dialog */}
      <Dialog open={isRegionDialogOpen} onOpenChange={(open) => { setIsRegionDialogOpen(open); if(!open) setRegionFormView('list'); }}>
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle>{regionFormView === 'list' ? 'Manage Reference Zones' : (editingRegion ? 'Edit Zone' : 'Add Zone')}</DialogTitle>
                <DialogDescription>
                    {regionFormView === 'list' 
                        ? 'Manage highlighted time ranges on the Gantt chart.' 
                        : 'Define the name, date range, and color for this zone.'}
                </DialogDescription>
            </DialogHeader>

            {regionFormView === 'list' ? (
                <div className="space-y-4">
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {timeRegions.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No regions defined.</p>}
                        {timeRegions.map(r => (
                            <div key={r.id} className="flex items-center justify-between p-3 rounded-md border bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded shadow-sm" style={{ backgroundColor: r.color }} />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">{r.name}</span>
                                        <span className="text-[10px] text-slate-500">
                                            {format(parseISO(r.start_date), 'MMM d')} - {format(parseISO(r.end_date), 'MMM d')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditRegion(r)}>
                                        <Settings2 className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteRegion(r.id)}>
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button className="w-full gap-2" onClick={() => { setEditingRegion(null); setNewRegion({ color: '#e2e8f0', text_color: '#000000', label_position: 'middle', label_rotation: -90 }); setRegionFormView('form'); }}>
                        <Plus className="w-4 h-4" /> Add New Region
                    </Button>
                </div>
            ) : (
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input placeholder="e.g. Q1 Sprint" value={newRegion.name || ''} onChange={(e) => setNewRegion({...newRegion, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input type="date" value={newRegion.start_date || ''} onChange={(e) => setNewRegion({...newRegion, start_date: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input type="date" value={newRegion.end_date || ''} onChange={(e) => setNewRegion({...newRegion, end_date: e.target.value})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Label Position</Label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={newRegion.label_position}
                                onChange={(e) => setNewRegion({...newRegion, label_position: e.target.value as any})}
                            >
                                <option value="top">Top</option>
                                <option value="middle">Middle</option>
                                <option value="bottom">Bottom</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Label Rotation (deg)</Label>
                            <Input type="number" value={newRegion.label_rotation} onChange={(e) => setNewRegion({...newRegion, label_rotation: parseInt(e.target.value)})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Zone Color</Label>
                            <div className="flex gap-2">
                                <Input type="color" className="w-10 p-1" value={newRegion.color} onChange={(e) => setNewRegion({...newRegion, color: e.target.value})} />
                                <Input value={newRegion.color} onChange={(e) => setNewRegion({...newRegion, color: e.target.value})} placeholder="#e2e8f0" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Text Color</Label>
                            <div className="flex gap-2">
                                <Input type="color" className="w-10 p-1" value={newRegion.text_color} onChange={(e) => setNewRegion({...newRegion, text_color: e.target.value})} />
                                <Input value={newRegion.text_color} onChange={(e) => setNewRegion({...newRegion, text_color: e.target.value})} placeholder="#000000" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-between pt-2">
                        <Button variant="ghost" onClick={() => setRegionFormView('list')}>Back to List</Button>
                        <Button onClick={handleSaveRegion} disabled={!newRegion.name || !newRegion.start_date}>
                            {editingRegion ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
