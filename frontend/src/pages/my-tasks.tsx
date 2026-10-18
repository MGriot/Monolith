import { Fragment, useState, useMemo, useEffect } from 'react';
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
  MoreHorizontal,
  Pencil
} from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TaskForm, { type TaskFormValues } from '@/components/task-form';
import TaskDialog, { TaskFooterMeta } from '@/components/task-dialog';
import { taskExtraTabs, taskSubtitle } from '@/components/task-dialog-helpers';
import type { Task } from '@/types';
import { useTitle } from '@/context/title-context';
import { toast } from 'sonner';
import { fromDateInput } from "@/lib/dates";
import { calculateSortIndex as sharedSortIndex, flattenTasks } from '@/lib/kanban';
import TaskFilterBar from '@/components/task-filter-bar';
import { useTaskView } from '@/hooks/use-task-view';
import { collectAssignees, hasActiveFilters } from '@/lib/task-filters';
import { TOGGLE_VIEW_EVENT, onAppEvent } from '@/lib/app-events';
import BulkActionBar from '@/components/bulk-action-bar';
import { clickSelection, EMPTY_SELECTION, headerState, pruneSelection, toggleAll, type SelectionState } from '@/lib/selection';
import { useAuth } from '@/components/auth-provider';
import { confirmDialog } from '@/lib/confirm';

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

        <div className="bg-muted p-1 rounded-lg flex items-center h-9">
          <Button 
            variant={view === 'kanban' ? 'secondary' : 'ghost'} 
            size="sm" 
            className={view === 'kanban' ? 'bg-background shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-muted-foreground'}
            onClick={() => setView('kanban')}
          >
            <Trello className="w-3.5 h-3.5" /> Kanban
          </Button>
          <Button 
            variant={view === 'list' ? 'secondary' : 'ghost'} 
            size="sm" 
            className={view === 'list' ? 'bg-background shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-muted-foreground'}
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

  const taskView = useTaskView(activeTasks);
  const assigneeOptions = useMemo(() => collectAssignees(activeTasks), [activeTasks]);
  const filtering = hasActiveFilters(taskView.filters);

  // bulk selection (list view): rows in display order, groups included
  const { user: me } = useAuth();
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const rowOrder = useMemo(() => taskView.groups.flatMap((g) => g.tasks.map((t) => t.id)), [taskView.groups]);
  useEffect(() => {
    setSelection((s) => pruneSelection(s, rowOrder));
  }, [rowOrder]);
  const bulkAssignees = useMemo(() => {
    const opts = collectAssignees(activeTasks);
    if (me && !opts.some((o) => o.id === me.id)) opts.unshift({ id: me.id, label: me.full_name || me.email });
    return opts;
  }, [activeTasks, me]);
  const selectionHeader = headerState(selection, rowOrder);

  // command palette "toggle view"
  useEffect(() => onAppEvent(TOGGLE_VIEW_EVENT, () => setView((v) => (v === 'kanban' ? 'list' : 'kanban'))), []);

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
    const formatDate = fromDateInput;

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

  const calculateSortIndex = (container: string, index: number, movingId?: string) =>
    sharedSortIndex(flattenTasks(taskView.filtered), container, index, movingId);

  const handleKanbanReorder = (taskId: string, newIndex: number, container: string) => {
    const sortIndex = calculateSortIndex(container, newIndex, taskId);
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

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-subtle/50 pb-12">

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <TaskFilterBar
          scope="my-tasks"
          filters={taskView.filters}
          onChange={taskView.setFilters}
          assignees={assigneeOptions}
          showLayoutControls={view === 'list'}
          resultCount={flattenTasks(taskView.filtered).length}
        />
        <div className="min-h-[500px]">
          {view === 'kanban' ? (
            <KanbanBoard 
              tasks={taskView.filtered} 
              onTaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx, id) : undefined })}
              onSubtaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx, id) : undefined })}
              onReorder={handleKanbanReorder}
              onTaskClick={handleTaskClick}
              onSubtaskClick={handleTaskClick}
            />
          ) : (
            <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-subtle">
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        aria-label="Select all tasks"
                        checked={selectionHeader === 'all'}
                        ref={(el) => { if (el) el.indeterminate = selectionHeader === 'some'; }}
                        onChange={() => setSelection((s) => toggleAll(s, rowOrder))}
                      />
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Task</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Project</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Priority</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground text-right">Due Date</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskView.sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                        {filtering ? 'No tasks match the current filters.' : 'You have no tasks assigned to you.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    taskView.groups.map((group) => (
                      <Fragment key={group.key}>
                      {group.label && (
                        <TableRow className="bg-subtle hover:bg-subtle">
                          <TableCell colSpan={7} className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span role="heading" aria-level={4}>{group.label} <span className="font-semibold text-fg-faint">({group.tasks.length})</span></span>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.tasks.map((task) => (
                      <TableRow 
                        key={`${group.key}-${task.id}`}
                        className="hover:bg-subtle/50 cursor-pointer"
                        data-state={selection.selected.has(task.id) ? 'selected' : undefined}
                        onClick={() => handleTaskClick(task)}
                      >
                        <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                            aria-label={`Select ${task.title}`}
                            checked={selection.selected.has(task.id)}
                            onChange={() => undefined}
                            onClick={(e) => setSelection((s) => clickSelection(s, rowOrder, task.id, e.shiftKey))}
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">{task.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-fg-soft">
                            <Folder className="w-3 h-3 text-fg-faint" />
                            {task.project?.name || 'Independent'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-[11px] font-bold">
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[11px] font-semibold">
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-muted-foreground">
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
                                  void confirmDialog({ title: "Delete this task?", confirmLabel: 'Delete', tone: 'danger' }).then((ok) => { if (ok) {
                                    deleteTaskMutation.mutate(task.id);
                                  } });
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      ))}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {view === 'list' && (
            <BulkActionBar ids={[...selection.selected]} assignees={bulkAssignees} onClear={() => setSelection(EMPTY_SELECTION)} />
          )}
        </div>

        <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-subtle/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-fg-body flex items-center gap-2">
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
      <TaskDialog
        open={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        title="Edit task"
        subtitle={taskSubtitle(editingTask)}
      >
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
              extraTabs={taskExtraTabs(editingTask, editingTask.project_id || undefined)}
              footerStart={
                <TaskFooterMeta
                  task={editingTask}
                  onArchive={() => archiveTaskMutation.mutate(editingTask.id)}
                  onDelete={() => deleteTaskMutation.mutate(editingTask.id)}
                  archiving={archiveTaskMutation.isPending}
                  deleting={deleteTaskMutation.isPending}
                />
              }
            />
        )}
      </TaskDialog>

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
