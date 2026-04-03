import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';

interface RecentCollaborator {
  partnerId: string;
  partnerName: string;
  partnerReputation: number;
  mode: string;
  startedAt: string;
}

interface DashboardRightSidebarProps {
  onlineCount: number;
  sessionHistory: any[];
}

export function DashboardRightSidebar({ onlineCount, sessionHistory }: DashboardRightSidebarProps) {
  const navigate = useNavigate();

  // Extract unique recent collaborators from session history
  const recentCollaborators: RecentCollaborator[] = [];
  const seen = new Set<string>();
  for (const sess of sessionHistory) {
    if (sess.partnerId && !seen.has(sess.partnerId)) {
      seen.add(sess.partnerId);
      recentCollaborators.push({
        partnerId: sess.partnerId,
        partnerName: sess.partnerName || 'Unknown',
        partnerReputation: sess.partnerReputation || 0,
        mode: sess.mode,
        startedAt: sess.startedAt,
      });
    }
    if (recentCollaborators.length >= 5) break;
  }

  // Relative date helper
  const relativeDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    return new Date(dateStr).toLocaleDateString();
  };

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

      {/* Recent Collaborators */}
      {recentCollaborators.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">
            Recent Collaborators
          </h3>
          <div className="space-y-2.5">
            {recentCollaborators.map((collab) => {
              const initial = collab.partnerName.charAt(0).toUpperCase();
              const colors = ['bg-green-500/10 text-green-600', 'bg-blue-500/10 text-blue-600', 'bg-purple-500/10 text-purple-600', 'bg-orange-500/10 text-orange-600', 'bg-pink-500/10 text-pink-600'];
              const colorIdx = collab.partnerName.charCodeAt(0) % colors.length;

              return (
                <button
                  key={collab.partnerId}
                  onClick={() => navigate(`/users/${collab.partnerId}`)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs ${colors[colorIdx]}`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-pairon-accent transition-colors">
                      {collab.partnerName}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Star className="w-3 h-3 text-yellow-500" />
                      <span>{collab.partnerReputation}</span>
                      <span>·</span>
                      <span>{relativeDate(collab.startedAt)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
