import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Trash2, 
  Loader2,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Subtask {
  id: string;
  title: string;
  status: string;
  task_id: string;
}

interface SubtaskManagerProps {
  taskId: string;
}

export default function SubtaskManager({ taskId }: SubtaskManagerProps) {
  const queryClient = useQueryClient();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

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

  const toggleMutation = useMutation({
    mutationFn: async ({ subtaskId, status }: { subtaskId: string; status: string }) => {
      return api.put(`/subtasks/${subtaskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      // Also invalidate parent task/project to reflect progress changes
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
          <div 
            key={subtask.id} 
            className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-slate-100 hover:bg-slate-50 group transition-all"
          >
            <div className="flex items-center gap-3 flex-1">
              <input 
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                checked={subtask.status === "Done"} 
                onChange={(e) => {
                  toggleMutation.mutate({ 
                    subtaskId: subtask.id, 
                    status: e.target.checked ? "Done" : "Todo" 
                  });
                }}
              />
              <span className={cn(
                "text-sm",
                subtask.status === "Done" && "line-through text-slate-400"
              )}>
                {subtask.title}
              </span>
            </div>
            <button 
              onClick={() => deleteMutation.mutate(subtask.id)}
              className="p-1 text-slate-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
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
