import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth-provider';
import {
  format,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameDay,
  parseISO,
  differenceInDays,
  eachMonthOfInterval,
} from 'date-fns';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Filter, Plus, ExternalLink, Calendar as CalendarIcon, GanttChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatPercent } from '@/lib/utils';
import { toast } from 'sonner';
import {
  moveItemDates,
  rangeKey,
  rangeTitle,
  shiftAnchor,
  visibleDays,
  visibleRange,
  yearBounds,
  type CalendarView,
} from '@/lib/calendar-range';
import TaskCreateDialog from '@/components/task-create-dialog';
import { useTitle } from '@/context/title-context';

// --- Calendar View Component ---

interface CalendarItem {
  id: string;
  title: string;
  item_type: 'project' | 'task' | 'subtask';
  status: string;
  start_date?: string;
  due_date: string;
  deadline_at?: string;
  project_id?: string;
  project_name?: string;
  project_owner_id?: string;
  task_id?: string;
}

// --- Task Roadmap View Component ---

function YearNav({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  return (
    <div className="flex items-center bg-background border border-border rounded-md p-1 shadow-sm">
      <Button variant="ghost" size="icon" onClick={() => onChange(year - 1)} className="h-7 w-7 text-muted-foreground" aria-label="Previous year">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" className="h-7 text-xs font-medium px-3 text-fg-soft" onClick={() => onChange(new Date().getFullYear())}>
        This year
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onChange(year + 1)} className="h-7 w-7 text-muted-foreground" aria-label="Next year">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}


function TaskRoadmapView() {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const viewWindow = useMemo(() => yearBounds(year), [year]);

  const { data: calendarItems, isLoading } = useQuery({
    queryKey: ['calendar-tasks-gantt', year],
    queryFn: async () => {
      const start = format(viewWindow.start, 'yyyy-MM-dd');
      const end = format(viewWindow.end, 'yyyy-MM-dd');
      const response = await api.get(`/calendar/?start_date=${start}&end_date=${end}`);
      return response.data.items as CalendarItem[];
    },
  });

  const months = useMemo(() => {
    return eachMonthOfInterval({
      start: viewWindow.start,
      end: viewWindow.end,
    });
  }, [viewWindow]);

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
    return Math.max(0.5, (duration / totalDays) * 100);
  };

  const relevantTasks = useMemo(() => {
    if (!calendarItems || !user) return [];
    return calendarItems.filter(item => 
      (item.item_type === 'task' || item.item_type === 'subtask') && 
      item.start_date && 
      item.project_owner_id !== user.id
    );
  }, [calendarItems, user]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-foreground">{year} Task Progression</h2>
          <YearNav year={year} onChange={setYear} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-purple-500" /> Assigned Tasks
        </div>
      </div>
      
      <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
        {/* Timeline Header */}
        <div className="flex border-b border-border bg-subtle/50">
          <div className="w-64 border-r border-border p-4 flex-shrink-0 font-semibold text-sm text-fg-soft">
            Task / Project
          </div>
          <div className="flex-1 relative h-14 flex items-end">
            {months.map((month) => {
              const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
              const width = (differenceInDays(endOfMonth(month), month) + 1) / totalDays * 100;
              return (
                <div 
                  key={month.toISOString()} 
                  className="absolute border-l border-border h-full flex items-center justify-center text-[11px] font-bold text-fg-faint uppercase tracking-tight"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {format(month, 'MMM')}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto max-h-[600px]">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : relevantTasks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <p>No tasks with progression found in other projects.</p>
            </div>
          ) : (
            relevantTasks.map((task) => (
              <div key={task.id} className="flex border-b border-hairline hover:bg-subtle/50 transition-colors group">
                <div className="w-64 border-r border-border p-4 flex-shrink-0 flex flex-col justify-center">
                  <span className="text-sm font-semibold text-foreground truncate">{task.title}</span>
                  <span className="text-[11px] text-fg-faint truncate">{task.project_name || 'Individual Task'}</span>
                </div>
                <div className="flex-1 relative h-16 py-4 px-0">
                  {/* Grid lines */}
                  {months.map((month) => {
                    const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
                    return (
                      <div 
                        key={month.toISOString()} 
                        className="absolute top-0 bottom-0 border-l border-hairline h-full"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
                  
                  {/* Task Bar */}
                  <div 
                    className={cn(
                      "absolute h-8 rounded-md border flex items-center px-3 shadow-sm transition-transform group-hover:scale-[1.01] bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30"
                    )}
                    style={{ 
                      left: `${getPosition(task.start_date!)}%`, 
                      width: `${getWidth(task.start_date!, task.due_date)}%` 
                    }}
                  >
                    <span className="text-[11px] font-bold truncate text-purple-700 dark:text-purple-300">
                      {task.title}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MoveToDate({ value, onMove }: { value: string; onMove: (day: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Move to
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border px-2 py-1 text-xs font-normal normal-case text-fg-body"
        />
      </label>
      <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={!draft || draft === value} onClick={() => onMove(draft)}>
        Move
      </Button>
    </div>
  );
}

const VIEW_LABELS: Record<CalendarView, string> = { month: 'Month', week: 'Week', day: 'Day' };

const itemDay = (item: CalendarItem): Date =>
  parseISO(item.item_type === 'task' || item.item_type === 'subtask' ? item.deadline_at || item.due_date : item.due_date);

function CalendarView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const key = rangeKey(view, anchor);

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', key],
    queryFn: async () => {
      const start = format(range.start, 'yyyy-MM-dd');
      const end = format(range.end, 'yyyy-MM-dd');
      const response = await api.get(`/calendar/?start_date=${start}&end_date=${end}`);
      return response.data.items as CalendarItem[];
    },
  });

  // Optimistic reschedule: every cached calendar range is patched at once, and restored if the server refuses.
  const moveMutation = useMutation({
    mutationFn: async ({ item, dates }: { item: CalendarItem; dates: ReturnType<typeof moveItemDates> }) => {
      return api.put(`/tasks/${item.id}`, dates);
    },
    onMutate: async ({ item, dates }) => {
      await queryClient.cancelQueries({ queryKey: ['calendar'] });
      const snapshots = queryClient.getQueriesData<CalendarItem[]>({ queryKey: ['calendar'] });
      queryClient.setQueriesData<CalendarItem[]>({ queryKey: ['calendar'] }, (old) =>
        old?.map((i) => (i.id === item.id ? ({ ...i, ...dates } as CalendarItem) : i)),
      );
      return { snapshots };
    },
    onError: (error: any, _vars, context) => {
      context?.snapshots.forEach(([k, d]) => queryClient.setQueryData(k, d));
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' && detail ? detail : 'Could not move the task');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-tasks-gantt'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const moveItemTo = (item: CalendarItem, target: Date) => {
    if (item.item_type === 'project') return;
    const from = itemDay(item);
    if (isSameDay(from, target)) return;
    const dates = moveItemDates(
      { start_date: item.start_date, due_date: item.due_date, deadline_at: item.deadline_at },
      from,
      target,
    );
    moveMutation.mutate({ item, dates });
  };

  const handleViewDetails = (item: CalendarItem) => {
    if (item.item_type === 'project') {
      navigate(`/projects/${item.id}`);
    } else if (item.project_id) {
      navigate(`/projects/${item.project_id}`);
    }
  };

  const goPrev = () => setAnchor(shiftAnchor(view, anchor, -1));
  const goNext = () => setAnchor(shiftAnchor(view, anchor, 1));

  const renderHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-bold text-foreground">{rangeTitle(view, anchor)}</h2>
        <div className="flex items-center bg-background border border-border rounded-md p-1 shadow-sm">
          <Button variant="ghost" size="icon" onClick={goPrev} className="h-7 w-7 text-muted-foreground" aria-label={`Previous ${view}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" className="h-7 text-xs font-medium px-3 text-fg-soft" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={goNext} className="h-7 w-7 text-muted-foreground" aria-label={`Next ${view}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center bg-background border border-border rounded-md p-1 shadow-sm" role="group" aria-label="Calendar view">
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <Button
              key={v}
              variant={view === v ? 'secondary' : 'ghost'}
              className="h-7 text-xs font-medium px-3"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {VIEW_LABELS[v]}
            </Button>
          ))}
        </div>
      </div>
      <Button size="sm" className="gap-2 shadow-md shadow-primary/20" onClick={() => setIsTaskDialogOpen(true)}>
        <Plus className="h-4 w-4" /> New Task
      </Button>
    </div>
  );

  const renderDayNames = () => {
    if (view === 'day') return null;
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.slice(0, 7).map((day) => (
          <div key={format(day, 'EEE')} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
            {format(day, 'EEE')}
          </div>
        ))}
      </div>
    );
  };

  const renderItem = (item: CalendarItem) => {
    const movable = item.item_type !== 'project';
    const day = itemDay(item);
    return (
      <Popover key={item.id}>
        <PopoverTrigger asChild>
          <div
            draggable={movable}
            onDragStart={(e) => {
              if (!movable) return;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
              setDragId(item.id);
            }}
            onDragEnd={() => { setDragId(null); setDropDay(null); }}
            className={cn(
              "text-[11px] px-1.5 py-0.5 rounded border truncate",
              movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
              view !== 'month' && "text-xs py-1",
              dragId === item.id && "opacity-40",
              item.item_type === 'project' && "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300",
              item.item_type === 'task' && "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300",
              item.item_type === 'subtask' && "bg-subtle border-border text-fg-body"
            )}
          >
            {item.title}
            {view === 'day' && item.project_name && <span className="ml-2 opacity-60">{item.project_name}</span>}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4">
          <div className="space-y-2">
            <div className="flex justify-between items-start">
              <Badge variant="outline" className="capitalize text-[11px]">{item.item_type}</Badge>
              <Badge className="text-[11px]">{item.status}</Badge>
            </div>
            <h4 className="font-bold text-sm text-foreground">{item.title}</h4>
            <p className="text-xs text-muted-foreground">
              {item.deadline_at ? `Deadline: ${format(parseISO(item.deadline_at), 'PPP')}` : `Due: ${format(parseISO(item.due_date), 'PPP')}`}
            </p>
            {movable && (
              <MoveToDate value={format(day, 'yyyy-MM-dd')} onMove={(d) => moveItemTo(item, parseISO(d))} />
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 h-8 text-xs gap-2"
              onClick={() => handleViewDetails(item)}
            >
              <ExternalLink className="w-3 h-3" />
              View Details
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(anchor);
    const maxVisible = view === 'month' ? 3 : Infinity;
    const minHeight = view === 'month' ? 'min-h-[120px]' : view === 'week' ? 'min-h-[360px]' : 'min-h-[480px]';

    return (
      <div className={cn("border-b border-r border-border rounded-lg overflow-hidden shadow-sm grid", view === 'day' ? 'grid-cols-1' : 'grid-cols-7')}>
        {days.map((day, i) => {
          const formattedDate = format(day, 'yyyy-MM-dd');
          const dayItems = data?.filter((item) => isSameDay(day, itemDay(item))) || [];
          const isDropTarget = dropDay === formattedDate && dragId !== null;
          return (
            <div
              key={formattedDate}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropDay !== formattedDate) setDropDay(formattedDate);
              }}
              onDragLeave={() => setDropDay((cur) => (cur === formattedDate ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragId;
                const item = data?.find((x) => x.id === id);
                setDragId(null);
                setDropDay(null);
                if (item) moveItemTo(item, day);
              }}
              className={cn(
                minHeight,
                "bg-background border-t border-l border-border p-2 transition-colors hover:bg-subtle/50",
                view === 'month' && !isSameMonth(day, monthStart) && "bg-subtle/30 text-fg-faint",
                (view === 'day' || i % 7 === 6) && "border-r",
                isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary/40"
              )}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={cn(
                  "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                  isSameDay(day, new Date()) && "bg-primary text-primary-foreground font-bold"
                )}>
                  {format(day, 'd')}
                </span>
                {view === 'day' && <span className="text-xs text-fg-faint">{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, maxVisible).map(renderItem)}
                {dayItems.length > maxVisible && (
                  <button
                    type="button"
                    className="text-[11px] text-fg-faint pl-1 font-medium hover:text-fg-soft"
                    onClick={() => { setAnchor(day); setView('day'); }}
                  >
                    + {dayItems.length - maxVisible} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mt-4">
      {renderHeader()}
      <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 bg-subtle/50 border-b border-border">
          {renderDayNames()}
        </div>
        {isLoading ? (
          <div className="h-[600px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          renderCells()
        )}
      </div>
      <p className="mt-2 text-[11px] text-fg-faint">Drag a task onto another day to reschedule it, or open it and use "Move to".</p>
      <TaskCreateDialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen} />
    </div>
  );
}

// --- Roadmap View Component ---

interface Project {
  id: string;
  name: string;
  status: string;
  progress_percent: number;
  start_date: string;
  due_date: string;
  topic: string;
}

function RoadmapView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const viewWindow = useMemo(() => yearBounds(year), [year]);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects-gantt', year],
    queryFn: async () => {
      const response = await api.get('/projects/gantt');
      return response.data as Project[];
    },
  });

  const months = useMemo(() => {
    return eachMonthOfInterval({
      start: viewWindow.start,
      end: viewWindow.end,
    });
  }, [viewWindow]);

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
    return Math.max(0.5, (duration / totalDays) * 100);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-foreground">{year} Timeline</h2>
          <YearNav year={year} onChange={setYear} />
        </div>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-4">
                <div className="w-2 h-2 rounded-full bg-primary" /> Active
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Done
            </div>
            <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" /> Filter
            </Button>
        </div>
      </div>
      
      <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
        {/* Timeline Header */}
        <div className="flex border-b border-border bg-subtle/50">
          <div className="w-64 border-r border-border p-4 flex-shrink-0 font-semibold text-sm text-fg-soft">
            Project Name
          </div>
          <div className="flex-1 relative h-14 flex items-end">
            {months.map((month) => {
              const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
              const width = (differenceInDays(endOfMonth(month), month) + 1) / totalDays * 100;
              return (
                <div 
                  key={month.toISOString()} 
                  className="absolute border-l border-border h-full flex items-center justify-center text-[11px] font-bold text-fg-faint uppercase tracking-tight"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {format(month, 'MMM')}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto max-h-[600px]">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : projects?.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <p>No projects with timelines found.</p>
            </div>
          ) : (
            projects?.map((project) => (
              <div key={project.id} className="flex border-b border-hairline hover:bg-subtle/50 transition-colors group">
                <div className="w-64 border-r border-border p-4 flex-shrink-0 flex flex-col justify-center">
                  <span className="text-sm font-semibold text-foreground truncate">{project.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-muted-foreground">{formatPercent(project.progress_percent)}%</span>
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${project.progress_percent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-1 relative h-16 py-4 px-0">
                  {/* Grid lines */}
                  {months.map((month) => {
                    const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
                    return (
                      <div 
                        key={month.toISOString()} 
                        className="absolute top-0 bottom-0 border-l border-hairline h-full"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
                  
                  {/* Project Bar */}
                  <div 
                    className={cn(
                      "absolute h-8 rounded-md border flex items-center px-3 shadow-sm transition-transform group-hover:scale-[1.01]",
                      project.status === 'done' ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30" : "bg-primary/5 border-primary/20"
                    )}
                    style={{ 
                      left: `${getPosition(project.start_date)}%`, 
                      width: `${getWidth(project.start_date, project.due_date)}%` 
                    }}
                  >
                    <span className={cn(
                        "text-[11px] font-bold truncate",
                        project.status === 'done' ? "text-emerald-700 dark:text-emerald-300" : "text-primary"
                    )}>
                      {project.name}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Schedule Page ---

export default function SchedulePage() {
    const { setTitle } = useTitle();

    useEffect(() => {
        setTitle("Master Schedule");
        return () => setTitle(null);
    }, [setTitle]);

    return (
        <div className="h-full flex flex-col space-y-0 overflow-hidden bg-subtle/50">
            <div className="flex-1 overflow-auto p-6 space-y-16 pb-12">
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <GanttChart className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">Project Roadmaps</h2>
                    </div>
                    <RoadmapView />
                </section>

                <section>
                    <div className="flex items-center gap-2 mb-4 border-t pt-12">
                        <GanttChart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">Single Tasks Progression</h2>
                    </div>
                    <TaskRoadmapView />
                </section>

                <section>
                    <div className="flex items-center gap-2 mb-4 border-t pt-12">
                        <CalendarIcon className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">Discrete Deadlines</h2>
                    </div>
                    <CalendarView />
                </section>
            </div>
        </div>
    );
}
