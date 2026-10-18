import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Check, Plus, Search, Users as TeamIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Eyebrow } from "@/components/ui/section";
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

/**
 * One control for picking people: the chip box is the trigger. Picking a team adds all of its members;
 * a team whose members are all selected shows as checked and can be removed in one click.
 */
export function AssigneeSelector({
  selectedValues,
  onSelect,
  onRemove,
  isLoading: externalLoading,
  placeholder = "Nobody yet",
  className,
  label,
}: AssigneeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users/')).data as User[],
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => (await api.get('/teams/')).data as Team[],
  });

  const isLoading = externalLoading || usersLoading || teamsLoading;
  const q = search.trim().toLowerCase();

  const filteredTeams = useMemo(
    () => (teams || []).filter(t => (t.members?.length ?? 0) > 0 && t.name.toLowerCase().includes(q)),
    [teams, q]
  );

  const filteredUsers = useMemo(
    () => (users || []).filter(u => `${u.full_name || ''} ${u.email}`.toLowerCase().includes(q)),
    [users, q]
  );

  const selectedUsers = useMemo(
    () => (users || []).filter(u => selectedValues.includes(u.id)),
    [users, selectedValues]
  );

  const teamFullySelected = (team: Team) => team.members.every(m => selectedValues.includes(m.id));

  const toggleTeam = (team: Team) => {
    if (teamFullySelected(team)) team.members.forEach(m => onRemove(m.id));
    else team.members.forEach(m => { if (!selectedValues.includes(m.id)) onSelect(m.id); });
  };

  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
        <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm",
            open && "ring-1 ring-ring"
          )}
        >
          {selectedUsers.map((user) => (
            <span key={user.id} className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border bg-subtle pl-0.5 pr-1 text-xs">
              <UserAvatar user={user} className="h-5 w-5 border-0" />
              <span className="truncate">{user.full_name || user.email}</span>
              <button
                type="button"
                onClick={() => onRemove(user.id)}
                className="rounded-full p-0.5 text-fg-faint transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${user.full_name || user.email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isLoading}
              className={cn(
                "inline-flex h-6 min-w-[5rem] flex-1 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selectedUsers.length === 0 && "-ml-1"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {isLoading ? "Loading…" : selectedUsers.length === 0 ? placeholder : "Add"}
            </button>
          </PopoverTrigger>
        </div>
        </PopoverAnchor>

        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-fg-faint" />
            <input
              autoFocus
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search people or teams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto p-1">
            {filteredTeams.length > 0 && (
              <div className="pb-1">
                <div className="flex items-baseline justify-between px-2 pb-1 pt-2">
                  <Eyebrow>Teams</Eyebrow>
                  <span className="text-[11px] text-fg-faint">adds every member</span>
                </div>
                {filteredTeams.map((team) => {
                  const all = teamFullySelected(team);
                  return (
                    <button
                      type="button"
                      key={team.id}
                      onClick={() => toggleTeam(team)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                      title={team.members.map(m => m.full_name || m.email).join(", ")}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
                        <TeamIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
                      <span className="text-xs tabular-nums text-fg-faint">{team.members.length}</span>
                      {all && <Check className="h-3.5 w-3.5 text-info" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={cn(filteredTeams.length > 0 && "border-t pt-1")}>
              <div className="px-2 pb-1 pt-2"><Eyebrow>People</Eyebrow></div>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const isSelected = selectedValues.includes(user.id);
                  return (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => (isSelected ? onRemove(user.id) : onSelect(user.id))}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                        isSelected ? "bg-info-soft" : "hover:bg-muted"
                      )}
                    >
                      <UserAvatar user={user} className="h-6 w-6" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm leading-tight">{user.full_name || user.email}</span>
                        <span className="block truncate text-[11px] leading-tight text-fg-faint">{user.email}</span>
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-info" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-2 py-4 text-center text-xs text-fg-faint">Nobody matches “{search}”</div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
