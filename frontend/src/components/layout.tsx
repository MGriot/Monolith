import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Calendar as CalendarIcon, 
  GanttChart, 
  LogOut, 
  Bell,
  Settings,
  User as UserIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: FolderKanban, label: 'Projects', href: '/projects' },
  { icon: CalendarIcon, label: 'Calendar', href: '/calendar' },
  { icon: GanttChart, label: 'Roadmap', href: '/roadmap' },
];

export default function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black">M</div>
            Monolith
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-1">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-slate-600 hover:text-slate-900 gap-3"
            onClick={() => navigate('/settings')}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 gap-3"
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium text-slate-500 capitalize">
              {location.pathname === '/' ? 'Overview' : location.pathname.substring(1)}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-slate-500">
              <Bell className="w-5 h-5" />
            </Button>
            <div className="h-8 w-[1px] bg-slate-200 mx-2" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-slate-900">{user?.full_name || 'User'}</p>
                <p className="text-[10px] text-slate-500">{user?.email}</p>
              </div>
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                <UserIcon className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
