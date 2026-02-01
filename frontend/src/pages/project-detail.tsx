import { useParams } from 'react-router-dom';
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
import TaskForm from '@/components/task-form';
import type { TaskFormValues } from '@/components/task-form';
import SubtaskManager from '@/components/subtask-manager';
import DependencyManager from '@/components/dependency-manager';
import AttachmentManager from '@/components/attachment-manager';
import MarkdownRenderer from '@/components/markdown-renderer';
import { 
  Trello, 
  GanttChart, 
  Activity,
  Calendar as CalendarIcon,
  Plus,
  List as ListIcon,
  Settings as SettingsIcon,
  FolderKanban,
  LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  progress_percent: number;
  start_date: string;
  due_date: string;
  topic: string;
  type: string;
  tags?: string[];
}

interface Subtask {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  topic?: string;
  type?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  topic?: string;
  type?: string;
  start_date?: string;
  due_date?: string;
  blocked_by_ids?: string[];
  attachments?: string[];
  assignees?: { id: string; full_name: string; email: string }[];
  subtasks?: Subtask[];
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isProjectEditDialogOpen, setIsProjectEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<string>("Todo");

  const { data: project, isLoading: isProjectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get(`/projects/${id}`);
      return response.data as Project;
    },
  });

  const { data: tasks, isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const response = await api.get(`/tasks/?project_id=${id}`);
      return response.data as Task[];
    },
  });

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
      return api.post('/tasks/', { ...newTask, project_id: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setIsTaskDialogOpen(false);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskFormValues> }) => {
      return api.put(`/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
      setIsTaskDialogOpen(false);
      setEditingTask(null);
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      return api.put(`/tasks/${taskId}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', id] });
    },
  });

  const handleTaskMove = (taskId: string, newStatus: string) => {
    moveTaskMutation.mutate({ taskId, newStatus });
  };

  const handleAddTask = (status?: string) => {
    setEditingTask(null);
    setInitialStatus(status || "Todo");
    setIsTaskDialogOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  };

  const handleTaskSubmit = (data: TaskFormValues) => {
    if (editingTask) {
      updateTaskMutation.mutate({ taskId: editingTask.id, data });
    } else {
      createTaskMutation.mutate(data);
    }
  };

  if (isProjectLoading || isTasksLoading || isStatsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return <div className="p-8">Project not found.</div>;
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
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Topic</Label>
                  <p className="text-xs font-bold text-slate-700 truncate">{project.topic || 'General'}</p>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                  <ListIcon className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <Label className="text-[8px] uppercase text-slate-400 font-black leading-none mb-1">Type</Label>
                  <p className="text-xs font-bold text-slate-700 truncate">{project.type || 'Standard'}</p>
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
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0 bg-white">
        <div className="px-6 py-2 border-b border-slate-100 bg-white">
          <TabsList className="flex bg-transparent p-0 gap-6 h-10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <LayoutDashboard className="w-3.5 h-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="kanban" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <Trello className="w-3.5 h-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs font-bold gap-2">
              <Activity className="w-3.5 h-3.5" /> Activity
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
            <ProjectTaskList tasks={tasks || []} onTaskClick={handleTaskClick} />
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="flex-1 overflow-hidden m-0 p-6 bg-slate-50/30">
          <KanbanBoard 
            tasks={tasks || []} 
            onTaskMove={handleTaskMove}
            onAddTask={handleAddTask}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>
        
        <TabsContent value="activity" className="flex-1 overflow-auto m-0 p-6 bg-slate-50/30">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <ProjectHeatmap 
              stats={stats || []} 
              projectStartDate={project.start_date}
              projectDueDate={project.due_date}
            />
          </div>
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
                topic: project.topic,
                type: project.type,
                status: project.status,
                start_date: project.start_date?.split('T')[0],
                due_date: project.due_date?.split('T')[0],
                tags: project.tags?.join(', ')
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
              topic: editingTask.topic,
              type: editingTask.type,
              start_date: editingTask.start_date ? editingTask.start_date.split('T')[0] : '',
              due_date: editingTask.due_date ? editingTask.due_date.split('T')[0] : '',
              assignee_ids: editingTask.assignees?.map(u => u.id) || [],
            } : {
              status: initialStatus
            }}
            onSubmit={handleTaskSubmit}
            onCancel={() => setIsTaskDialogOpen(false)}
            isLoading={createTaskMutation.isPending || updateTaskMutation.isPending}
          />
          {editingTask && (
            <>
              <SubtaskManager taskId={editingTask.id} />
              <DependencyManager 
                currentTask={editingTask} 
                allTasks={tasks || []} 
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
