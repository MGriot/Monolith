import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { 
  Users as TeamIcon, 
  User as UserIcon, 
  Search, 
  X, 
  Check, 
  ChevronsUpDown,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { User, Team } from "@/types";

interface AssigneeSelectorProps {
  selectedValues: string[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  label?: string;
}

export function AssigneeSelector({
  selectedValues,
  onSelect,
  onRemove,
  isLoading: externalLoading,
  placeholder = "Select assignees...",
  className,
  label
}: AssigneeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users/')).data as User[],
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => (await api.get('/teams/')).data as Team[],
  });

  const isLoading = externalLoading || usersLoading || teamsLoading;

  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    return teams.filter(t => 
      t.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [teams, search]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => 
      (u.full_name || u.email).toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  const selectedUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => selectedValues.includes(u.id));
  }, [users, selectedValues]);

  const handleTeamSelect = (team: Team) => {
    if (!team.members) return;
    
    team.members.forEach(member => {
      if (!selectedValues.includes(member.id)) {
        onSelect(member.id);
      }
    });
    // Optional: setOpen(false); 
  };

  return (
    <div className={cn("grid gap-2", className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 border rounded-md bg-slate-50/50">
        {selectedUsers.length > 0 ? (
          selectedUsers.map((user) => (
            <Badge 
              key={user.id} 
              variant="secondary"
              className="pl-2 pr-1 py-0.5 flex items-center gap-1 bg-white border-slate-200 text-[11px] font-medium"
            >
              <UserIcon className="w-2.5 h-2.5 text-slate-400" />
              {user.full_name || user.email}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(user.id);
                }}
                className="hover:bg-slate-100 rounded-full p-0.5 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground py-1 px-1">{placeholder}</span>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between w-full h-9 text-xs"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Manage Assignees"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search users or teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
            {/* Teams Section */}
            {filteredTeams.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Teams
                </div>
                {filteredTeams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between group px-2 py-1.5 rounded-sm hover:bg-slate-100 cursor-pointer"
                    onClick={() => handleTeamSelect(team)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 rounded bg-indigo-50 flex items-center justify-center">
                        <TeamIcon className="w-3 h-3 text-indigo-600" />
                      </div>
                      <span className="text-sm truncate">{team.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="right" className="w-48 p-2">
                          <div className="text-[11px] font-semibold mb-1">Team Members</div>
                          <div className="space-y-1">
                            {team.members && team.members.length > 0 ? (
                              team.members.map(m => (
                                <div key={m.id} className="text-[10px] flex items-center gap-1">
                                  <UserIcon className="w-2 h-2" /> {m.full_name}
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] text-slate-400">No members</div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="w-4 h-4 flex items-center justify-center">
                        <Badge variant="outline" className="text-[9px] px-1 h-3.5 bg-slate-50">
                          +{team.members?.length || 0}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Users Section */}
            <div className="p-1 border-t">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Individual Users
              </div>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const isSelected = selectedValues.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      className={cn(
                        "flex items-center justify-between px-2 py-1.5 rounded-sm cursor-pointer",
                        isSelected ? "bg-slate-50 text-indigo-600" : "hover:bg-slate-100"
                      )}
                      onClick={() => isSelected ? onRemove(user.id) : onSelect(user.id)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={cn(
                          "w-6 h-6 rounded flex items-center justify-center",
                          isSelected ? "bg-indigo-100" : "bg-slate-100"
                        )}>
                          <UserIcon className={cn("w-3 h-3", isSelected ? "text-indigo-600" : "text-slate-500")} />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm truncate leading-none mb-0.5">{user.full_name || user.email}</span>
                          <span className="text-[10px] text-slate-400 truncate leading-none">{user.email}</span>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  );
                })
              ) : (
                <div className="px-2 py-4 text-center text-xs text-slate-400">
                  No users found
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-[10px] text-slate-500">
        Selecting a team will automatically add all of its members to the selection.
      </p>
    </div>
  );
}
