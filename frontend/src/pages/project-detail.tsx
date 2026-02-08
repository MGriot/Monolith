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
  DialogDescription,
} from "@/components/ui/dialog";
import KanbanBoard from '@/components/kanban-board';
import ProjectGantt from '@/components/project-gantt';
import ProjectHeatmap from '@/components/project-heatmap';
import ProjectTaskList from '@/components/project-task-list';
import ResourceTimeline from '@/components/resource-timeline';
import ProjectIdeas from '@/components/project-ideas';
import TaskForm from '@/components/task-form';
import type { TaskFormValues } from '@/components/task-form';
import DependencyManager from '@/components/dependency-manager';
import AttachmentManager from '@/components/attachment-manager';
import MarkdownRenderer from '@/components/markdown-renderer';
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
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';
import type { Project, Task } from '@/types';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isProjectEditDialogOpen, setIsProjectEditDialogOpen] = useState(false);
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
      setIsProjectEditDialogOpen(false);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (newTask: TaskFormValues) => {
      const response = await api.post('/tasks/', { ...newTask, project_id: id });
      return response.data;
    },
    onSuccess: (newTask) => {
      // Optimistic cache update for Tasks
      queryClient.setQueryData(['tasks', id], (old: Task[] | undefined) => {
        if (!old) return [newTask];
        // If it's a subtask, we might need to find the parent and add it there
        // But for simplicity in this implementation, we rely on the flatten login in components
        // or just append to the flat list if the API returns a flat list (it seems it returns nested based on findTaskRecursive)
        return [...old, newTask];
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setIsTaskDialogOpen(false);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return api.delete(`/tasks/${taskId}`);
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });
      const previousTasks = queryClient.getQueryData(['tasks', id]);
      queryClient.setQueryData(['tasks', id], (old: Task[] | undefined) => {
        return old?.filter(t => t.id !== taskId);
      });
      return { previousTasks };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['tasks', id], context?.previousTasks);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskFormValues> }) => {
      const response = await api.put(`/tasks/${taskId}`, data);
      return response.data;
    },
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });
      const previousTasks = queryClient.getQueryData(['tasks', id]);

      queryClient.setQueryData(['tasks', id], (old: Task[] | undefined) => {
        const updateRecursive = (list: Task[]): Task[] => {
          return list.map(t => {
            if (t.id === taskId) return { ...t, ...data };
            if (t.subtasks) return { ...t, subtasks: updateRecursive(t.subtasks) };
            return t;
          });
        };
        return old ? updateRecursive(old) : [];
      });

      return { previousTasks };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['tasks', id], context?.previousTasks);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
      setIsTaskDialogOpen(false);
      setEditingTaskId(null);
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      return api.put(`/tasks/${taskId}`, { status: newStatus });
    },
    onMutate: async ({ taskId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });
      const previousTasks = queryClient.getQueryData(['tasks', id]);

      queryClient.setQueryData(['tasks', id], (old: Task[] | undefined) => {
        const updateRecursive = (list: Task[]): Task[] => {
          return list.map(t => {
            if (t.id === taskId) return { ...t, status: newStatus };
            if (t.subtasks) return { ...t, subtasks: updateRecursive(t.subtasks) };
            return t;
          });
        };
        return old ? updateRecursive(old) : [];
      });

      return { previousTasks };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['tasks', id], context?.previousTasks);
    },
    onSuccess: () => {
      // We don't necessarily need to invalidate immediately if we are confident in our optimistic update
      // but it's good practice to ensure consistency eventually
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
    },
  });

  const handleTaskMove = (taskId: string, newStatus: string) => {
    moveTaskMutation.mutate({ taskId, newStatus });
  };

  const handleSubtaskMove = (subtaskId: string, newStatus: string) => {
    moveTaskMutation.mutate({ taskId: subtaskId, newStatus });
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
      parent_id: data.parent_id === undefined ? parentTaskId : data.parent_id
    };

    if (editingTaskId) {
      updateTaskMutation.mutate({ taskId: editingTaskId, data: formattedData });
    } else {
      createTaskMutation.mutate(formattedData);
    }
  };

  const handleReorderTask = (taskId: string, direction: 'up' | 'down') => {
    if (!tasks) return;

    // Find task and its siblings
    let taskToMove: Task | null = null;
    let siblings: Task[] = [];

    const findSiblings = (list: Task[]) => {
      const idx = list.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        taskToMove = list[idx];
        siblings = list;
        return true;
      }
      for (const t of list) {
        if (t.subtasks && findSiblings(t.subtasks)) return true;
      }
      return false;
    };

    findSiblings(tasks);
    if (!taskToMove || siblings.length === 0) return;

    const index = siblings.findIndex(t => t.id === taskId);
    if (direction === 'up' && index > 0) {
      const prevTask = siblings[index - 1];
      const newIndex = (prevTask.sort_index || 0) - 1;
      updateTaskMutation.mutate({ taskId, data: { sort_index: newIndex } });
    } else if (direction === 'down' && index < siblings.length - 1) {
      const nextTask = siblings[index + 1];
      const newIndex = (nextTask.sort_index || 0) + 1;
      updateTaskMutation.mutate({ taskId, data: { sort_index: newIndex } });
    }
  };

  const handleIndentTask = (taskId: string, direction: 'indent' | 'outdent') => {
    if (!tasks) return;

    const findContext = (list: Task[], p: Task | null = null): { task: Task, parent: Task | null, siblings: Task[] } | null => {
      const idx = list.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        return { task: list[idx], parent: p, siblings: list };
      }
      for (const t of list) {
        if (t.subtasks) {
          const res = findContext(t.subtasks, t);
          if (res) return res;
        }
      }
      return null;
    };

    const context = findContext(tasks);
    if (!context) return;

    const { parent: pTask, siblings } = context;

    if (direction === 'indent') {
      const index = siblings.findIndex(t => t.id === taskId);
      if (index > 0) {
        const prevSibling = siblings[index - 1];
        updateTaskMutation.mutate({ taskId, data: { parent_id: prevSibling.id } });
      }
    } else {
      // Outdent
      if (pTask) {
        updateTaskMutation.mutate({ taskId, data: { parent_id: pTask.parent_id || null } });
      }
    }
  };

  const handlePromoteSuccess = (task: Task) => {
    // Switch to overview, select the new task, and open edit dialog
    setActiveTab("overview");
    setEditingTaskId(task.id);
    setIsTaskDialogOpen(true);
  };

  if (isProjectLoading || isTasksLoading || isStatsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (projectError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
          <p className="text-slate-500">You do not have permission to view this project or it does not exist.</p>
        </div>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Project not found.</p>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-primary transition-colors"
                onClick={() => setIsProjectEditDialogOpen(true)}
              >
                <SettingsIcon className="w-4 h-4" />
              </Button>
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
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {project.topic_ref?.name || project.topic || 'General'}
                      </p>
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
                      <p className="text-xs font-bold text-slate-700 truncate">{project.type_ref?.name || project.type || 'Standard'}</p>
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

            <MarkdownRenderer
              content={project.description || "No description provided."}
              className="text-xs text-slate-500 max-w-4xl line-clamp-2 hover:line-clamp-none transition-all cursor-default"
            />
          </div>

          <div className="flex flex-row lg:flex-col items-center lg:items-end gap-4 shrink-0">
            <Button onClick={() => handleAddTask()} className="gap-2 shadow-lg shadow-primary/20 h-9">
              <Plus className="w-4 h-4" /> Add Task
            </Button>
            <div className="w-48 space-y-1.5">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                <span className="text-slate-400">Progress</span>
                <span className="text-primary">{Math.round(project.progress_percent)}%</span>
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
            <TabsTrigger value="ideas" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <Lightbulb className="w-3.5 h-3.5" /> Ideas
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30 space-y-6">
          {/* Gantt Chart Section */}
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
              />
            </div>
          </div>

          {/* Task List Section */}
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
                {project.members?.length === 0 && (
                  <p className="text-xs text-slate-500 italic py-4">No members assigned to this project.</p>
                )}
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
      </Tabs>

      {/* Project Edit Dialog */}
      <Dialog open={isProjectEditDialogOpen} onOpenChange={setIsProjectEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Modify project metadata and settings.</DialogDescription>
          </DialogHeader>
          {project && (
            <ProjectForm
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
              onCancel={() => setIsProjectEditDialogOpen(false)}
              isLoading={updateProjectMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
            <DialogDescription>
              {editingTask ? 'Modify the task details below.' : 'Add a new task to your project.'}
            </DialogDescription>
          </DialogHeader>

          {editingTask && editingTask.description && (
            <div className="bg-slate-50 p-4 rounded-lg border mb-4">
              <Label className="text-[10px] uppercase text-slate-400 font-bold mb-2 block">Description Preview</Label>
              <MarkdownRenderer content={editingTask.description} />
            </div>
          )}

          <TaskForm
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
              assignee_ids: editingTask.assignees?.map(u => u.id) || [],
              parent_id: editingTask.parent_id
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
                Created at {new Date(editingTask.id ? parseInt(editingTask.id.substring(0, 8), 16) * 1000 : Date.now()).toLocaleDateString()}
              </div>
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
                      flat.push({ id: t.id, title, blocked_by_ids: t.blocked_by_ids });
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
