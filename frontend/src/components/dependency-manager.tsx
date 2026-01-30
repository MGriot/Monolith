import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Link as LinkIcon, 
  Loader2,
  AlertCircle,
  Plus
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  blocked_by_ids?: string[];
}

interface DependencyManagerProps {
  currentTask: Task;
  allTasks: Task[];
}

export default function DependencyManager({ currentTask, allTasks }: DependencyManagerProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);

  const updateTaskMutation = useMutation({
    mutationFn: async (blockedByIds: string[]) => {
      return api.put(`/tasks/${currentTask.id}`, { blocked_by_ids: blockedByIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsAdding(false);
    },
  });

  const handleAddDependency = (taskId: string) => {
    const currentDeps = currentTask.blocked_by_ids || [];
    if (!currentDeps.includes(taskId)) {
      updateTaskMutation.mutate([...currentDeps, taskId]);
    }
  };

  const handleRemoveDependency = (taskId: string) => {
    const currentDeps = currentTask.blocked_by_ids || [];
    updateTaskMutation.mutate(currentDeps.filter(id => id !== taskId));
  };

  // Filter out current task and already added dependencies to show in "available" list
  const availableTasks = allTasks.filter(t => 
    t.id !== currentTask.id && 
    !(currentTask.blocked_by_ids || []).includes(t.id)
  );

  const blockedByTasks = allTasks.filter(t => 
    (currentTask.blocked_by_ids || []).includes(t.id)
  );

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-slate-400" />
          Dependencies
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {blockedByTasks.length}
          </span>
        </h4>
        {!isAdding && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => setIsAdding(true)}
          >
            Add Dependency
          </Button>
        )}
      </div>

      {blockedByTasks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {blockedByTasks.map(task => (
            <Badge 
              key={task.id} 
              variant="secondary" 
              className="pl-2 pr-1 py-1 gap-1 flex items-center"
            >
              <span className="max-w-[150px] truncate">{task.title}</span>
              <button 
                onClick={() => handleRemoveDependency(task.id)}
                className="hover:bg-slate-200 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No dependencies defined.</p>
      )}

      {isAdding && (
        <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Select Task to depend on:</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0" 
              onClick={() => setIsAdding(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="max-h-[150px] overflow-y-auto space-y-1">
            {availableTasks.length > 0 ? (
              availableTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => handleAddDependency(task.id)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all flex items-center justify-between group"
                >
                  <span className="truncate flex-1">{task.title}</span>
                  <Plus className="w-3 h-3 text-slate-300 group-hover:text-primary" />
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-slate-400 gap-1">
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px]">No other tasks available</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {updateTaskMutation.isPending && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Updating dependencies...
        </div>
      )}
    </div>
  );
}
