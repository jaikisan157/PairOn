import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Clock,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Link2,
  X,
  ArrowLeft,
  AlertTriangle,
  LogOut,
  Bot,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { formatTime } from '@/lib/utils';
import { socketService } from '@/lib/socket';
import type { TaskStatus } from '@/types';

// ===== Types =====
type ChallengeMode = 'sprint' | 'challenge' | 'build';
type PageStatus = 'idle' | 'searching' | 'matched';

interface ChallengeMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'system' | 'ai';
}

interface ChallengeTask {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ChallengeSession {
  sessionId: string;
  matchId: string;
  partnerId: string;
  partnerName: string;
  mode: ChallengeMode;
  projectIdea: any;
  messages: ChallengeMessage[];
  tasks: ChallengeTask[];
  submission: any;
  endsAt: string;
  startedAt: string;
}

const MODE_LABELS: Record<ChallengeMode, string> = {
  sprint: '3-Hour Sprint',
  challenge: '24-Hour Challenge',
  build: '7-Day Build',
};

export function CollaborationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Core state (like QuickConnectPage pattern)
  const [status, setStatus] = useState<PageStatus>('idle');
  const [session, setSession] = useState<ChallengeSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);

  // UI state
  const [newMessage, setNewMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionDescription, setSubmissionDescription] = useState('');

  // Exit request state
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exitRequestSent, setExitRequestSent] = useState(false);
  const [incomingExitRequest, setIncomingExitRequest] = useState<{
    requesterName: string;
    reason: string;
  } | null>(null);
  const [exitDeclined, setExitDeclined] = useState(false);
  const [showForceQuitConfirm, setShowForceQuitConfirm] = useState(false);

  // Content moderation
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Activity check
  const [showActivityCheck, setShowActivityCheck] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [targetZone, setTargetZone] = useState({ min: 40, max: 60 });
  const [activityCheckTimer, setActivityCheckTimer] = useState(60);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ===== SOCKET LISTENERS (like QuickConnectPage) =====
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    // Matched!
    socket.on('challenge:matched', (data: any) => {
      console.log('[Challenge] Matched!', data);
      setStatus('matched');
      setSession({
        sessionId: data.sessionId,
        matchId: data.matchId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        mode: data.mode,
        projectIdea: data.projectIdea,
        messages: data.messages || [],
        tasks: data.tasks || [],
        submission: null,
        endsAt: data.endsAt,
        startedAt: data.startedAt,
      });

      // Save to localStorage for refresh recovery
      localStorage.setItem('challenge_session', JSON.stringify({
        sessionId: data.sessionId,
        matchId: data.matchId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        mode: data.mode,
        projectIdea: data.projectIdea,
        endsAt: data.endsAt,
        startedAt: data.startedAt,
      }));

      // Start countdown
      const remaining = Math.max(0, Math.floor((new Date(data.endsAt).getTime() - Date.now()) / 1000));
      setTimeRemaining(remaining);
      startCountdown(new Date(data.endsAt));
    });

    // Waiting
    socket.on('challenge:waiting', () => {
      // Still searching — no action needed
    });

    // Error
    socket.on('challenge:error', (msg: string) => {
      setStatus('idle');
      alert(msg);
    });

    // Cancelled
    socket.on('challenge:cancelled', () => {
      setStatus('idle');
    });

    // Incoming message
    socket.on('challenge:message', (message: ChallengeMessage) => {
      setSession(prev => {
        if (!prev) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    });

    // Task updated
    socket.on('challenge:task-updated', (task: ChallengeTask) => {
      setSession(prev => {
        if (!prev) return prev;
        const idx = prev.tasks.findIndex(t => t.id === task.id);
        const updated = [...prev.tasks];
        if (idx >= 0) updated[idx] = task;
        else updated.push(task);
        return { ...prev, tasks: updated };
      });
    });

    // Timer sync from server
    socket.on('challenge:timer', (remaining: number) => {
      setTimeRemaining(remaining);
    });

    // Project submitted
    socket.on('challenge:submitted', (submission: any) => {
      setSession(prev => prev ? { ...prev, submission } : prev);
    });

    // Session ended (approved exit, force quit, or kicked)
    socket.on('challenge:ended', () => {
      handleSessionEnded();
    });

    // Time's up
    socket.on('challenge:time-up', () => {
      setTimeExpired(true);
      setTimeRemaining(0);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    // Exit requested by partner
    socket.on('challenge:exit-requested', (data: any) => {
      setIncomingExitRequest({
        requesterName: data.requesterName,
        reason: data.reason,
      });
    });

    // My exit request was sent
    socket.on('challenge:exit-request-sent', () => {
      setExitRequestSent(true);
    });

    // Exit declined
    socket.on('challenge:exit-declined', () => {
      setExitRequestSent(false);
      setExitDeclined(true);
      setTimeout(() => setExitDeclined(false), 5000);
    });

    // Content moderation warning
    socket.on('challenge:warning', (data: { warningCount: number; message: string; kicked: boolean }) => {
      setWarningMessage(data.message);
      setTimeout(() => setWarningMessage(null), 8000);
    });

    // Rejoined after refresh
    socket.on('challenge:rejoined', (data: any) => {
      setStatus('matched');
      setSession({
        sessionId: data.session.id,
        matchId: '',
        partnerId: data.session.participants.find((p: string) => p !== user?.id) || '',
        partnerName: data.partnerName,
        mode: data.mode,
        projectIdea: data.projectIdea,
        messages: data.session.messages || [],
        tasks: data.session.tasks || [],
        submission: data.session.submission || null,
        endsAt: data.session.endsAt,
        startedAt: data.session.startedAt,
      });

      const remaining = Math.max(0, Math.floor((new Date(data.session.endsAt).getTime() - Date.now()) / 1000));
      setTimeRemaining(remaining);
      startCountdown(new Date(data.session.endsAt));
    });

    // Force logout
    socket.on('session:force-logout', () => {
      cleanupAndLeave();
      navigate('/login');
    });

    return () => {
      // Only remove challenge-specific listeners
      const s = socketService.getSocket();
      if (s) {
        s.removeAllListeners('challenge:matched');
        s.removeAllListeners('challenge:waiting');
        s.removeAllListeners('challenge:error');
        s.removeAllListeners('challenge:cancelled');
        s.removeAllListeners('challenge:message');
        s.removeAllListeners('challenge:task-updated');
        s.removeAllListeners('challenge:timer');
        s.removeAllListeners('challenge:submitted');
        s.removeAllListeners('challenge:ended');
        s.removeAllListeners('challenge:time-up');
        s.removeAllListeners('challenge:exit-requested');
        s.removeAllListeners('challenge:exit-request-sent');
        s.removeAllListeners('challenge:exit-declined');
        s.removeAllListeners('challenge:warning');
        s.removeAllListeners('challenge:rejoined');
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, []);

  // ===== Load session from localStorage (set by Dashboard) or rejoin on refresh =====
  useEffect(() => {
    const saved = localStorage.getItem('challenge_session');
    if (saved && status === 'idle') {
      const data = JSON.parse(saved);

      if (data.sessionId) {
        // Set session state
        setStatus('matched');
        setSession({
          sessionId: data.sessionId,
          matchId: data.matchId || '',
          partnerId: data.partnerId || '',
          partnerName: data.partnerName || 'Partner',
          mode: data.mode || 'sprint',
          projectIdea: data.projectIdea || null,
          messages: data.messages || [],
          tasks: data.tasks || [],
          submission: null,
          endsAt: data.endsAt,
          startedAt: data.startedAt,
        });

        // Start countdown
        if (data.endsAt) {
          const remaining = Math.max(0, Math.floor((new Date(data.endsAt).getTime() - Date.now()) / 1000));
          setTimeRemaining(remaining);
          startCountdown(new Date(data.endsAt));
        }

        // Rejoin socket room
        socketService.getSocket()?.emit('challenge:rejoin', data.sessionId);
      } else {
        navigate('/dashboard');
      }
    } else if (!saved && status === 'idle') {
      // No session at all — go back to dashboard
      navigate('/dashboard');
    }
  }, [status, navigate]);

  // ===== Auto-scroll messages =====
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  // ===== Activity check (every 15 min) =====
  useEffect(() => {
    if (status === 'matched') {
      activityIntervalRef.current = setInterval(() => {
        const min = Math.floor(Math.random() * 60) + 20;
        setTargetZone({ min, max: min + 20 });
        setSliderValue(0);
        setActivityCheckTimer(60);
        setShowActivityCheck(true);
      }, 15 * 60 * 1000);
    }
    return () => {
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, [status]);

  // Activity check countdown
  useEffect(() => {
    if (!showActivityCheck) return;
    const t = setInterval(() => {
      setActivityCheckTimer(prev => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [showActivityCheck]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === 'matched') {
        e.preventDefault();
        e.returnValue = 'You have an active challenge. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [status]);

  // ===== Helpers =====
  function startCountdown(endsAt: Date) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
      setTimeRemaining(rem);
      if (rem <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 1000);
  }

  function handleSessionEnded() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    setSession(null);
    setStatus('idle');
    setTimeRemaining(0);
    localStorage.removeItem('challenge_session');
    navigate('/dashboard');
  }

  function cleanupAndLeave() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    setSession(null);
    setStatus('idle');
    localStorage.removeItem('challenge_session');
  }

  // ===== Actions =====
  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const msg = newMessage.trim();

    // @ai command
    if (msg.toLowerCase().startsWith('@ai ')) {
      const question = msg.substring(4).trim();
      if (question) {
        socketService.getSocket()?.emit('challenge:ai-help', session.sessionId, question);
      }
    }

    // Send user message
    socketService.getSocket()?.emit('challenge:message', session.sessionId, msg);
    setNewMessage('');
  }, [newMessage, session]);

  const handleRequestExit = useCallback(() => {
    if (!session || !exitReason.trim()) return;
    socketService.getSocket()?.emit('challenge:request-exit', session.sessionId, exitReason.trim());
    setShowExitModal(false);
  }, [session, exitReason]);

  const handleApproveExit = useCallback(() => {
    if (!session) return;
    socketService.getSocket()?.emit('challenge:approve-exit', session.sessionId);
    setIncomingExitRequest(null);
  }, [session]);

  const handleDeclineExit = useCallback(() => {
    if (!session) return;
    socketService.getSocket()?.emit('challenge:decline-exit', session.sessionId);
    setIncomingExitRequest(null);
  }, [session]);

  const handleForceQuit = useCallback(() => {
    if (!session) return;
    socketService.getSocket()?.emit('challenge:force-quit', session.sessionId);
    setShowForceQuitConfirm(false);
    cleanupAndLeave();
    navigate('/dashboard');
  }, [session, navigate]);

  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    if (!session) return;
    const task = session.tasks.find(t => t.id === taskId);
    if (!task) return;
    const updated = { ...task, status: newStatus, updatedAt: new Date() };
    socketService.getSocket()?.emit('challenge:update-task', session.sessionId, updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    socketService.getSocket()?.emit('challenge:submit', session.sessionId, submissionLink, submissionDescription);
    setShowSubmitModal(false);
  };

  const handleActivityVerified = () => {
    if (sliderValue >= targetZone.min && sliderValue <= targetZone.max) {
      setShowActivityCheck(false);
    }
  };

  // ===== RENDER: Loading (session not yet loaded from localStorage) =====
  if (status !== 'matched' || !session) {
    return (
      <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading session...</p>
        </div>
      </div>
    );
  }

  // ===== RENDER: Matched (Chat + Tasks + Sidebar) =====
  const messages = session.messages;
  const tasks = session.tasks;
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowExitModal(true)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Request to leave"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="font-display font-semibold text-gray-900 dark:text-white">
                  {MODE_LABELS[session.mode]}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  with <strong>{session.partnerName}</strong>
                  {session.projectIdea && ` • ${session.projectIdea.title}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Timer */}
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${timeRemaining < 300 ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono text-sm font-semibold">{formatTime(timeRemaining)}</span>
              </div>

              {/* Exit buttons */}
              <Button variant="outline" size="sm" onClick={() => setShowExitModal(true)} className="text-yellow-600 border-yellow-200 hover:bg-yellow-50">
                <LogOut className="w-4 h-4 mr-1" /> Request to leave
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowForceQuitConfirm(true)} className="text-red-600 border-red-200 hover:bg-red-50">
                <X className="w-4 h-4 mr-1" /> Force leave
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500" title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* Warning toast */}
          <AnimatePresence>
            {warningMessage && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 py-3 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800"
              >
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{warningMessage}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI hint */}
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-600 dark:text-blue-400">
              Type <strong>@ai your question</strong> to ask the AI assistant
            </span>
          </div>

          {/* Exit request banners */}
          {exitRequestSent && (
            <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 text-sm text-yellow-700">
              ⏳ Exit request sent. Waiting for partner's response...
            </div>
          )}
          {exitDeclined && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 text-sm text-red-700">
              ❌ Your exit request was declined.
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                {msg.type === 'system' ? (
                  <div className="mx-auto px-4 py-2 bg-gray-100 dark:bg-gray-700/50 rounded-full text-xs text-gray-500 dark:text-gray-400 text-center max-w-md">
                    {msg.content}
                  </div>
                ) : msg.type === 'ai' ? (
                  <div className="max-w-[80%] px-4 py-3 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border border-blue-200 dark:border-blue-700">
                    <div className="flex items-center gap-1 mb-1">
                      <Bot className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-500">AI Assistant</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${msg.senderId === user?.id
                    ? 'bg-pairon-accent text-white rounded-br-md'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md shadow-sm'
                    }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <span className={`text-[10px] mt-1 block ${msg.senderId === user?.id ? 'text-white/60' : 'text-gray-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message... (or @ai your question)"
                className="flex-1 rounded-full"
              />
              <Button type="submit" size="icon" disabled={!newMessage.trim()} className="rounded-full pairon-btn-primary">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Kanban + Sidebar — toggleable */}
        {sidebarOpen && (<>
          <div className="w-96 bg-gray-50 dark:bg-gray-900/50 flex flex-col border-r border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="font-display font-semibold text-gray-900 dark:text-white">Tasks</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* To Do */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Circle className="w-3 h-3" /> To Do ({todoTasks.length})
                </h3>
                <div className="space-y-2">
                  {todoTasks.map(task => (
                    <div key={task.id} onClick={() => handleTaskStatusChange(task.id, 'in-progress')}
                      className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* In Progress */}
              <div>
                <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <MoreHorizontal className="w-3 h-3" /> In Progress ({inProgressTasks.length})
                </h3>
                <div className="space-y-2">
                  {inProgressTasks.map(task => (
                    <div key={task.id} onClick={() => handleTaskStatusChange(task.id, 'done')}
                      className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl cursor-pointer hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Done */}
              <div>
                <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> Done ({doneTasks.length})
                </h3>
                <div className="space-y-2">
                  {doneTasks.map(task => (
                    <div key={task.id} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl opacity-60">
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-through">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Project sidebar */}
          <div className="w-64 bg-white dark:bg-gray-800 p-4 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Idea</h3>
              {session.projectIdea && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{session.projectIdea.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{session.projectIdea.description}</p>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Submission</h3>
              {session.submission ? (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">✅ Submitted</p>
                  <a href={session.submission.link} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-pairon-accent hover:underline break-all">{session.submission.link}</a>
                </div>
              ) : (
                <Button onClick={() => setShowSubmitModal(true)} className="w-full pairon-btn-primary">
                  <Link2 className="w-4 h-4 mr-2" /> Submit project
                </Button>
              )}
            </div>
          </div>
        </>)}
      </main>

      {/* ===== MODALS ===== */}

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-[28px] p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white">Submit project</h2>
              <button onClick={() => setShowSubmitModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project link</label>
                <Input type="url" value={submissionLink} onChange={(e) => setSubmissionLink(e.target.value)} placeholder="https://github.com/..." className="rounded-xl" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea value={submissionDescription} onChange={(e) => setSubmissionDescription(e.target.value)} placeholder="What did you build?"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none h-24" required />
              </div>
              <Button type="submit" className="w-full pairon-btn-primary rounded-xl">Submit</Button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Exit Request Modal */}
      <AnimatePresence>
        {showExitModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">Request to leave?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                Your partner must approve. If declined, force-quit costs <strong className="text-red-500">reputation</strong> and gives partner <strong className="text-green-500">10 credits</strong>.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason <span className="text-red-500">*</span></label>
                <Input value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="Why do you want to leave?" className="rounded-xl text-sm" required />
                {!exitReason.trim() && <p className="text-xs text-red-400 mt-1">A reason is required</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowExitModal(false)} className="flex-1 rounded-xl">Stay</Button>
                <Button onClick={handleRequestExit} disabled={!exitReason.trim()} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl disabled:opacity-50">Send request</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming Exit Request Modal */}
      <AnimatePresence>
        {incomingExitRequest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">Partner wants to leave</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-2">
                <strong>{incomingExitRequest.requesterName}</strong> wants to end the session.
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-4 italic">
                "{incomingExitRequest.reason}"
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleDeclineExit} className="flex-1 rounded-xl">Decline</Button>
                <Button onClick={handleApproveExit} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-xl">Approve</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Force Quit Confirm */}
      <AnimatePresence>
        {showForceQuitConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">Force leave?</h3>
              <p className="text-sm text-gray-500 text-center mb-4">Your <strong className="text-red-500">reputation will decrease</strong> and your partner will receive <strong className="text-green-500">10 credits</strong>.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowForceQuitConfirm(false)} className="flex-1 rounded-xl">Cancel</Button>
                <Button onClick={handleForceQuit} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl">Force leave</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity Check */}
      <AnimatePresence>
        {showActivityCheck && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 bg-pairon-accent/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white mb-1">Activity Check</h3>
              <p className="text-sm text-gray-500 mb-4">Slide to the <strong className="text-green-500">green zone</strong> to verify</p>
              <div className="flex items-center justify-center gap-1 mb-4">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={`text-sm font-mono font-semibold ${activityCheckTimer <= 10 ? 'text-red-500' : 'text-gray-500'}`}>{activityCheckTimer}s</span>
              </div>
              <div className="relative mb-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                  <div className="absolute top-0 bottom-0 bg-green-200 dark:bg-green-800/50 border-l-2 border-r-2 border-green-500"
                    style={{ left: `${targetZone.min}%`, width: `${targetZone.max - targetZone.min}%` }} />
                  <div className={`absolute top-0 bottom-0 w-2 rounded-full transition-all ${sliderValue >= targetZone.min && sliderValue <= targetZone.max ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-pairon-accent'}`}
                    style={{ left: `${sliderValue}%` }} />
                </div>
                <input type="range" min="0" max="100" value={sliderValue} onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="w-full absolute top-0 left-0 h-8 opacity-0 cursor-pointer" />
              </div>
              <Button onClick={handleActivityVerified} disabled={sliderValue < targetZone.min || sliderValue > targetZone.max} className="w-full pairon-btn-primary rounded-xl">Verify</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Expired Overlay */}
      <AnimatePresence>
        {timeExpired && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
              <div className="w-16 h-16 bg-pairon-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-pairon-accent" />
              </div>
              <h3 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">⏰ Time's Up!</h3>
              <p className="text-gray-500 mb-6">
                {session.submission ? '✅ Your project has been submitted.' : '💡 Submit your project before leaving.'}
              </p>
              <div className="flex gap-3">
                {!session.submission && (
                  <Button variant="outline" onClick={() => setShowSubmitModal(true)} className="flex-1 rounded-xl">
                    <Link2 className="w-4 h-4 mr-1" /> Submit project
                  </Button>
                )}
                <Button onClick={() => { cleanupAndLeave(); navigate('/dashboard'); }} className="flex-1 pairon-btn-primary rounded-xl">Exit session</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
