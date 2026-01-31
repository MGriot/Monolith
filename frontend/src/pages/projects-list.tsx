import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  FolderKanban, 
  ArrowRight, 
  Calendar,
  AlertCircle,
  Plus
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';

interface Project {
  id: string;
  name: string;
  topic: string;
  type: string;
  status: string;
  progress_percent: number;
  due_date: string;
  owner_id: string;
}

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateDialogOpen(true);
      // Clean up search params after opening
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('create');
      setSearchParams(newParams);
    }
  }, [searchParams, setSearchParams]);

  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects/');
      return response.data as Project[];
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const formattedValues = {
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()) : [],
        start_date: values.start_date ? new Date(values.start_date).toISOString() : null,
        due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
      };
      return api.post('/projects/', formattedValues);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateDialogOpen(false);
    },
  });

  const handleCreateSubmit = (data: ProjectFormValues) => {
    createProjectMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load projects. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
          <p className="text-slate-500">Manage and track all your active projects.</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Project
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[300px]">Project Name</TableHead>
              <TableHead>Topic & Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[200px]">Progress</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <p>No projects found. Create one to get started.</p>
                    <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                      Create your first project
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              projects?.map((project) => (
                <TableRow key={project.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20 shrink-0">
                        <FolderKanban className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-slate-900 truncate">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-700">{project.topic}</span>
                      <span className="text-[10px] text-slate-500 capitalize">{project.type}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize bg-slate-50">
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-medium text-slate-500">
                        <span>{project.progress_percent}%</span>
                      </div>
                      <Progress value={project.progress_percent} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>{project.due_date ? format(parseISO(project.due_date), 'MMM d, yyyy') : 'No date'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 text-slate-500 hover:text-primary"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      View
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Enter the project details to get started.
            </DialogDescription>
          </DialogHeader>
          <ProjectForm 
            onSubmit={handleCreateSubmit} 
            onCancel={() => setIsCreateDialogOpen(false)} 
            isLoading={createProjectMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}