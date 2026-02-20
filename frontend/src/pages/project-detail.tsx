import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import TaskForm from '@/components/task-form';
import type { TaskFormValues } from '@/components/task-form';
import DependencyManager from '@/components/dependency-manager';
import AttachmentManager from '@/components/attachment-manager';
import ScopedTaxonomyManager from '@/components/scoped-taxonomy-manager';
import { toast } from 'sonner';
import {
  Trello,
  GanttChart,
  Calendar as CalendarIcon,
  Plus,
  List as ListIcon,
  Users as UsersIcon,
  Settings as SettingsIcon,
  User as UserIcon,
  FolderKanban,
  LayoutDashboard,
  Trash2,
  Loader2,
  AlertCircle,
  Lightbulb,
  Archive,
  Download,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatPercent } from '@/lib/utils';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';
import DataExportDialog from '@/components/data-export-dialog';
import type { Project, Task } from '@/types';

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
        start_date: values.start_date ? new Date(values.start_date).toISOString() : null,
        due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
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

  const handleTaskMove = (taskId: string, newStatus: string) => {
    // Basic move without sophisticated sort index calculation for now
    moveTaskMutation.mutate({ taskId, newStatus });
  };

  const handleSubtaskMove = (subtaskId: string, newStatus: string) => {
    moveTaskMutation.mutate({ taskId: subtaskId, newStatus });
  };

  const handleKanbanReorder = (taskId: string, _newIndex: number, container: string) => {
    moveTaskMutation.mutate({ taskId, newStatus: container });
  };

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
    const formatDate = (d?: string | null) => (d && d.trim()) ? new Date(d).toISOString() : null;

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

  const handleReorderTask = () => {
    // Reorder logic omitted for brevity, should use sort_index
  };

  const handleIndentTask = () => {
    // Indent logic omitted for brevity
  };

  const handlePromoteSuccess = (task: Task) => {
    setActiveTab("overview");
    setEditingTaskId(task.id);
    setIsTaskDialogOpen(true);
  };

  if (isProjectLoading || isTasksLoading || isStatsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-slate-500">Project not found or access denied.</p>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
      {/* Project Header */}
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-4 flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
              <Badge variant="secondary" className="capitalize px-2 py-0 h-5 text-[10px]">{project.status}</Badge>
              <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-primary transition-colors"
                    onClick={() => setActiveTab("settings")}
                    title="Settings"
                >
                    <SettingsIcon className="w-4 h-4" />
                </Button>
                {!project.is_archived && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-amber-600 transition-colors"
                        onClick={() => {
                            if (confirm("Archive this project?")) {
                                archiveProjectMutation.mutate();
                            }
                        }}
                        disabled={archiveProjectMutation.isPending}
                        title="Archive Project"
                    >
                        {archiveProjectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                    </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                  <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Topics</Label>
                  <div className="flex flex-wrap gap-1">
                    {project.topics && project.topics.length > 0 ? project.topics.map(t => (
                      <Badge key={t.id} variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-white border-slate-200" style={{ color: t.color }}>{t.name}</Badge>
                    )) : (
                      <p className="text-xs font-bold text-slate-700 truncate">General</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                  <ListIcon className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Types</Label>
                  <div className="flex flex-wrap gap-1">
                    {project.types && project.types.length > 0 ? project.types.map(t => (
                      <Badge key={t.id} variant="outline" className="text-[9px] px-1 py-0 h-4 bg-white border-slate-200">{t.name}</Badge>
                    )) : (
                      <p className="text-xs font-bold text-slate-700 truncate">Standard</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Start</Label>
                  <p className="text-xs font-bold text-slate-700 truncate">
                    {project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}
                  </p>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Due</Label>
                  <p className="text-xs font-bold text-amber-700 truncate">
                    {project.due_date ? new Date(project.due_date).toLocaleDateString() : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-row lg:flex-col items-center lg:items-end gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsExportDialogOpen(true)} 
                className="h-9 gap-2 text-[10px] font-black uppercase"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button onClick={() => handleAddTask()} className="gap-2 shadow-lg shadow-primary/20 h-9">
                <Plus className="w-4 h-4" /> Add Task
              </Button>
            </div>
            <div className="w-48 space-y-1.5">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                <span className="text-slate-400">Progress</span>
                <span className="text-primary">{formatPercent(project.progress_percent)}%</span>
              </div>
              <Progress value={project.progress_percent} className="h-1.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 bg-white">
        <div className="px-6 py-2 border-b border-slate-100 bg-white">
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
            <TabsTrigger value="settings" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <GanttChart className="w-4 h-4 text-slate-500" />
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
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 px-1">
              <ListIcon className="w-4 h-4 text-slate-500" />
              Tasks & Subtasks
            </h3>
            <ProjectTaskList
              tasks={tasks || []}
              onTaskClick={handleTaskClick}
              onSubtaskClick={handleSubtaskClick}
              onAddSubtask={handleAddSubtask}
              onReorderTask={handleReorderTask}
              onIndentTask={handleIndentTask}
            />
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-4xl bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <ProjectHeatmap stats={stats || []} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="flex-1 overflow-hidden m-0 p-6 bg-slate-50/30">
          <KanbanBoard
            tasks={tasks || []}
            onTaskMove={handleTaskMove}
            onSubtaskMove={handleSubtaskMove}
            onReorder={handleKanbanReorder}
            onAddTask={handleAddTask}
            onTaskClick={handleTaskClick}
            onSubtaskClick={handleSubtaskClick}
          />
        </TabsContent>

        <TabsContent value="team" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-primary" />
                Project Members
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.members?.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm">
                      <UserIcon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-slate-900 truncate">{member.full_name || 'No Name'}</span>
                      <span className="text-xs text-slate-500 truncate">{member.email}</span>
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

        <TabsContent value="ideas" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30">
          <ProjectIdeas projectId={id!} onPromoteSuccess={handlePromoteSuccess} />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30">
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

        <TabsContent value="settings" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30">
          <div className="max-w-4xl mx-auto space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Project Settings</CardTitle>
                    <CardDescription>General project information and metadata.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ProjectForm
                        projectId={id}
                        initialValues={{
                            name: project.name,
                            description: project.description,
                            topic_id: project.topic_id || undefined,
                            type_id: project.type_id || undefined,
                            topic_ids: project.topic_ids || project.topics?.map(t => t.id) || [],
                            type_ids: project.type_ids || project.types?.map(t => t.id) || [],
                            status: project.status,
                            start_date: project.start_date?.split('T')[0],
                            due_date: project.due_date?.split('T')[0],
                            tags: project.tags?.join(', '),
                            member_ids: project.members?.map(m => m.id) || []
                        }}
                        onSubmit={(data) => updateProjectMutation.mutate(data)}
                        onCancel={() => setActiveTab("overview")}
                        isLoading={updateProjectMutation.isPending}
                    />
                </CardContent>
            </Card>

            <ScopedTaxonomyManager 
                projectId={id}
                title="Project Taxonomy"
                description="Custom categories and activity types exclusive to this project."
            />
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
            initialValues={editingTask ? {
              title: editingTask.title,
              description: editingTask.description,
              status: editingTask.status,
              priority: editingTask.priority,
              topic_id: editingTask.topic_id || undefined,
              type_id: editingTask.type_id || undefined,
              topic_ids: editingTask.topic_ids || editingTask.topics?.map(t => t.id) || [],
              type_ids: editingTask.type_ids || editingTask.types?.map(t => t.id) || [],
              is_milestone: editingTask.is_milestone,
              start_date: editingTask.start_date ? editingTask.start_date.split('T')[0] : '',
              due_date: editingTask.due_date ? editingTask.due_date.split('T')[0] : '',
              deadline_at: editingTask.deadline_at ? editingTask.deadline_at.split('T')[0] : '',
              completed_at: editingTask.completed_at ? editingTask.completed_at.split('T')[0] : '',
              assignee_ids: editingTask.assignees?.map(u => u.id) || [],
              parent_id: editingTask.parent_id,
              color: editingTask.color,
              optimistic_days: editingTask.optimistic_days,
              normal_days: editingTask.normal_days,
              pessimistic_days: editingTask.pessimistic_days
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
            <div className="pt-6 border-t mt-6 flex justify-between items-center">
              <div className="text-xs text-slate-400">
                Created at {new Date(editingTask.created_at).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 gap-2 h-8"
                    onClick={() => {
                    if (window.confirm(`Archive the task "${editingTask.title}"?`)) {
                        archiveTaskMutation.mutate(editingTask.id);
                    }
                    }}
                    disabled={archiveTaskMutation.isPending}
                >
                    {archiveTaskMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    Archive Task
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 h-8"
                    onClick={() => {
                    if (window.confirm(`Are you sure you want to delete the task "${editingTask.title}"?`)) {
                        deleteTaskMutation.mutate(editingTask.id);
                    }
                    }}
                    disabled={deleteTaskMutation.isPending}
                >
                    {deleteTaskMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete Task
                </Button>
              </div>
            </div>
          )}

          {editingTask && (
            <>
              <DependencyManager
                item={editingTask}
                allPossibleBlockers={(() => {
                  const flat: any[] = [];
                  const recurse = (list: Task[], prefix = "") => {
                    list.forEach(t => {
                      const title = prefix ? `${prefix} > ${t.title}` : t.title;
                      flat.push({ ...t, title });
                      if (t.subtasks) recurse(t.subtasks, title);
                    });
                  };
                  recurse(tasks || []);
                  return flat;
                })()}
              />
              <AttachmentManager
                taskId={editingTask.id}
                attachments={editingTask.attachments || []}
              />
              
              <div className="pt-6 border-t mt-6">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Task Activity
                </h3>
                <CommentSection taskId={editingTask.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
