import { Lightbulb, MessageSquare, Paperclip } from 'lucide-react';
import AttachmentManager from '@/components/attachment-manager';
import CommentSection from '@/components/comments/comment-section';
import ProjectIdeas from '@/components/project-ideas';
import type { TaskFormTab } from '@/components/task-form';
import type { Task } from '@/types';

// Kept apart from task-dialog.tsx so that file only exports components (fast refresh).

/** "Project › WBS" line for the dialog header. */
export function taskSubtitle(task: Task | null | undefined, projectName?: string): string | undefined {
  const parts = [projectName || task?.project?.name, task?.wbs_code].filter(Boolean);
  return parts.length ? parts.join(' › ') : undefined;
}

/** Attachments, activity and linked ideas, shown as extra tabs of an existing task. */
export function taskExtraTabs(task: Task, projectId?: string): TaskFormTab[] {
  return [
    {
      value: 'files',
      label: 'Files',
      icon: <Paperclip className="h-3.5 w-3.5" />,
      content: <AttachmentManager taskId={task.id} projectId={projectId} attachments={task.attachments || []} />,
    },
    {
      value: 'activity',
      label: 'Activity',
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      content: <CommentSection taskId={task.id} />,
    },
    {
      value: 'ideas',
      label: 'Ideas',
      icon: <Lightbulb className="h-3.5 w-3.5" />,
      content: <ProjectIdeas projectId={projectId} taskId={task.id} />,
    },
  ];
}
