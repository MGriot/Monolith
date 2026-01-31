import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Calendar as CalendarIcon, 
  GanttChart, 
  LogOut, 
  Settings,
  User as UserIcon,
  Users,
  Plus,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NotificationPopover from './notification-popover';
import TaskCreateDialog from './task-create-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: FolderKanban, label: 'Projects', href: '/projects' },
  { icon: CalendarIcon, label: 'Calendar', href: '/calendar' },
  { icon: GanttChart, label: 'Roadmap', href: '/roadmap' },
  { icon: Users, label: 'Team', href: '/users' },
];

export default function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isTaskCreateOpen, setIsTaskCreateOpen] = useState(false);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path === '/projects') return 'Projects';
    if (path.startsWith('/projects/')) return 'Project Details';
    if (path === '/calendar') return 'Calendar';
    if (path === '/roadmap') return 'Roadmap';
    if (path === '/users') return 'Team Management';
    return path.substring(1);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">M</div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Monolith</h1>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
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
            className="w-full justify-start text-slate-600 hover:text-slate-900 gap-3 h-10 px-3"
            onClick={() => navigate('/settings')}
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Settings
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 gap-3 h-10 px-3"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0 z-10 shadow-sm shadow-slate-100">
          <div className="flex items-center gap-6 flex-1">
            <h2 className="text-sm font-semibold text-slate-900 capitalize">
              {getPageTitle()}
            </h2>
            <div className="hidden md:flex items-center bg-slate-100 border-none rounded-full px-3 py-1.5 gap-2 w-64">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="bg-transparent border-none text-xs focus:ring-0 w-full placeholder:text-slate-400"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" className="h-8 w-8 rounded-full shadow-md shadow-primary/20">
                  <Plus className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="flex flex-col gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="justify-start gap-2 text-xs font-medium"
                    onClick={() => {
                      navigate('/projects?create=true');
                    }}
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
                  <Button variant="ghost" size="sm" className="justify-start gap-2 text-xs font-medium text-slate-400 cursor-not-allowed">
                    <Users className="w-3.5 h-3.5" />
                    Invite User
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <NotificationPopover />
            <div className="h-6 w-[1px] bg-slate-200 mx-1" />
            <div className="flex items-center gap-3 pl-1">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-bold text-slate-900 leading-none">{user?.full_name || 'User'}</p>
                <p className="text-[9px] text-slate-500 leading-none mt-1">{user?.email}</p>
              </div>
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 shrink-0">
                <UserIcon className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scroll-smooth">
          {children}
        </main>
      </div>
      <TaskCreateDialog open={isTaskCreateOpen} onOpenChange={setIsTaskCreateOpen} />
    </div>
  );
}