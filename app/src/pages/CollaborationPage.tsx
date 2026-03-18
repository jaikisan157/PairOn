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
  Plus,
  Sparkles,
  Wand2,
  Edit3,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { formatTime } from '@/lib/utils';
import { socketService } from '@/lib/socket';
import { playMessageSound, playSendSound } from '@/lib/audio';
import { CollabIDE } from '@/components/CollabIDE';
import { UserProfileModal } from '@/components/UserProfileModal';
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
  partnerReputation: number;
  mode: ChallengeMode;
  projectIdea: any;
  messages: ChallengeMessage[];
  tasks: ChallengeTask[];
  submission: any;
  endsAt: string;
  startedAt: string;
}

const MODE_LABELS: Record<ChallengeMode, string> = {
  sprint: '⚡ Sprint',
  challenge: '🏆 Challenge',
  build: '🔨 Build',
};

export function CollaborationPage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  // Core state (like QuickConnectPage pattern)
  const [status, setStatus] = useState<PageStatus>('idle');
  const [session, setSession] = useState<ChallengeSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  // timeExpired is tracked via showTimeUpModal

  // UI state
  const [newMessage, setNewMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<'chat' | 'code'>('chat');
  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0);
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
  // Solo mode leave confirmation
  const [showSoloLeaveConfirm, setShowSoloLeaveConfirm] = useState(false);

  // Partner force-quit popup
  const [partnerForceQuit, setPartnerForceQuit] = useState<{ creditsEarned: number; message: string } | null>(null);
  const [isSoloMode, setIsSoloMode] = useState(false);

  // Time-up modal
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);

  // Content moderation
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Task features
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [aiTaskSuggestions, setAiTaskSuggestions] = useState<string[]>([]);
  const [loadingTaskSuggestions, setLoadingTaskSuggestions] = useState(false);
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);

  // Edit project idea
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');

  // Activity check
  const [showActivityCheck, setShowActivityCheck] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [targetZone, setTargetZone] = useState({ min: 40, max: 60 });
  const [activityCheckTimer, setActivityCheckTimer] = useState(60);

  // Partner activity
  const [partnerStatus, setPartnerStatus] = useState<'online' | 'away' | 'offline'>('offline');

  // Project edit proposal
  const [incomingProjectEdit, setIncomingProjectEdit] = useState<{ proposerName: string; title: string; description: string } | null>(null);

  // Typing indicator
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User profile modal
  const [showPartnerProfile, setShowPartnerProfile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gracefulEndRef = useRef(false);
  const sessionRef = useRef<ChallengeSession | null>(null);
  // Idle tracking for slide-to-verify
  const lastActivityRef = useRef<number>(Date.now());
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ===== SOCKET LISTENERS (like QuickConnectPage) =====
  useEffect(() => {
    let cleanedUp = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function attachListeners() {
      const socket = socketService.getSocket();
      if (!socket || cleanedUp) return false;

      // Matched!
      socket.on('challenge:matched', (data: any) => {
      console.log('[Challenge] Matched!', data);
      // Guard: if we already have a session, ignore matches for different sessions
      const currentSession = sessionRef.current;
      if (currentSession && currentSession.sessionId && currentSession.sessionId !== data.sessionId) {
        console.log('[Challenge] Ignoring match for different session:', data.sessionId);
        return;
      }
      setStatus('matched');
      setSession({
        sessionId: data.sessionId,
        matchId: data.matchId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        partnerReputation: data.partnerReputation || 0,
        mode: data.mode,
        projectIdea: data.projectIdea,
        messages: data.messages || [],
        tasks: data.tasks || [],
        submission: null,
        endsAt: data.endsAt,
        startedAt: data.startedAt,
      });

      // CRITICAL: join the session room used by IDE relay handlers
      socketService.getSocket()?.emit('user:join-session', data.sessionId);

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

    // Incoming message (skip if already added optimistically)
    socket.on('challenge:message', (message: ChallengeMessage) => {
      setSession(prev => {
        if (!prev) return prev;
        // Skip if we already have an optimistic version of this message
        const isDuplicate = prev.messages.some(
          m => m.senderId === message.senderId && m.content === message.content && m.id.startsWith('opt-')
        );
        if (isDuplicate) {
          // Replace optimistic with server version
          return {
            ...prev,
            messages: prev.messages.map(m =>
              m.senderId === message.senderId && m.content === message.content && m.id.startsWith('opt-')
                ? message
                : m
            ),
          };
        }
        return { ...prev, messages: [...prev.messages, message] };
      });
      // Play sound for partner messages (not system, not own)
      if (message.senderId !== user?.id && message.type !== 'system') {
        playMessageSound();
      }
    });

    // Typing indicators
    socket.on('challenge:partner-typing', () => {
      setPartnerTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
    });
    socket.on('challenge:partner-stop-typing', () => {
      setPartnerTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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

    // Time's up — show modal instead of auto-ending
    socket.on('challenge:time-up', () => {
      setTimeRemaining(0);
      if (timerRef.current) clearInterval(timerRef.current);
      setShowTimeUpModal(true);
    });

    // Partner force-quit — dedicated event with credits info
    socket.on('challenge:partner-force-quit', (data: { sessionId: string; creditsEarned: number; message: string }) => {
      setPartnerForceQuit({ creditsEarned: data.creditsEarned, message: data.message });
    });

    // Now in solo mode
    socket.on('challenge:now-solo', () => {
      setIsSoloMode(true);
      setPartnerForceQuit(null);
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
      // Cancel the rejoin guard timeout — backend confirmed this session is valid
      const tid = sessionStorage.getItem('_rejoin_timeout_id');
      if (tid) { clearTimeout(Number(tid)); sessionStorage.removeItem('_rejoin_timeout_id'); }

      setStatus('matched');
      setSession({
        sessionId: data.session.id,
        matchId: '',
        partnerId: data.session.participants.find((p: string) => p !== user?.id) || '',
        partnerName: data.partnerName,
        partnerReputation: data.partnerReputation || 0,
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

    // (Force logout removed)

    // Partner activity updates
    socket.on('challenge:partner-activity', (data: any) => {
      setPartnerStatus(data.status);
    });

    // Project edit proposed by partner
    socket.on('challenge:project-edit-proposed', (data: any) => {
      setIncomingProjectEdit({ proposerName: data.proposerName, title: data.title, description: data.description });
    });

    // Project edit approved
    socket.on('challenge:project-updated', (data: any) => {
      setSession(prev => prev ? { ...prev, projectIdea: { ...prev.projectIdea, title: data.title, description: data.description } } : prev);
      setIncomingProjectEdit(null);
    });

    // Project edit declined
    socket.on('challenge:project-edit-declined', () => {
      setIncomingProjectEdit(null);
    });

    // Task deleted
    socket.on('challenge:task-deleted', (taskId: string) => {
      setSession(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) } : prev);
    });

    return true;
  }

  // Try to attach immediately; if socket isn't ready yet, poll until it is
    if (!attachListeners()) {
      pollTimer = setInterval(() => {
        if (attachListeners() && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 300);
    }

    return () => {
      cleanedUp = true;
      if (pollTimer) clearInterval(pollTimer);
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
        s.removeAllListeners('challenge:partner-force-quit');
        s.removeAllListeners('challenge:now-solo');
        s.removeAllListeners('challenge:exit-requested');
        s.removeAllListeners('challenge:exit-request-sent');
        s.removeAllListeners('challenge:exit-declined');
        s.removeAllListeners('challenge:warning');
        s.removeAllListeners('challenge:rejoined');
        s.removeAllListeners('challenge:task-suggestions');
        s.removeAllListeners('challenge:partner-activity');
        s.removeAllListeners('challenge:project-edit-proposed');
        s.removeAllListeners('challenge:project-updated');
        s.removeAllListeners('challenge:project-edit-declined');
        s.removeAllListeners('challenge:task-deleted');
        s.removeAllListeners('challenge:partner-typing');
        s.removeAllListeners('challenge:partner-stop-typing');
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
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
          partnerReputation: data.partnerReputation || 0,
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

        // Rejoin socket rooms (both challenge room + session room used by IDE)
        socketService.getSocket()?.emit('challenge:rejoin', data.sessionId);
        socketService.getSocket()?.emit('user:join-session', data.sessionId);
        // Request fresh IDE state from partner
        socketService.getSocket()?.emit('ide:request-state', data.sessionId);

        // Guard: if backend doesn't confirm rejoin within 4s, the session is gone
        // (partner_skipped, completed, etc.) — clear stale localStorage and go home
        const rejoinTimeout = setTimeout(() => {
          // challenge:rejoined would have cancelled this via clearTimeout
          // If we're here, backend silently rejected the rejoin
          localStorage.removeItem('challenge_session');
          setStatus('idle');
          setSession(null);
          navigate('/dashboard');
        }, 4000);
        // Store so challenge:rejoined handler can cancel it
        sessionStorage.setItem('_rejoin_timeout_id', String(rejoinTimeout));

        // Restore active view from session storage — only if the session was already visited (resume)
        // Fresh matches must always start on 'chat'
        const savedView = sessionStorage.getItem(`collab_active_view_${data.sessionId}`);
        if (savedView === 'code') {
          setActiveView('code');
        } else {
          setActiveView('chat'); // Always start on chat
        }
      } else {
        navigate('/dashboard');
      }
    } else if (!saved && status === 'idle') {
      navigate('/dashboard');
    }
  }, [status, navigate]);

  // Persist active view per session
  useEffect(() => {
    if (session?.sessionId) {
      sessionStorage.setItem(`collab_active_view_${session.sessionId}`, activeView);
    }
  }, [activeView, session?.sessionId]);

  // Heartbeat: send every 20s while matched
  useEffect(() => {
    if (status === 'matched' && session) {
      const socket = socketService.getSocket();
      // Send immediately
      socket?.emit('challenge:heartbeat', session.sessionId);
      socket?.emit('challenge:check-partner', session.sessionId);
      heartbeatRef.current = setInterval(() => {
        socket?.emit('challenge:heartbeat', session.sessionId);
        socket?.emit('challenge:check-partner', session.sessionId);
      }, 20_000);
    }
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [status, session?.sessionId]);

  // ===== Auto-scroll messages =====
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  // ===== Idle detection for slide-to-verify (10 min idle) =====
  useEffect(() => {
    if (status !== 'matched') return;
    const recordActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('keydown', recordActivity);
    window.addEventListener('mousemove', recordActivity);
    window.addEventListener('click', recordActivity);
    // Check every 60s if user has been idle for 10 min
    idleCheckRef.current = setInterval(() => {
      const idleSecs = (Date.now() - lastActivityRef.current) / 1000;
      if (idleSecs >= 10 * 60 && !showActivityCheck) {
        const min = Math.floor(Math.random() * 60) + 20;
        setTargetZone({ min, max: min + 20 });
        setSliderValue(0);
        setActivityCheckTimer(60);
        setShowActivityCheck(true);
      }
    }, 60_000);
    return () => {
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('mousemove', recordActivity);
      window.removeEventListener('click', recordActivity);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    };
  }, [status, showActivityCheck]);

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
    gracefulEndRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    setSession(null);
    setStatus('idle');
    setTimeRemaining(0);
    localStorage.removeItem('challenge_session');
    navigate('/dashboard');
  }

  function cleanupAndLeave() {
    gracefulEndRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    setSession(null);
    setStatus('idle');
    localStorage.removeItem('challenge_session');
  }

  // ===== Session persistence on unmount =====
  // ALL modes: session persists. No auto force-quit on navigation.
  // Sessions only end via: force-quit button, approved exit request, or timer expiry.
  useEffect(() => {
    return () => {
      // Do nothing — session stays alive in backend & localStorage
      // User can resume from Dashboard "Recent Sessions"
    };
  }, []);

  // ===== Warn before closing tab (all modes) =====
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'matched' && session) {
        e.preventDefault();
        e.returnValue = 'You have an active session. Your progress is saved — you can resume from the Dashboard.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status, session]);

  // ===== Actions =====
  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const msg = newMessage.trim();

    // Optimistic update — show message instantly
    const optimisticMsg: ChallengeMessage = {
      id: `opt-${Date.now()}`,
      senderId: user?.id || '',
      content: msg,
      timestamp: new Date(),
      type: 'text',
    };
    setSession(prev => {
      if (!prev) return prev;
      return { ...prev, messages: [...prev.messages, optimisticMsg] };
    });

    // @ai command
    if (msg.toLowerCase().startsWith('@ai ')) {
      const question = msg.substring(4).trim();
      if (question) {
        socketService.getSocket()?.emit('challenge:ai-help', session.sessionId, question);
      }
    }

    // Send user message to server
    socketService.getSocket()?.emit('challenge:message', session.sessionId, msg);
    socketService.getSocket()?.emit('challenge:stop-typing', session.sessionId);
    playSendSound();
    setNewMessage('');
  }, [newMessage, session, user?.id]);

  const handleRequestExit = useCallback(() => {
    if (!session || !exitReason.trim() || exitReason.trim().length < 5) return;
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
    setShowTimeUpModal(false);
    // Refresh user stats so completedProjects updates in UI
    updateProfile({}).catch(() => {});
  };

  // Continue alone after partner left
  const handleContinueAlone = useCallback(() => {
    if (!session) return;
    socketService.getSocket()?.emit('challenge:continue-alone', session.sessionId);
    setPartnerForceQuit(null);
    setIsSoloMode(true);
  }, [session]);

  // End session after time-up without submitting
  const handleEndAfterTimeout = useCallback(() => {
    if (!session) return;
    socketService.getSocket()?.emit('challenge:end-after-timeout', session.sessionId);
    setShowTimeUpModal(false);
    handleSessionEnded();
  }, [session]);

  // Submit via time-up modal (opens submit form first)
  const handleTimeUpSubmit = () => {
    setShowTimeUpModal(false);
    setShowSubmitModal(true);
  };


  const handleActivityVerified = () => {
    if (sliderValue >= targetZone.min && sliderValue <= targetZone.max) {
      setShowActivityCheck(false);
    }
  };

  // Task suggestion handlers
  const handleRequestTaskSuggestions = useCallback(() => {
    if (!session) return;
    setLoadingTaskSuggestions(true);
    setShowTaskSuggestions(true);
    const socket = socketService.getSocket();
    socket?.emit('challenge:suggest-tasks', session.sessionId);
    // Listen for response
    socket?.once('challenge:task-suggestions', (data: { tasks: string[]; error?: string }) => {
      setLoadingTaskSuggestions(false);
      if (data.tasks?.length > 0) {
        setAiTaskSuggestions(data.tasks);
      }
    });
  }, [session]);

  const handleAddTask = useCallback((title: string) => {
    if (!session || !title.trim()) return;
    socketService.getSocket()?.emit('challenge:add-task', session.sessionId, title.trim());
  }, [session]);

  const handleAddNewTask = useCallback(() => {
    if (!newTaskTitle.trim() || !session) return;
    handleAddTask(newTaskTitle);
    setNewTaskTitle('');
    setShowNewTaskInput(false);
  }, [newTaskTitle, session, handleAddTask]);

  const handleAddAllSuggested = useCallback(() => {
    if (!session) return;
    aiTaskSuggestions.forEach((title) => {
      socketService.getSocket()?.emit('challenge:add-task', session.sessionId, title);
    });
    setShowTaskSuggestions(false);
    setAiTaskSuggestions([]);
  }, [session, aiTaskSuggestions]);

  const handleAddSingleSuggestion = useCallback((title: string) => {
    handleAddTask(title);
    setAiTaskSuggestions(prev => prev.filter(t => t !== title));
  }, [handleAddTask]);

  const handleSaveProjectEdit = useCallback(() => {
    if (!session) return;
    // Send proposal to partner — DON'T update local state until partner approves
    socketService.getSocket()?.emit('challenge:propose-project-edit', {
      sessionId: session.sessionId,
      title: editProjectTitle,
      description: editProjectDesc,
    });
    setEditingProject(false);
    // Optimistic: if solo mode, apply immediately
    if (isSoloMode) {
      setSession(prev => prev ? {
        ...prev,
        projectIdea: { ...prev.projectIdea, title: editProjectTitle, description: editProjectDesc },
      } : null);
    }
  }, [session, editProjectTitle, editProjectDesc, isSoloMode]);

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
    <div className="h-screen bg-pairon-bg dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  // ALL modes: go back to dashboard, session persists
                  gracefulEndRef.current = true;
                  navigate('/dashboard');
                }}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Back to Dashboard (session continues)"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="font-display font-semibold text-gray-900 dark:text-white">
                  {MODE_LABELS[session.mode]}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  with{' '}
                  <strong
                    className="cursor-pointer hover:text-blue-500 hover:underline transition-colors"
                    onClick={() => setShowPartnerProfile(true)}
                    title="View profile & add friend"
                  >{session.partnerName}</strong>
                  <span className={`inline-block w-2 h-2 rounded-full ml-1 ${partnerStatus === 'online' ? 'bg-green-500' : partnerStatus === 'away' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'}`} title={`Partner is ${partnerStatus}`} />
                  <span className="text-yellow-500"> ⭐ {session.partnerReputation}</span>
                  {session.projectIdea && ` • ${session.projectIdea.title}`}
                </p>
              </div>
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setActiveView('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeView === 'chat' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <Send className="w-3 h-3" /> Chat
              </button>
              <button
                onClick={() => setActiveView('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeView === 'code' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className="text-sm">💻</span> Code
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Solo mode indicator (inline, not blocking) */}
              {isSoloMode && (
                <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded-full font-medium">⚡ Solo</span>
              )}
              {/* Timer */}
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${timeRemaining < 300 ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono text-sm font-semibold">{formatTime(timeRemaining)}</span>
              </div>

              {/* Exit buttons — solo mode shows Leave only, collaborative shows Request + Force */}
              {isSoloMode ? (
                <Button variant="outline" size="sm" onClick={() => setShowSoloLeaveConfirm(true)} className="text-gray-600 border-gray-200 hover:bg-gray-50">
                  <LogOut className="w-4 h-4 mr-1" /> Leave
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowExitModal(true)} className="text-yellow-600 border-yellow-200 hover:bg-yellow-50">
                    <LogOut className="w-4 h-4 mr-1" /> Request to leave
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowForceQuitConfirm(true)} className="text-red-600 border-red-200 hover:bg-red-50">
                    <X className="w-4 h-4 mr-1" /> Force leave
                  </Button>
                </>
              )}
              {activeView === 'chat' && (
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500" title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
                  <Menu className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat/Code area */}
        {activeView === 'code' ? (
          /* Full IDE view */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 min-h-0">
              <CollabIDE
                sessionId={session.sessionId}
                partnerId={session.partnerId}
                projectTitle={session.projectIdea?.title || 'Untitled Project'}
                userId={user?.id || ''}
                userName={user?.name || 'You'}
                messages={session.messages}
                onSendMessage={(msg) => {
                  socketService.getSocket()?.emit('challenge:message', session.sessionId, msg);
                }}
                lastSeenMessageCount={lastSeenMessageCount}
                onMessagesSeen={(count) => setLastSeenMessageCount(count)}
              />
            </div>
          </div>
        ) : (
          /* Chat Panel */
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

            {/* Typing indicator */}
            {partnerTyping && (
              <div className="px-4 py-1 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {session?.partnerName} is typing...
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    if (session && e.target.value.trim()) {
                      socketService.getSocket()?.emit('challenge:typing', session.sessionId);
                    } else if (session) {
                      socketService.getSocket()?.emit('challenge:stop-typing', session.sessionId);
                    }
                  }}
                  placeholder="Type a message... (or @ai your question)"
                  className="flex-1 rounded-full"
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim()} className="rounded-full pairon-btn-primary">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Kanban + Sidebar — only in chat view */}
        {activeView === 'chat' && sidebarOpen && (<>
          <div className="w-96 bg-gray-50 dark:bg-gray-900/50 flex flex-col border-r border-gray-200 dark:border-gray-700">
            {/* Task Header with + and AI buttons */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-gray-900 dark:text-white">Tasks</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setShowNewTaskInput(true); setTimeout(() => document.getElementById('new-task-input')?.focus(), 50); }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Add task"
                  >
                    <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={handleRequestTaskSuggestions}
                    disabled={loadingTaskSuggestions}
                    className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title="AI suggest tasks"
                  >
                    <Wand2 className={`w-4 h-4 text-purple-500 ${loadingTaskSuggestions ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              </div>

              {/* New task inline input */}
              {showNewTaskInput && (
                <div className="mt-3 flex gap-2">
                  <Input
                    id="new-task-input"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewTask(); if (e.key === 'Escape') setShowNewTaskInput(false); }}
                    placeholder="What needs to be done?"
                    className="flex-1 text-sm rounded-lg h-8"
                  />
                  <button onClick={handleAddNewTask} disabled={!newTaskTitle.trim()} className="p-1.5 rounded-lg bg-pairon-accent text-white hover:bg-pairon-accent/90 disabled:opacity-40">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* AI Task Suggestions Panel */}
            <AnimatePresence>
              {showTaskSuggestions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-purple-200 dark:border-purple-800"
                >
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">AI Suggestions</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {aiTaskSuggestions.length > 0 && (
                          <button onClick={handleAddAllSuggested} className="text-[10px] font-medium text-purple-600 hover:text-purple-800 px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-800/40">
                            Add All
                          </button>
                        )}
                        <button onClick={() => { setShowTaskSuggestions(false); setAiTaskSuggestions([]); }} className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-800/40">
                          <X className="w-3 h-3 text-purple-500" />
                        </button>
                      </div>
                    </div>
                    {loadingTaskSuggestions ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                        <span className="ml-2 text-xs text-purple-500">Generating tasks...</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {aiTaskSuggestions.map((title, i) => (
                          <div key={i} className="flex items-center gap-2 group">
                            <button
                              onClick={() => handleAddSingleSuggestion(title)}
                              className="flex-1 text-left text-xs px-2.5 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700 hover:border-purple-400 hover:shadow-sm transition-all group-hover:bg-purple-50 dark:group-hover:bg-purple-900/30"
                            >
                              <span className="text-gray-700 dark:text-gray-300">{title}</span>
                            </button>
                            <button onClick={() => handleAddSingleSuggestion(title)} className="opacity-0 group-hover:opacity-100 p-1 rounded bg-purple-500 text-white transition-opacity">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Empty state */}
              {tasks.length === 0 && !showTaskSuggestions && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No tasks yet</p>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={handleRequestTaskSuggestions} className="mx-auto text-xs gap-1 bg-purple-500 hover:bg-purple-600 text-white">
                      <Wand2 className="w-3 h-3" /> Generate with AI
                    </Button>
                    <button
                      onClick={() => { setShowNewTaskInput(true); setTimeout(() => document.getElementById('new-task-input')?.focus(), 50); }}
                      className="text-xs text-pairon-accent hover:underline"
                    >
                      or add manually
                    </button>
                  </div>
                </div>
              )}

              {/* To Do */}
              {todoTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Circle className="w-3 h-3" /> To Do ({todoTasks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {todoTasks.map(task => (
                      <div key={task.id}
                        className="flex items-center gap-2.5 p-2.5 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all group cursor-pointer"
                      >
                        <button
                          onClick={() => handleTaskStatusChange(task.id, 'in-progress')}
                          className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors flex-shrink-0"
                        />
                        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{task.title}</p>
                        <button onClick={() => socketService.getSocket()?.emit('challenge:delete-task', session.sessionId, task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all" title="Delete task">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* In Progress */}
              {inProgressTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <MoreHorizontal className="w-3 h-3" /> In Progress ({inProgressTasks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {inProgressTasks.map(task => (
                      <div key={task.id}
                        className="flex items-center gap-2.5 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:shadow-md transition-all cursor-pointer group"
                      >
                        <button
                          onClick={() => handleTaskStatusChange(task.id, 'done')}
                          className="w-5 h-5 rounded-full border-2 border-blue-400 bg-blue-100 hover:bg-green-100 hover:border-green-500 transition-colors flex-shrink-0 flex items-center justify-center"
                        >
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                        </button>
                        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{task.title}</p>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                          <button onClick={() => handleTaskStatusChange(task.id, 'todo')}
                            className="p-1 text-gray-400 hover:text-blue-500" title="Undo (back to todo)">
                            ↩
                          </button>
                          <button onClick={() => socketService.getSocket()?.emit('challenge:delete-task', session.sessionId, task.id)}
                            className="p-1 text-red-400 hover:text-red-600" title="Delete">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Done */}
              {doneTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3" /> Done ({doneTasks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {doneTasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2.5 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl opacity-60 group hover:opacity-100 transition-all">
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 line-through">{task.title}</p>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                          <button onClick={() => handleTaskStatusChange(task.id, 'in-progress')}
                            className="p-1 text-gray-400 hover:text-blue-500" title="Undo (back to in-progress)">
                            ↩
                          </button>
                          <button onClick={() => socketService.getSocket()?.emit('challenge:delete-task', session.sessionId, task.id)}
                            className="p-1 text-red-400 hover:text-red-600" title="Delete">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Project sidebar */}
          <div className="w-64 bg-white dark:bg-gray-800 p-4 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Idea</h3>
                {session.projectIdea && !editingProject && (
                  <button
                    onClick={() => { setEditProjectTitle(session.projectIdea.title); setEditProjectDesc(session.projectIdea.description || ''); setEditingProject(true); }}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Edit project"
                  >
                    <Edit3 className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>
              {editingProject ? (
                <div className="space-y-2">
                  <Input
                    value={editProjectTitle}
                    onChange={(e) => setEditProjectTitle(e.target.value)}
                    placeholder="Project title"
                    className="text-sm rounded-lg h-8"
                  />
                  <textarea
                    value={editProjectDesc}
                    onChange={(e) => setEditProjectDesc(e.target.value)}
                    placeholder="Project description"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none h-16"
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={handleSaveProjectEdit} className="flex-1 text-xs h-7 pairon-btn-primary">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingProject(false)} className="flex-1 text-xs h-7">Cancel</Button>
                  </div>
                </div>
              ) : session.projectIdea ? (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{session.projectIdea.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{session.projectIdea.description}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No project idea set</p>
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
                <Input value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="Why do you want to leave? (min 5 characters)" className="rounded-xl text-sm" required />
                {exitReason.trim().length > 0 && exitReason.trim().length < 5 && <p className="text-xs text-red-400 mt-1">Reason must be at least 5 characters ({exitReason.trim().length}/5)</p>}
                {!exitReason.trim() && <p className="text-xs text-red-400 mt-1">A reason is required</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowExitModal(false)} className="flex-1 rounded-xl">Stay</Button>
                <Button onClick={handleRequestExit} disabled={!exitReason.trim() || exitReason.trim().length < 5} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl disabled:opacity-50">Send request</Button>
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

      {/* Solo Leave Confirm */}
      <AnimatePresence>
        {showSoloLeaveConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">End solo session?</h3>
              <p className="text-sm text-gray-500 text-center mb-1">You are working alone. Leaving will <strong className="text-orange-500">end this session permanently</strong>.</p>
              <p className="text-xs text-gray-400 text-center mb-4">Make sure to submit your project first if you want credit.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowSoloLeaveConfirm(false)} className="flex-1 rounded-xl">Cancel</Button>
                <Button onClick={() => { setShowSoloLeaveConfirm(false); cleanupAndLeave(); navigate('/dashboard'); }} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">End Session</Button>
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

      {/* Incoming Project Edit Proposal */}
      <AnimatePresence>
        {incomingProjectEdit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✏️</span>
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">Project Edit Proposal</h3>
              <p className="text-sm text-gray-500 text-center mb-3">
                <strong>{incomingProjectEdit.proposerName}</strong> wants to change the project:
              </p>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 mb-4 space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{incomingProjectEdit.title}</p>
                <p className="text-xs text-gray-500">{incomingProjectEdit.description}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => {
                  socketService.getSocket()?.emit('challenge:decline-project-edit', { sessionId: session.sessionId });
                  setIncomingProjectEdit(null);
                }} className="flex-1 rounded-xl">Decline</Button>
                <Button onClick={() => {
                  socketService.getSocket()?.emit('challenge:approve-project-edit', {
                    sessionId: session.sessionId,
                    title: incomingProjectEdit.title,
                    description: incomingProjectEdit.description,
                  });
                  setIncomingProjectEdit(null);
                }} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl">Accept</Button>
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

      {/* Solo mode indicator moved to header — no fixed overlay */}

      {/* ── Partner Force-Quit Popup ── */}
      <AnimatePresence>
        {partnerForceQuit && session && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#161b22] border border-yellow-500/30 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
              <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Partner Left 👋</h3>
              <p className="text-gray-400 text-sm mb-2">{partnerForceQuit.message}</p>
              <div className="inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1 mb-6">
                <span className="text-green-400 text-xs font-semibold">+{partnerForceQuit.creditsEarned} credits added to your account</span>
              </div>
              <div className="flex gap-3">
                <button onClick={handleContinueAlone}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
                  Continue Alone
                </button>
                <button onClick={() => { setPartnerForceQuit(null); cleanupAndLeave(); navigate('/dashboard'); }}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors">
                  End Session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Time's Up Modal ── */}
      <AnimatePresence>
        {showTimeUpModal && session && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#161b22] border border-orange-500/30 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
              <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">⏰ Time's Up!</h3>
              <p className="text-gray-400 text-sm mb-6">
                Your session time has ended. What would you like to do?
              </p>
              <div className="flex flex-col gap-3">
                {!session.submission && (
                  <button onClick={handleTimeUpSubmit}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Submit Project
                  </button>
                )}
                {session.submission && (
                  <div className="py-2 text-green-400 text-sm">✅ Project already submitted!</div>
                )}
                <button onClick={() => setShowTimeUpModal(false)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
                  Continue Working
                </button>
                <button onClick={handleEndAfterTimeout}
                  className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors">
                  End Without Submitting
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Partner profile modal */}
      {showPartnerProfile && session && (
        <UserProfileModal
          userId={session.partnerId}
          userName={session.partnerName}
          userReputation={session.partnerReputation}
          isOnline={partnerStatus === 'online'}
          onClose={() => setShowPartnerProfile(false)}
        />
      )}
    </div>
  );
}

