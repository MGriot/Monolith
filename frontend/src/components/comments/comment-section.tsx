import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Comment } from '@/types';
import { useAuth } from '@/components/auth-provider';
import { errorMessage } from '@/components/auth-card';
import { buildTimeline, type ActivityEvent, type ActivityFilter } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { CommentInput } from './comment-input';
import { CommentItem } from './comment-item';
import { ActivityChange } from './activity-change';

interface CommentSectionProps {
  projectId?: string;
  taskId?: string;
  ideaId?: string;
  /** Project view: clicking a task name in a change line opens it. */
  onOpenTask?: (taskId: string) => void;
}

const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'changes', label: 'Changes' },
];

/**
 * Discussion of a project, task or idea. For projects and tasks the change log (who edited, moved, assigned or
 * completed what) is woven in, so the conversation and the history read as one timeline.
 */
export default function CommentSection({ projectId, taskId, ideaId, onOpenTask }: CommentSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const withChanges = !ideaId && !!(projectId || taskId);

  const commentsKey = ['comments', { projectId, taskId, ideaId }];
  const activityKey = ['activity', { projectId, taskId }];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: commentsKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      if (ideaId) params.append('idea_id', ideaId);
      return (await api.get<Comment[]>(`/comments/?${params.toString()}`)).data;
    },
    refetchInterval: 30_000, // others' messages appear without a reload (paused while the tab is hidden)
  });

  const { data: events = [] } = useQuery({
    queryKey: activityKey,
    enabled: withChanges,
    queryFn: async () => {
      const url = taskId ? `/tasks/${taskId}/activity` : `/projects/${projectId}/activity`;
      return (await api.get<ActivityEvent[]>(url, { params: { limit: 200 } })).data;
    },
    refetchInterval: 30_000,
  });

  const items = useMemo(() => buildTimeline(comments, withChanges ? events : [], filter), [comments, events, filter, withChanges]);

  // Newest at the bottom: follow it whenever lines arrive (after layout, so images and the editor are measured).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    const late = setTimeout(() => { el.scrollTop = el.scrollHeight; }, 250);
    return () => { cancelAnimationFrame(frame); clearTimeout(late); };
  }, [items.length]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: commentsKey });

  const createMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      await api.post('/comments/', { content, project_id: projectId, task_id: taskId, idea_id: ideaId, parent_id: parentId });
    },
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err, 'Could not post the comment')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      await api.put(`/comments/${id}`, { content });
    },
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/comments/${id}`);
    },
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err, 'Could not delete the comment')),
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const itemProps = {
    currentUserId: user?.id,
    onEdit: async (commentId: string, content: string) => { await updateMutation.mutateAsync({ id: commentId, content }); },
    onDelete: async (commentId: string) => { await deleteMutation.mutateAsync(commentId); },
    onReply: async (parentId: string, content: string) => { await createMutation.mutateAsync({ content, parentId }); },
    projectId,
    taskId,
    ideaId,
  };

  return (
    <div className="flex h-[680px] max-h-[75vh] flex-col overflow-hidden rounded-xl border bg-subtle/30">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          {withChanges ? <History className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-primary" />}
          {withChanges ? 'Discussion and changes' : 'Discussion'}
        </div>
        {withChanges && (
          <div role="radiogroup" aria-label="Show" className="inline-flex rounded-md border bg-subtle p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
                  filter === f.value && 'bg-background text-foreground shadow-sm',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="activity-timeline">
        {items.map((item) =>
          item.type === 'day' ? (
            <div key={item.key} className="flex items-center gap-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
              <span className="h-px flex-1 bg-hairline" />
              {item.label}
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ) : item.type === 'event' ? (
            <ActivityChange key={item.key} event={item.event} currentUserId={user?.id} showTask={!taskId} onOpenTask={onOpenTask} />
          ) : (
            <CommentItem key={item.key} comment={item.comment} {...itemProps} />
          ),
        )}
        {items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 text-fg-ghost" />
            <p className="text-sm font-medium">{filter === 'changes' ? 'No changes recorded yet' : 'No messages yet'}</p>
            <p className="text-xs">{filter === 'changes' ? 'Edits to tasks will appear here.' : 'Start the conversation below.'}</p>
          </div>
        )}
      </div>

      <div className="border-t bg-background p-3">
        <CommentInput
          onSubmit={async (content) => { await createMutation.mutateAsync({ content }); }}
          isSubmitting={createMutation.isPending}
          projectId={projectId}
          taskId={taskId}
          ideaId={ideaId}
          placeholder="Write a message…"
          submitLabel="Send"
        />
      </div>
    </div>
  );
}
