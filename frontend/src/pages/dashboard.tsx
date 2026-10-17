import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { 
  FolderKanban, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Calendar,
  ArrowRight,
  TrendingUp,
  Activity,
  Users,
  Zap,
  Bell
} from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO, startOfDay, addDays } from 'date-fns';
import ProjectHeatmap from '@/components/project-heatmap';
import ResourceTimeline from '@/components/resource-timeline';
import { UserAvatar } from '@/components/ui/user-avatar';
import RiskHeatmap from '@/components/risk-heatmap';

interface DashboardSummary {
  total_projects: number;
  total_tasks: number;
  tasks_backlog: number;
  tasks_todo: number;
  tasks_in_progress: number;
  tasks_on_hold: number;
  tasks_review: number;
  tasks_done: number;
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

interface WorkloadDay {
    date: string;
    hours: number;
    task_count: number;
}

interface UserWorkload {
    user_id: string;
    user_name: string;
    workload: WorkloadDay[];
    is_overallocated: boolean;
}

interface TeamWorkloadResponse {
    users: UserWorkload[];
}

interface TeammateActivity {
  id: string;
  title: string;
  completed_at: string;
  project_name: string;
  project_id: string;
  user: {
    full_name: string;
    email: string;
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const response = await api.get('/dashboard/summary');
      return response.data as DashboardSummary;
    },
  });

  const { data: teamActivity } = useQuery({
    queryKey: ['team-activity'],
    queryFn: async () => {
      const response = await api.get('/teams/activity');
      return response.data as TeammateActivity[];
    },
  });

  const { data: workloadData, isLoading: isLoadingWorkload } = useQuery({
    queryKey: ['team-workload'],
    queryFn: async () => {
        const res = await api.get('/dashboard/team-workload?days=14');
        return res.data as TeamWorkloadResponse;
    }
  });

  const { data: calendarData } = useQuery({
    queryKey: ['calendar-events', 'global'],
    queryFn: async () => {
      const response = await api.get('/calendar/');
      return response.data;
    },
  });

  const { data: riskData } = useQuery({
    queryKey: ['risk-data'],
    queryFn: async () => {
      const response = await api.get('/dashboard/risk-data');
      return response.data;
    },
  });

  const workloadDates = useMemo(() => {
    const dates = [];
    const start = startOfDay(new Date());
    for (let i = 0; i < 14; i++) {
        dates.push(format(addDays(start, i), 'yyyy-MM-dd'));
    }
    return dates;
  }, []);

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

  const completionRate = data?.total_tasks ? (data.tasks_done / data.total_tasks) * 100 : 0;

  const getWorkloadColor = (hours: number) => {
    if (hours === 0) return 'bg-subtle';
    if (hours <= 4) return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
    if (hours <= 7) return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300';
    if (hours <= 8) return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
    return 'bg-rose-500 text-white animate-pulse';
  };

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-subtle/50">
      <div className="flex-1 overflow-auto p-6 space-y-8 pb-12">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
              <FolderKanban className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.total_projects}</div>
              <p className="text-xs text-muted-foreground mt-1">Across your organization</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Tasks</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(data?.tasks_in_progress || 0) + (data?.tasks_review || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">In Progress & Review</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Blocked / Hold</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.tasks_on_hold}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently on hold</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">System Activity</CardTitle>
              <Bell className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-1 text-[10px] font-bold uppercase h-8"
                onClick={() => navigate('/updates')}
              >
                View Activity Recap
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(completionRate)}%</div>
              <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${completionRate}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Task Status Breakdown */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-fg-faint" />
              Task Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-subtle border border-hairline">
                <span className="text-[10px] font-black uppercase text-fg-faint">Backlog</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-fg-body">{data?.tasks_backlog}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-muted-foreground border-border">{formatPercent((data?.tasks_backlog || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-subtle border border-hairline">
                <span className="text-[10px] font-black uppercase text-fg-faint">To Do</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-fg-body">{data?.tasks_todo}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-muted-foreground border-border">{formatPercent((data?.tasks_todo || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-blue-50/50 border border-blue-100 dark:border-blue-500/20">
                <span className="text-[10px] font-black uppercase text-blue-400">In Progress</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{data?.tasks_in_progress}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20">{formatPercent((data?.tasks_in_progress || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-amber-50/50 border border-amber-100 dark:border-amber-500/20">
                <span className="text-[10px] font-black uppercase text-amber-400">On Hold</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{data?.tasks_on_hold}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20">{formatPercent((data?.tasks_on_hold || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-purple-50/50 border border-purple-100 dark:border-purple-500/20">
                <span className="text-[10px] font-black uppercase text-purple-400">Review</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-purple-700 dark:text-purple-300">{data?.tasks_review}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20">{formatPercent((data?.tasks_review || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 dark:border-emerald-500/20">
                <span className="text-[10px] font-black uppercase text-emerald-400">Done</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{data?.tasks_done}</span>
                  <Badge variant="outline" className="text-[9px] bg-background text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">{formatPercent((data?.tasks_done || 0) / (data?.total_tasks || 1) * 100)}%</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workload Heatmap */}
        <Card className="border-border shadow-sm overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            Team Capacity Heatmap (14 Days)
                        </CardTitle>
                        <CardDescription className="text-[10px]">Real-time daily effort distribution based on active task durations.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-tighter text-fg-faint">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-100 dark:bg-emerald-500/20"></div> Low</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-blue-100 dark:bg-blue-500/20"></div> Med</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-100 dark:bg-amber-500/20"></div> Full</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-rose-500"></div> Over</div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 border-t bg-subtle/30">
                <div className="table-container">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-subtle/80">
                                <th className="p-3 text-[10px] font-black uppercase text-muted-foreground border-b border-r w-40 sticky left-0 bg-subtle z-10">Team Member</th>
                                {workloadDates.map(date => (
                                    <th key={date} className="p-2 text-[9px] font-black uppercase text-fg-faint border-b text-center min-w-[45px]">
                                        {format(parseISO(date), 'EEE')}<br/>
                                        <span className="text-fg-soft">{format(parseISO(date), 'd')}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingWorkload ? (
                                <tr><td colSpan={15} className="p-8 text-center text-xs text-fg-faint">Loading workload data...</td></tr>
                            ) : workloadData?.users.map(user_workload => (
                                <tr key={user_workload.user_id} className="hover:bg-background transition-colors">
                                    <td className="p-3 border-b border-r sticky left-0 bg-background z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                        <div className="flex items-center gap-2">
                                            <UserAvatar user={{ full_name: user_workload.user_name }} className="w-6 h-6" />
                                            <span className="text-xs font-bold text-fg-body truncate max-w-[100px]">{user_workload.user_name}</span>
                                            {user_workload.is_overallocated && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                                        </div>
                                    </td>
                                    {workloadDates.map(date => {
                                        const day = user_workload.workload.find(d => d.date === date);
                                        const hours = day?.hours || 0;
                                        return (
                                            <td key={date} className="p-1 border-b">
                                                <div className={cn(
                                                    "h-10 rounded-md flex flex-col items-center justify-center transition-all",
                                                    getWorkloadColor(hours)
                                                )}>
                                                    <span className="text-[10px] font-black">{hours > 0 ? `${hours}h` : '-'}</span>
                                                    {day && day.task_count > 0 && <span className="text-[8px] opacity-60 font-medium">{day.task_count}t</span>}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-7">
          {/* Upcoming Deadlines */}
          <Card className="md:col-span-4 border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
                  <CardDescription>Tasks due in the next 7 days.</CardDescription>
                </div>
                <Calendar className="h-4 w-4 text-fg-faint" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.upcoming_deadlines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-fg-faint">
                    <p className="text-sm">No upcoming deadlines.</p>
                  </div>
                ) : (
                  data?.upcoming_deadlines.map((task) => (
                    <Link 
                      key={task.id} 
                      to={`/projects/${task.project_id}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-hairline hover:border-primary/20 hover:bg-subtle transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                        <div>
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{task.title}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">Due {task.due_date ? format(parseISO(task.due_date), 'MMM d, h:mm a') : 'N/A'}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-fg-ghost group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="md:col-span-3 border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                  <CardDescription>Latest completed tasks.</CardDescription>
                </div>
                <Activity className="h-4 w-4 text-fg-faint" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-4">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-muted" />
                {data?.recent_activity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-fg-faint">
                    <p className="text-sm">No recent activity.</p>
                  </div>
                ) : (
                  data?.recent_activity.map((activity) => (
                    <div key={activity.id} className="relative pl-7 flex flex-col gap-0.5">
                      <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border-2 border-background flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-foreground leading-tight">{activity.title}</p>
                      <p className="text-[10px] text-muted-foreground">Completed {activity.completed_at ? format(parseISO(activity.completed_at), 'MMM d, p') : 'N/A'}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Activity Feed (only if there is activity) */}
        {(teamActivity && teamActivity.length > 0) && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Teammate Activity</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {teamActivity.map((activity) => (
                <Card key={activity.id} className="border-border shadow-sm hover:border-primary/20 transition-all group">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <UserAvatar user={activity.user} className="w-8 h-8" />
                      <Badge variant="outline" className="text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20">Done</Badge>
                    </div>
                    <CardTitle className="text-xs font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {activity.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <FolderKanban className="w-3 h-3" />
                        <span className="truncate">{activity.project_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-fg-faint">
                        <Clock className="w-3 h-3" />
                        <span>{activity.completed_at ? format(parseISO(activity.completed_at), 'MMM d, h:mm a') : 'N/A'}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
                      <span className="text-[10px] font-bold text-foreground">{activity.user.full_name || activity.user.email}</span>
                      <Link to={`/projects/${activity.project_id}`} className="text-[9px] font-black text-primary uppercase hover:underline flex items-center gap-0.5">
                        View <ArrowRight className="w-2 h-2" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className={cn("grid gap-4", user?.is_superuser ? "md:grid-cols-3" : "md:grid-cols-2")}>
          <Link 
            to="/projects" 
            className="p-4 bg-background border border-border rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Manage Projects</p>
                <p className="text-xs text-muted-foreground">View all your active work</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-fg-ghost group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link 
            to="/roadmap" 
            className="p-4 bg-background border border-border rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Roadmap</p>
                <p className="text-xs text-muted-foreground">Track timelines and goals</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-fg-ghost group-hover:translate-x-1 transition-transform" />
          </Link>

          {user?.is_superuser && (
            <Link 
              to="/users" 
              className="p-4 bg-background border border-border rounded-xl shadow-sm hover:border-primary/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Team Stats</p>
                  <p className="text-xs text-muted-foreground">See contribution patterns</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-fg-ghost group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>

        <div className={cn("grid gap-6", user?.is_superuser ? "md:grid-cols-2" : "grid-cols-1")}>
          {user?.is_superuser && (
            <Card className="border-border shadow-sm overflow-hidden flex flex-col">
              <CardHeader className="bg-background">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Team Workload</CardTitle>
                    <CardDescription>Current task distribution across your team.</CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-fg-faint" />
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-[400px]">
                <ResourceTimeline 
                    tasks={(calendarData?.items || []).filter((i: any) => i.item_type !== 'project').map((i: any) => ({
                        ...i,
                        project: { name: i.project_name }
                    }))} 
                    title="Global Resource Load"
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Risk Heatmap */}
            <Card className="border-border shadow-sm overflow-hidden flex flex-col">
              <CardHeader className="bg-subtle/50 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Risk Exposure Matrix
                    </CardTitle>
                    <CardDescription className="text-[10px]">Probability vs Impact for active items.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 flex-1">
                <RiskHeatmap items={riskData || []} />
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="bg-subtle/50 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      System-wide Activity
                    </CardTitle>
                    <CardDescription className="text-[10px]">Consolidated completions over the last year.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ProjectHeatmap stats={data?.global_activity || []} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
