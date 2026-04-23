import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Comment } from '@/types';
import { CommentInput } from './comment-input';
import { CommentItem } from './comment-item';
import { Loader2, MessageSquare, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useEffect, useRef } from 'react';

interface CommentSectionProps {
  projectId?: string;
  taskId?: string;
  ideaId?: string;
}

export default function CommentSection({ projectId, taskId, ideaId }: CommentSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const queryKey = ['comments', { projectId, taskId, ideaId }];

  const { data: comments, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      if (ideaId) params.append('idea_id', ideaId);
      
      const response = await api.get(`/comments/?${params.toString()}`);
      // Reverse comments for chat view (oldest at top, newest at bottom)
      return (response.data as Comment[]).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      await api.post('/comments/', {
        content,
        project_id: projectId,
        task_id: taskId,
        idea_id: ideaId
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string, content: string }) => {
      await api.put(`/comments/${id}`, { content });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/comments/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-[600px] border rounded-2xl bg-slate-50/30 overflow-hidden shadow-inner">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Project Communication</h3>
          </div>
          <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Live Chat</span>
          </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-transparent"
      >
        {comments?.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={user?.id}
            onReply={async (parentId, content) => {}} // Replies disabled for flat chat for now
            onEdit={async (commentId, content) => await updateMutation.mutateAsync({ id: commentId, content })}
            onDelete={async (commentId) => await deleteMutation.mutateAsync(commentId)}
            projectId={projectId}
            taskId={taskId}
            ideaId={ideaId}
          />
        ))}
        {comments?.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-30 grayscale">
                <MessageSquare className="w-12 h-12 text-slate-300" />
                <div>
                    <p className="text-sm font-black uppercase tracking-tighter">No Messages</p>
                    <p className="text-[10px] font-bold">Start the communication flow below.</p>
                </div>
            </div>
        )}
      </div>
      
      <div className="p-4 bg-white border-t">
        <CommentInput 
          onSubmit={async (content) => await createMutation.mutateAsync(content)}
          isSubmitting={createMutation.isPending}
          projectId={projectId}
          taskId={taskId}
          ideaId={ideaId}
          placeholder="Type a message..."
          submitLabel="Send"
        />
      </div>
    </div>
  );
}
