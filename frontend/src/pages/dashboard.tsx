import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { 
  FolderKanban, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Calendar,
  ArrowRight,
  TrendingUp,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format, parseISO } from 'date-fns';
import ProjectHeatmap from '@/components/project-heatmap';

interface DashboardSummary {
  total_projects: number;
  total_tasks: number;
  tasks_in_progress: number;
  tasks_done: number;
  tasks_todo: number;
  upcoming_deadlines: {
    id: string;
    title: string;
    due_date: string;
    project_id: string;
  }[];
  recent_activity: {
    id: string;
    title: string;
    completed_at: string;
    project_id: string;
  }[];
  global_activity: { date: string; count: number }[];
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const response = await api.get('/dashboard/summary');
      return response.data as DashboardSummary;
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
        <p>Failed to load dashboard data.</p>
      </div>
    );
  }

  const completionRate = data?.total_tasks ? Math.round((data.tasks_done / data.total_tasks) * 100) : 0;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back! Here's what's happening in your projects.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total_projects}</div>
            <p className="text-xs text-slate-500 mt-1">Across your organization</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.tasks_in_progress}</div>
            <p className="text-xs text-slate-500 mt-1">Tasks currently active</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.tasks_done}</div>
            <p className="text-xs text-slate-500 mt-1">Tasks finished total</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${completionRate}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Upcoming Deadlines */}
        <Card className="md:col-span-4 border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
                <CardDescription>Tasks due in the next 7 days.</CardDescription>
              </div>
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data?.upcoming_deadlines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <p className="text-sm">No upcoming deadlines.</p>
                </div>
              ) : (
                data?.upcoming_deadlines.map((task) => (
                  <Link 
                    key={task.id} 
                    to={`/projects/${task.project_id}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">{task.title}</p>
                        <p className="text-[10px] text-slate-500 font-medium">Due {format(parseISO(task.due_date), 'MMM d, h:mm a')}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="md:col-span-3 border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                <CardDescription>Latest completed tasks.</CardDescription>
              </div>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-4">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-100" />
              {data?.recent_activity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <p className="text-sm">No recent activity.</p>
                </div>
              ) : (
                data?.recent_activity.map((activity) => (
                  <div key={activity.id} className="relative pl-7 flex flex-col gap-0.5">
                    <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-emerald-50 border-2 border-white flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 leading-tight">{activity.title}</p>
                    <p className="text-[10px] text-slate-500">Completed {format(parseISO(activity.completed_at), 'MMM d, p')}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link 
          to="/projects" 
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Manage Projects</p>
              <p className="text-xs text-slate-500">View all your active work</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link 
          to="/roadmap" 
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Roadmap</p>
              <p className="text-xs text-slate-500">Track timelines and goals</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link 
          to="/users" 
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Team Stats</p>
              <p className="text-xs text-slate-500">See contribution patterns</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Global Activity Heatmap */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">System-wide Activity</CardTitle>
              <CardDescription>Consolidated task completions across all projects over the last year.</CardDescription>
            </div>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
        </CardHeader>
        <CardContent>
          <ProjectHeatmap stats={data?.global_activity || []} />
        </CardContent>
      </Card>
    </div>
  );
}
