import * as React from "react";
import { Check, ChevronsUpDown, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface RichDropdownItem {
  id: string;
  label: string;
  color?: string | null;
  icon?: React.ReactNode;
}

interface RichDropdownProps {
  items: RichDropdownItem[];
  selectedValues: string[];
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  multi?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function RichDropdown({
  items,
  selectedValues,
  onSelect,
  onRemove,
  placeholder = "Select item...",
  searchPlaceholder = "Search...",
  emptyText = "No items found.",
  multi = false,
  isLoading = false,
  className,
}: RichDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchPlaceholder] = React.useState("");

  const filteredItems = React.useMemo(() => {
    if (!searchQuery) return items;
    return items.filter((item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  const selectedItems = React.useMemo(() => {
    return items.filter((item) => selectedValues.includes(item.id));
  }, [items, selectedValues]);

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-10 px-3 py-2"
            disabled={isLoading}
          >
            <div className="flex flex-wrap gap-1 items-center">
              {selectedItems.length > 0 ? (
                multi ? (
                  selectedItems.map((item) => (
                    <Badge
                      key={item.id}
                      variant="secondary"
                      className="text-[10px] font-bold gap-1 pr-1"
                      style={item.color ? { borderLeft: `3px solid ${item.color}` } : {}}
                    >
                      {item.label}
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-slate-200 p-0.5"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemove ? onRemove(item.id) : onSelect(item.id);
                        }}
                      >
                        <X className="h-2 w-2 text-muted-foreground" />
                      </span>
                    </Badge>
                  ))
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedItems[0].color && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: selectedItems[0].color }}
                      />
                    )}
                    <span className="text-sm font-medium">{selectedItems[0].label}</span>
                  </div>
                )
              ) : (
                <span className="text-muted-foreground text-sm font-normal">{placeholder}</span>
              )}
            </div>
            {isLoading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex flex-col h-full max-h-[300px]">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchPlaceholder(e.target.value)}
                className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none border-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {filteredItems.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {emptyText}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                      selectedValues.includes(item.id) && "bg-slate-50 font-bold"
                    )}
                    onClick={() => {
                      onSelect(item.id);
                      if (!multi) setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {item.color && (
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                      {item.icon && <span className="shrink-0">{item.icon}</span>}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {selectedValues.includes(item.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
