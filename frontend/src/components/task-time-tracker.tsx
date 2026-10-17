import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Square, Trash2, Timer } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  describeVariance,
  elapsedSeconds,
  estimateStatus,
  formatClock,
  formatDuration,
  manualEntryRange,
  parseDurationInput,
  parseServerDate,
  type TaskTimeSummary,
  type TimeEntry,
} from '@/lib/time-tracking';
import { useAuth } from '@/components/auth-provider';

interface TaskTimeResponse {
  summary: TaskTimeSummary;
  entries: TimeEntry[];
}

const errorMessage = (e: any, fallback: string) => e?.response?.data?.detail || fallback;

/** Timer control, manual entry, estimate-vs-actual and the entry list for one task. */
export default function TaskTimeTracker({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [manual, setManual] = useState('');
  const [manualNote, setManualNote] = useState('');

  const taskKey = ['time', 'task', taskId];
  const runningKey = ['time', 'running'];

  const { data, isLoading } = useQuery({
    queryKey: taskKey,
    queryFn: async () => (await api.get(`/time/tasks/${taskId}`)).data as TaskTimeResponse,
  });
  const { data: running } = useQuery({
    queryKey: runningKey,
    queryFn: async () => (await api.get('/time/running')).data as TimeEntry | null,
  });

  const runningHere = running?.task_id === taskId;
  useEffect(() => {
    if (!running) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['time'] });
  };

  const start = useMutation({
    mutationFn: async () => (await api.post(`/time/tasks/${taskId}/start`, { note: note.trim() || null })).data,
    onSuccess: () => {
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not start the timer')),
  });
  const stop = useMutation({
    mutationFn: async () => (await api.post('/time/stop')).data,
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, 'Could not stop the timer')),
  });
  const addManual = useMutation({
    mutationFn: async (seconds: number) =>
      (await api.post(`/time/tasks/${taskId}/entries`, { ...manualEntryRange(new Date(), seconds), note: manualNote.trim() || null })).data,
    onSuccess: () => {
      setManual('');
      setManualNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add the entry')),
  });
  const remove = useMutation({
    mutationFn: async (entryId: string) => api.delete(`/time/entries/${entryId}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, 'Could not delete the entry')),
  });

  const manualSeconds = parseDurationInput(manual);
  const summary = data?.summary;
  // The server total includes the running entry up to its last fetch; show it ticking by adding the delta
  const liveExtra = runningHere && running ? Math.max(0, elapsedSeconds(running.started_at, now) - running.duration_seconds) : 0;
  const total = (summary?.total_seconds ?? 0) + liveExtra;
  const percent = summary && summary.estimate_hours > 0 ? Math.min(100, (total / 3600 / summary.estimate_hours) * 100) : 0;
  const tone = summary ? estimateStatus({ estimate_hours: summary.estimate_hours, percent_of_estimate: summary.estimate_hours > 0 ? (total / 3600 / summary.estimate_hours) * 100 : null }) : 'none';

  return (
    <div className="space-y-6" data-testid="task-time-tracker">
      <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 text-white rounded-lg">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <div className="text-3xl font-black tabular-nums text-slate-800 leading-none" aria-live="off">
                {runningHere && running ? formatClock(elapsedSeconds(running.started_at, now)) : '0:00:00'}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">
                {running && !runningHere ? 'A timer is running on another task' : runningHere ? 'Timer running' : 'Timer stopped'}
              </p>
            </div>
          </div>
          {running ? (
            <Button type="button" variant="destructive" className="gap-2" onClick={() => stop.mutate()} disabled={stop.isPending}>
              {stop.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} Stop
            </Button>
          ) : (
            <Button type="button" className="gap-2" onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start
            </Button>
          )}
        </div>
        {!running && (
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on? (optional)" maxLength={1000} />
        )}
      </div>

      <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md space-y-3">
        <div className="flex items-baseline justify-between">
          <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Logged</Label>
          <span className="text-lg font-black tabular-nums text-slate-800">{formatDuration(total)}</span>
        </div>
        {summary && summary.estimate_hours > 0 ? (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', tone === 'over' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Estimate {summary.estimate_hours}h (from PERT / planned duration) &middot;{' '}
              {describeVariance({ estimate_hours: summary.estimate_hours, variance_hours: total / 3600 - summary.estimate_hours })}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">No estimate: set PERT days or a duration in the Timeline tab to compare.</p>
        )}
      </div>

      <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-md space-y-3">
        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Add time manually</Label>
        <div className="flex gap-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="1h 30m, 90m, 1:30" className="w-40" aria-label="Duration" />
          <Input value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Note (optional)" maxLength={1000} />
          <Button type="button" variant="outline" disabled={manualSeconds === null || addManual.isPending} onClick={() => manualSeconds && addManual.mutate(manualSeconds)}>
            Add
          </Button>
        </div>
        {manual.trim() !== '' && manualSeconds === null && <p className="text-xs text-rose-500">Try “1h 30m”, “90m” or “1:30”.</p>}
      </div>

      <div className="space-y-2">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />}
        {data?.entries.length === 0 && <p className="text-center text-xs text-slate-400 py-6">No time logged yet.</p>}
        {data?.entries.map((entry) => {
          const mine = entry.user_id === user?.id || user?.is_superuser;
          const seconds = entry.ended_at ? entry.duration_seconds : elapsedSeconds(entry.started_at, now);
          return (
            <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2 text-sm group">
              <span className="font-bold tabular-nums w-20">{entry.ended_at ? formatDuration(seconds) : formatClock(seconds)}</span>
              <span className="text-slate-500 text-xs w-36 shrink-0">{parseServerDate(entry.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="flex-1 truncate text-slate-600">{entry.note || <span className="text-slate-300">—</span>}</span>
              <span className="text-xs text-slate-400 truncate max-w-28">{entry.user?.full_name || entry.user?.email}</span>
              {!entry.ended_at && <span className="text-[10px] font-black uppercase text-emerald-600">running</span>}
              {mine && entry.ended_at && (
                <button
                  type="button"
                  aria-label="Delete time entry"
                  onClick={() => remove.mutate(entry.id)}
                  className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
