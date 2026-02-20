import { useState } from 'react';
import type { Comment } from '@/types';
import { CommentInput } from './comment-input';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  MoreHorizontal, 
  Trash2, 
  Edit2, 
  Reply 
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
}

export function CommentItem({ 
  comment, 
  currentUserId, 
  onReply, 
  onEdit, 
  onDelete, 
  depth = 0 
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleReplySubmit = async (content: string) => {
    await onReply(comment.id, content);
    setIsReplying(false);
  };

  const handleEditSubmit = async (content: string) => {
    await onEdit(comment.id, content);
    setIsEditing(false);
  };

  const isAuthor = currentUserId === comment.author_id;

  return (
    <div className={`flex gap-3 ${depth > 0 ? 'ml-8 mt-4 relative' : 'mt-6'}`}>
      {depth > 0 && (
          <div className="absolute -left-6 top-0 bottom-0 w-px bg-border" />
      )}
      <Avatar className="h-8 w-8">
        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.full_name || 'U'}`} />
        <AvatarFallback>{comment.author?.full_name?.charAt(0) || 'U'}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-2">
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
          />
        ) : (
          <div className="text-sm prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
            {comment.content}
          </div>
        )}

        {!isEditing && (
           <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsReplying(!isReplying)}
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          </div>
        )}

        {isReplying && (
          <div className="mt-2">
             <CommentInput
              onSubmit={handleReplySubmit}
              onCancel={() => setIsReplying(false)}
              submitLabel="Reply"
              placeholder="Write a reply..."
            />
          </div>
        )}

        {/* Recursive Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="pt-2">
             {comment.replies.map(reply => (
               <CommentItem
                 key={reply.id}
                 comment={reply}
                 currentUserId={currentUserId}
                 onReply={onReply}
                 onEdit={onEdit}
                 onDelete={onDelete}
                 depth={depth + 1}
               />
             ))}
          </div>
        )}
      </div>
    </div>
  );
}
