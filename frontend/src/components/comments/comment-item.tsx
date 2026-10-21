import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Edit2, ExternalLink, FileText, Globe, Reply, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Comment } from '@/types';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/components/auth-card';
import { confirmDialog } from '@/lib/confirm';
import { parseUtc } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { CommentInput } from './comment-input';

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReply?: (parentId: string, content: string) => Promise<void>;
  projectId?: string;
  taskId?: string;
  ideaId?: string;
  depth?: number;
}

const isImage = (url: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(url.split('.').pop()?.toLowerCase() || '');

function when(value: string) {
  const at = parseUtc(value);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function CommentItem({ comment, currentUserId, onEdit, onDelete, onReply, projectId, taskId, ideaId, depth = 0 }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const isMe = currentUserId === comment.author_id;
  const context = {
    projectId: projectId || comment.project_id || undefined,
    taskId: taskId || comment.task_id || undefined,
    ideaId: ideaId || comment.idea_id || undefined,
  };

  // Esc leaves the editor without saving.
  useEffect(() => {
    if (!isEditing && !isReplying) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsEditing(false); setIsReplying(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditing, isReplying]);

  const save = async (content: string) => {
    try {
      await onEdit(comment.id, content);
      setIsEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the comment')); // the editor stays open with the text
    }
  };

  const reply = async (content: string) => {
    if (!onReply) return;
    try {
      await onReply(comment.id, content);
      setIsReplying(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not post the reply'));
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this comment?', description: 'Replies to it are deleted too.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    await onDelete(comment.id);
  };

  return (
    <div className={cn('flex w-full gap-3', depth > 0 && 'pl-11')} data-testid="comment">
      <UserAvatar user={comment.author} className="mt-0.5 h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">{isMe ? 'You' : comment.author?.full_name || comment.author?.email || 'Former member'}</span>
          <time className="text-[11px] tabular-nums text-fg-faint" dateTime={comment.created_at} title={parseUtc(comment.created_at).toLocaleString()}>
            {when(comment.created_at)}
          </time>
          {comment.updated_at && parseUtc(comment.updated_at).getTime() - parseUtc(comment.created_at).getTime() > 60_000 && (
            <span className="text-[11px] text-fg-faint">(edited)</span>
          )}
        </div>

        {isEditing ? (
          <div className="rounded-lg border bg-background p-2">
            <CommentInput initialValue={comment.content} onSubmit={save} onCancel={() => setIsEditing(false)} submitLabel="Save" {...context} />
          </div>
        ) : (
          <div className={cn('group relative rounded-lg border px-3 py-2', isMe ? 'border-primary/15 bg-primary/5' : 'border-hairline bg-background')}>
            <div className="prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content}</ReactMarkdown>
            </div>

            {!!comment.attachments?.length && (
              <div className="mt-2 space-y-2">
                {comment.attachments.map((url, idx) => (
                  <div key={idx} className="max-w-sm overflow-hidden rounded-md border border-hairline bg-subtle">
                    {isImage(url) ? (
                      <img src={url} alt="attachment" className="max-h-48 w-full cursor-pointer object-cover hover:opacity-90" onClick={() => window.open(url, '_blank')} />
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 hover:bg-muted">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs font-medium">{url.split('/').pop()}</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Hidden until hover/focus; while hidden it cannot be clicked (it used to open the editor by accident). */}
            <div
              className={cn(
                'pointer-events-none absolute -top-3 right-2 flex gap-0.5 rounded-md border border-hairline bg-background p-0.5 opacity-0 shadow-sm transition-opacity',
                'group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                '[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100',
              )}
            >
              {onReply && depth < 3 && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-fg-faint hover:text-foreground" aria-label="Reply" title="Reply" onClick={() => setIsReplying(true)}>
                  <Reply className="h-3 w-3" />
                </Button>
              )}
              {isMe && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-fg-faint hover:text-foreground" aria-label="Edit comment" title="Edit" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
              {isMe && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-fg-faint hover:text-danger" aria-label="Delete comment" title="Delete" onClick={remove}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {!!comment.links?.length && (
          <div className="flex flex-wrap gap-1">
            {comment.links.map((link, idx) => (
              <a key={idx} href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background px-2.5 py-1 text-[11px] text-fg-soft hover:border-primary/30">
                <Globe className="h-3 w-3" />
                <span className="max-w-[12rem] truncate">{link.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        )}

        {isReplying && (
          <div className="rounded-lg border bg-background p-2">
            <CommentInput onSubmit={reply} onCancel={() => setIsReplying(false)} submitLabel="Reply" placeholder="Write a reply…" {...context} />
          </div>
        )}

        {comment.replies?.map((child) => (
          <CommentItem
            key={child.id}
            comment={child}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onReply={onReply}
            projectId={projectId}
            taskId={taskId}
            ideaId={ideaId}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  );
}
