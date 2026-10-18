import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNotificationList, useNotificationMutations, useUnreadCount } from "@/hooks/use-notifications";
import { notificationKeys } from "@/lib/notifications";
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
import { toast } from "sonner";

export default function NotificationPopover() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  const [open, setOpen] = useState(false);
  // The bell only needs a COUNT; the list is fetched when the popover is opened.
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifications, isLoading } = useNotificationList({ unreadOnly: false, type: '', limit: 20 }, open);
  const { setRead, markAllRead } = useNotificationMutations();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Note: In development inside Docker, host might need to point to the backend container or proxy
    // But since Vite proxies /api, and usually WebSockets are separate, 
    // we try to reach the backend directly or via the same host if Nginx handles it.
    // Given vite.config.ts proxies /api, we'll try to reach the backend at /api/v1/notifications/ws/
    
    const wsUrl = `${protocol}//${host}/api/v1/notifications/ws`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    let pingInterval: any;

    socket.onmessage = (event) => {
      try {
        if (event.data === 'pong') return;
        const message = JSON.parse(event.data);
        if (message.type === 'auth_ok') return;
        if (message.type === 'new_notification') {
          toast.info(message.data.title, {
            description: message.data.message,
          });
          queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        }
      } catch (e) {
        // Silently ignore non-JSON
      }
    };

    socket.onopen = () => {
      // Authenticate with the first frame so the JWT never appears in a URL / access log.
      socket.send(JSON.stringify({ type: 'auth', token }));
      pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send('ping');
        }
      }, 30000);
    };

    socket.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
    };

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      socket.close();
    };
  }, [queryClient]);

  const getIcon = (type: string | null) => {
    switch (type) {
      case 'assignment':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'unblocked':
        return <CheckCheck className="w-4 h-4 text-emerald-500" />;
      default:
        return <Info className="w-4 h-4 text-fg-faint" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} className="relative text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-2 ring-background animate-in zoom-in duration-300">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 overflow-hidden" align="end">
        <div className="flex items-center justify-between p-4 border-b bg-subtle/50">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs px-2 gap-1.5 hover:bg-border"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
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
                  "p-4 transition-colors hover:bg-subtle relative group",
                  !n.is_read && "bg-primary/5 hover:bg-primary/10"
                )}
                onClick={() => !n.is_read && setRead.mutate({ id: n.id, isRead: true })}
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
                        !n.is_read ? "text-foreground" : "text-fg-soft"
                      )}>
                        {n.title}
                      </p>
                      <span className="text-[11px] text-fg-faint whitespace-nowrap flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
                      {n.message}
                    </p>
                    {n.link && (
                      <Link 
                        to={n.link}
                        className="inline-flex items-center gap-1 text-[11px] text-primary font-medium hover:underline mt-1"
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
              <div className="w-12 h-12 bg-subtle rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-fg-ghost" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">No new notifications for you.</p>
            </div>
          )}
        </div>
        <div className="border-t p-2 text-center">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open notification centre
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
