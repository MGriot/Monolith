import { useMemo, useState, useRef } from 'react';
import {
  format,
  differenceInCalendarDays,
  startOfMonth,
  eachMonthOfInterval,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  startOfYear,
  parseISO,
  min,
  max,
  isAfter,
  startOfWeek,
  startOfDay,
  startOfQuarter,
  endOfDay,
  eachQuarterOfInterval,
  subDays,
  addDays // Added addDays import
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
  Trash2,
  Link,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getGanttBarColor as getBarColor,
  getStatusHex,
  getPriorityBorderClass as getPriorityBorder
} from '@/constants/colors';
import type { Task, Subtask } from '@/types';

interface ProjectGanttProps {
  tasks: Task[];
  projectStartDate?: string;
  projectDueDate?: string;
  initialShowSubtasks?: boolean;
  projectId?: string;
  initialRegions?: TimeRegion[];
  onRegionsChange?: (regions: TimeRegion[]) => void;
  showProjectNames?: boolean;
}

type GanttItem = (Task | (Subtask & { isSubtask: boolean, parentTitle: string, parentId: string })) & { rowIndex: number, projectName?: string };
type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year';

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

// Optimized zoom configuration for maximum screen utilization and high-precision alignment
const ZOOM_CONFIG = {
  day: {
    scale: 120,
    label: 'Days',
    majorUnit: 'day',
    minorUnits: []
  },
  week: {
    scale: 60,
    label: 'Weeks',
    majorUnit: 'week',
    minorUnits: ['day']
  },
  month: {
    scale: 30,
    label: 'Months',
    majorUnit: 'month',
    minorUnits: ['week', 'day']
  },
  quarter: {
    scale: 15,
    label: 'Quarters',
    majorUnit: 'quarter',
    minorUnits: ['month', 'week']
  },
  year: {
    scale: 8,
    label: 'Years',
    majorUnit: 'year',
    minorUnits: ['quarter', 'month']
  }
};

