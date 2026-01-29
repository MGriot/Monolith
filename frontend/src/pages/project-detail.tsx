import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import KanbanBoard from '@/components/kanban-board';
import ProjectGantt from '@/components/project-gantt';
import ProjectHeatmap from '@/components/project-heatmap';
import { 
  Trello, 
  GanttChart, 
  Activity,
  Calendar as CalendarIcon
} from 'lucide-react';

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
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  topic?: string;
  start_date?: string;
  due_date?: string;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Project Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
            <Badge variant="secondary" className="capitalize">{project.status}</Badge>
          </div>
          <p className="text-slate-500 max-w-2xl">{project.description}</p>
        </div>
        
        <div className="w-full md:w-64 space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-slate-600">Overall Progress</span>
            <span className="text-primary">{project.progress_percent}%</span>
          </div>
          <Progress value={project.progress_percent} className="h-2" />
          <div className="flex items-center gap-4 pt-2 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}
            </div>
            <span>→</span>
            <div className="flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {project.due_date ? new Date(project.due_date).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 mb-8">
          <TabsTrigger value="kanban" className="gap-2">
            <Trello className="w-4 h-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-2">
            <GanttChart className="w-4 h-4" /> Gantt
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" /> Activity
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="kanban" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <KanbanBoard tasks={tasks || []} onTaskMove={handleTaskMove} />
        </TabsContent>
        
        <TabsContent value="gantt" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <ProjectGantt tasks={tasks || []} />
        </TabsContent>
        
        <TabsContent value="activity" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm overflow-hidden">
          <ProjectHeatmap stats={stats || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
