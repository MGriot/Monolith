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
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Plus,
  Trash2,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import ProjectForm, { type ProjectFormValues } from '@/components/project-form';
import type { Project as ProjectType, ProjectTemplate } from '@/types';

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [creationStep, setCreationStep] = useState<'type' | 'form'>('type');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectType | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateDialogOpen(true);
      setCreationStep('type');
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
      return response.data as ProjectType[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates/')).data as ProjectTemplate[],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const formattedValues = {
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()) : [],
        start_date: values.start_date ? new Date(values.start_date).toISOString() : null,
        due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
      };
      
      const projectResponse = await api.post('/projects/', formattedValues);
      const newProject = projectResponse.data;

      // If a template was selected, create the tasks from it
      if (selectedTemplate && selectedTemplate.tasks_json) {
        for (const taskTemplate of selectedTemplate.tasks_json) {
          await api.post('/tasks/', {
            ...taskTemplate,
            project_id: newProject.id,
            start_date: formattedValues.start_date,
            due_date: formattedValues.due_date
          });
        }
      }

      return newProject;
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateDialogOpen(false);
      navigate(`/projects/${newProject.id}`);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return api.delete(`/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectToDelete(null);
    },
  });

  const handleCreateSubmit = (data: ProjectFormValues) => {
    createProjectMutation.mutate(data);
  };

  const handleDeleteProject = (e: React.MouseEvent, project: ProjectType) => {
    e.stopPropagation();
    setProjectToDelete(project);
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
                <TableRow key={project.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => navigate(`/projects/${project.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20 shrink-0 group-hover:scale-105 transition-transform">
                        <FolderKanban className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-semibold text-slate-900 truncate group-hover:text-primary transition-colors">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {project.topics && project.topics.length > 0 ? project.topics.map(t => (
                          <Badge key={t.id} variant="secondary" className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-none">{t.name}</Badge>
                        )) : <span className="text-xs font-medium text-slate-700">{project.topic || 'General'}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {project.types && project.types.length > 0 ? project.types.map(t => (
                          <Badge key={t.id} variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-slate-200 text-slate-500">{t.name}</Badge>
                        )) : <span className="text-[10px] text-slate-500 capitalize">{project.type || 'Standard'}</span>}
                      </div>
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
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-400 hover:text-destructive"
                        onClick={(e) => handleDeleteProject(e, project)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2 text-slate-500 hover:text-primary h-8"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        View
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Delete Project
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{projectToDelete?.name}"</span>? 
              This will permanently remove all associated tasks, subtasks, and files. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setProjectToDelete(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
              disabled={deleteProjectMutation.isPending}
              className="gap-2"
            >
              {deleteProjectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) setCreationStep('type'); }}>
        <DialogContent className={cn("transition-all duration-300", creationStep === 'type' ? "sm:max-w-[600px]" : "sm:max-w-[500px]")}>
          <DialogHeader>
            <DialogTitle>{creationStep === 'type' ? 'Select Project Type' : 'Project Details'}</DialogTitle>
            <DialogDescription>
              {creationStep === 'type' ? 'Choose a template or start with a blank project.' : 'Enter the project details to get started.'}
            </DialogDescription>
          </DialogHeader>
          
          {creationStep === 'type' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <Card 
                className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
                onClick={() => { setSelectedTemplate(null); setCreationStep('form'); }}
              >
                <CardHeader className="p-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/10 transition-colors">
                    <Plus className="w-5 h-5 text-slate-500 group-hover:text-primary" />
                  </div>
                  <CardTitle className="text-base">Blank Project</CardTitle>
                  <CardDescription className="text-xs">Start from scratch with no predefined tasks.</CardDescription>
                </CardHeader>
              </Card>

              {templates?.map((template) => (
                <Card 
                  key={template.id}
                  className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  onClick={() => { setSelectedTemplate(template); setCreationStep('form'); }}
                >
                  <CardHeader className="p-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                      <FolderKanban className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    <CardDescription className="text-xs line-clamp-1">{template.description || 'Custom template'}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <ProjectForm 
              onSubmit={handleCreateSubmit} 
              onCancel={() => setCreationStep('type')} 
              isLoading={createProjectMutation.isPending}
              initialValues={selectedTemplate ? {
                name: selectedTemplate.name,
                description: selectedTemplate.description,
              } : {}}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}