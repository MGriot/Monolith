import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { 
  Bell, 
  CheckCircle2, 
  PlusCircle, 
  Calendar, 
  Clock, 
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface ActivityRecap {
  new_tasks: {
    id: string;
    title: string;
    created_at: string;
    project_id: string;
  }[];
  completed_tasks: {
    id: string;
    title: string;
    completed_at: string;
    project_id: string;
  }[];
  upcoming_deadlines: {
    id: string;
    title: string;
    due_date: string;
    project_id: string;
  }[];
}

export default function UpdatesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['activity-recap'],
    queryFn: async () => {
      const response = await api.get('/dashboard/activity-recap');
      return response.data as ActivityRecap;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load activity data.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50">
      <div className="p-6 space-y-8 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Updates</h1>
            <p className="text-sm text-slate-500">Recap of all recent activities and upcoming milestones.</p>
          </div>
          <Badge variant="outline" className="bg-white border-slate-200">
            Last 30 Days
          </Badge>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* New Tasks */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-blue-500" />
                  Newly Created
                </CardTitle>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">{data?.new_tasks.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {data?.new_tasks.length === 0 ? (
                  <p className="text-xs text-center text-slate-400 py-4">No new tasks recently.</p>
                ) : (
                  data?.new_tasks.map((task) => (
                    <Link 
                      key={task.id} 
                      to={`/projects/${task.project_id}`}
                      className="block p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                    >
                      <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 line-clamp-1">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-500">{format(parseISO(task.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Completed Tasks */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Recently Finished
                </CardTitle>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">{data?.completed_tasks.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {data?.completed_tasks.length === 0 ? (
                  <p className="text-xs text-center text-slate-400 py-4">No tasks completed recently.</p>
                ) : (
                  data?.completed_tasks.map((task) => (
                    <Link 
                      key={task.id} 
                      to={`/projects/${task.project_id}`}
                      className="block p-3 rounded-lg border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
                    >
                      <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 line-clamp-1">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-slate-500">{format(parseISO(task.completed_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Upcoming Deadlines
                </CardTitle>
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">{data?.upcoming_deadlines.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {data?.upcoming_deadlines.length === 0 ? (
                  <p className="text-xs text-center text-slate-400 py-4">No upcoming deadlines.</p>
                ) : (
                  data?.upcoming_deadlines.map((task) => (
                    <Link 
                      key={task.id} 
                      to={`/projects/${task.project_id}`}
                      className="block p-3 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/30 transition-all group"
                    >
                      <p className="text-xs font-bold text-slate-800 group-hover:text-amber-700 line-clamp-1">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] text-slate-600 font-bold">Due {format(parseISO(task.due_date), 'MMM d, h:mm a')}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
