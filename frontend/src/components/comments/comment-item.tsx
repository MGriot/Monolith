import { useState } from 'react';
import type { Comment } from '@/types';
import { CommentInput } from './comment-input';
import { format } from 'date-fns';
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
  Globe,
  FileText,
  Layout,
  ExternalLink
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

  const isMe = currentUserId === comment.author_id;

  const handleEditSubmit = async (content: string) => {
    await onEdit(comment.id, content);
    setIsEditing(false);
  };

  const isImage = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  return (
    <div className={cn(
        "flex gap-3 w-full",
        isMe ? "flex-row-reverse" : "flex-row"
    )}>
      <UserAvatar user={comment.author} className="h-8 w-8 shrink-0 mt-1" />
      
      <div className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[70%] gap-1",
        isMe ? "items-end" : "items-start"
      )}>
        {/* Header: Author & Time */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-tight">
            {isMe ? 'You' : (comment.author?.full_name || 'Guest')}
          </span>
          <span className="text-[9px] text-slate-300 font-bold">
            {format(new Date(comment.created_at), 'HH:mm')}
          </span>
        </div>

        {/* Content Bubble */}
        <div className={cn(
            "relative p-3 rounded-2xl group shadow-sm border transition-all",
            isMe 
                ? "bg-primary text-primary-foreground rounded-tr-none border-primary shadow-primary/10" 
                : "bg-white text-slate-800 rounded-tl-none border-slate-100 shadow-slate-200/50"
        )}>
          {isEditing ? (
            <div className="min-w-[300px]">
                <CommentInput
                    initialValue={comment.content}
                    onSubmit={handleEditSubmit}
                    onCancel={() => setIsEditing(false)}
                    submitLabel="Save"
                    projectId={projectId || comment.project_id || undefined}
                    taskId={taskId || comment.task_id || undefined}
                    ideaId={ideaId || comment.idea_id || undefined}
                />
            </div>
          ) : (
            <div className={cn(
                "text-xs prose prose-sm max-w-none leading-relaxed",
                isMe ? "prose-invert" : "prose-slate"
            )}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {comment.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Attachments & Previews inside bubble or below */}
          {(comment.attachments && comment.attachments.length > 0) && (
              <div className="mt-3 space-y-2">
                  {comment.attachments.map((url, idx) => (
                      <div key={idx} className={cn(
                          "rounded-lg overflow-hidden border shadow-sm max-w-sm",
                          isMe ? "bg-white/10 border-white/20" : "bg-slate-50 border-slate-100"
                      )}>
                          {isImage(url) ? (
                              <div className="group/img relative">
                                <img src={url} alt="attachment" className="w-full h-auto max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
                                <div className="absolute top-1 right-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                    <Button variant="secondary" size="icon" className="h-6 w-6 rounded-md bg-white/90 backdrop-blur" onClick={() => window.open(url, '_blank')}>
                                        <ExternalLink className="h-3 w-3" />
                                    </Button>
                                </div>
                              </div>
                          ) : (
                              <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 hover:bg-black/5 transition-colors">
                                  <div className="h-8 w-8 rounded bg-slate-200 flex items-center justify-center shrink-0">
                                      <FileText className="h-4 w-4 text-slate-500" />
                                  </div>
                                  <div className="min-w-0">
                                      <p className="text-[10px] font-bold truncate tracking-tight">{url.split('/').pop()}</p>
                                      <p className="text-[8px] uppercase font-black opacity-60">File Attachment</p>
                                  </div>
                              </a>
                          )}
                      </div>
                  ))}
              </div>
          )}

          {/* Actions Popover (Hover only on non-mobile) */}
          <div className={cn(
              "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-slate-100 p-0.5 rounded-lg shadow-lg z-10",
              isMe ? "-left-12" : "-right-12"
          )}>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-primary" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-destructive" onClick={() => onDelete(comment.id)}>
                <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Links Preview */}
        {(comment.links && comment.links.length > 0) && (
            <div className="flex flex-col gap-1 w-full mt-1">
                {comment.links.map((link, idx) => (
                    <a 
                      key={idx} 
                      href={link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-100 bg-white text-slate-600 hover:border-primary/30 transition-all group/link shadow-sm"
                    >
                        <Globe className="h-3 w-3 text-slate-300 group-hover/link:text-primary" />
                        <span className="text-[10px] font-bold truncate max-w-[150px]">{link.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="h-2.5 w-2.5 text-slate-200 ml-auto" />
                    </a>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}
