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
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  due_date?: string;
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
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

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

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  if (isProjectLoading || isTasksLoading || isStatsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return <div>Project not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Project Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
            <Badge variant="secondary" className="capitalize">{project.status}</Badge>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8 text-slate-400"
              onClick={() => setIsProjectEditDialogOpen(true)}
            >
              <SettingsIcon className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-slate-400 font-bold">Topic</Label>
              <p className="text-sm font-medium">{project.topic || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-slate-400 font-bold">Type</Label>
              <p className="text-sm font-medium">{project.type || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-slate-400 font-bold">Start Date</Label>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-slate-400 font-bold">Due Date</Label>
              <p className="text-sm font-medium flex items-center gap-1.5 text-amber-600">
                <CalendarIcon className="w-3.5 h-3.5" />
                {project.due_date ? new Date(project.due_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>

          <MarkdownRenderer 
            content={project.description || "No description provided."} 
            className="text-slate-500 max-w-3xl"
          />
        </div>
        
        <div className="flex flex-col gap-4">
          <Button onClick={() => handleAddTask()} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Add Task
          </Button>
          <div className="w-full md:w-64 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-slate-600">Overall Progress</span>
              <span className="text-primary">{Math.round(project.progress_percent)}%</span>
            </div>
            <Progress value={project.progress_percent} className="h-2" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-4 mb-8">
          <TabsTrigger value="kanban" className="gap-2">
            <Trello className="w-4 h-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            <ListIcon className="w-4 h-4" /> List
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-2">
            <GanttChart className="w-4 h-4" /> Gantt
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" /> Activity
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="kanban" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <KanbanBoard 
            tasks={tasks || []} 
            onTaskMove={handleTaskMove}
            onAddTask={handleAddTask}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>

        <TabsContent value="list" className="min-h-[500px] border rounded-xl bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-[40%]">Task Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    No tasks found.
                  </TableCell>
                </TableRow>
              ) : (
                tasks?.map((task) => (
                  <React.Fragment key={task.id}>
                    <TableRow 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                      onClick={() => handleTaskClick(task)}
                    >
                      <TableCell onClick={(e) => {
                        e.stopPropagation();
                        toggleTaskExpansion(task.id);
                      }}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
                          {expandedTasks.has(task.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{task.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{task.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleTaskClick(task)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                    {expandedTasks.has(task.id) && task.subtasks?.map(st => (
                      <TableRow key={st.id} className="bg-slate-50/30 border-l-2 border-l-primary/30">
                        <TableCell></TableCell>
                        <TableCell className="pl-8 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            {st.title}
                          </div>
                        </TableCell>
                        <TableCell colSpan={3}>
                          <Badge className="text-[9px] bg-slate-100 text-slate-500 hover:bg-slate-100 border-none">{st.status}</Badge>
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
        
        <TabsContent value="gantt" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <ProjectGantt tasks={tasks || []} />
        </TabsContent>
        
        <TabsContent value="activity" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <ProjectHeatmap stats={stats || []} />
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
