import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { 
  Bell, 
  CheckCheck, 
  Clock, 
  ExternalLink,
  MessageSquare,
  Info
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationPopover() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications/');
      return response.data as Notification[];
    },
    // Poll every minute for new notifications
    refetchInterval: 60000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.put(`/notifications/${id}`, { is_read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return api.post('/notifications/mark-all-as-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const getIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'unblocked':
        return <CheckCheck className="w-4 h-4 text-emerald-500" />;
      default:
        return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-900 transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ring-2 ring-white animate-in zoom-in duration-300">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 overflow-hidden" align="end">
        <div className="flex items-center justify-between p-4 border-b bg-slate-50/50">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs px-2 gap-1.5 hover:bg-slate-200"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        
        <div className="max-h-[400px] overflow-y-auto divide-y">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : notifications && notifications.length > 0 ? (
            notifications.map((n) => (
              <div 
                key={n.id} 
                className={cn(
                  "p-4 transition-colors hover:bg-slate-50 relative group",
                  !n.is_read && "bg-primary/5 hover:bg-primary/10"
                )}
                onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
              >
                {!n.is_read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-xs font-semibold truncate",
                        !n.is_read ? "text-slate-900" : "text-slate-600"
                      )}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                      {n.message}
                    </p>
                    {n.link && (
                      <Link 
                        to={n.link}
                        className="inline-flex items-center gap-1 text-[10px] text-primary font-medium hover:underline mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Details
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-900">All caught up!</p>
              <p className="text-xs text-slate-500 mt-1">No new notifications for you.</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
