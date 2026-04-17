import { useState } from 'react';
import type { Comment } from '@/types';
import { CommentInput } from './comment-input';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  MoreHorizontal, 
  Trash2, 
  Edit2, 
  Reply,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  onReply: (parentId: string, content: string) => Promise<void>;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  depth?: number;
  projectId?: string;
  taskId?: string;
  ideaId?: string;
}

export function CommentItem({ 
  comment, 
  currentUserId, 
  onReply, 
  onEdit, 
  onDelete, 
  depth = 0,
  projectId,
  taskId,
  ideaId
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleReplySubmit = async (content: string) => {
    await onReply(comment.id, content);
    setIsReplying(false);
    setIsExpanded(true);
  };

  const handleEditSubmit = async (content: string) => {
    await onEdit(comment.id, content);
    setIsEditing(false);
  };

  const isAuthor = currentUserId === comment.author_id;
  const hasReplies = comment.replies && comment.replies.length > 0;
  
  // Cap indentation at depth 3 to avoid extreme narrowing
  const indentClass = depth > 0 && depth <= 3 ? 'ml-8' : depth > 3 ? 'ml-2' : '';

  return (
    <div className={cn(
        "flex gap-3",
        depth === 0 ? "mt-6" : "mt-4 relative",
        indentClass
    )}>
      {depth > 0 && depth <= 3 && (
          <div className="absolute -left-4 top-0 bottom-0 w-px bg-slate-100" />
      )}
      <UserAvatar user={comment.author} className="h-8 w-8" />
      
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{comment.author?.full_name || 'Unknown User'}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          
          {(isAuthor) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(comment.id)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isEditing ? (
          <CommentInput
            initialValue={comment.content}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save"
            projectId={projectId || comment.project_id || undefined}
            taskId={taskId || comment.task_id || undefined}
            ideaId={ideaId || comment.idea_id || undefined}
          />
        ) : (
          <div className="text-sm prose prose-sm max-w-none text-foreground prose-slate dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {comment.content}
            </ReactMarkdown>
          </div>
        )}

        {!isEditing && (
           <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 text-muted-foreground hover:text-foreground text-[11px]"
              onClick={() => setIsReplying(!isReplying)}
            >
              <Reply className="h-3.5 w-3.5 mr-1" />
              Reply
            </Button>
            
            {hasReplies && (
               <Button 
                variant="ghost" 
                size="sm" 
                className="h-auto p-0 text-muted-foreground hover:text-foreground text-[11px]"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide Replies ({comment.replies?.length})</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Show Replies ({comment.replies?.length})</>
                )}
              </Button>
            )}
          </div>
        )}

        {isReplying && (
          <div className="mt-2">
             <CommentInput
              onSubmit={handleReplySubmit}
              onCancel={() => setIsReplying(false)}
              submitLabel="Reply"
              placeholder="Write a reply..."
              projectId={projectId || comment.project_id || undefined}
              taskId={taskId || comment.task_id || undefined}
              ideaId={ideaId || comment.idea_id || undefined}
            />
          </div>
        )}

        {/* Recursive Replies */}
        {hasReplies && isExpanded && (
          <div className="pt-2">
             {comment.replies!.map(reply => (
               <CommentItem
                 key={reply.id}
                 comment={reply}
                 currentUserId={currentUserId}
                 onReply={onReply}
                 onEdit={onEdit}
                 onDelete={onDelete}
                 depth={depth + 1}
                 projectId={projectId}
                 taskId={taskId}
                 ideaId={ideaId}
               />
             ))}
          </div>
        )}
      </div>
    </div>
  );
}
