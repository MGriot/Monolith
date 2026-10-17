import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import KanbanBoard from '@/components/kanban-board';
import ProjectGantt from '@/components/project-gantt';
import ProjectHeatmap from '@/components/project-heatmap';
import ProjectTaskList from '@/components/project-task-list';
import ResourceTimeline from '@/components/resource-timeline';
import ProjectIdeas from '@/components/project-ideas';
import CommentSection from '@/components/comments/comment-section';
import FolderTree from '@/components/folder-tree';
import FilePreviewDialog from '@/components/file-preview-dialog';
import TaskForm from '@/components/task-form';
import type { TaskFormValues } from '@/components/task-form';
import AttachmentManager from '@/components/attachment-manager';
import ScopedTaxonomyManager from '@/components/scoped-taxonomy-manager';
import { toast } from 'sonner';
import {
  Trello,
  GanttChart,
  Plus,
  Folder as FolderIcon,
  List as ListIcon,
  Users as UsersIcon,
  Trash2,
  Loader2,
  AlertCircle,
  Lightbulb,
  Archive,
  Download,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';
import { ProjectMembersCard } from '@/components/project-members';
import { canAdmin, canEdit } from '@/lib/roles';
import DataExportDialog from '@/components/data-export-dialog';
import CustomFieldsManager from '@/components/custom-fields-manager';
import { UserAvatar } from '@/components/ui/user-avatar';
import type { Project, Task } from '@/types';
import { useTitle } from '@/context/title-context';
import { fromDateInput } from "@/lib/dates";
import { calculateSortIndex, flattenTasks } from '@/lib/kanban';
import TaskFilterBar from '@/components/task-filter-bar';
import { useTaskView } from '@/hooks/use-task-view';
import { collectAssignees, hasActiveFilters } from '@/lib/task-filters';
import { TOGGLE_VIEW_EVENT, onAppEvent } from '@/lib/app-events';
import BulkActionBar from '@/components/bulk-action-bar';
import { EMPTY_SELECTION, type SelectionState } from '@/lib/selection';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<string>("Todo");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { setTitle, setActions } = useTitle();

  const { data: project, isLoading: isProjectLoading, error: projectError } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get(`/projects/${id}`);
      return response.data as Project;
    },
    retry: false,
  });

  const { data: tasks, isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const response = await api.get(`/tasks/?project_id=${id}`);
      return response.data as Task[];
    },
  });

  const view = useTaskView(tasks ?? []);
  const assigneeOptions = useMemo(() => collectAssignees(tasks ?? []), [tasks]);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const bulkEnabled = canEdit(project?.my_role);
  const { data: members } = useQuery({
    queryKey: ['project-members', id],
    queryFn: async () => (await api.get<{ user_id: string; email: string; full_name?: string | null }[]>(`/projects/${id}/members`)).data,
    enabled: !!id && bulkEnabled,
  });
  const bulkAssignees = useMemo(
    () => (members ?? []).map((m) => ({ id: m.user_id, label: m.full_name || m.email })),
    [members],
  );

  // command palette "toggle view": flip between the list overview and the board
  useEffect(() => onAppEvent(TOGGLE_VIEW_EVENT, () => setActiveTab((t) => (t === 'kanban' ? 'overview' : 'kanban'))), []);

  const archiveProjectMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/projects/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
      toast.success("Project archived successfully");
    },
  });

  useEffect(() => {
    if (project) {
      setTitle(project.name);
      setActions(
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="capitalize px-2 py-0 h-4 text-[9px] font-black uppercase bg-muted text-fg-soft border-none">{project.status}</Badge>
          <div className="flex items-center gap-0.5 mr-2">
            {!project.is_archived && canAdmin(project.my_role) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-fg-faint hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                onClick={() => {
                  if (confirm("Archive this project?")) {
                    archiveProjectMutation.mutate();
                  }
                }}
                disabled={archiveProjectMutation.isPending}
                title="Archive Project"
              >
                {archiveProjectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-4 h-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 text-fg-faint hover:text-primary transition-colors",
                activeTab === 'settings' && "text-primary"
              )}
              onClick={() => setActiveTab('settings')}
              title="Project Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsExportDialogOpen(true)} 
            className="h-9 gap-2 text-[10px] font-black uppercase"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          {canEdit(project.my_role) ? (
            <Button onClick={() => handleAddTask()} size="sm" className="gap-2 shadow-lg shadow-primary/20 h-9">
              <Plus className="w-4 h-4" /> Add Task
            </Button>
          ) : (
            <Badge variant="outline" className="h-9 px-3 capitalize" title="Your role in this project">
              {project.my_role ?? 'viewer'}
            </Badge>
          )}
        </div>
      );
    }
    return () => {
      setTitle(null);
      setActions(null);
    };
  }, [project, setTitle, setActions, activeTab, archiveProjectMutation.isPending]);

  // Recursive find to handle deep WBS hierarchy
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

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['project-stats', id],
    queryFn: async () => {
      const response = await api.get(`/projects/${id}/statistics`);
      return response.data;
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const formattedValues = {
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()) : [],
        start_date: fromDateInput(values.start_date),
        due_date: fromDateInput(values.due_date),
        topic_ids: values.topic_ids || [],
        type_ids: values.type_ids || [],
        member_ids: values.member_ids || [],
      };
      return api.put(`/projects/${id}`, formattedValues);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success("Project updated successfully");
    },
  });

  const updateProjectRegionsMutation = useMutation({
    mutationFn: async (regions: any[]) => {
      return api.put(`/projects/${id}`, { gantt_regions: regions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success("Timeline regions updated");
    },
    onError: () => toast.error("Failed to update timeline regions")
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      const response = await api.post('/tasks/', { ...data, project_id: id });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setIsTaskDialogOpen(false);
      toast.success("Task created successfully");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return api.delete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task deleted successfully");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskFormValues> }) => {
      const response = await api.put(`/tasks/${taskId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task updated successfully");
    },
  });

  const [kanbanSyncKey, setKanbanSyncKey] = useState(0);

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, sortIndex }: { taskId: string; newStatus: string; sortIndex?: number }) => {
      const data: any = { status: newStatus };
      if (sortIndex !== undefined) data.sort_index = sortIndex;
      return api.put(`/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
    },
    onError: (error: any) => {
      // The board already moved the card optimistically: tell the user why it was refused and put it back.
      toast.error(error?.response?.data?.detail || 'Could not move the task');
      setKanbanSyncKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
    },
  });

  const archiveTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return api.post(`/tasks/${taskId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
      toast.success("Task archived successfully");
    },
  });

  const moveCard = (taskId: string, newStatus: string, index?: number) => {
    const sortIndex = index === undefined ? undefined : calculateSortIndex(flattenTasks(view.filtered), newStatus, index, taskId);
    moveTaskMutation.mutate({ taskId, newStatus, sortIndex });
  };

  const handleTaskMove = (taskId: string, newStatus: string, index?: number) => moveCard(taskId, newStatus, index);

  const handleSubtaskMove = (subtaskId: string, newStatus: string, index?: number) => moveCard(subtaskId, newStatus, index);

  // Reordering inside a column is persisted too (it used to snap back on the next refetch)
  const handleKanbanReorder = (taskId: string, newIndex: number, container: string) => moveCard(taskId, container, newIndex);

  const handleAddTask = (status?: string) => {
    setEditingTaskId(null);
    setParentTaskId(null);
    setInitialStatus(status || "Todo");
    setIsTaskDialogOpen(true);
  };

  const handleAddSubtask = (parentTask: Task) => {
    setEditingTaskId(null);
    setParentTaskId(parentTask.id);
    setInitialStatus("Todo");
    setIsTaskDialogOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    setEditingTaskId(task.id);
    setParentTaskId(task.parent_id || null);
    setIsTaskDialogOpen(true);
  };

  const handleSubtaskClick = (subtask: Task) => {
    setEditingTaskId(subtask.id);
    setParentTaskId(subtask.parent_id || null);
    setIsTaskDialogOpen(true);
  };

  const handleTaskSubmit = (data: TaskFormValues) => {
    const formatDate = fromDateInput;

    const formattedData = {
      ...data,
      start_date: formatDate(data.start_date),
      due_date: formatDate(data.due_date),
      deadline_at: formatDate(data.deadline_at),
      completed_at: formatDate(data.completed_at),
      parent_id: data.parent_id === undefined ? parentTaskId : data.parent_id
    };

    if (editingTaskId) {
      updateTaskMutation.mutate({ taskId: editingTaskId, data: formattedData });
    } else {
      createTaskMutation.mutate(formattedData);
    }
  };

  const handleReorderTask = () => {};
  const handleIndentTask = () => {};

  const handlePromoteSuccess = (task: Task) => {
    setActiveTab("overview");
    setEditingTaskId(task.id);
    setIsTaskDialogOpen(true);
  };

  if (isProjectLoading || isTasksLoading || isStatsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-4 text-sm">
          {isProjectLoading && "Loading project data..."}
          {isTasksLoading && "Loading tasks..."}
          {isStatsLoading && "Loading project statistics..."}
        </p>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-muted-foreground">Project not found or access denied.</p>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
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
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-subtle/50">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 bg-background">
        <div className="px-6 py-2 border-b border-hairline bg-background">
          <TabsList className="flex bg-transparent p-0 gap-6 h-10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <LayoutDashboard className="w-3.5 h-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="kanban" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <Trello className="w-3.5 h-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <UsersIcon className="w-3.5 h-3.5" /> Team Workload
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <MessageSquare className="w-3.5 h-3.5" /> Activity
            </TabsTrigger>
            <TabsTrigger value="ideas" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <Lightbulb className="w-3.5 h-3.5" /> Ideas
            </TabsTrigger>
            <TabsTrigger value="library" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <FolderIcon className="w-3.5 h-3.5" /> File Hub
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30 space-y-6">
          {/* Metadata Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="shadow-sm border-border">
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase text-fg-faint">Topics</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-1">
                        {project.topics && project.topics.length > 0 ? project.topics.map(t => (
                            <Badge key={t.id} variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-muted text-fg-soft border-none" style={{ color: t.color }}>{t.name}</Badge>
                        )) : (
                            <p className="text-xs font-bold text-fg-body">General</p>
                        )}
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase text-fg-faint">Work Types</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-1">
                        {project.types && project.types.length > 0 ? project.types.map(t => (
                            <Badge key={t.id} variant="outline" className="text-[9px] px-1 py-0 h-4 border-border text-muted-foreground">{t.name}</Badge>
                        )) : (
                            <p className="text-xs font-bold text-fg-body">Standard</p>
                        )}
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase text-fg-faint">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Start: {project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Due: {project.due_date ? new Date(project.due_date).toLocaleDateString() : '-'}</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase text-fg-faint">Financials</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-black uppercase">
                            <span className="text-fg-faint">Actual / Budget</span>
                            <span className={cn(
                                "font-bold",
                                (project.real_cost || 0) > (project.budget || 0) ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
                            )}>
                                ${project.real_cost?.toLocaleString()} / ${project.budget?.toLocaleString()}
                            </span>
                        </div>
                        <Progress value={Math.min(100, ((project.real_cost || 0) / (project.budget || 1)) * 100)} className="h-1.5" />
                    </div>
                </CardContent>
            </Card>
          </div>

          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-hairline bg-subtle/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-fg-body flex items-center gap-2">
                <GanttChart className="w-4 h-4 text-muted-foreground" />
                Project Timeline
              </h3>
            </div>
            <div className="min-h-[400px] h-auto">
              <ProjectGantt
                tasks={tasks || []}
                projectStartDate={project.start_date}
                projectDueDate={project.due_date}
                initialShowSubtasks={true}
                initialRegions={project.gantt_regions || []}
                onRegionsChange={(regions) => updateProjectRegionsMutation.mutate(regions)}
                onTaskClick={handleTaskClick}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-fg-body flex items-center gap-2 px-1">
              <ListIcon className="w-4 h-4 text-muted-foreground" />
              Tasks & Subtasks
            </h3>
            <TaskFilterBar
              scope="project-tasks"
              filters={view.filters}
              onChange={view.setFilters}
              assignees={assigneeOptions}
              resultCount={flattenTasks(view.filtered).length}
            />
            <ProjectTaskList
              tasks={view.sorted}
              groups={view.groups}
              filtered={hasActiveFilters(view.filters)}
              onTaskClick={handleTaskClick}
              onSubtaskClick={handleSubtaskClick}
              onAddSubtask={handleAddSubtask}
              onReorderTask={handleReorderTask}
              onIndentTask={handleIndentTask}
              selection={bulkEnabled ? { state: selection, onChange: setSelection } : undefined}
            />
            {bulkEnabled && (
              <BulkActionBar ids={[...selection.selected]} assignees={bulkAssignees} onClear={() => setSelection(EMPTY_SELECTION)} />
            )}
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-4xl bg-background p-4 rounded-xl border border-border shadow-sm">
              <ProjectHeatmap stats={stats || []} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="flex-1 overflow-hidden m-0 p-6 bg-subtle/30">
          <div className="mb-4">
            <TaskFilterBar
              scope="project-tasks"
              filters={view.filters}
              onChange={view.setFilters}
              assignees={assigneeOptions}
              showLayoutControls={false}
              resultCount={flattenTasks(view.filtered).length}
            />
          </div>
          <KanbanBoard
            tasks={view.filtered}
            onTaskMove={handleTaskMove}
            onSubtaskMove={handleSubtaskMove}
            onReorder={handleKanbanReorder}
            onAddTask={canEdit(project.my_role) ? handleAddTask : undefined}
            onTaskClick={handleTaskClick}
            onSubtaskClick={handleSubtaskClick}
            syncKey={kanbanSyncKey}
          />
        </TabsContent>

        <TabsContent value="team" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30">
          <div className="space-y-6">
            <div className="bg-background p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-bold text-fg-body mb-4 flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-primary" />
                Project Members
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.members?.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-subtle border border-hairline">
                    <UserAvatar user={member} className="w-10 h-10 border-background shadow-sm" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-foreground truncate">{member.full_name || 'No Name'}</span>
                      <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ResourceTimeline
              tasks={tasks || []}
              users={project.members}
              title="Team Schedule"
            />
          </div>
        </TabsContent>

        <TabsContent value="ideas" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30 space-y-6">
          <ProjectIdeas projectId={id!} onPromoteSuccess={handlePromoteSuccess} />
        </TabsContent>

        <TabsContent value="library" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30">
          <div className="max-w-4xl mx-auto space-y-6">
            <Card className="border-border shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <FolderIcon className="w-4 h-4 text-primary" />
                        Project File Hub
                    </CardTitle>
                    <CardDescription className="text-[10px]">Manage project documents, media, and technical notes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FolderTree projectId={id} onFileClick={(file) => setPreviewUrl(file.url)} />
                </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Project Activity
                </CardTitle>
                <CardDescription>Universal threaded discussion and change logs for this project.</CardDescription>
              </CardHeader>
              <CardContent>
                <CommentSection projectId={id} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="flex-1 overflow-auto m-0 p-6 bg-subtle/30">
          <div className="max-w-4xl mx-auto space-y-6">
            {id && <ProjectMembersCard projectId={id} canManage={canAdmin(project.my_role)} />}

            {!canAdmin(project.my_role) && (
              <p role="status" className="rounded-lg border bg-background p-4 text-sm text-fg-soft">
                Only project admins can change the settings, custom fields and taxonomy of this project.
              </p>
            )}
            {canAdmin(project.my_role) && (<>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Project Settings</CardTitle>
                    <CardDescription>General project information and metadata.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ProjectForm
                        projectId={id}
                        initialValues={{
                            ...project,
                            tags: project.tags || [],
                            topic_ids: project.topic_ids || project.topics?.map(t => t.id) || [],
                            type_ids: project.type_ids || project.types?.map(t => t.id) || [],
                            member_ids: project.members?.map(m => m.id) || []
                        }}
                        onSubmit={(data) => updateProjectMutation.mutate(data)}
                        onCancel={() => setActiveTab("overview")}
                        isLoading={updateProjectMutation.isPending}
                    />
                </CardContent>
            </Card>

            {id && <CustomFieldsManager projectId={id} />}

            <ScopedTaxonomyManager 
                projectId={id}
                title="Project Taxonomy"
                description="Custom categories and activity types exclusive to this project."
            />
            </>)}
          </div>
        </TabsContent>
      </Tabs>

      {/* Task Dialog */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          </DialogHeader>

          <TaskForm
            projectId={id}
            taskObject={editingTask}
            initialValues={editingTask ? {
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
            } : {
              status: initialStatus,
              parent_id: parentTaskId
            }}
            onSubmit={handleTaskSubmit}
            onCancel={() => setIsTaskDialogOpen(false)}
            isLoading={createTaskMutation.isPending || updateTaskMutation.isPending}
            allTasks={tasks || []}
            editingTaskId={editingTaskId}
          />

          {editingTask && (
            <div className="space-y-8 mt-6 border-t pt-6">
              {/* Secondary sections wrapped in a safety check */}
              <>
                 {id && editingTask.id && (
                    <AttachmentManager
                        taskId={editingTask.id}
                        projectId={id}
                        attachments={editingTask.attachments || []}
                    />
                 )}

                 {editingTask.id && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-fg-body flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Task Activity
                        </h3>
                        <CommentSection taskId={editingTask.id} />
                    </div>
                 )}

                 {id && editingTask.id && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-fg-body flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        Linked Project Ideas
                        </h3>
                        <ProjectIdeas 
                        projectId={id} 
                        taskId={editingTask.id} 
                        />
                    </div>
                 )}
              </>

              {/* Metadata & Footer Actions */}
              <div className="pt-6 border-t mt-6 flex flex-col gap-6 bg-subtle/50 -mx-6 px-6 pb-6 rounded-b-xl">
                <div className="flex flex-wrap justify-between items-end gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] text-fg-faint font-bold uppercase tracking-tight flex items-center gap-2">
                       <Clock className="w-3 h-3" /> Created: {formatDateSafe(editingTask.created_at)}
                    </div>
                    <div className="text-[10px] text-fg-faint font-bold uppercase tracking-tight flex items-center gap-2">
                       <Clock className="w-3 h-3 text-primary/40" /> Modified: {formatDateSafe(editingTask.updated_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 gap-2 h-9 px-4 font-bold text-[11px] uppercase tracking-wider"
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
                        className="text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 gap-2 h-9 px-4 font-bold text-[11px] uppercase tracking-wider"
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

      <FilePreviewDialog 
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />

      <DataExportDialog 
        open={isExportDialogOpen} 
        onOpenChange={setIsExportDialogOpen} 
        endpoint={`/projects/${id}/export`}
        title={`Export Project: ${project.name}`}
        filenamePrefix={`export_${project.name}`}
      />
    </div>
  );
}
