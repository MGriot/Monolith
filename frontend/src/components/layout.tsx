import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import {
  LayoutDashboard,
  Bell,
  FolderKanban,
  Calendar as CalendarIcon,
  LogOut,
  Settings,
  Users,
  Plus,
  Database,
  Copy,
  CheckSquare,
  BookOpen,
  Archive,
  Menu,
  X,
  Search,
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UserAvatar } from './ui/user-avatar';
import NotificationPopover from './notification-popover';
import TaskCreateDialog from './task-create-dialog';
import CommandPalette from './command-palette';
import ShortcutSheet from './shortcut-sheet';
import { INITIAL_CHORD, isPaletteShortcut, stepShortcut, type ChordState } from '@/lib/shortcuts';
import { useTitle } from '@/context/title-context';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isTaskCreateOpen, setIsTaskCreateOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { title, icon: DisplayIcon, actions } = useTitle();

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const chordRef = useRef<ChordState>(INITIAL_CHORD);

  // Global shortcuts: Ctrl/Cmd+K toggles the palette anywhere; single keys are ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        setIsPaletteOpen((o) => !o);
        return;
      }
      const { state, action } = stepShortcut(chordRef.current, e, e.target as HTMLElement | null, Date.now());
      chordRef.current = state;
      if (!action) return;
      e.preventDefault();
      if (action.type === 'go') navigate(action.to);
      else if (action.type === 'create-task') setIsTaskCreateOpen(true);
      else setIsHelpOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const filteredNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Bell, label: 'Updates', href: '/updates' },
    { icon: FolderKanban, label: 'Projects', href: '/projects' },
    { icon: CheckSquare, label: 'Tasks', href: '/tasks' },
    { icon: Lightbulb, label: 'Ideas', href: '/ideas' },
    { icon: CalendarIcon, label: 'Schedule', href: '/schedule' },
    { icon: Archive, label: 'Archive', href: '/archive' },
    { icon: Copy, label: 'Templates', href: '/templates' },
    { icon: BookOpen, label: 'Workflows', href: '/workflows' },
    { icon: Users, label: 'Teams', href: '/teams' },
    ...(user?.is_superuser ? [
      { icon: Users, label: 'Team Members', href: '/users' },
      { icon: Database, label: 'Metadata', href: '/admin/metadata' }
    ] : []),
  ];

  const getPageInfo = () => {
    const path = location.pathname;
    let item = filteredNavItems.find(i => i.href === path);

    // Fallback for nested routes
    if (!item && path !== '/') {
      item = filteredNavItems.find(i => i.href !== '/' && path.startsWith(i.href));
    }

    if (path === '/') return { icon: LayoutDashboard, label: 'Overview' };
    if (path.startsWith('/projects/')) return { icon: FolderKanban, label: 'Project Details' };
    if (path === '/settings') return { icon: Settings, label: 'Settings' };

    return item ? { icon: item.icon, label: item.label } : { icon: LayoutDashboard, label: path.substring(1) };
  };

  const pageInfo = getPageInfo();
  const displayTitle = title || pageInfo.label;
  const FinalIcon = DisplayIcon || pageInfo.icon;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-all"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-300 lg:static lg:translate-x-0",
        !isMobileMenuOpen && "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">M</div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight text-nowrap">Monolith</h1>
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-slate-400"
            aria-label="Close menu"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-400")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-1 bg-slate-50/50">
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-600 hover:text-slate-900 gap-3 h-10 px-3 font-medium"
            onClick={() => navigate('/settings')}
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 gap-3 h-10 px-3 font-medium"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 flex-shrink-0 z-10 shadow-sm shadow-slate-100">
          <div className="flex items-center gap-3 flex-1 min-w-0">
             <Button 
               variant="ghost" 
               size="icon" 
               className="lg:hidden mr-1 text-slate-500"
               aria-label="Open menu"
               onClick={() => setIsMobileMenuOpen(true)}
             >
               <Menu className="w-5 h-5" />
             </Button>
             
             {/* Global search: opens the command palette */}
             <button
               type="button"
               onClick={() => setIsPaletteOpen(true)}
               aria-label="Open command palette"
               aria-haspopup="dialog"
               className="hidden md:flex h-9 w-full max-w-md items-center gap-2 rounded-md bg-slate-50 px-3 text-left text-sm text-slate-400 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
             >
               <Search className="h-4 w-4" aria-hidden />
               <span className="flex-1 truncate">Search projects, tasks, ideas...</span>
               <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>
             </button>
             <Button
               variant="ghost"
               size="icon"
               className="md:hidden text-slate-500"
               aria-label="Search"
               onClick={() => setIsPaletteOpen(true)}
             >
               <Search className="w-5 h-5" />
             </Button>

             {/* Mobile Title */}
             <div className="flex items-center gap-2 md:hidden">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">{displayTitle}</h1>
             </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden lg:flex items-center gap-3 mr-4">
                {FinalIcon && <FinalIcon className="w-4 h-4 text-primary" />}
                <h1 className="text-sm font-bold text-slate-600 tracking-tight whitespace-nowrap">{displayTitle}</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 mr-1 sm:mr-2">
                {actions}
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" aria-label="Create new" className="h-8 w-8 rounded-full shadow-md shadow-primary/20 shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 text-xs font-medium"
                    onClick={() => navigate('/projects?create=true')}
                  >
                    <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
                    New Project
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 text-xs font-medium"
                    onClick={() => setIsTaskCreateOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-400" />
                    New Task
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <NotificationPopover />
            <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
            <div className="flex items-center gap-3 pl-1">
              <div className="text-right hidden md:block">
                <p className="text-[11px] font-bold text-slate-900 leading-none">{user?.full_name || 'User'}</p>
                <p className="text-[9px] text-slate-500 leading-none mt-1">{user?.email}</p>
              </div>
              <UserAvatar user={user} className="w-8 h-8" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
      
      <TaskCreateDialog open={isTaskCreateOpen} onOpenChange={setIsTaskCreateOpen} />
      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        onCreateTask={() => setIsTaskCreateOpen(true)}
        onShowHelp={() => setIsHelpOpen(true)}
      />
      <ShortcutSheet open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}
