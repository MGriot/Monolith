import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  X, 
  Link as LinkIcon, 
  Loader2,
  AlertCircle,
  Plus,
  Info,
  Edit2,
  Check as CheckIcon
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import type { Task, DependencyType } from "@/types";

interface DependencyManagerProps {
  item: Task;
  allPossibleBlockers: Task[];
}

export default function DependencyManager({ item, allPossibleBlockers }: DependencyManagerProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);
  const [depType, setDepType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);

  // Edit state
  const [editingDepId, setEditingDepId] = useState<string | null>(null);
  const [editType, setEditType] = useState<DependencyType>("FS");
  const [editLagDays, setEditLagDays] = useState(0);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBlockerId) return;
      return api.post(`/tasks/${item.id}/dependencies`, {
        successor_id: item.id,
        predecessor_id: selectedBlockerId,
        type: depType,
        lag_days: lagDays
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      setIsAdding(false);
      setSelectedBlockerId(null);
      setDepType("FS");
      setLagDays(0);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingDepId) return;
      // We perform a delete and then an add to update the dependency
      await api.delete(`/tasks/${item.id}/dependencies/${editingDepId}`);
      return api.post(`/tasks/${item.id}/dependencies`, {
        successor_id: item.id,
        predecessor_id: editingDepId,
        type: editType,
        lag_days: editLagDays
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      setEditingDepId(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (predecessorId: string) => {
      return api.delete(`/tasks/${item.id}/dependencies/${predecessorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
    },
  });

  const availableBlockers = allPossibleBlockers.filter(b => 
    b.id !== item.id && 
    !(item.blocked_by || []).some(d => d.predecessor_id === b.id)
  );

  const activeDependencies = item.blocked_by || [];

  const getBlockerTitle = (id: string) => {
    return allPossibleBlockers.find(b => b.id === id)?.title || "Unknown Task";
  };

  const typeDescriptions = {
    FS: "Finish-to-Start: Successor starts after Predecessor finishes.",
    SS: "Start-to-Start: Successor starts after Predecessor starts.",
    FF: "Finish-to-Finish: Successor finishes after Predecessor finishes.",
    SF: "Start-to-Finish: Successor finishes after Predecessor starts."
  };

  const startEdit = (dep: any) => {
    setEditingDepId(dep.predecessor_id);
    setEditType(dep.type);
    setEditLagDays(dep.lag_days);
  };

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-slate-400" />
          Advanced Dependencies
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {activeDependencies.length}
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

      {activeDependencies.length > 0 ? (
        <div className="grid gap-2">
          {activeDependencies.map(d => (
            <div 
              key={d.id} 
              className={cn(
                "flex flex-col p-2 rounded-md border bg-white group transition-all",
                editingDepId === d.predecessor_id && "ring-2 ring-primary/20 border-primary/30"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col overflow-hidden flex-1">
                  <span className="text-xs font-medium truncate">{getBlockerTitle(d.predecessor_id)}</span>
                  
                  {editingDepId !== d.predecessor_id ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-slate-50 text-slate-500 border-slate-200">
                        {d.type}
                      </Badge>
                      {d.lag_days !== 0 && (
                        <span className="text-[10px] text-slate-400">
                          Lag: {d.lag_days > 0 ? `+${d.lag_days}` : d.lag_days}d
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="space-y-1">
                        <Label className="text-[8px] uppercase font-black text-slate-400">Type</Label>
                        <Select value={editType} onValueChange={(v: any) => setEditType(v)}>
                          <SelectTrigger className="h-7 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FS">FS</SelectItem>
                            <SelectItem value="SS">SS</SelectItem>
                            <SelectItem value="FF">FF</SelectItem>
                            <SelectItem value="SF">SF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[8px] uppercase font-black text-slate-400">Lag</Label>
                        <Input 
                          type="number" 
                          value={editLagDays} 
                          onChange={(e) => setEditLagDays(parseInt(e.target.value) || 0)} 
                          className="h-7 text-[10px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {editingDepId !== d.predecessor_id ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => startEdit(d)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeMutation.mutate(d.predecessor_id)}
                        disabled={removeMutation.isPending}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Dependency"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400"
                        onClick={() => setEditingDepId(null)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No dependencies defined.</p>
      )}

      {isAdding && (
        <div className="space-y-3 border rounded-lg p-3 bg-slate-50/50 animate-in fade-in slide-in-from-top-1 duration-200">
          {!selectedBlockerId ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">1. Select Predecessor:</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0" 
                  onClick={() => setIsAdding(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-[150px] overflow-y-auto space-y-1 bg-white border rounded-md p-1">
                {availableBlockers.length > 0 ? (
                  availableBlockers.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBlockerId(b.id)}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 rounded flex items-center justify-between group"
                    >
                      <span className="truncate flex-1">{b.title}</span>
                      <Plus className="w-3 h-3 text-slate-300 group-hover:text-primary" />
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-slate-400 gap-1">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-[10px]">No other items available</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2 mb-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-xs font-semibold text-indigo-600 truncate">
                    {getBlockerTitle(selectedBlockerId)}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedBlockerId(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                >
                  Change
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Type</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button"><Info className="w-2.5 h-2.5 text-slate-400" /></button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="w-64 p-2 text-[10px]">
                        <div className="space-y-1">
                          {Object.entries(typeDescriptions).map(([k, v]) => (
                            <div key={k}><span className="font-bold">{k}:</span> {v}</div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Select value={depType} onValueChange={(v: any) => setDepType(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FS">Finish-to-Start (FS)</SelectItem>
                      <SelectItem value="SS">Start-to-Start (SS)</SelectItem>
                      <SelectItem value="FF">Finish-to-Finish (FF)</SelectItem>
                      <SelectItem value="SF">Start-to-Finish (SF)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Lag (Days)</label>
                  <Input 
                    type="number" 
                    value={lagDays}
                    onChange={(e) => setEditLagDays(parseInt(e.target.value) || 0)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button 
                  className="flex-1 h-8 text-xs" 
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                </Button>
                <Button 
                  variant="outline" 
                  className="h-8 text-xs"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {(addMutation.isPending || removeMutation.isPending || updateMutation.isPending) && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Syncing dependencies...
        </div>
      )}
    </div>
  );
}
