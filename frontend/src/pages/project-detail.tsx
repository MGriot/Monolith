import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get(`/projects/${id}`);
      return response.data as Project;
    },
  });

  if (isLoading) {
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
        
        <TabsContent value="kanban" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 italic">
            Kanban Board Implementation Coming Soon...
          </div>
        </TabsContent>
        
        <TabsContent value="gantt" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 italic">
            Project Gantt Implementation Coming Soon...
          </div>
        </TabsContent>
        
        <TabsContent value="activity" className="min-h-[500px] border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 italic">
            Activity Heatmap Implementation Coming Soon...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
