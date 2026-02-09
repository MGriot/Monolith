import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  Archive, 
  RefreshCcw, 
  AlertCircle,
  Loader2,
  FolderKanban,
  Calendar
} from 'lucide-react';
import { formatPercent } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { Project as ProjectType } from '@/types';
import { toast } from 'sonner';

export default function ArchivePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['projects', 'archived'],
    queryFn: async () => {
      // Fetch all projects including archived, then filter in frontend for now 
      // (since API returns all if include_archived=True)
      // Ideally backend would support "only_archived" but "include_archived" is what we have.
      const response = await api.get('/projects/?include_archived=true');
      const allProjects = response.data as ProjectType[];
      return allProjects.filter(p => p.is_archived);
    },
  });

  const restoreProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return api.post(`/projects/${projectId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success("Project restored successfully");
    },
    onError: () => {
        toast.error("Failed to restore project");
    }
  });

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
        <p>Failed to load archived projects.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Archive className="w-6 h-6 text-slate-400" />
            Project Archive
          </h1>
          <p className="text-slate-500">View and restore completed projects.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/projects')}>
          Back to Active Projects
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
              <TableHead>Archived Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Archive className="w-8 h-8 text-slate-300" />
                    <p>No archived projects found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              projects?.map((project) => (
                <TableRow key={project.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 shrink-0">
                        <FolderKanban className="w-4 h-4 text-slate-500" />
                      </div>
                      <span className="font-semibold text-slate-700 truncate">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 opacity-70">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {project.topics && project.topics.length > 0 ? project.topics.map(t => (
                          <Badge key={t.id} variant="secondary" className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-none">{t.name}</Badge>
                        )) : <span className="text-xs font-medium text-slate-700">{project.topic || 'General'}</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize bg-slate-50 text-slate-500">
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5 opacity-70">
                      <div className="flex justify-between text-[10px] font-medium text-slate-500">
                        <span>{formatPercent(project.progress_percent)}%</span>
                      </div>
                      <Progress value={project.progress_percent} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>{project.archived_at ? format(parseISO(project.archived_at as any), 'MMM d, yyyy') : 'Unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 text-primary hover:text-primary hover:bg-primary/10 h-8"
                      onClick={() => restoreProjectMutation.mutate(project.id)}
                      disabled={restoreProjectMutation.isPending}
                    >
                      {restoreProjectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