// IMPROVED: Proportionally scaling orthogonal path generation with adaptive loop buffers
const getOrthogonalPath = (
  startSide: 'left' | 'right',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dayWidth: number,
  overrideSpineX?: number,
  endSide: 'left' | 'right' = 'left'
) => {
  const baseRadius = 8;
  const baseGutterOffset = 22;
  const referenceDayWidth = 120; // Maximum zoom level as reference

  // FIXED: Scale radius and gutter proportionally
  const r = Math.max(0.5, baseRadius * (dayWidth / referenceDayWidth));
  const gutterOffset = Math.max(8, baseGutterOffset * (dayWidth / referenceDayWidth));

  // Restricted horizontal sections: adjust indent based on zoom level to avoid large detours
  let indent = 20 * (dayWidth / referenceDayWidth);
  if (dayWidth <= 8) { // Year level
    indent = Math.max(6, 2.5 * dayWidth);
  } else if (dayWidth <= 15) { // Quarter level
    indent = Math.max(8, 1.5 * dayWidth);
  } else if (dayWidth <= 30) { // Month level
    indent = Math.max(10, 1 * dayWidth);
  }

  indent = Math.max(indent, 6); // Hard minimum buffer

  const buffer = indent;

  if (startSide === 'left') {
    const ry = y2 > y1 ? r : -r;
    if (endSide === 'left') {
      const spineX = overrideSpineX ?? (Math.min(x1, x2) - indent);
      return `
        M ${x1} ${y1}
        H ${spineX + r}
        Q ${spineX} ${y1} ${spineX} ${y1 + ry}
        V ${y2 - ry}
        Q ${spineX} ${y2} ${spineX + r} ${y2}
        H ${x2}
      `.replace(/\s+/g, ' ');
    } else {
      // SF: Left to Right. Detour left then cross over.
      const spineX = overrideSpineX ?? (x1 - indent);
      return `
        M ${x1} ${y1}
        H ${spineX + r}
        Q ${spineX} ${y1} ${spineX} ${y1 + ry}
        V ${y2 - ry}
        Q ${spineX} ${y2} ${spineX + r} ${y2}
        H ${x2 + indent}
        V ${y2}
        H ${x2}
      `.replace(/\s+/g, ' ');
    }
  } else {
    // startSide === 'right'
    if (endSide === 'right') {
      // FF: Right to Right
      const spineX = overrideSpineX ?? (Math.max(x1, x2) + indent);
      const ry = y2 > y1 ? r : -r;
      return `
        M ${x1} ${y1}
        H ${spineX - r}
        Q ${spineX} ${y1} ${spineX} ${y1 + ry}
        V ${y2 - ry}
        Q ${spineX} ${y2} ${spineX - r} ${y2}
        H ${x2}
      `.replace(/\s+/g, ' ');
    }

    // FS: Right to Left (Existing logic with conflict handling)
    const isConflict = x2 < x1 + buffer;
    const ry = y2 > y1 ? r : -r;
    const transitY = y1 + (y2 > y1 ? gutterOffset : -gutterOffset);

    if (!isConflict) {
      const midX = overrideSpineX ?? (x1 + (x2 - x1) / 2);
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
  onRegionsChange,
  showProjectNames = true
}: ProjectGanttProps) {
  const [showSubtasks, setShowSubtasks] = useState(initialShowSubtasks);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showTaskColors, setShowTaskColors] = useState(true);
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

  // Derived values for components
  const dayWidth = ZOOM_CONFIG[zoomLevel].scale;

  // Calculate dynamic sidebar width
  const sidebarWidth = useMemo(() => {
    return columns.reduce((acc, col) => acc + (col.visible ? col.width : 0), 0);
  }, [columns]);

  const handleSaveRegion = () => {
    if (!newRegion.name || !newRegion.start_date || !newRegion.end_date) return;

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
    return item.completed_at || item.due_date || item.deadline_at || item.start_date;
  };

  const ganttItems = useMemo(() => {
    const items: GanttItem[] = [];
    let currentRow = 0;

    const flattenTasks = (taskList: Task[], level: number = 0, parent?: Task) => {
      const sorted = [...taskList].sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));

      sorted.forEach(task => {
        if (task.start_date && (task.due_date || task.deadline_at || task.completed_at)) {
          items.push({
            ...task,
            isSubtask: level > 0,
            parentTitle: parent?.title || "",
            parentId: parent?.id || "",
            projectName: task.project?.name || parent?.project?.name || "",
            rowIndex: currentRow++,
            hierarchyLevel: level
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
    const dates: Date[] = []; // IMPROVED: Exclude 'Today' from default bounds to minimize empty space
    ganttItems.forEach(item => {
      if (item.start_date) dates.push(parseISO(item.start_date));
      const effectiveEnd = getEffectiveEndDate(item);
      if (effectiveEnd) dates.push(parseISO(effectiveEnd));
      if (item.completed_at) dates.push(parseISO(item.completed_at));
    });
    if (projectStartDate) dates.push(parseISO(projectStartDate));
    if (projectDueDate) dates.push(parseISO(projectDueDate));

    timeRegions.forEach(r => {
      if (r.start_date) dates.push(parseISO(r.start_date));
      if (r.end_date) dates.push(parseISO(r.end_date));
    });

    if (dates.length === 0) {
      // Fallback if no tasks have dates
      dates.push(new Date());
    }

    let start = min(dates);
    let end = max(dates);

    // Apply only the leading buffer (3 days)
    start = subDays(start, 3);
    
    // Minimal trailing alignment: just snap to end of day
    end = endOfDay(end);

    // Ensure start is at day boundary
    start = startOfDay(start);
    return { start, end };
  }, [ganttItems, projectStartDate, projectDueDate, zoomLevel, timeRegions]);

  const timeTicks = useMemo(() => {
    if (!viewWindow) return [];
    const interval = { start: viewWindow.start, end: viewWindow.end };
    let dates: Date[] = [];
    switch (zoomLevel) {
      case 'day': dates = eachDayOfInterval(interval); break;
      case 'week': dates = eachWeekOfInterval(interval, { weekStartsOn: 1 }); break;
      case 'month': dates = eachMonthOfInterval(interval); break;
      case 'quarter': dates = eachQuarterOfInterval(interval); break;
      case 'year': dates = eachYearOfInterval(interval); break;
    }

    // IMPROVED: Ensure the first unit label is visible even if the interval starts mid-unit
    if (dates.length === 0 || isAfter(dates[0], viewWindow.start)) {
      let firstTick: Date;
      switch (zoomLevel) {
        case 'day': firstTick = startOfDay(viewWindow.start); break;
        case 'week': firstTick = startOfWeek(viewWindow.start, { weekStartsOn: 1 }); break;
        case 'month': firstTick = startOfMonth(viewWindow.start); break;
        case 'quarter': firstTick = startOfQuarter(viewWindow.start); break;
        case 'year': firstTick = startOfYear(viewWindow.start); break;
        default: firstTick = viewWindow.start;
      }
      if (!dates.some(d => d.getTime() === firstTick.getTime())) {
        dates = [firstTick, ...dates];
      }
    }
    return dates;
  }, [viewWindow, zoomLevel]);

  const minorTicksLevel1 = useMemo(() => {
    if (!viewWindow) return [];
    const interval = { start: viewWindow.start, end: viewWindow.end };

    switch (zoomLevel) {
      case 'year':
        return eachQuarterOfInterval(interval);
      case 'quarter':
        return eachMonthOfInterval(interval);
      case 'month':
        return eachWeekOfInterval(interval, { weekStartsOn: 1 });
      case 'week':
        return eachDayOfInterval(interval);
      case 'day':
        return [];
      default:
        return [];
    }
  }, [viewWindow, zoomLevel]);

  const minorTicksLevel2 = useMemo(() => {
    if (!viewWindow) return [];
    const interval = { start: viewWindow.start, end: viewWindow.end };

    switch (zoomLevel) {
      case 'year':
        return eachMonthOfInterval(interval);
      case 'quarter':
        return eachWeekOfInterval(interval, { weekStartsOn: 1 });
      case 'month':
        return eachDayOfInterval(interval);
      case 'week':
      case 'day':
        return [];
      default:
        return [];
    }
  }, [viewWindow, zoomLevel]);

  // IMPROVED: Zoom-aware arrow markers with proportional scaling
  const arrowMarkerSize = useMemo(() => {
    const scale = Math.max(0.4, Math.min(1, dayWidth / 120));
    return {
      width: 6 * scale,
      height: 4 * scale,
      refX: 6 * scale,
      refY: 2 * scale,
      pathD: `M 0 0 L ${6 * scale} ${2 * scale} L 0 ${4 * scale} Z`
    };
  }, [dayWidth]);

  // IMPROVED: Zoom-aware stroke width with better minimum threshold
  const getStrokeWidth = (isCritical: boolean) => {
    const baseWidth = isCritical ? 3 : 2;
    // Improved scaling: minimum 1px, scales more gracefully
    const scaleFactor = Math.max(0.33, dayWidth / 120);
    return Math.max(1, baseWidth * scaleFactor);
  };

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

  // Window-dependent helpers
  const totalDays = differenceInCalendarDays(viewWindow.end, viewWindow.start) + 1;
  const containerWidth = totalDays * dayWidth;

  const getPositionPx = (dateInput: string | Date) => {
    if (!viewWindow) return 0;
    const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    const days = differenceInCalendarDays(date, viewWindow.start);
    const msIntoDay = date.getTime() - startOfDay(date).getTime();
    const fraction = msIntoDay / (24 * 60 * 60 * 1000);
    return (days + fraction) * dayWidth;
  };

  const getWidthPx = (startStr: string, endStr: string) => {
    if (!viewWindow) return 0;
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const days = differenceInCalendarDays(end, start);
    const startFrac = (start.getTime() - startOfDay(start).getTime()) / (24 * 60 * 60 * 1000);
    const endFrac = (end.getTime() - startOfDay(end).getTime()) / (24 * 60 * 60 * 1000);
    return (days + 1 + endFrac - startFrac) * dayWidth;
  };

  const getItemLeftEdgePx = (item: any) => {
    const isMilestone = item.is_milestone || (item.start_date && item.start_date === getEffectiveEndDate(item));
    if (isMilestone) return getPositionPx(item.start_date!) - 8;
    return getPositionPx(item.start_date!);
  };

  const getItemRightEdgePx = (item: any) => {
    const isMilestone = item.is_milestone || (item.start_date && item.start_date === getEffectiveEndDate(item));
    if (isMilestone) return getPositionPx(item.start_date!) + 8;
    const barEndDate = item.due_date || item.start_date;
    return getPositionPx(item.start_date!) + getWidthPx(item.start_date!, barEndDate);
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
    const levels: ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year'];
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

  const isPredecessor = (taskId: string) => {
    return ganttItems.some((item: any) => {
      const blockedBy = item.blocked_by || [];
      const blockedByIds = item.blocked_by_ids || [];
      return blockedBy.some((dep: any) => dep.predecessor_id === taskId) || blockedByIds.includes(taskId);
    });
  };

  const hasBlockers = (item: any) => {
    return (item.blocked_by && item.blocked_by.length > 0) || (item.blocked_by_ids && item.blocked_by_ids.length > 0);
  };

  const todayPx = getPositionPx(new Date());
  const svgHeight = ganttItems.length * ROW_HEIGHT;

  const scrollToToday = () => {
    const ganttContainer = ganttRef.current?.querySelector('.overflow-x-auto');
    if (ganttContainer) {
      ganttContainer.scrollLeft = Math.max(0, todayPx - 400);
    }
  };

  return (
    <div className="flex flex-col bg-white relative">
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
          <div className="flex items-center space-x-2">
            <Switch id="show-colors" checked={showTaskColors} onCheckedChange={setShowTaskColors} />
            <Label htmlFor="show-colors" className="text-xs font-medium">Row Colors</Label>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-2" />

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

          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={scrollToToday}>
            <Target className="w-3.5 h-3.5" /> Today
          </Button>

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

          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setIsRegionDialogOpen(true)}>
            <Calendar className="w-3.5 h-3.5" /> Regions
          </Button>

          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportGantt} disabled={isExporting}>
            <Download className="w-3.5 h-3.5" /> {isExporting ? '...' : 'PNG'}
          </Button>
        </div>
      </div>

      <div className="absolute top-[73px] right-4 flex flex-col gap-2 p-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-md shadow-lg z-50 pointer-events-none">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status (Theme)</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-400/20 border border-slate-400" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">Backlog</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-500/20 border border-slate-500" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">Todo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500/20 border border-blue-500" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">On Hold</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-purple-500/20 border border-purple-500" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500" />
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

        <div className="my-1 border-t border-slate-100" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Indicators</span>
        <div className="grid grid-cols-1 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-sm border relative overflow-hidden" style={{ backgroundColor: '#cbd5e122', borderColor: '#94a3b8' }}>
               <div className="absolute bottom-0 left-0 w-2/3 h-0.5 bg-slate-400" />
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase">Progress Underline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #cbd5e1, #cbd5e1 1px, transparent 1px, transparent 3px)', opacity: 0.6 }} />
            <span className="text-[9px] font-bold text-slate-500 uppercase">Buffer (Grace Period)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center w-4">
                <div className="w-0.5 h-3 bg-emerald-500 relative">
                    <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />
                </div>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase">Completed On-Time</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center w-4">
                <div className="w-0.5 h-3 bg-red-500 relative">
                    <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full" />
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full" />
                </div>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase">Completed Late</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-2.5 bg-purple-500 opacity-40" />
            <span className="text-[9px] font-bold text-slate-500 uppercase">Hard Deadline</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={ganttRef}>
        <div style={{ width: `${containerWidth + sidebarWidth}px` }} className="relative bg-white">
          {/* Header Row */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-30">
            <div className="sticky left-0 z-40 flex bg-slate-50 shrink-0">
              {columns.filter(c => c.visible).map(col => (
                <div
                  key={col.id}
                  style={{ width: `${col.width}px` }}
                  className={cn(
                    "border-r border-slate-200 p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0 flex items-center box-border",
                    ['wbs', 'duration', 'status', 'priority', 'start_date', 'end_date'].includes(col.id) ? "justify-center text-center" : "justify-start"
                  )}
                >
                  {col.label}
                </div>
              ))}
            </div>

            <div className="relative shrink-0" style={{ height: zoomLevel === 'day' ? '40px' : '56px', width: `${containerWidth}px` }}>
              {/* Major Ticks */}
              {timeTicks?.map((tick) => {
                const left = getPositionPx(tick);
                let label = format(tick, 'MMM');
                if (zoomLevel === 'day') label = format(tick, 'dd MMM');
                if (zoomLevel === 'week') label = `WK${format(tick, 'ww')}`;
                if (zoomLevel === 'quarter') label = `Q${format(tick, 'Q')}`;
                if (zoomLevel === 'year') label = format(tick, 'yyyy');

                return (
                  <div
                    key={tick.toISOString()}
                    className="absolute border-l border-slate-300 flex flex-col justify-start pt-1.5 pl-2 text-[10px] font-bold text-slate-600 uppercase whitespace-nowrap z-20"
                    style={{ left: `${left}px`, height: '100%' }}
                  >
                    {label}
                  </div>
                );
              })}

              {/* Minor Ticks Level 1 */}
              {minorTicksLevel1?.map((tick) => {
                const left = getPositionPx(tick);
                let label = "";
                let heightStyle = {};
                let containerClass = "";

                if (zoomLevel === 'year') {
                  label = `Q${format(tick, 'Q')}`;
                  heightStyle = { height: '50%', top: '18px' };
                  containerClass = "flex items-start pt-1 pl-1";
                } else if (zoomLevel === 'quarter') {
                  label = format(tick, 'MMM');
                  heightStyle = { height: '50%', top: '18px' };
                  containerClass = "flex items-start pt-1 pl-1";
                } else if (zoomLevel === 'month') {
                  label = `WK${format(tick, 'ww').padStart(2, '0')}`;
                  heightStyle = { height: '50%', top: '22px' };
                  containerClass = "flex items-start pt-1 pl-1";
                } else if (zoomLevel === 'week') {
                  label = format(tick, 'd');
                  heightStyle = { height: '50%', bottom: 0 };
                  containerClass = "flex items-end pb-1 pl-1";
                }

                return (
                  <div
                    key={`minor1-${tick.toISOString()}`}
                    className={cn("absolute border-l border-slate-200", containerClass)}
                    style={{
                      left: `${left}px`,
                      ...heightStyle
                    }}
                  >
                    <span className="text-[8px] text-slate-500 font-semibold leading-none">{label}</span>
                  </div>
                );
              })}

              {/* Minor Ticks Level 2 */}
              {minorTicksLevel2?.map((tick) => {
                const left = getPositionPx(tick);
                let label = "";

                if (zoomLevel === 'year') {
                  label = format(tick, 'MMM');
                } else if (zoomLevel === 'quarter') {
                  label = `WK${format(tick, 'ww').padStart(2, '0')}`;
                } else if (zoomLevel === 'month') {
                  label = format(tick, 'd');
                }

                return (
                  <div
                    key={`minor2-${tick.toISOString()}`}
                    className="absolute border-l border-slate-100 flex items-end pb-0.5"
                    style={{
                      left: `${left}px`,
                      height: zoomLevel === 'year' || zoomLevel === 'quarter' ? '30%' : '25%',
                      bottom: 0
                    }}
                  >
                    {label && (
                      <span className="text-[7px] text-slate-400 font-medium leading-none">{label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content Layer */}
          <div className="relative">
            {/* Time Regions Layer */}
            <div style={{ left: `${sidebarWidth}px`, width: `${containerWidth}px` }} className="absolute top-0 bottom-0 pointer-events-none z-0 overflow-hidden">
              {timeRegions.map(region => {
                const startX = getPositionPx(region.start_date);
                const endX = getPositionPx(region.end_date);
                const width = endX - startX;

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
                    style={{ left: `${startX}px`, width: `${width}px`, backgroundColor: region.color }}
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
            <div style={{ left: `${sidebarWidth}px`, width: `${containerWidth}px` }} className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
              <svg className="w-full h-full" viewBox={`0 0 ${containerWidth} ${svgHeight}`} preserveAspectRatio="none">
                <defs>
                  <marker
                    id="arrowhead-blue"
                    markerWidth={arrowMarkerSize.width}
                    markerHeight={arrowMarkerSize.height}
                    refX={arrowMarkerSize.refX}
                    refY={arrowMarkerSize.refY}
                    orient="auto"
                  >
                    <path d={arrowMarkerSize.pathD} fill="#2563eb" />
                  </marker>
                  <marker
                    id="arrowhead-red"
                    markerWidth={arrowMarkerSize.width}
                    markerHeight={arrowMarkerSize.height}
                    refX={arrowMarkerSize.refX}
                    refY={arrowMarkerSize.refY}
                    orient="auto"
                  >
                    <path d={arrowMarkerSize.pathD} fill="#ef4444" />
                  </marker>
                  <marker
                    id="arrowhead-amber"
                    markerWidth={arrowMarkerSize.width}
                    markerHeight={arrowMarkerSize.height}
                    refX={arrowMarkerSize.refX}
                    refY={arrowMarkerSize.refY}
                    orient="auto"
                  >
                    <path d={arrowMarkerSize.pathD} fill="#f59e0b" />
                  </marker>
                </defs>

                                {/* Hierarchy Lines */}
                                {(() => {
                                  const lines: React.ReactNode[] = [];
                                  const drawHierarchy = (taskList: Task[]) => {
                                    taskList.forEach(task => {
                                      if (!showSubtasks || !task.subtasks || task.subtasks.length === 0) return;
                                      const parentItem = ganttItems.find(i => i.id === task.id);
                                      if (!parentItem) return;
                                      const startX = getItemLeftEdgePx(task);
                                      const startY = (parentItem as any).rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);
                                      const renderedSubtasks = task.subtasks.map(st => ganttItems.find(i => i.id === st.id)).filter((st): st is GanttItem => !!st && !!st.start_date);
                                      if (renderedSubtasks.length === 0) return;
                                      const minChildX = Math.min(...renderedSubtasks.map(st => getItemLeftEdgePx(st)));
                
                                      const sharedSpineX = Math.max(10, Math.min(startX, minChildX) - Math.max(6, 20 * (dayWidth / 120)));
                
                                      lines.push(
                                        <g key={`hier-group-${task.id}`}>
                                          {renderedSubtasks.map(st => {
                                            const isStCritical = st.is_critical || st.slack_days === 0;
                                            const isHierCritical = showCriticalPath && isStCritical;
                                            const color = isHierCritical ? "#ef4444" : "#94a3b8";
                
                                            return (
                                              <g key={`hier-branch-group-${st.id}`}>
                                                {isHierCritical && (
                                                  <path
                                                    d={getOrthogonalPath(
                                                      'left',
                                                      startX,
                                                      startY,
                                                      getItemLeftEdgePx(st),
                                                      st.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2),
                                                      dayWidth,
                                                      sharedSpineX,
                                                      'left'
                                                    )}
                                                    fill="none"
                                                    stroke={color}
                                                    strokeWidth={getStrokeWidth(true) * 4}
                                                    strokeOpacity="0.4"
                                                    className="animate-pulse"
                                                    vectorEffect="non-scaling-stroke"
                                                  />
                                                )}
                                                <path
                                                  key={`hier-branch-${st.id}`}
                                                  d={getOrthogonalPath(
                                                    'left',
                                                    startX,
                                                    startY,
                                                    getItemLeftEdgePx(st),
                                                    st.rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2),
                                                    dayWidth,
                                                    sharedSpineX,
                                                    'left'
                                                  )}
                                                  fill="none"
                                                  stroke={color}
                                                  strokeWidth={getStrokeWidth(isHierCritical) * (isHierCritical ? 1.2 : 1)}
                                                  strokeDasharray={isHierCritical ? "none" : "3 3"}
                                                  strokeOpacity={isHierCritical ? 1 : 0.5}
                                                  vectorEffect="non-scaling-stroke"
                                                />
                                              </g>
                                            );
                                          })}
                                        </g>
                                      );
                                      drawHierarchy(task.subtasks);
                                    });
                                  };
                                  drawHierarchy(tasks);
                                  return lines;
                                })()}
                
                                                {/* Dependency Lines */}
                
                                                {ganttItems.map((item: any) => {
                
                                                  const combinedDeps = [...(item.blocked_by || [])];
                
                                                  if (item.blocked_by_ids) {
                
                                                    const existing = new Set(combinedDeps.map(d => d.predecessor_id));
                
                                                    item.blocked_by_ids.forEach((bid: string) => {
                
                                                      if (!existing.has(bid)) combinedDeps.push({
                
                                                        id: `synth-${bid}`,
                
                                                        successor_id: item.id,
                
                                                        predecessor_id: bid,
                
                                                        type: 'FS',
                
                                                        lag_days: 0
                
                                                      });
                
                                                    });
                
                                                  }
                
                                                  return combinedDeps.map(dep => {
                
                                                    const blocker = ganttItems.find(i => i.id === dep.predecessor_id);
                
                                                    if (!blocker) return null;
                
                                
                                                    const startSide = (dep.type === 'SS' || dep.type === 'SF') ? 'left' : 'right';
                                                    const endSide = (dep.type === 'FS' || dep.type === 'SS') ? 'left' : 'right';
                                                    
                                                    const sX = startSide === 'left' ? getItemLeftEdgePx(blocker) : getItemRightEdgePx(blocker);
                                                    const eX = endSide === 'left' ? getItemLeftEdgePx(item) : getItemRightEdgePx(item);
                                                    
                                                    const isConflict = (startSide === 'right' && endSide === 'left') ? eX < sX + (dep.lag_days || 0) * dayWidth : false;
                
                                                    const itemIsCritical = item.is_critical || item.slack_days === 0;
                
                                
                
                                                    // IMPROVED: Less strict logic. 
                
                                                    // A line is "Critical" if:
                
                                                    // 1. CPM Critical Path is toggled AND the successor is critical
                
                                                    // 2. OR the task itself has a 'critical' priority label
                
                                                    const isCritical = (showCriticalPath && itemIsCritical) || (item.priority === 'critical');
                
                                                    
                
                                                    // Use Amber for 'high' priority or conflicts
                
                                                    const isHigh = item.priority === 'high' || isConflict;
                
                                                    
                
                                                    const color = isCritical ? "#ef4444" : (isHigh ? "#f59e0b" : "#2563eb");
                
                                
                
                                                    return (
                
                                                      <g key={`${item.id}-${dep.predecessor_id}`}>
                
                                                        {isCritical && (
                
                                                          <path
                
                                                            d={getOrthogonalPath(
                
                                                              startSide,
                
                                                              sX,
                
                                                              blocker.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
                
                                                              eX,
                
                                                              item.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
                
                                                              dayWidth,
                                                              undefined,
                                                              endSide
                
                                                            )}
                
                                                            fill="none"
                
                                                            stroke={color}
                
                                                            strokeWidth={getStrokeWidth(true) * 6}
                
                                                            vectorEffect="non-scaling-stroke"
                
                                                            className="animate-pulse opacity-30"
                
                                                          />
                
                                                        )}
                
                                                        <path
                
                                                          d={getOrthogonalPath(
                
                                                            startSide,
                
                                                            sX,
                
                                                            blocker.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
                
                                                            eX,
                
                                                            item.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
                
                                                            dayWidth,
                                                            undefined,
                                                            endSide
                
                                                          )}
                
                                                          fill="none"
                
                                                          stroke={color}
                
                                                          strokeWidth={getStrokeWidth(isCritical) * (isCritical ? 1.8 : 1)}
                
                                                          markerEnd={`url(#arrowhead-${isCritical ? 'red' : (isHigh ? 'amber' : 'blue')})`}
                
                                                          strokeOpacity={isCritical ? 1 : 0.8}
                
                                                          vectorEffect="non-scaling-stroke"
                
                                                        />
                
                                                      </g>
                
                                                    );
                
                                                  });
                
                                                })}              </svg>
            </div>

            {/* Global Timeline Overlay */}
            <div style={{ left: `${sidebarWidth}px`, width: `${containerWidth}px` }} className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
              {todayPx >= 0 && todayPx <= containerWidth && (
                <div
                  style={{ left: `${todayPx}px` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm w-max">
                    TODAY
                  </div>
                </div>
              )}
            </div>

            {/* Rows */}
            {ganttItems.map((item: any) => {
              const isSub = 'isSubtask' in item;
              const isWbsRoot = !isSub && !item.parent_id;
              const hasColor = showTaskColors && item.color;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex border-b border-slate-100 hover:bg-slate-50 transition-colors group relative box-border shrink-0",
                    !hasColor && (isWbsRoot ? "bg-slate-50/40" : "")
                  )}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    width: `${containerWidth + sidebarWidth}px`,
                    backgroundColor: hasColor ? `${item.color}10` : undefined
                  }}
                >
                  {/* Sidebar Cells */}
                  <div className="sticky left-0 z-20 flex bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] h-full shrink-0">
                    {columns.filter(c => c.visible).map(col => (
                      <div
                        key={col.id}
                        style={{ width: `${col.width}px` }}
                        className={cn(
                          "border-r border-slate-200 p-2 flex items-center min-w-0 shrink-0 text-xs h-full box-border",
                          ['wbs', 'duration', 'status', 'priority', 'start_date', 'end_date'].includes(col.id) ? "justify-center" : "justify-start"
                        )}
                      >
                        {col.id === 'wbs' && <span className="font-mono text-[10px] text-slate-400">{item.wbs_code}</span>}
                        {col.id === 'title' && (
                          <div className="flex flex-col min-w-0 w-full">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={cn("truncate font-medium")}
                                style={{
                                  paddingLeft: `${(item.hierarchyLevel || 0) * 12}px`,
                                  color: item.hierarchyLevel === 0 ? 'inherit' : '#64748b'
                                }}
                              >
                                {item.title}
                              </span>
                              {hasBlockers(item) && (
                                <span title="This task depends on other tasks">
                                  <Link className="w-3 h-3 text-red-500 shrink-0" />
                                </span>
                              )}
                              {isPredecessor(item.id) && (
                                <span title="Other tasks depend on this one">
                                  <Link className="w-3 h-3 text-blue-500 shrink-0" />
                                </span>
                              )}
                            </div>
                            {showProjectNames && isSub && <span className="text-[8px] text-slate-400 truncate" style={{ paddingLeft: `${(item.hierarchyLevel || 0) * 12}px` }}>In {item.projectName}</span>}
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
                        {col.id === 'duration' && <span className="text-slate-500">{item.start_date ? differenceInCalendarDays(parseISO(getEffectiveEndDate(item)!), parseISO(item.start_date)) + 1 : '-'}</span>}
                        {col.id === 'status' && (
                          <div className="flex items-center gap-1.5">
                            <Circle className={cn("w-2 h-2 fill-current",
                              item.status.toLowerCase() === 'done' ? "text-emerald-500" :
                                item.status.toLowerCase() === 'in progress' ? "text-blue-500" :
                                  item.status.toLowerCase() === 'on hold' ? "text-amber-500" :
                                    item.status.toLowerCase() === 'review' ? "text-purple-500" :
                                      "text-slate-300"
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
                  <div className="relative h-14 shrink-0" style={{ width: `${containerWidth}px` }}>
                    {/* Grid Lines */}
                    {timeTicks?.map(tick => (
                      <div key={tick.toISOString()} className="absolute top-0 bottom-0 border-l border-slate-100 h-full z-0" style={{ left: `${getPositionPx(tick)}px` }} />
                    ))}
                    {minorTicksLevel1?.map(tick => (
                      <div key={`grid-minor1-${tick.toISOString()}`} className="absolute top-0 bottom-0 border-l border-slate-50 h-full z-0" style={{ left: `${getPositionPx(tick)}px` }} />
                    ))}
                    {minorTicksLevel2?.map(tick => (
                      <div key={`grid-minor2-${tick.toISOString()}`} className="absolute top-0 bottom-0 border-l border-slate-50/40 h-full z-0" style={{ left: `${getPositionPx(tick)}px` }} />
                    ))}

                    {/* Deadline Indicator */}
                    {item.deadline_at && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-10 pointer-events-none opacity-40"
                        style={{ left: `${getPositionPx(item.deadline_at) + dayWidth}px` }}
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
                          left: `calc(${getPositionPx(item.start_date!)}px - 8px)`,
                          top: '20px'
                        }}
                        title={`${item.title} (Milestone)`}
                      />
                    ) : (
                      <div className="relative h-full flex flex-col justify-center">
                        {/* Buffer Zone (Grace Period) */}
                        {item.deadline_at && item.due_date && isAfter(parseISO(item.deadline_at), parseISO(item.due_date)) && (
                          <div
                            className="absolute h-6 opacity-60 z-0"
                            style={{
                              left: `${getPositionPx(addDays(parseISO(item.due_date), 1))}px`,
                              width: `${getPositionPx(item.deadline_at) - getPositionPx(item.due_date)}px`,
                              backgroundImage: 'repeating-linear-gradient(-45deg, #cbd5e1, #cbd5e1 2px, transparent 2px, transparent 6px)',
                              borderRadius: '0 4px 4px 0'
                            }}
                          />
                        )}

                        {/* Main Bar (Planned Time) */}
                        <div
                          className={cn(
                            "absolute h-6 rounded shadow-sm flex items-center transition-all group-hover:z-10 border-[1.5px] overflow-hidden z-10",
                            getPriorityBorder(item.priority),
                            (item.deadline_at && isAfter(new Date(), parseISO(item.deadline_at)) && item.status.toLowerCase() !== 'done') && "ring-2 ring-red-500 ring-offset-1",
                            showCriticalPath && item.is_critical && "ring-2 ring-red-400 ring-offset-2 animate-pulse"
                          )}
                          style={{
                            left: `${getPositionPx(item.start_date!)}px`,
                            width: `${getWidthPx(item.start_date!, (item.due_date || item.start_date))}px`,
                            backgroundColor: hasColor ? `${item.color}25` : `${getStatusHex(item.status)}22`,
                            borderColor: hasColor ? item.color : getStatusHex(item.status)
                          }}
                        >
                          <span className="px-2 text-[10px] font-bold truncate text-slate-800 pointer-events-none">
                            {item.title}
                          </span>

                          {/* Progress Indicator Underline */}
                          <div
                            className="h-1 absolute bottom-0 left-0 transition-all duration-500 ease-in-out"
                            style={{
                              width: getProgressWidth(item),
                              backgroundColor: hasColor ? item.color : getStatusHex(item.status),
                            }}
                          />

                          {(item.deadline_at && isAfter(new Date(), parseISO(item.deadline_at)) && item.status.toLowerCase() !== 'done') && (
                            <div className="absolute right-1 top-1 text-[8px] animate-pulse">⚠️</div>
                          )}
                        </div>

                        {/* Actual Completion Pin */}
                        {(() => {
                          const conclusionDate = item.completed_at;
                          if (!conclusionDate) return null;

                          const conclusionPx = getPositionPx(conclusionDate);
                          
                          const isLate = isAfter(parseISO(conclusionDate), parseISO(item.due_date || item.start_date!));
                          const pinColor = isLate ? "bg-red-500" : "bg-emerald-500";

                          return (
                            <div
                              className={cn("absolute w-0.5 h-8 z-20 shadow-sm", pinColor)}
                              style={{
                                left: `${conclusionPx}px`,
                              }}
                              title={`Actually completed: ${format(parseISO(conclusionDate), 'PPP')}`}
                            >
                              <div className={cn("absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full shadow-sm", pinColor)} />
                              <div className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full shadow-sm", pinColor)} />
                            </div>
                          );
                        })()}
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
      <Dialog open={isRegionDialogOpen} onOpenChange={(open) => { setIsRegionDialogOpen(open); if (!open) setRegionFormView('list'); }}>
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
                <Input placeholder="e.g. Q1 Sprint" value={newRegion.name || ''} onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={newRegion.start_date || ''} onChange={(e) => setNewRegion({ ...newRegion, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={newRegion.end_date || ''} onChange={(e) => setNewRegion({ ...newRegion, end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Label Position</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newRegion.label_position}
                    onChange={(e) => setNewRegion({ ...newRegion, label_position: e.target.value as any })}
                  >
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Label Rotation (deg)</Label>
                  <Input type="number" value={newRegion.label_rotation} onChange={(e) => setNewRegion({ ...newRegion, label_rotation: parseInt(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Zone Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" className="w-10 p-1" value={newRegion.color} onChange={(e) => setNewRegion({ ...newRegion, color: e.target.value })} />
                    <Input value={newRegion.color} onChange={(e) => setNewRegion({ ...newRegion, color: e.target.value })} placeholder="#e2e8f0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" className="w-10 p-1" value={newRegion.text_color} onChange={(e) => setNewRegion({ ...newRegion, text_color: e.target.value })} />
                    <Input value={newRegion.text_color} onChange={(e) => setNewRegion({ ...newRegion, text_color: e.target.value })} placeholder="#000000" />
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
