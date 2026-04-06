import { GlobalThemeToggle } from '@/components/GlobalThemeToggle';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Coins,
  Star,
  Trophy,
  Target,
  Calendar,
  ArrowRight,
  LogOut,
  History,
  Sun,
  Moon,
  MessageCircle,
  Handshake,
  CheckCircle,
  XCircle,
  Shield,
  AlertTriangle,
  Clock,
  Play,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/lib/socket';
import { useTheme } from '@/context/ThemeContext';
import { MATCH_MODES, CHALLENGE_RULES } from '@/data/constants';
import { formatDuration } from '@/lib/utils';
import { api } from '@/lib/api';

import { playMatchSound } from '@/lib/audio';
import { MatchConfirmModal } from '@/components/MatchConfirmModal';
import type { MatchFoundData } from '@/components/MatchConfirmModal';
import type { MatchMode } from '@/types';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { DashboardRightSidebar } from '@/components/DashboardRightSidebar';
import { NotificationBell } from '@/components/NotificationBell';

const iconMap = {
  zap: Zap,
  target: Target,
  calendar: Calendar,
};

export function DashboardPage() {
  const [selectedMode, setSelectedMode] = useState<MatchMode | null>(null);
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Rules modal
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesAgreed, setRulesAgreed] = useState(false);

  // Sidebar expanded/collapsed (persisted)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem('pairon_sidebar');
    return saved !== null ? saved === 'expanded' : true; // default expanded
  });

  const toggleSidebar = () => {
    setSidebarExpanded(prev => {
      const next = !prev;
      localStorage.setItem('pairon_sidebar', next ? 'expanded' : 'collapsed');
      return next;
    });
  };

  // Searching state
  const [isSearching, setIsSearching] = useState(false);
  const [matchTimeout, setMatchTimeout] = useState(false);
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  // Online collaborators count
  const [onlineCount, setOnlineCount] = useState(0);

  // Active long-running sessions (24hr/7day)
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Session history
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);



  // Match confirmation
  const [pendingMatchData, setPendingMatchData] = useState<MatchFoundData | null>(null);
  const [waitingForPartner, setWaitingForPartner] = useState(false);

  // Session filter
  const [sessionFilter, setSessionFilter] = useState<'all' | 'completed' | 'skipped' | 'abandoned'>('all');

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


  // Fetch online collaborator count
  useEffect(() => {
    const fetchCount = () => api.getOnlineCount().then(d => setOnlineCount(d.onlineCount)).catch(() => { });
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  // On mount: immediately restore solo session from localStorage so the
  // "Continue" card appears before the server's cleanup response arrives.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('challenge_session');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.isSolo && data.sessionId) {
          setActiveSessions([{
            sessionId: data.sessionId,
            partnerId: data.partnerId || '',
            partnerName: data.partnerName || 'Solo',
            partnerReputation: data.partnerReputation || 0,
            mode: data.mode || 'sprint',
            projectIdea: data.projectIdea || null,
            endsAt: data.endsAt || new Date(Date.now() + 86400000).toISOString(),
            startedAt: data.startedAt || new Date().toISOString(),
            tasksDone: 0,
            tasksTotal: 0,
            messagesCount: (data.messages || []).length,
            isSolo: true,
          }]);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Listen for challenge events
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    // Cleanup expired sessions when landing on dashboard
    socket.emit('dashboard:cleanup');

    // Fetch session history
    socket.emit('dashboard:get-history');

    // Re-fetch history whenever user tabs back to this page (real-time status updates)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        socket.emit('dashboard:cleanup');
        socket.emit('dashboard:get-history');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Receive active long-running sessions after cleanup
    socket.on('dashboard:cleanup-done', (data: { activeSessions: any[] }) => {
      // Always check for a local solo session first
      const getSoloSessionEntry = () => {
        try {
          const raw = localStorage.getItem('challenge_session');
          if (!raw) return null;
          const saved = JSON.parse(raw);
          if (!saved.isSolo || !saved.sessionId) return null;
          return {
            sessionId: saved.sessionId,
            partnerId: saved.partnerId || '',
            partnerName: saved.partnerName || 'Solo',
            partnerReputation: saved.partnerReputation || 0,
            mode: saved.mode || 'sprint',
            projectIdea: saved.projectIdea || null,
            endsAt: saved.endsAt || new Date(Date.now() + 86400000).toISOString(),
            startedAt: saved.startedAt || new Date().toISOString(),
            tasksDone: 0,
            tasksTotal: 0,
            messagesCount: (saved.messages || []).length,
            isSolo: true,
          };
        } catch { return null; }
      };

      if (data?.activeSessions?.length > 0) {
        const first = data.activeSessions[0];
        // Preserve isSolo flag if it was already set locally
        const existingRaw = localStorage.getItem('challenge_session');
        const existingIsSolo = existingRaw ? (() => { try { return JSON.parse(existingRaw).isSolo; } catch { return false; } })() : false;
        localStorage.setItem('challenge_session', JSON.stringify({ ...first, savedAt: Date.now(), isSolo: existingIsSolo || false }));
        setActiveSessions(data.activeSessions);
      } else {
        // Server returned no active sessions — check if we have a local solo session
        const soloEntry = getSoloSessionEntry();
        if (soloEntry) {
          // Keep the solo session alive and visible on the dashboard
          setActiveSessions([soloEntry]);
          // Don't touch localStorage — it's already correct with isSolo: true
        } else {
          setActiveSessions([]);
          localStorage.removeItem('challenge_session');
        }
      }
    });

    // Receive session history
    socket.on('dashboard:history', (history: any[]) => {
      setSessionHistory(history);
    });

    // Match found — show confirmation popup
    socket.on('challenge:match-found', (data: MatchFoundData) => {
      console.log('[Dashboard] Match found:', data);
      playMatchSound();
      setPendingMatchData(data);
      setWaitingForPartner(false);
    });

    // Partner waiting / both accepted — real session incoming via challenge:matched
    socket.on('challenge:waiting-for-partner', () => {
      setWaitingForPartner(true);
    });

    // Match declined or timed out
    socket.on('challenge:match-declined', (data: { reason: string; message: string }) => {
      setPendingMatchData(null);
      setWaitingForPartner(false);
      setIsSearching(false); // stop spinner — user is shown re-queue notification
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
      alert(data.message ?? 'Match cancelled. Searching again...');
    });

    // Server re-queued user (after other declined) — resume searching
    socket.on('challenge:requeued', (data: { mode: string }) => {
      console.log('[Dashboard] Re-queued for mode:', data.mode);
      setIsSearching(true);
    });

    // Matched — save data and navigate
    socket.on('challenge:matched', (data: any) => {
      setIsSearching(false);
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
      setMatchTimeout(false);

      // Save session to localStorage for CollaborationPage to pick up
      localStorage.setItem('challenge_session', JSON.stringify({
        sessionId: data.sessionId,
        matchId: data.matchId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        partnerReputation: data.partnerReputation || 0,
        mode: data.mode,
        projectIdea: data.projectIdea,
        endsAt: data.endsAt,
        startedAt: data.startedAt,
        messages: data.messages || [],
        tasks: data.tasks || [],
        savedAt: Date.now(),
      }));

      playMatchSound();
      navigate('/collaborate');
    });

    // Waiting — still searching
    socket.on('challenge:waiting', () => {
      // No-op, keep searching
    });

    // Error
    socket.on('challenge:error', (msg: string) => {
      setIsSearching(false);
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
      alert(msg);
    });

    // Cancelled
    socket.on('challenge:cancelled', () => {
      setIsSearching(false);
    });

    // Note: proposal acceptance now emits 'challenge:matched' which is handled above

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (socket) {
        socket.removeAllListeners('challenge:match-found');
        socket.removeAllListeners('challenge:matched');
        socket.removeAllListeners('challenge:waiting');
        socket.removeAllListeners('challenge:waiting-for-partner');
        socket.removeAllListeners('challenge:match-declined');
        socket.removeAllListeners('challenge:requeued');
        socket.removeAllListeners('challenge:error');
        socket.removeAllListeners('challenge:cancelled');
        socket.removeAllListeners('dashboard:cleanup-done');
        socket.removeAllListeners('dashboard:history');
      }
    };
  }, [navigate]);

  // Matchmaking timeout (60 seconds)
  useEffect(() => {
    if (isSearching) {
      setMatchTimeout(false);
      matchTimerRef.current = setTimeout(() => {
        setMatchTimeout(true);
        setIsSearching(false);
        socketService.getSocket()?.emit('challenge:cancel');
      }, 60000);
    } else {
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    }
    return () => {
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    };
  }, [isSearching]);

  const handleStartMatching = () => {
    if (!selectedMode) return;
    // Block if user has an active session
    if (activeSessions.length > 0) {
      const sess = activeSessions[0];
      const modeLabels: Record<string, string> = { sprint: 'Sprint', challenge: '24-Hour Challenge', build: '7-Day Build' };
      const confirmed = window.confirm(
        `You already have an active ${modeLabels[sess.mode] || 'session'} with ${sess.partnerName}.\n\nFinish or leave your current session before starting a new one.\n\nClick OK to go to your active session.`
      );
      if (confirmed) {
        navigate('/collaborate');
      }
      return;
    }
    // Always show rules modal before matching
    setShowRulesModal(true);
    setRulesAgreed(false);
  };

  const handleConfirmAndStart = () => {
    if (!selectedMode || !rulesAgreed) return;
    setShowRulesModal(false);
    setMatchTimeout(false);
    setIsSearching(true);
    socketService.getSocket()?.emit('challenge:find', { mode: selectedMode });
  };

  const handleCancelSearch = () => {
    socketService.getSocket()?.emit('challenge:cancel');
    setIsSearching(false);
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
  };

  const stats = [
    { label: 'Credits', value: user?.credits || 0, icon: Coins, color: 'text-pairon-accent' },
    { label: 'Reputation', value: user?.reputation || 0, icon: Star, color: 'text-yellow-500' },
    { label: 'Projects', value: user?.completedProjects || 0, icon: Trophy, color: 'text-purple-500' },
  ];

  const handleMatchAccept = (pendingMatchId: string) => {
    socketService.getSocket()?.emit('challenge:confirm', { pendingMatchId });
    setWaitingForPartner(true);
    setPendingMatchData(null);
  };

  const handleMatchDecline = (pendingMatchId: string) => {
    socketService.getSocket()?.emit('challenge:decline', { pendingMatchId });
    setPendingMatchData(null);
    setWaitingForPartner(false);
    setIsSearching(false);
  };

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">

      {/* Match confirmation modal */}
      <MatchConfirmModal
        data={pendingMatchData}
        onAccept={handleMatchAccept}
        onDecline={handleMatchDecline}
      />

      {/* Waiting for partner overlay */}
      {waitingForPartner && !pendingMatchData && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99989,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{
            background: '#1a1d2e', borderRadius: 20, padding: '32px 40px',
            textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              width: 44, height: 44, border: '3px solid #10b981',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            <p style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: 0 }}>Waiting for partner...</p>
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>They accepted — connecting now</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Sidebar Navigation */}
      <DashboardSidebar
        onLogout={() => setShowLogoutConfirm(true)}
        expanded={sidebarExpanded}
        onToggle={toggleSidebar}
      />

      {/* Top Header Bar (shifted right for sidebar) */}
      <header className={`fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-30 transition-all duration-300 ${sidebarExpanded ? 'lg:left-[220px]' : 'lg:left-[68px]'}`}>
        <div className="px-4 sm:px-6 flex items-center justify-between h-14">
          <h2 className="font-display font-bold text-lg text-gray-900 dark:text-white">
            Dashboard
          </h2>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-pairon-accent-light dark:bg-pairon-accent/10 rounded-full">
              <Coins className="w-4 h-4 text-pairon-accent" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {user?.credits} credits
              </span>
            </div>
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
            <div className="flex items-center gap-2"><GlobalThemeToggle /><NotificationBell /></div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="sm:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
              title="Log out"
            >
              <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-red-500" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content — offset for sidebar + topbar */}
      <main className={`pt-14 pb-16 lg:pb-0 transition-all duration-300 ${sidebarExpanded ? 'lg:ml-[220px]' : 'lg:ml-[68px]'}`}>
        <div className="flex">
          {/* Left: Main content area */}
          <div className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 py-4 lg:py-6 max-w-4xl">
          {/* Welcome */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="font-display text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {(() => {
                const hour = new Date().getHours();
                const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
                return `${greeting}, ${user?.name?.split(' ')[0]}! 👋`;
              })()}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {activeSessions.length > 0
                ? 'You have an active session in progress ⚡'
                : 'Ready to find your next collaborator?'}
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-3 gap-2 sm:gap-4 mb-6"
          >
            {stats.map((stat) => {
              const topBorderColor = stat.label === 'Credits' ? 'bg-green-500' : stat.label === 'Reputation' ? 'bg-yellow-500' : 'bg-purple-500';
              const contextText = stat.label === 'Credits' ? 'Earn by completing sessions' : stat.label === 'Reputation' ? 'Complete sessions to earn' : 'View all →';
              return (
                <div
                  key={stat.label}
                  onClick={stat.label === 'Projects' ? () => navigate('/projects') : undefined}
                  className={`relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-card${stat.label === 'Projects' ? ' cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all' : ''}`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-[3px] ${topBorderColor}`} />
                  <div className="flex items-center gap-1.5 sm:gap-3 mb-1 sm:mb-2">
                    <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
                    <span className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">
                      {stat.label}
                    </span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                  <p className={`text-[9px] sm:text-xs mt-0.5 sm:mt-1 hidden sm:block ${stat.label === 'Projects' ? 'text-purple-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    {contextText}
                  </p>
                </div>
              );
            })}
          </motion.div>

          {/* Active Challenge Card (for 24hr/7day sessions) */}
          {activeSessions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-8"
            >
              {activeSessions.map((sess: any) => {
                const remaining = Math.max(0, Math.floor((new Date(sess.endsAt).getTime() - Date.now()) / 1000));
                const hours = Math.floor(remaining / 3600);
                const minutes = Math.floor((remaining % 3600) / 60);
                const modeLabels: Record<string, string> = { sprint: '3-Hour Sprint', challenge: '24-Hour Challenge', build: '7-Day Build' };
                const modeColors: Record<string, string> = { sprint: 'from-blue-500 to-blue-600', challenge: 'from-orange-500 to-orange-600', build: 'from-purple-500 to-purple-600' };

                return (
                  <div
                    key={sess.sessionId}
                    className={`relative overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-card border-2 ${sess.isSolo ? 'border-yellow-400 dark:border-yellow-500' : 'border-green-400 dark:border-green-500'}`}
                  >
                    {/* Gradient accent bar */}
                    <div className={`h-1.5 bg-gradient-to-r ${sess.isSolo ? 'from-yellow-400 to-orange-500' : modeColors[sess.mode] || 'from-green-500 to-green-600'}`} />

                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${sess.isSolo ? 'bg-yellow-500' : 'bg-green-500'}`} />
                            <span className={`text-xs font-semibold uppercase tracking-wide ${sess.isSolo ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                              {sess.isSolo ? '⚡ Solo Mode' : 'Active Session'}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {sess.projectIdea?.title || 'Untitled Project'}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {modeLabels[sess.mode]}{sess.isSolo
                              ? ' · Partner left — you can keep building'
                              : <> · with <strong>{sess.partnerName}</strong><span className="text-yellow-500 ml-1">⭐ {sess.partnerReputation}</span></>
                            }
                          </p>
                        </div>

                        <Button
                          onClick={() => navigate('/collaborate')}
                          className={`${sess.isSolo ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'} text-white shadow-lg`}
                        >
                          <Play className="w-4 h-4 mr-1 fill-current" /> Continue
                        </Button>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <Clock className="w-4 h-4 text-orange-500" />
                          <span className="font-medium">
                            {hours > 24
                              ? `${Math.floor(hours / 24)}d ${hours % 24}h remaining`
                              : `${hours}h ${minutes}m remaining`
                            }
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <ListChecks className="w-4 h-4 text-blue-500" />
                          <span className="font-medium">{sess.tasksDone}/{sess.tasksTotal} tasks done</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <MessageCircle className="w-4 h-4 text-purple-500" />
                          <span className="font-medium">{sess.messagesCount} messages</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* Match Modes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white">
                Choose your mode
              </h2>
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="font-medium">{onlineCount} online now</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {MATCH_MODES.map((mode) => {
                const Icon = iconMap[mode.icon as keyof typeof iconMap];
                const isSelected = selectedMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    onClick={() => !isSearching && setSelectedMode(mode.id)}
                    disabled={isSearching}
                    className={`p-4 sm:p-6 rounded-2xl border-2 text-left transition-all duration-200 ${isSelected
                      ? 'border-pairon-accent bg-pairon-accent-light dark:bg-pairon-accent/10 shadow-[0_0_20px_rgba(34,197,94,0.15)] scale-[1.02]'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:scale-[1.01] hover:shadow-md'
                      } ${isSearching ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${isSelected
                        ? 'bg-pairon-accent text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {mode.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {formatDuration(mode.duration)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {mode.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {isSearching ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Looking for a {MATCH_MODES.find(m => m.id === selectedMode)?.name} partner...
                </p>
                <Button variant="outline" onClick={handleCancelSearch} className="rounded-xl">
                  Cancel search
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleStartMatching}
                disabled={!selectedMode}
                className="w-full pairon-btn-primary py-4 h-auto text-base"
              >
                Start matching
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            )}

            {/* Matchmaking timeout message */}
            {matchTimeout && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl flex items-start gap-3"
              >
                <Clock className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    No collaborators available right now
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Try again in a few minutes or try a different mode.
                  </p>
                </div>
              </motion.div>
            )}

          </motion.div>



          {/* Recent Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[28px] shadow-card p-4 sm:p-8"
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2 sm:gap-3">
              <h2 className="font-display text-base sm:text-xl font-semibold text-gray-900 dark:text-white">
                Recent Sessions
              </h2>
              <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto">
                {(['all', 'completed', 'skipped', 'abandoned'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSessionFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      sessionFilter === f
                        ? 'bg-pairon-accent text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {sessionHistory.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  No sessions yet. Start matching to build your first project!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessionHistory.filter((sess: any) => {
                  if (sessionFilter === 'all') return true;
                  if (sessionFilter === 'completed') return sess.status === 'completed' || (sess.status === 'partner_skipped' && sess.submittedBy === user?.id);
                  if (sessionFilter === 'skipped') return sess.status === 'partner_skipped' && sess.submittedBy !== user?.id && sess.quitterId !== user?.id;
                  if (sessionFilter === 'abandoned') return sess.status === 'abandoned' || (sess.status === 'completed' && sess.quitterId === user?.id) || (sess.status === 'partner_skipped' && sess.quitterId === user?.id);
                  return true;
                }).map((sess: any) => {
                  const modeLabels: Record<string, string> = { sprint: 'Sprint', challenge: '24hr', build: '7-Day' };
                  const statusColors: Record<string, string> = {
                    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    abandoned: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    partner_skipped: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                    mutual_quit: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    ended: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                  };

                  // Determine display status based on who quit
                  let displayStatus = sess.status;
                  let displayLabel = '';
                  if (sess.status === 'partner_skipped') {
                    if (sess.quitterId === user?.id) {
                      displayStatus = 'abandoned';
                      displayLabel = '🚪 Abandoned';
                    } else if (sess.submittedBy === user?.id) {
                      displayStatus = 'completed';
                      displayLabel = '✅ Completed';
                    } else if (sess.submittedBy) {
                      displayStatus = 'completed';
                      displayLabel = '✅ Partner Submitted';
                    } else {
                      displayLabel = '⚠️ Partner Left';
                    }
                  } else if (sess.status === 'mutual_quit') {
                    displayLabel = '🤝 Mutual Quit';
                  } else if (sess.status === 'completed') {
                    if (sess.quitterId === user?.id) {
                      displayStatus = 'abandoned';
                      displayLabel = '🚪 Abandoned';
                    } else {
                      displayLabel = '✅ Completed';
                    }
                  } else if (sess.status === 'abandoned') {
                    displayLabel = '❌ Abandoned';
                  } else if (sess.status === 'ended') {
                    displayLabel = '⏹ Ended';
                  }

                  const isActive = sess.status === 'active' && new Date(sess.endsAt) > new Date();
                  // Don't show continue for the person who force-quit
                  const canContinue = isActive && !(sess.status === 'partner_skipped' && (sess.quitterId === user?.id || sess.submittedBy === user?.id));

                  // Color-coded left border
                  const leftBorderColor = displayStatus === 'completed' ? 'border-l-green-500' : displayStatus === 'partner_skipped' ? 'border-l-orange-500' : displayStatus === 'abandoned' ? 'border-l-red-500' : displayStatus === 'mutual_quit' ? 'border-l-yellow-500' : 'border-l-gray-500';
                  const partnerInitial = sess.partnerName?.charAt(0)?.toUpperCase() || '?';
                  const partnerColor = displayStatus === 'completed' ? 'bg-green-500/10 text-green-500' : displayStatus === 'partner_skipped' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-500/10 text-gray-400';

                  return (
                    <div
                      key={sess.sessionId}
                      className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border-l-4 border border-gray-200 dark:border-gray-700 transition-all ${leftBorderColor} ${isActive ? 'bg-green-50/50 dark:bg-green-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/30'} ${!isActive ? 'cursor-pointer' : ''}`}
                      onClick={!isActive ? () => navigate('/projects') : undefined}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Partner avatar initial */}
                        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs sm:text-sm ${partnerColor}`}>
                          {partnerInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px] sm:max-w-none">
                              {sess.projectIdea?.title || 'Untitled'}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[displayStatus] || statusColors.ended}`}>
                              {isActive ? '🟢 Active' : (displayLabel || sess.status)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {modeLabels[sess.mode]} · with{' '}
                            <span
                              className="hover:text-pairon-accent transition-colors cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/users/${sess.partnerId}`); }}
                            >{sess.partnerName}</span>
                            <span className="text-yellow-500 ml-1">⭐ {sess.partnerReputation}</span>
                            {sess.tasksTotal > 0 && <span className="ml-2">· {sess.tasksDone}/{sess.tasksTotal} tasks</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 ml-2 sm:ml-3 flex-shrink-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap" title={new Date(sess.startedAt).toLocaleString()}>
                          {relativeDate(sess.startedAt)}
                        </span>
                        {canContinue && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              localStorage.setItem('challenge_session', JSON.stringify(sess));
                              navigate('/collaborate');
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
                          >
                            <Play className="w-3 h-3 mr-1 fill-current" /> Continue
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
          </div>

          {/* Right sidebar */}
          <div className="hidden lg:block w-64 xl:w-72 flex-shrink-0 py-6 pr-4 xl:pr-6">
            <div className="sticky top-20">
              <DashboardRightSidebar
                onlineCount={onlineCount}
                sessionHistory={sessionHistory}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Pre-Challenge Rules Modal */}
      <AnimatePresence>
        {showRulesModal && selectedMode && CHALLENGE_RULES[selectedMode] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              {(() => {
                const rules = CHALLENGE_RULES[selectedMode];
                return (
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-12 h-12 bg-pairon-accent/10 rounded-xl flex items-center justify-center">
                        <Shield className="w-6 h-6 text-pairon-accent" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white">
                          {rules.title} — Rules & Commitment
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-bold ${rules.severityColor}`}>
                            {rules.severity} Severity
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{rules.durationLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Commitment */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-4">
                      <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                        📌 {rules.commitmentLevel}
                      </p>
                    </div>

                    {/* Rest Policy */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Rest Policy</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{rules.restPolicy}</p>
                    </div>

                    {/* Rules */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Rules
                      </h4>
                      <ul className="space-y-1.5">
                        {rules.rules.map((rule, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-400 mt-0.5">•</span>
                            {rule}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Warnings */}
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-5">
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        Warnings
                      </h4>
                      <ul className="space-y-1.5">
                        {rules.warnings.map((warn, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                            <span className="mt-0.5">⚠️</span>
                            {warn}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Agreement */}
                    <label className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rulesAgreed}
                        onChange={(e) => setRulesAgreed(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-pairon-accent focus:ring-pairon-accent"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        I have read and agree to the rules. I understand the commitment and consequences of leaving without permission.
                      </span>
                    </label>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowRulesModal(false)}
                        className="flex-1 rounded-xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleConfirmAndStart}
                        disabled={!rulesAgreed}
                        className="flex-1 pairon-btn-primary rounded-xl"
                      >
                        I Agree — Start Matching
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-base">Log out?</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Are you sure you want to log out of PairOn?</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); logout(); }}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Log out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
