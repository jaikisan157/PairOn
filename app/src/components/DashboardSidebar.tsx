import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap,
  LayoutDashboard,
  MessageCircle,
  Users,
  FolderOpen,
  Award,
  Settings,
  LogOut,
} from 'lucide-react';

interface DashboardSidebarProps {
  totalDmUnread: number;
  onLogout: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Zap, label: 'Quick Connect', path: '/quick-connect' },
  { icon: MessageCircle, label: 'Messages', path: '/messages', badgeKey: 'messages' },
  { icon: Users, label: 'Friends', path: '/friends' },
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: Award, label: 'Credits', path: '/credits' },
];

export function DashboardSidebar({ totalDmUnread, onLogout }: DashboardSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[68px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 z-40">
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="w-10 h-10 rounded-xl bg-pairon-accent flex items-center justify-center mb-6 hover:scale-105 transition-transform"
        title="PairOn Home"
      >
        <Zap className="w-5 h-5 text-white" />
      </button>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col items-center gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          const badge = item.badgeKey === 'messages' ? totalDmUnread : 0;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={item.label}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group
                ${isActive
                  ? 'bg-pairon-accent/10 text-pairon-accent'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-1 h-6 bg-pairon-accent rounded-r-full" />
              )}
              <Icon className="w-5 h-5" />
              {/* Notification badge */}
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-1 w-full px-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate('/profile')}
          title="Settings"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={onLogout}
          title="Log out"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
}
