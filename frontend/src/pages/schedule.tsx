import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  parseISO,
  differenceInDays,
  startOfYear,
  endOfYear,
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
import TaskCreateDialog from '@/components/task-create-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  task_id?: string;
}

function CalendarView() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const start = format(startOfWeek(startOfMonth(currentMonth)), 'yyyy-MM-dd');
      const end = format(endOfWeek(endOfMonth(currentMonth)), 'yyyy-MM-dd');
      const response = await api.get(`/calendar/?start_date=${start}&end_date=${end}`);
      return response.data.items as CalendarItem[];
    },
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleViewDetails = (item: CalendarItem) => {
    if (item.item_type === 'project') {
      navigate(`/projects/${item.id}`);
    } else if (item.project_id) {
      navigate(`/projects/${item.project_id}`);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h2>
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-1 shadow-sm">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7 text-slate-500">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" className="h-7 text-xs font-medium px-3 text-slate-600" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7 text-slate-500">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button size="sm" className="gap-2 shadow-md shadow-primary/20" onClick={() => setIsTaskDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({
      start: startDate,
      end: endDate,
    });

    const rows: React.ReactNode[] = [];
    let days: React.ReactNode[] = [];

    calendarDays.forEach((day, i) => {
      const formattedDate = format(day, 'yyyy-MM-dd');
      
      const dayItems = data?.filter((item) => {
        const dateStr = (item.item_type === 'task' || item.item_type === 'subtask')
          ? (item.deadline_at || item.due_date)
          : item.due_date;
          
        return isSameDay(day, parseISO(dateStr));
      }) || [];

      days.push(
        <div
          key={formattedDate}
          className={cn(
            "min-h-[120px] bg-white border-t border-l border-slate-200 p-2 transition-colors hover:bg-slate-50/50",
            !isSameMonth(day, monthStart) && "bg-slate-50/30 text-slate-400",
            i % 7 === 6 && "border-r"
          )}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={cn(
              "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
              isSameDay(day, new Date()) && "bg-primary text-primary-foreground font-bold"
            )}>
              {format(day, 'd')}
            </span>
          </div>
          <div className="space-y-1">
            {dayItems.slice(0, 3).map((item) => (
              <Popover key={item.id}>
                <PopoverTrigger asChild>
                  <div className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border cursor-pointer truncate",
                    item.item_type === 'project' && "bg-blue-50 border-blue-200 text-blue-700",
                    item.item_type === 'task' && "bg-purple-50 border-purple-200 text-purple-700",
                    item.item_type === 'subtask' && "bg-slate-50 border-slate-200 text-slate-700"
                  )}>
                    {item.title}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <Badge variant="outline" className="capitalize text-[10px]">{item.item_type}</Badge>
                      <Badge className="text-[10px]">{item.status}</Badge>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                    <p className="text-xs text-slate-500">
                      {item.deadline_at ? `Deadline: ${format(parseISO(item.deadline_at), 'PPP')}` : `Due: ${format(parseISO(item.due_date), 'PPP')}`}
                    </p>
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
            ))}
            {dayItems.length > 3 && (
              <div className="text-[10px] text-slate-400 pl-1 font-medium">
                + {dayItems.length - 3} more
              </div>
            )}
          </div>
        </div>
      );

      if ((i + 1) % 7 === 0) {
        rows.push(
          <div className="grid grid-cols-7" key={formattedDate}>
            {days}
          </div>
        );
        days = [];
      }
    });

    return <div className="border-b border-r border-slate-200 rounded-lg overflow-hidden shadow-sm">{rows}</div>;
  };

  return (
    <div className="mt-4">
      {renderHeader()}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-200">
          {renderDays()}
        </div>
        {isLoading ? (
          <div className="h-[600px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          renderCells()
        )}
      </div>
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
  const [viewWindow] = useState({
    start: startOfYear(new Date()),
    end: endOfYear(new Date()),
  });

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects-gantt'],
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
        <h2 className="text-xl font-bold text-slate-900">{format(viewWindow.start, 'yyyy')} Timeline</h2>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 mr-4">
                <div className="w-2 h-2 rounded-full bg-primary" /> Active
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Done
            </div>
            <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" /> Filter
            </Button>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Timeline Header */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <div className="w-64 border-r border-slate-200 p-4 flex-shrink-0 font-semibold text-sm text-slate-600">
            Project Name
          </div>
          <div className="flex-1 relative h-14 flex items-end">
            {months.map((month) => {
              const left = (differenceInDays(month, viewWindow.start) / totalDays) * 100;
              const width = (differenceInDays(endOfMonth(month), month) + 1) / totalDays * 100;
              return (
                <div 
                  key={month.toISOString()} 
                  className="absolute border-l border-slate-200 h-full flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-tighter"
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
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <p>No projects with timelines found.</p>
            </div>
          ) : (
            projects?.map((project) => (
              <div key={project.id} className="flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                <div className="w-64 border-r border-slate-200 p-4 flex-shrink-0 flex flex-col justify-center">
                  <span className="text-sm font-semibold text-slate-900 truncate">{project.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{formatPercent(project.progress_percent)}%</span>
                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
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
                        className="absolute top-0 bottom-0 border-l border-slate-100 h-full"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
                  
                  {/* Project Bar */}
                  <div 
                    className={cn(
                      "absolute h-8 rounded-md border flex items-center px-3 shadow-sm transition-transform group-hover:scale-[1.01]",
                      project.status === 'done' ? "bg-emerald-50 border-emerald-200" : "bg-primary/5 border-primary/20"
                    )}
                    style={{ 
                      left: `${getPosition(project.start_date)}%`, 
                      width: `${getWidth(project.start_date, project.due_date)}%` 
                    }}
                  >
                    <span className={cn(
                        "text-[10px] font-bold truncate",
                        project.status === 'done' ? "text-emerald-700" : "text-primary"
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
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Master Schedule</h1>
                <p className="text-slate-500 mt-1">Visualize deadlines and project roadmaps in one place.</p>
            </div>

            <Tabs defaultValue="calendar" className="w-full">
                <TabsList className="mb-4 bg-white border border-slate-200 p-1 h-12 rounded-lg">
                    <TabsTrigger value="calendar" className="gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                        <CalendarIcon className="w-4 h-4" />
                        Calendar View
                    </TabsTrigger>
                    <TabsTrigger value="roadmap" className="gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                        <GanttChart className="w-4 h-4" />
                        Roadmap View
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="calendar" className="outline-none">
                    <CalendarView />
                </TabsContent>
                
                <TabsContent value="roadmap" className="outline-none">
                    <RoadmapView />
                </TabsContent>
            </Tabs>
        </div>
    );
}