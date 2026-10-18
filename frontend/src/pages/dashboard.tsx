import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
} from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { format, isToday, isTomorrow, parseISO, startOfDay, addDays } from 'date-fns';
import ProjectHeatmap from '@/components/project-heatmap';
import ResourceTimeline from '@/components/resource-timeline';
import { UserAvatar } from '@/components/ui/user-avatar';
import RiskHeatmap from '@/components/risk-heatmap';
import TaskCreateDialog from '@/components/task-create-dialog';
import { PageBody, PageHeader } from '@/components/ui/page-header';
import { Panel, Eyebrow } from '@/components/ui/section';
import { StatStrip, StatTile } from '@/components/ui/stat-tile';
import { EmptyState } from '@/components/ui/empty-state';
import { STATUS_COLORS } from '@/constants/colors';

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

interface FeedItem {
  id: string;
  title: string;
  completed_at: string;
  project_id: string;
  project_name?: string;
  user?: { full_name: string; email: string };
}

const CAPACITY_ROWS = 8;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const dueLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE d MMM');
};

const capacityClass = (hours: number) => {
  if (hours === 0) return 'bg-hairline text-transparent';
  if (hours <= 4) return 'bg-info-soft text-info';
  if (hours <= 7) return 'bg-info/40 text-foreground';
  if (hours <= 8) return 'bg-info text-white';
  return 'bg-danger text-white';
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isTaskCreateOpen, setIsTaskCreateOpen] = useState(false);
  const [showAllCapacity, setShowAllCapacity] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data as DashboardSummary,
  });

  const { data: teamActivity } = useQuery({
    queryKey: ['team-activity'],
    queryFn: async () => (await api.get('/teams/activity')).data as TeammateActivity[],
  });

  const { data: workloadData, isLoading: isLoadingWorkload } = useQuery({
    queryKey: ['team-workload'],
    queryFn: async () => (await api.get('/dashboard/team-workload?days=14')).data as TeamWorkloadResponse,
  });

  const { data: calendarData } = useQuery({
    queryKey: ['calendar-events', 'global'],
    queryFn: async () => (await api.get('/calendar/')).data,
    enabled: !!user?.is_superuser,
  });

  const { data: riskData } = useQuery({
    queryKey: ['risk-data'],
    queryFn: async () => (await api.get('/dashboard/risk-data')).data,
  });

  const workloadDates = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 14 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  }, []);

  // One feed: teammates' completions carry a person and project; the summary's own list fills the rest.
  const feed = useMemo<FeedItem[]>(() => {
    const byId = new Map<string, FeedItem>();
    for (const a of teamActivity || []) byId.set(a.id, a);
    for (const a of data?.recent_activity || []) if (!byId.has(a.id)) byId.set(a.id, a);
    return [...byId.values()]
      .filter(a => a.completed_at)
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
      .slice(0, 6);
  }, [teamActivity, data?.recent_activity]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-fg-faint" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-danger">
        <AlertCircle className="h-8 w-8" />
        <p>Couldn't load the dashboard. Reload the page to try again.</p>
      </div>
    );
  }

  const total = data.total_tasks || 0;
  const open = total - data.tasks_done;
  const completionRate = total ? (data.tasks_done / total) * 100 : 0;
  const firstName = (user?.full_name || '').split(' ')[0];

  const statuses = [
    { label: 'Backlog', count: data.tasks_backlog, bar: STATUS_COLORS['Backlog'].bar },
    { label: 'To do', count: data.tasks_todo, bar: 'bg-fg-ghost' },
    { label: 'In progress', count: data.tasks_in_progress, bar: STATUS_COLORS['In Progress'].bar },
    { label: 'On hold', count: data.tasks_on_hold, bar: STATUS_COLORS['On Hold'].bar },
    { label: 'Review', count: data.tasks_review, bar: STATUS_COLORS['Review'].bar },
    { label: 'Done', count: data.tasks_done, bar: STATUS_COLORS['Done'].bar },
  ];

  const capacityUsers = workloadData?.users || [];
  const visibleCapacity = showAllCapacity ? capacityUsers : capacityUsers.slice(0, CAPACITY_ROWS);

  const capacityPanel = (
    <Panel
      title="Team capacity"
      description="Planned hours per person, next 14 days"
      className="lg:col-span-12"
      actions={
        <div className="hidden items-center gap-3 text-[11px] text-fg-faint sm:flex">
          {[['Light', 'bg-info-soft'], ['Busy', 'bg-info/40'], ['Full', 'bg-info'], ['Over', 'bg-danger']].map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', c)} />{l}</span>
          ))}
        </div>
      }
    >
      {isLoadingWorkload ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-fg-faint" /></div>
      ) : capacityUsers.length === 0 ? (
        <EmptyState size="sm" title="No planned work" text="Tasks with dates and assignees show up here." />
      ) : (
        <div className="table-container">
          <table className="w-full min-w-[720px] border-separate border-spacing-[3px] text-left">
            <thead>
              <tr>
                <th className="w-36 pb-1 text-xs font-medium text-muted-foreground"><span className="sr-only">Person</span></th>
                {workloadDates.map(date => (
                  <th key={date} className="pb-1 text-center text-[11px] font-normal leading-tight text-fg-faint">
                    {format(parseISO(date), 'EEEEE')}<br /><span className="tabular-nums text-fg-soft">{format(parseISO(date), 'd')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCapacity.map(u => (
                <tr key={u.user_id}>
                  <td className="pr-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={{ full_name: u.user_name }} className="h-6 w-6" />
                      <span className="truncate text-xs font-medium text-fg-body">{u.user_name}</span>
                      {u.is_overallocated && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Over capacity" />}
                    </div>
                  </td>
                  {workloadDates.map(date => {
                    const day = u.workload.find(d => d.date === date);
                    const hours = day?.hours || 0;
                    return (
                      <td key={date} className="p-0">
                        <div
                          className={cn('flex h-8 items-center justify-center rounded text-[11px] font-medium tabular-nums', capacityClass(hours))}
                          title={`${u.user_name}, ${format(parseISO(date), 'EEE d MMM')}: ${hours}h${day?.task_count ? `, ${day.task_count} task${day.task_count === 1 ? '' : 's'}` : ''}`}
                        >
                          {hours > 0 ? hours : '·'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {capacityUsers.length > CAPACITY_ROWS && (
            <Button variant="ghost" size="sm" className="mt-2 gap-1 text-muted-foreground" onClick={() => setShowAllCapacity(v => !v)}>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAllCapacity && 'rotate-180')} />
              {showAllCapacity ? 'Show fewer' : `Show all (${capacityUsers.length})`}
            </Button>
          )}
        </div>
      )}
    </Panel>
  );

  return (
    <PageBody className="max-w-[1920px]">
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description={`${format(new Date(), 'EEEE d MMMM')} · ${data.upcoming_deadlines.length} task${data.upcoming_deadlines.length === 1 ? '' : 's'} due this week`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsTaskCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Task
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/projects?create=true')}>
              <Plus className="h-3.5 w-3.5" /> Project
            </Button>
          </>
        }
      />

      <StatStrip>
        <StatTile label="Active projects" value={data.total_projects} sub="Across your organisation" to="/projects" />
        <StatTile
          label="Open tasks"
          value={open}
          sub={`${data.tasks_in_progress} in progress · ${data.tasks_review} in review`}
          to="/tasks"
        />
        <StatTile
          label="On hold"
          value={data.tasks_on_hold}
          tone={data.tasks_on_hold > 0 ? 'warning' : 'default'}
          sub={data.tasks_on_hold > 0 ? 'Waiting on something' : 'Nothing blocked'}
        />
        <StatTile label="Completion" value={`${formatPercent(completionRate)}%`} progress={completionRate} sub={`${data.tasks_done} of ${total} done`} />
      </StatStrip>

      <Panel title="Status distribution" description={`${total} task${total === 1 ? '' : 's'}`}>
        {total === 0 ? (
          <div className="h-2.5 rounded-full bg-hairline" aria-label="No tasks yet" />
        ) : (
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={statuses.map(s => `${s.label} ${s.count}`).join(', ')}>
            {statuses.filter(s => s.count > 0).map(s => (
              <span key={s.label} className={cn('h-full', s.bar)} style={{ flexGrow: s.count }} title={`${s.label}: ${s.count}`} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-fg-soft">
          {statuses.map(s => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', s.bar)} />
              {s.label}
              <b className="font-semibold tabular-nums text-foreground">{s.count}</b>
              <span className="tabular-nums text-fg-faint">{formatPercent((s.count / (total || 1)) * 100)}%</span>
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel
          title="Due this week"
          description="Deadlines in the next 7 days"
          className="lg:col-span-7"
          actions={<Link to="/schedule" className="text-xs font-medium text-muted-foreground hover:text-foreground">Schedule →</Link>}
          bodyClassName="px-0 pb-2"
        >
          {data.upcoming_deadlines.length === 0 ? (
            <div className="px-5 pb-3">
              <EmptyState
                size="sm"
                icon={<CalendarCheck />}
                title="Nothing due this week"
                action={<Link to="/schedule" className="text-xs font-medium text-info hover:underline">Plan the week</Link>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.upcoming_deadlines.map(task => (
                <li key={task.id}>
                  <Link to={`/projects/${task.project_id}`} className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-subtle">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                    <span className={cn(
                      'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium tabular-nums',
                      task.due_date && isToday(parseISO(task.due_date)) ? 'bg-warning-soft text-warning' : 'bg-subtle text-fg-soft'
                    )}>
                      {task.due_date ? dueLabel(task.due_date) : 'No date'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-ghost transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Activity"
          description="Recently completed"
          className="lg:col-span-5"
          actions={<Link to="/updates" className="text-xs font-medium text-muted-foreground hover:text-foreground">Recap →</Link>}
        >
          {feed.length === 0 ? (
            <EmptyState size="sm" icon={<CheckCircle2 />} title="No completed tasks yet" text="Finished work from you and your teams appears here." />
          ) : (
            <ul className="space-y-3.5">
              {feed.map(item => (
                <li key={item.id} className="flex items-start gap-3">
                  {item.user ? (
                    <UserAvatar user={item.user} className="h-7 w-7" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      {item.user && <span className="font-medium">{item.user.full_name || item.user.email} </span>}
                      <span className="text-fg-soft">{item.user ? 'completed ' : 'Completed '}</span>
                      <Link to={`/projects/${item.project_id}`} className="font-medium hover:underline">{item.title}</Link>
                    </p>
                    <p className="mt-0.5 text-xs text-fg-faint">
                      {item.project_name && <>{item.project_name} · </>}
                      {format(parseISO(item.completed_at), 'd MMM, HH:mm')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {capacityPanel}
      </div>

      <div className="space-y-3">
        <Eyebrow>Insights</Eyebrow>
        <div className="grid gap-6 lg:grid-cols-12">
          <Panel title="Risk exposure" description="Probability × impact of open items" className="lg:col-span-5">
            <RiskHeatmap items={riskData || []} />
          </Panel>
          <Panel
            title="Completions"
            description="Tasks completed per day, last 12 months"
            className="lg:col-span-7"
          >
            <ProjectHeatmap stats={data.global_activity || []} title={null} />
          </Panel>
          {user?.is_superuser && (
            <div className="min-w-0 lg:col-span-12">
              <ResourceTimeline
                tasks={(calendarData?.items || []).filter((i: { item_type?: string }) => i.item_type !== 'project').map((i: { project_name?: string }) => ({
                  ...i,
                  project: { name: i.project_name },
                }))}
                title="Team workload"
              />
            </div>
          )}
        </div>
      </div>

      <TaskCreateDialog open={isTaskCreateOpen} onOpenChange={setIsTaskCreateOpen} />
    </PageBody>
  );
}
