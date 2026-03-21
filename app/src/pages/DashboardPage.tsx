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
  User,
  Users,
  History,
  Sun,
  Moon,
  MessageCircle,
  Handshake,
  CheckCircle,
  XCircle,
  Award,
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
import { isMobileOrTablet } from '@/lib/deviceDetect';
import { playMatchSound } from '@/lib/audio';
import type { MatchMode } from '@/types';

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

  // Searching state
  const [isSearching, setIsSearching] = useState(false);
  const [matchTimeout, setMatchTimeout] = useState(false);
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Proposals
  const [proposals, setProposals] = useState<any[]>([]);

  // Online collaborators count
  const [onlineCount, setOnlineCount] = useState(0);

  // Active long-running sessions (24hr/7day)
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Session history
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);

  // Unread DM count for Friends icon badge
  const [totalDmUnread, setTotalDmUnread] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('pairon_token') || '';
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    fetch(`${API}/api/dm/threads`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const total = data.reduce((sum: number, t: any) => sum + (t.unreadCount || 0), 0);
          setTotalDmUnread(total);
        }
      })
      .catch(() => {});

    const sock = socketService.getSocket();
    if (sock) {
      const handler = () => setTotalDmUnread(prev => prev + 1);
      sock.on('dm:new-message', handler);
      return () => { sock.off('dm:new-message', handler); };
    }
  }, []);

  // Fetch online collaborator count
  useEffect(() => {
    const fetchCount = () => api.getOnlineCount().then(d => setOnlineCount(d.onlineCount)).catch(() => { });
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
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
      if (data?.activeSessions?.length > 0) {
        setActiveSessions(data.activeSessions);
        const first = data.activeSessions[0];
        localStorage.setItem('challenge_session', JSON.stringify(first));
      } else {
        setActiveSessions([]);
        localStorage.removeItem('challenge_session');
      }
    });

    // Receive session history
    socket.on('dashboard:history', (history: any[]) => {
      setSessionHistory(history);
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

    // Proposals
    socketService.onProposalReceived((proposal: any) => {
      if (!proposal.isSent) {
        setProposals(prev => [proposal, ...prev]);
      }
    });

    // Note: proposal acceptance now emits 'challenge:matched' which is handled above

    socketService.onProposalDeclined((proposalId: string) => {
      setProposals(prev => prev.filter(p => p.id !== proposalId));
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (socket) {
        socket.removeAllListeners('challenge:matched');
        socket.removeAllListeners('challenge:waiting');
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
    if (isMobileOrTablet()) {
      alert('⚠️ Collaboration projects require a desktop/laptop. The code editor and workspace only work on PC. Please switch to a desktop to start matching.');
      return;
    }
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

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-pairon-accent flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-bold text-xl text-gray-900 dark:text-white">
                PairOn
              </span>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-pairon-accent-light dark:bg-pairon-accent/10 rounded-full">
                <Coins className="w-4 h-4 text-pairon-accent" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.credits} credits
                </span>
              </div>
              <button
                onClick={() => navigate('/credits')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Credits & Certificates"
              >
                <Award className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={() => navigate('/quick-connect')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Quick Connect"
              >
                <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="relative">
                <button
                  onClick={() => navigate('/friends')}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Friends"
                >
                  <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                {totalDmUnread > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none"
                  >
                    {totalDmUnread > 99 ? '99+' : totalDmUnread}
                  </span>
                )}
              </div>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Welcome */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome back, {user?.name?.split(' ')[0]}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Ready to find your next collaborator?
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid sm:grid-cols-3 gap-4 mb-8"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                onClick={stat.label === 'Projects' ? () => navigate('/projects') : undefined}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card${stat.label === 'Projects' ? ' cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            ))}

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
                    className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-card border-2 border-green-400 dark:border-green-500"
                  >
                    {/* Gradient accent bar */}
                    <div className={`h-1.5 bg-gradient-to-r ${modeColors[sess.mode] || 'from-green-500 to-green-600'}`} />

                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                              Active Session
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {sess.projectIdea?.title || 'Untitled Project'}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {modeLabels[sess.mode]} · with <strong>{sess.partnerName}</strong>
                            <span className="text-yellow-500 ml-1">⭐ {sess.partnerReputation}</span>
                          </p>
                        </div>

                        <Button
                          onClick={() => navigate('/collaborate')}
                          className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
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
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${isSelected
                      ? 'border-pairon-accent bg-pairon-accent-light dark:bg-pairon-accent/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
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

          {/* Incoming Proposals */}
          {proposals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
            >
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Handshake className="w-5 h-5 text-pairon-accent" />
                Collaboration Proposals
                <span className="ml-2 px-2 py-0.5 bg-pairon-accent/10 text-pairon-accent text-sm rounded-full">
                  {proposals.length}
                </span>
              </h2>

              <div className="space-y-4">
                {proposals.map((p) => (
                  <div
                    key={p.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-pairon-accent/10 flex items-center justify-center">
                          <span className="font-bold text-pairon-accent">
                            {p.proposer?.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{p.proposer?.name}</p>
                          <p className="text-xs text-gray-500">{p.proposer?.experienceLevel} · ⭐ {p.proposer?.reputation}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                        {p.matchScore}% match
                      </span>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mb-3">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{p.projectIdea?.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p.projectIdea?.description}</p>
                    </div>

                    {p.message && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-3">"{p.message}"</p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => socketService.acceptProposal(p.id)}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white flex items-center justify-center gap-1 rounded-xl"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          socketService.declineProposal(p.id);
                          setProposals(prev => prev.filter(pr => pr.id !== p.id));
                        }}
                        className="flex-1 flex items-center justify-center gap-1 rounded-xl"
                      >
                        <XCircle className="w-4 h-4" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Recent Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white">
                Recent Sessions
              </h2>
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
                {sessionHistory.map((sess: any) => {
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
                    } else {
                      displayLabel = '⚠️ Partner Skipped';
                    }
                  } else if (sess.status === 'mutual_quit') {
                    displayLabel = '🤝 Mutual Quit';
                  } else if (sess.status === 'completed') {
                    displayLabel = '✅ Completed';
                  } else if (sess.status === 'abandoned') {
                    displayLabel = '❌ Abandoned';
                  } else if (sess.status === 'ended') {
                    displayLabel = '⏹ Ended';
                  }

                  const isActive = sess.status === 'active' && new Date(sess.endsAt) > new Date();
                  // Don't show continue for the person who force-quit
                  const canContinue = isActive && !(sess.status === 'partner_skipped' && sess.quitterId === user?.id);

                  return (
                    <div
                      key={sess.sessionId}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${isActive ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-pairon-accent/30 hover:bg-gray-50/50 dark:hover:bg-gray-700/30'} ${!isActive ? 'cursor-pointer' : ''}`}
                      onClick={!isActive ? () => navigate('/projects') : undefined}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
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

                      <div className="flex items-center gap-3 ml-3">
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(sess.startedAt).toLocaleDateString()}
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
