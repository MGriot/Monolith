import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  format, 
  differenceInDays, 
  endOfMonth, 
  eachMonthOfInterval,
  parseISO,
  startOfYear,
  endOfYear,
} from 'date-fns';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  status: string;
  progress_percent: number;
  start_date: string;
  due_date: string;
  topic: string;
}

export default function RoadmapPage() {
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

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Project Roadmap</h1>
        <p className="text-sm text-slate-500">High-level timeline of all active projects.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" /> Filter
        </Button>
        <div className="flex items-center bg-white border border-slate-200 rounded-md p-1 shadow-sm ml-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium px-4">{format(viewWindow.start, 'yyyy')}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      {renderHeader()}
      
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
              <Button variant="link">Create your first project</Button>
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
                      project.status === 'done' ? "bg-green-50 border-green-200" : "bg-primary/5 border-primary/20"
                    )}
                    style={{ 
                      left: `${getPosition(project.start_date)}%`, 
                      width: `${getWidth(project.start_date, project.due_date)}%` 
                    }}
                  >
                    <span className="text-[10px] font-bold text-primary truncate">
                      {project.name}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary/10 border border-primary/20 rounded-sm" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-50 border border-green-200 rounded-sm" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span>* Timeline calculated based on start and due dates.</span>
        </div>
      </div>
    </div>
  );
}
