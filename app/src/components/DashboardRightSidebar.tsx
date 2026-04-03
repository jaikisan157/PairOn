import { useNavigate } from 'react-router-dom';
import { Zap, MessageCircle, FolderOpen, Users } from 'lucide-react';

interface DashboardRightSidebarProps {
  onlineCount: number;
  totalDmUnread: number;
}

export function DashboardRightSidebar({ onlineCount, totalDmUnread }: DashboardRightSidebarProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Who's Online */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
            {onlineCount} Online Now
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Developers ready to collaborate
        </p>
        <button
          onClick={() => navigate('/quick-connect')}
          className="w-full text-sm text-pairon-accent font-medium hover:underline text-left"
        >
          Browse collaborators →
        </button>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">
          Quick Actions
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => navigate('/quick-connect')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-pairon-accent/10 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-pairon-accent" />
            </div>
            Quick Connect
          </button>
          <button
            onClick={() => navigate('/messages')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="relative w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-blue-500" />
              {totalDmUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {totalDmUnread}
                </span>
              )}
            </div>
            Messages
          </button>
          <button
            onClick={() => navigate('/friends')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-purple-500" />
            </div>
            Friends
          </button>
          <button
            onClick={() => navigate('/projects')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-4 h-4 text-yellow-500" />
            </div>
            My Projects
          </button>
        </div>
      </div>
    </div>
  );
}
