import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trello, 
  List as ListIcon, 
  CheckSquare,
  AlertCircle,
  Loader2,
  Folder,
  Download,
  Trash2,
  Archive,
  MoreHorizontal,
  Pencil,
  MessageSquare,
  Lightbulb,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import KanbanBoard from '@/components/kanban-board';
import ProjectGantt from '@/components/project-gantt';
import DataExportDialog from '@/components/data-export-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TaskForm, { type TaskFormValues } from '@/components/task-form';
import AttachmentManager from '@/components/attachment-manager';
import CommentSection from '@/components/comments/comment-section';
import ProjectIdeas from '@/components/project-ideas';
import type { Task } from '@/types';
import { useTitle } from '@/context/title-context';
import { toast } from 'sonner';

export default function MyTasksPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'kanban' | 'list'>('list');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const { setTitle, setActions } = useTitle();

  useEffect(() => {
    setTitle('Tasks');
    setActions(
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setIsExportDialogOpen(true)} className="gap-2 h-9">
          <Download className="w-4 h-4" /> Export
        </Button>

        <div className="bg-slate-100 p-1 rounded-lg flex items-center h-9">
          <Button 
            variant={view === 'kanban' ? 'secondary' : 'ghost'} 
            size="sm" 
            className={view === 'kanban' ? 'bg-white shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-slate-500'}
            onClick={() => setView('kanban')}
          >
            <Trello className="w-3.5 h-3.5" /> Kanban
          </Button>
          <Button 
            variant={view === 'list' ? 'secondary' : 'ghost'} 
            size="sm" 
            className={view === 'list' ? 'bg-white shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-slate-500'}
            onClick={() => setView('list')}
          >
            <ListIcon className="w-3.5 h-3.5" /> List
          </Button>
        </div>
      </div>
    );
    return () => {
      setActions(null);
      setTitle(null);
    };
  }, [setActions, setTitle, view]);

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'assigned'],
    queryFn: async () => {
      const response = await api.get('/tasks/assigned');
      return response.data as Task[];
    },
  });

  const activeTasks = useMemo(() => {
    return (tasks || []).filter(t => !t.is_archived && (!t.project || !t.project.is_archived));
  }, [tasks]);

  const findTaskRecursive = (taskList: Task[], taskId: string): Task | null => {
    for (const task of taskList) {
      if (task.id === taskId) return task;
      if (task.subtasks && task.subtasks.length > 0) {
        const found = findTaskRecursive(task.subtasks, taskId);
        if (found) return found;
      }
    }
    return null;
  };

  const editingTask = tasks && editingTaskId ? findTaskRecursive(tasks, editingTaskId) : null;

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskFormValues> }) => {
      const response = await api.put(`/tasks/${taskId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'assigned'] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task updated successfully");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return api.delete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'assigned'] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task deleted successfully");
    },
  });

  const archiveTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return api.post(`/tasks/${taskId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'assigned'] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task archived successfully");
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, sortIndex }: { taskId: string; newStatus: string; sortIndex?: number }) => {
      const data: any = { status: newStatus };
      if (sortIndex !== undefined) data.sort_index = sortIndex;
      return api.put(`/tasks/${taskId}`, data);
    },
    onMutate: async ({ taskId, newStatus, sortIndex }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'assigned'] });
      const previousTasks = queryClient.getQueryData(['tasks', 'assigned']);

      queryClient.setQueryData(['tasks', 'assigned'], (old: Task[] | undefined) => {
        return old?.map(t => {
          if (t.id === taskId) {
            const updated = { ...t, status: newStatus };
            if (sortIndex !== undefined) updated.sort_index = sortIndex;
            return updated;
          }
          return t;
        });
      });

      return { previousTasks };
    },
    onError: (err: any, __, context) => {
      queryClient.setQueryData(['tasks', 'assigned'], context?.previousTasks);
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Move failed: ${msg}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'assigned'] });
    },
  });

  const handleTaskSubmit = (data: TaskFormValues) => {
    const formatDate = (d?: string | null) => (d && d.trim()) ? new Date(d).toISOString() : null;

    const formattedData = {
      ...data,
      start_date: formatDate(data.start_date),
      due_date: formatDate(data.due_date),
      deadline_at: formatDate(data.deadline_at),
      completed_at: formatDate(data.completed_at),
    };

    if (editingTaskId) {
      updateTaskMutation.mutate({ taskId: editingTaskId, data: formattedData });
    }
  };

  const calculateSortIndex = (container: string, index: number) => {
    const columnTasks = (tasks || [])
      .filter(t => t.status.toLowerCase() === container.toLowerCase())
      .sort((a, b) => {
        if ((a.sort_index || 0) !== (b.sort_index || 0)) {
          return (a.sort_index || 0) - (b.sort_index || 0);
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    if (columnTasks.length === 0) return 100;
    if (index <= 0) return (columnTasks[0].sort_index || 0) - 10;
    if (index >= columnTasks.length) return (columnTasks[columnTasks.length - 1].sort_index || 0) + 10;

    const prev = columnTasks[index - 1].sort_index || 0;
    const next = columnTasks[index].sort_index || 0;
    
    if (prev === next) {
        return prev + 1;
    }
    
    return Math.round((prev + next) / 2);
  };

  const handleKanbanReorder = (taskId: string, newIndex: number, container: string) => {
    const sortIndex = calculateSortIndex(container, newIndex);
    moveTaskMutation.mutate({ taskId, newStatus: container, sortIndex });
  };

  const handleTaskClick = (task: Task) => {
    setEditingTaskId(task.id);
    setIsTaskDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load assigned tasks.</p>
      </div>
    );
  }

  const formatDateSafe = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Invalid Date";
      return format(d, "PPP p");
    } catch (e) {
      return "N/A";
    }
  };

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50 pb-12">

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="min-h-[500px]">
          {view === 'kanban' ? (
            <KanbanBoard 
              tasks={activeTasks} 
              onTaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx) : undefined })}
              onSubtaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx) : undefined })}
              onReorder={handleKanbanReorder}
              onTaskClick={handleTaskClick}
              onSubtaskClick={handleTaskClick}
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Task</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Project</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Status</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Priority</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Due Date</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-slate-500 italic">
                        You have no tasks assigned to you.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeTasks.map((task) => (
                      <TableRow 
                        key={task.id} 
                        className="hover:bg-slate-50/50 cursor-pointer"
                        onClick={() => handleTaskClick(task)}
                      >
                        <TableCell className="font-semibold text-slate-900">{task.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Folder className="w-3 h-3 text-slate-400" />
                            {task.project?.name || 'Independent'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-[10px] font-bold">
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[10px] font-black">
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-slate-500">
                          {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleTaskClick(task)}>
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this task?")) {
                                    deleteTaskMutation.mutate(task.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary" />
              Schedule Overview
            </h3>
          </div>
          <div className="min-h-[400px]">
            <ProjectGantt tasks={activeTasks} initialShowSubtasks={true} />
          </div>
        </div>
      </div>

      {/* Task Dialog */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Task Details'}</DialogTitle>
          </DialogHeader>

          {editingTask && (
            <TaskForm
              projectId={editingTask.project_id || undefined}
              taskObject={editingTask}
              initialValues={{
                title: editingTask.title,
                description: editingTask.description,
                status: editingTask.status,
                priority: editingTask.priority,
                topic_ids: editingTask.topic_ids || editingTask.topics?.map(t => t.id) || [],
                type_ids: editingTask.type_ids || editingTask.types?.map(t => t.id) || [],
                is_milestone: editingTask.is_milestone,
                start_date: editingTask.start_date || '',
                due_date: editingTask.due_date || '',
                deadline_at: editingTask.deadline_at || '',
                completed_at: editingTask.completed_at || '',
                assignee_ids: editingTask.assignees?.map(u => u.id) || [],
                parent_id: editingTask.parent_id,
                color: editingTask.color,
                optimistic_days: editingTask.optimistic_days,
                normal_days: editingTask.normal_days,
                pessimistic_days: editingTask.pessimistic_days,
                duration_days: editingTask.duration_days
              }}
              onSubmit={handleTaskSubmit}
              onCancel={() => setIsTaskDialogOpen(false)}
              isLoading={updateTaskMutation.isPending}
              allTasks={tasks || []}
              editingTaskId={editingTaskId}
            />
          )}

          {editingTask && (
            <div className="space-y-8 mt-6 border-t pt-6">
               <>
                  {editingTask.id && (
                    <AttachmentManager
                        taskId={editingTask.id}
                        projectId={editingTask.project_id || undefined}
                        attachments={editingTask.attachments || []}
                    />
                  )}

                  {editingTask.id && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-primary" />
                            Task Activity
                        </h3>
                        <CommentSection taskId={editingTask.id} />
                    </div>
                  )}

                  {editingTask.id && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-500" />
                            Linked Project Ideas
                        </h3>
                        <ProjectIdeas 
                            projectId={editingTask.project_id || undefined} 
                            taskId={editingTask.id} 
                        />
                    </div>
                  )}
               </>

              {/* Metadata & Footer Actions */}
              <div className="pt-6 border-t mt-6 flex flex-col gap-6 bg-slate-50/50 -mx-6 px-6 pb-6 rounded-b-xl">
                <div className="flex flex-wrap justify-between items-end gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-2">
                       <Clock className="w-3 h-3" /> Created: {formatDateSafe(editingTask.created_at)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-2">
                       <Clock className="w-3 h-3 text-primary/40" /> Modified: {formatDateSafe(editingTask.updated_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-amber-600 hover:bg-amber-50 gap-2 h-9 px-4 font-bold text-[11px] uppercase tracking-wider"
                        onClick={() => {
                        if (window.confirm(`Archive the task "${editingTask.title}"?`)) {
                            archiveTaskMutation.mutate(editingTask.id);
                        }
                        }}
                        disabled={archiveTaskMutation.isPending}
                    >
                        {archiveTaskMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                        Archive
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 gap-2 h-9 px-4 font-bold text-[11px] uppercase tracking-wider"
                        onClick={() => {
                        if (window.confirm(`Are you sure you want to delete the task "${editingTask.title}"?`)) {
                            deleteTaskMutation.mutate(editingTask.id);
                        }
                        }}
                        disabled={deleteTaskMutation.isPending}
                    >
                        {deleteTaskMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DataExportDialog 
        open={isExportDialogOpen} 
        onOpenChange={setIsExportDialogOpen} 
        endpoint="/tasks/export"
        title="Export Tasks"
        filenamePrefix="tasks"
      />
    </div>
  );
}
