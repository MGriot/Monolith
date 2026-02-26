import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Comment } from '@/types';
import { CommentInput } from './comment-input';
import { CommentItem } from './comment-item';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

interface CommentSectionProps {
  projectId?: string;
  taskId?: string;
  ideaId?: string;
}

export default function CommentSection({ projectId, taskId, ideaId }: CommentSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryKey = ['comments', { projectId, taskId, ideaId }];

  const { data: comments, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      if (ideaId) params.append('idea_id', ideaId);
      
      const response = await api.get(`/comments/?${params.toString()}`);
      return response.data as Comment[];
    }
  });

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

  const replyMutation = useMutation({
    mutationFn: async ({ parentId, content }: { parentId: string, content: string }) => {
      await api.post('/comments/', {
        content,
        parent_id: parentId,
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
    <div className="space-y-8">
      <div className="space-y-6">
        {comments?.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={user?.id}
            onReply={async (parentId, content) => await replyMutation.mutateAsync({ parentId, content })}
            onEdit={async (commentId, content) => await updateMutation.mutateAsync({ id: commentId, content })}
            onDelete={async (commentId) => await deleteMutation.mutateAsync(commentId)}
          />
        ))}
        {comments?.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">No comments yet. Be the first to start the discussion.</p>
        )}
      </div>
      
      <div className="border-t pt-6">
        <h4 className="text-sm font-medium mb-4">Add a comment</h4>
        <CommentInput 
          onSubmit={async (content) => await createMutation.mutateAsync(content)}
          isSubmitting={createMutation.isPending}
          projectId={projectId}
          taskId={taskId}
          ideaId={ideaId}
        />
      </div>
    </div>
  );
}
