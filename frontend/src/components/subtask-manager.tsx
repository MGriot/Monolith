import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Plus, 
  Trash2, 
  Loader2,
  ChevronRight,
  User as UserIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

import DependencyManager from "@/components/dependency-manager";

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface Subtask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  topic?: string;
  type?: string;
  start_date?: string;
  due_date?: string;
  task_id: string;
  owner_id?: string;
  owner?: User;
  assignees?: User[];
  tags?: string[];
  attachments?: string[];
  blocked_by_ids?: string[];
}

interface SubtaskManagerProps {
  taskId: string;
  allPossibleBlockers: { id: string; title: string; blocked_by_ids?: string[] }[];
}

export default function SubtaskManager({ taskId, allPossibleBlockers }: SubtaskManagerProps) {
  const queryClient = useQueryClient();
  const [newSubtask, setNewSubtask] = useState({
    title: "",
    priority: "Medium",
    topic: "",
    type: "",
    start_date: "",
    due_date: "",
    assignee_ids: [] as string[]
  });
  const [activeSubtaskMenu, setActiveSubtaskMenu] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [draftSubtask, setDraftSubtask] = useState<Subtask | null>(null);
  const [isAdding, setIsAdding] = useState(false);

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

  const editingSubtask = subtasks?.find(st => st.id === editingSubtaskId) || null;

  const handleOpenEdit = (subtask: Subtask) => {
    setEditingSubtaskId(subtask.id);
    setDraftSubtask(subtask);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof newSubtask) => {
      return api.post("/subtasks/", { 
        ...data, 
        task_id: taskId, 
        start_date: data.start_date ? new Date(data.start_date).toISOString() : null,
        due_date: data.due_date ? new Date(data.due_date).toISOString() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      setNewSubtask({ 
        title: "", 
        priority: "Medium", 
        topic: "", 
        type: "", 
        start_date: "", 
        due_date: "", 
        assignee_ids: [] 
      });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ subtaskId, data }: { subtaskId: string; data: any }) => {
      return api.put(`/subtasks/${subtaskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // Keep editingSubtaskId set if we want to keep dialog open after a simple field update,
      // but if the user finishes editing (e.g. clicks save), we clear it elsewhere.
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

  const toggleNewSubtaskAssignee = (userId: string) => {
    const current = [...newSubtask.assignee_ids];
    const index = current.indexOf(userId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(userId);
    }
    setNewSubtask({ ...newSubtask, assignee_ids: current });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtask.title.trim()) {
      createMutation.mutate(newSubtask);
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
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/5"
          onClick={() => setIsAdding(!isAdding)}
        >
          <Plus className="w-3 h-3" /> Add Subtask
        </Button>
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
                <div className="flex flex-col">
                  <span 
                    className={cn(
                      "text-sm cursor-pointer hover:underline",
                      subtask.status === "Done" && "line-through text-slate-400"
                    )}
                    onClick={() => handleOpenEdit(subtask)}
                  >
                    {subtask.title}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-[8px] font-black uppercase px-1 rounded-sm",
                      subtask.priority === 'Critical' || subtask.priority === 'High' ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
                    )}>
                      {subtask.priority}
                    </span>
                    {subtask.topic && (
                        <span className="text-[8px] bg-blue-50 text-blue-600 px-1 rounded-sm font-bold">{subtask.topic}</span>
                    )}
                    {subtask.type && (
                        <span className="text-[8px] bg-purple-50 text-purple-600 px-1 rounded-sm font-bold">{subtask.type}</span>
                    )}
                    {subtask.start_date && (
                      <span className="text-[8px] text-slate-400">
                        Start: {new Date(subtask.start_date).toLocaleDateString()}
                      </span>
                    )}
                    {subtask.due_date && (
                      <span className="text-[8px] text-slate-400">
                        Due: {new Date(subtask.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                
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

      {isAdding && (
        <form onSubmit={handleAddSubtask} className="space-y-3 p-3 border rounded-lg bg-slate-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <Input
            placeholder="Subtask title..."
            value={newSubtask.title}
            onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })}
            className="h-8 text-sm bg-white"
            disabled={createMutation.isPending}
            autoFocus
          />
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[9px] uppercase font-bold text-slate-400">Priority</Label>
              <select 
                className="w-full h-8 rounded-md border text-[10px] px-2 bg-white"
                value={newSubtask.priority}
                onChange={(e) => setNewSubtask({ ...newSubtask, priority: e.target.value })}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
                <Label className="text-[9px] uppercase font-bold text-slate-400">Topic</Label>
                <Input
                    placeholder="e.g. Frontend"
                    value={newSubtask.topic}
                    onChange={(e) => setNewSubtask({ ...newSubtask, topic: e.target.value })}
                    className="h-8 text-[10px] bg-white"
                    disabled={createMutation.isPending}
                />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
             <div className="space-y-1 col-span-1">
                <Label className="text-[9px] uppercase font-bold text-slate-400">Type</Label>
                <Input
                    placeholder="e.g. Fix"
                    value={newSubtask.type}
                    onChange={(e) => setNewSubtask({ ...newSubtask, type: e.target.value })}
                    className="h-8 text-[10px] bg-white"
                    disabled={createMutation.isPending}
                />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase font-bold text-slate-400">Start Date</Label>
              <Input
                type="date"
                value={newSubtask.start_date}
                onChange={(e) => setNewSubtask({ ...newSubtask, start_date: e.target.value })}
                className="h-8 text-[10px] bg-white"
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase font-bold text-slate-400">Due Date</Label>
              <Input
                type="date"
                value={newSubtask.due_date}
                onChange={(e) => setNewSubtask({ ...newSubtask, due_date: e.target.value })}
                className="h-8 text-[10px] bg-white"
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-[9px] uppercase font-bold text-slate-400">Assignees</Label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-white border rounded-md min-h-[40px]">
              {users?.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleNewSubtaskAssignee(user.id)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] border transition-all",
                    newSubtask.assignee_ids.includes(user.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {user.full_name || user.email}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              size="sm" 
              className="h-7 text-xs"
              disabled={!newSubtask.title.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Subtask"}
            </Button>
          </div>
        </form>
      )}

      {!isAdding && subtasks?.length === 0 && (
        <p className="text-xs text-slate-400 italic text-center py-2">No subtasks yet.</p>
      )}

      {/* Quick Edit Subtask */}
      {editingSubtask && draftSubtask && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg">Edit Subtask</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-slate-400">Title</Label>
                <Input 
                  value={draftSubtask.title}
                  onChange={(e) => setDraftSubtask({...draftSubtask, title: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-slate-400">Description</Label>
                <textarea 
                  className="w-full min-h-[80px] rounded-md border p-2 text-sm"
                  value={draftSubtask.description || ""}
                  onChange={(e) => setDraftSubtask({...draftSubtask, description: e.target.value})}
                  placeholder="Subtask description..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Priority</Label>
                  <select 
                    className="w-full h-9 rounded-md border text-sm px-2"
                    value={draftSubtask.priority}
                    onChange={(e) => setDraftSubtask({...draftSubtask, priority: e.target.value})}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                  <select 
                    className="w-full h-9 rounded-md border text-sm px-2"
                    value={draftSubtask.status}
                    onChange={(e) => setDraftSubtask({...draftSubtask, status: e.target.value})}
                  >
                    <option value="Backlog">Backlog</option>
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Start Date</Label>
                  <Input 
                    type="date"
                    value={draftSubtask.start_date ? draftSubtask.start_date.split('T')[0] : ""}
                    onChange={(e) => setDraftSubtask({...draftSubtask, start_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Due Date</Label>
                  <Input 
                    type="date"
                    value={draftSubtask.due_date ? draftSubtask.due_date.split('T')[0] : ""}
                    onChange={(e) => setDraftSubtask({...draftSubtask, due_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Topic</Label>
                  <Input 
                    placeholder="e.g. Frontend"
                    value={draftSubtask.topic || ""}
                    onChange={(e) => setDraftSubtask({...draftSubtask, topic: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Type</Label>
                  <Input 
                    placeholder="e.g. Fix"
                    value={draftSubtask.type || ""}
                    onChange={(e) => setDraftSubtask({...draftSubtask, type: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <DependencyManager 
                item={editingSubtask}
                allPossibleBlockers={allPossibleBlockers}
                type="subtask"
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setEditingSubtaskId(null);
                setDraftSubtask(null);
              }}>Cancel</Button>
              <Button onClick={() => {
                updateMutation.mutate({ 
                  subtaskId: editingSubtask.id, 
                  data: {
                    title: draftSubtask.title,
                    description: draftSubtask.description,
                    status: draftSubtask.status,
                    priority: draftSubtask.priority,
                    start_date: draftSubtask.start_date ? new Date(draftSubtask.start_date).toISOString() : null,
                    due_date: draftSubtask.due_date ? new Date(draftSubtask.due_date).toISOString() : null,
                    topic: draftSubtask.topic,
                    type: draftSubtask.type,
                  } 
                });
                setEditingSubtaskId(null);
                setDraftSubtask(null);
              }} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
    </div>
  );
}