import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trello, 
  List as ListIcon, 
  CheckSquare,
  AlertCircle,
  Loader2,
  Folder
} from 'lucide-react';
import KanbanBoard from '@/components/kanban-board';
import ProjectGantt from '@/components/project-gantt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from 'react-router-dom';
import type { Task } from '@/types';

export default function MyTasksPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'assigned'],
    queryFn: async () => {
      const response = await api.get('/tasks/assigned');
      return response.data as Task[];
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, sortIndex }: { taskId: string; newStatus: string; sortIndex?: number }) => {
      const data: any = { status: newStatus };
      if (sortIndex !== undefined) data.sort_index = sortIndex;
      return api.put(`/tasks/${taskId}`, data);
    },
    onMutate: async ({ taskId, newStatus, sortIndex }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'assigned'] });
      const previousTasks = queryClient.getQueryData(['tasks', 'assigned']);

      queryClient.setQueryData(['tasks', 'assigned'], (old: Task[] | undefined) => {
        return old?.map(t => {
          if (t.id === taskId) {
            const updated = { ...t, status: newStatus };
            if (sortIndex !== undefined) updated.sort_index = sortIndex;
            return updated;
          }
          return t;
        });
      });

      return { previousTasks };
    },
    onError: (err: any, __, context) => {
      queryClient.setQueryData(['tasks', 'assigned'], context?.previousTasks);
      const msg = err.response?.data?.detail || err.message;
      alert(`Move failed: ${msg}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'assigned'] });
    },
  });

  const calculateSortIndex = (container: string, index: number) => {
    const columnTasks = (tasks || [])
      .filter(t => t.status.toLowerCase() === container.toLowerCase())
      .sort((a, b) => {
        if ((a.sort_index || 0) !== (b.sort_index || 0)) {
          return (a.sort_index || 0) - (b.sort_index || 0);
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    if (columnTasks.length === 0) return 100;
    if (index <= 0) return (columnTasks[0].sort_index || 0) - 10;
    if (index >= columnTasks.length) return (columnTasks[columnTasks.length - 1].sort_index || 0) + 10;

    const prev = columnTasks[index - 1].sort_index || 0;
    const next = columnTasks[index].sort_index || 0;
    
    if (prev === next) {
        return prev + 1;
    }
    
    return Math.round((prev + next) / 2);
  };

  const handleKanbanReorder = (taskId: string, newIndex: number, container: string) => {
    const sortIndex = calculateSortIndex(container, newIndex);
    moveTaskMutation.mutate({ taskId, newStatus: container, sortIndex });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load assigned tasks.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-primary" />
              My Tasks
            </h1>
            <p className="text-sm text-slate-500 mt-1">Focus on what's assigned to you across all projects.</p>
          </div>
          
          <div className="bg-slate-100 p-1 rounded-lg flex items-center">
            <Button 
              variant={view === 'kanban' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={view === 'kanban' ? 'bg-white shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-slate-500'}
              onClick={() => setView('kanban')}
            >
              <Trello className="w-3.5 h-3.5" /> Kanban
            </Button>
            <Button 
              variant={view === 'list' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={view === 'list' ? 'bg-white shadow-sm text-xs font-bold gap-2' : 'text-xs font-bold gap-2 text-slate-500'}
              onClick={() => setView('list')}
            >
              <ListIcon className="w-3.5 h-3.5" /> List
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="min-h-[500px]">
          {view === 'kanban' ? (
            <KanbanBoard 
              tasks={tasks || []} 
              onTaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx) : undefined })}
              onSubtaskMove={(id, status, idx) => moveTaskMutation.mutate({ taskId: id, newStatus: status, sortIndex: idx !== undefined ? calculateSortIndex(status, idx) : undefined })}
              onReorder={handleKanbanReorder}
              onTaskClick={(task) => navigate(`/projects/${task.project_id}`)}
              onSubtaskClick={(st) => navigate(`/projects/${st.project_id}`)}
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Task</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Project</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Status</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Priority</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-slate-500 italic">
                        You have no tasks assigned to you.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks?.map((task) => (
                      <TableRow 
                        key={task.id} 
                        className="hover:bg-slate-50/50 cursor-pointer"
                        onClick={() => navigate(`/projects/${task.project_id}`)}
                      >
                        <TableCell className="font-semibold text-slate-900">{task.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Folder className="w-3 h-3 text-slate-400" />
                            {task.project?.name || 'Unknown Project'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-[10px] font-bold">
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'destructive' : 'secondary'} className="text-[10px] font-black">
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-slate-500">
                          {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary" />
              Schedule Overview
            </h3>
          </div>
          <div className="min-h-[400px]">
            <ProjectGantt tasks={tasks || []} initialShowSubtasks={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
