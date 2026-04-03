import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap,
  LayoutDashboard,
  Users,
  FolderOpen,
  Award,
  User,
  LogOut,
} from 'lucide-react';

interface DashboardSidebarProps {
  onLogout: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Zap, label: 'Quick Connect', path: '/quick-connect' },
  { icon: Users, label: 'Friends', path: '/friends' },
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: Award, label: 'Credits', path: '/credits' },
];

// Bottom nav for mobile/tablet — Profile added next to Projects
const mobileNavItems = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: Zap, label: 'Connect', path: '/quick-connect' },
  { icon: Users, label: 'Friends', path: '/friends' },
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function DashboardSidebar({ onLogout }: DashboardSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[68px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col items-center py-4 z-40">
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
                {isActive && (
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-1 h-6 bg-pairon-accent rounded-r-full" />
                )}
                <Icon className="w-5 h-5" />
                <span className="absolute left-full ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions — Profile + Logout */}
        <div className="flex flex-col items-center gap-1 w-full px-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigate('/profile')}
            title="Profile"
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors group relative
              ${location.pathname === '/profile'
                ? 'bg-pairon-accent/10 text-pairon-accent'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
          >
            <User className="w-5 h-5" />
            <span className="absolute left-full ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              Profile
            </span>
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

      {/* Mobile bottom nav — visible only on mobile/tablet */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-1">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors
                  ${isActive ? 'text-pairon-accent' : 'text-gray-400'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-pairon-accent rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
