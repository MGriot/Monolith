import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Trash2, 
  Loader2,
  ChevronRight,
  User as UserIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface Subtask {
  id: string;
  title: string;
  status: string;
  task_id: string;
  assignees?: User[];
}

interface SubtaskManagerProps {
  taskId: string;
}

export default function SubtaskManager({ taskId }: SubtaskManagerProps) {
  const queryClient = useQueryClient();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [activeSubtaskMenu, setActiveSubtaskMenu] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data as User[];
    },
  });

  const { data: subtasks, isLoading } = useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: async () => {
      const response = await api.get(`/subtasks/?task_id=${taskId}`);
      return response.data as Subtask[];
    },
    enabled: !!taskId,
  });

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      return api.post("/subtasks/", { title, task_id: taskId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      setNewSubtaskTitle("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ subtaskId, data }: { subtaskId: string; data: any }) => {
      return api.put(`/subtasks/${subtaskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return api.delete(`/subtasks/${subtaskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
    },
  });

  const toggleAssignee = (subtask: Subtask, userId: string) => {
    const currentIds = subtask.assignees?.map(u => u.id) || [];
    const index = currentIds.indexOf(userId);
    let newIds = [...currentIds];
    if (index > -1) {
      newIds.splice(index, 1);
    } else {
      newIds.push(userId);
    }
    updateMutation.mutate({ subtaskId: subtask.id, data: { assignee_ids: newIds } });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtaskTitle.trim()) {
      createMutation.mutate(newSubtaskTitle.trim());
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-slate-400" />
          Subtasks
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {subtasks?.length || 0}
          </span>
        </h4>
      </div>

      <div className="space-y-2">
        {subtasks?.map((subtask) => (
          <div key={subtask.id} className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-slate-100 hover:bg-slate-50 group transition-all">
              <div className="flex items-center gap-3 flex-1">
                <input 
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  checked={subtask.status === "Done"} 
                  onChange={(e) => {
                    updateMutation.mutate({ 
                      subtaskId: subtask.id, 
                      data: { status: e.target.checked ? "Done" : "Todo" }
                    });
                  }}
                />
                <span className={cn(
                  "text-sm",
                  subtask.status === "Done" && "line-through text-slate-400"
                )}>
                  {subtask.title}
                </span>
                
                <div className="flex -space-x-1 ml-2">
                  {subtask.assignees?.map(u => (
                    <div 
                      key={u.id}
                      className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center"
                      title={u.full_name || u.email}
                    >
                      <UserIcon className="w-2.5 h-2.5 text-slate-500" />
                    </div>
                  ))}
                  <button 
                    onClick={() => setActiveSubtaskMenu(activeSubtaskMenu === subtask.id ? null : subtask.id)}
                    className="w-5 h-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center hover:border-primary hover:text-primary transition-colors bg-white"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              <button 
                onClick={() => deleteMutation.mutate(subtask.id)}
                className="p-1 text-slate-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            {activeSubtaskMenu === subtask.id && (
              <div className="ml-8 p-2 border rounded-md bg-white shadow-sm flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                {users?.map(user => (
                  <button
                    key={user.id}
                    onClick={() => toggleAssignee(subtask, user.id)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] border transition-all",
                      subtask.assignees?.some(u => u.id === user.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {user.full_name || user.email}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleAddSubtask} className="flex gap-2">
        <Input
          placeholder="Add a subtask..."
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          className="h-8 text-sm"
          disabled={createMutation.isPending}
        />
        <Button 
          type="submit" 
          size="sm" 
          variant="secondary" 
          disabled={!newSubtaskTitle.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </Button>
      </form>
    </div>
  );
}

