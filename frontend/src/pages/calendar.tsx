import { useState } from 'react';
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
} from 'date-fns';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import TaskCreateDialog from '@/components/task-create-dialog';

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

export default function CalendarPage() {
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h1>
          <p className="text-sm text-slate-500">View all project deadlines and task due dates.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-1 shadow-sm">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 text-slate-500">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" className="h-8 text-xs font-medium px-3 text-slate-600" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 text-slate-500">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" className="gap-2 shadow-md shadow-primary/20" onClick={() => setIsTaskDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
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
        // Show only the discrete deadline/due date, not the full interval
        const dateStr = (item.item_type === 'task' || item.item_type === 'subtask')
          ? (item.deadline_at || item.due_date)
          : item.due_date;
          
        return isSameDay(day, parseISO(dateStr));
      }) || [];

      days.push(        <div
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
                      className="w-full mt-2 h-8 text-xs gap-2 group-hover:border-primary/30 transition-colors"
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
    <div className="max-w-7xl mx-auto">
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
