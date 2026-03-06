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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useMatching } from '@/context/MatchingContext';
import { formatTime } from '@/lib/utils';
import { socketService } from '@/lib/socket';
import type { TaskStatus } from '@/types';

export function CollaborationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentMatch,
    currentSession,
    timeRemaining,
    partnerName,
    timeExpired,
    sessionEnded,
    endSession,
    submitProject,
    sendMessage,
    updateTask,
  } = useMatching();

  const [newMessage, setNewMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionDescription, setSubmissionDescription] = useState('');

  // Exit request system state
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exitRequestSent, setExitRequestSent] = useState(false);
  const [incomingExitRequest, setIncomingExitRequest] = useState<{
    requesterName: string;
    reason: string;
  } | null>(null);
  const [exitDeclined, setExitDeclined] = useState(false);
  const [showForceQuitConfirm, setShowForceQuitConfirm] = useState(false);

  // Activity check state
  const [showActivityCheck, setShowActivityCheck] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [targetZone, setTargetZone] = useState({ min: 60, max: 80 });
  const [activityCheckTimer, setActivityCheckTimer] = useState(60);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Activity check — every 15 minutes during active session
  useEffect(() => {
    if (!currentSession || currentSession.status !== 'active' || timeExpired) return;

    activityIntervalRef.current = setInterval(() => {
      // Random target zone
      const min = Math.floor(Math.random() * 50) + 20; // 20-70
      const max = min + 15; // 15% wide zone
      setTargetZone({ min, max });
      setSliderValue(0);
      setActivityCheckTimer(60);
      setShowActivityCheck(true);

      // Countdown
      activityCountdownRef.current = setInterval(() => {
        setActivityCheckTimer(prev => {
          if (prev <= 1) {
            if (activityCountdownRef.current) clearInterval(activityCountdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 15 * 60 * 1000); // 15 minutes

    return () => {
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
      if (activityCountdownRef.current) clearInterval(activityCountdownRef.current);
    };
  }, [currentSession, timeExpired]);

  const handleActivityVerified = useCallback(() => {
    if (sliderValue >= targetZone.min && sliderValue <= targetZone.max) {
      setShowActivityCheck(false);
      if (activityCountdownRef.current) clearInterval(activityCountdownRef.current);
    }
  }, [sliderValue, targetZone]);

  // Redirect if session ended (approved exit or force-quit handled by context)
  useEffect(() => {
    if (sessionEnded) {
      navigate('/dashboard');
    }
  }, [sessionEnded, navigate]);

  // Redirect only if no session AND no saved session in localStorage
  useEffect(() => {
    if (!currentSession) {
      const saved = localStorage.getItem('pairon_active_session');
      if (!saved) {
        navigate('/dashboard');
      }
    }
  }, [currentSession, navigate]);

  // beforeunload warning during active session
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentSession?.status === 'active') {
        e.preventDefault();
        e.returnValue = 'You have an active collaboration session. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentSession]);

  // Listen for exit request events (page-level UI only)
  useEffect(() => {
    socketService.onExitRequested((data) => {
      setIncomingExitRequest({
        requesterName: data.requesterName,
        reason: data.reason,
      });
    });

    socketService.onExitRequestSent(() => {
      setExitRequestSent(true);
    });

    socketService.onExitDeclined(() => {
      setExitRequestSent(false);
      setExitDeclined(true);
      setTimeout(() => setExitDeclined(false), 5000);
    });

    // Force logout from another device
    socketService.getSocket()?.on('session:force-logout', () => {
      endSession();
      navigate('/login');
    });
  }, [endSession, navigate]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg = newMessage.trim();

    // Check for @ai mention
    if (msg.toLowerCase().startsWith('@ai ') && currentSession) {
      const question = msg.substring(4).trim();
      if (question) {
        socketService.askAI(currentSession.id, question);
      }
    }

    // Always send the user's message too
    sendMessage(msg);
    setNewMessage('');
  }, [newMessage, currentSession, sendMessage]);

  const handleRequestExit = useCallback(() => {
    if (!currentSession) return;
    socketService.requestExit(currentSession.id, exitReason || 'Personal reasons');
    setShowExitModal(false);
  }, [currentSession, exitReason]);

  const handleApproveExit = useCallback(() => {
    if (!currentSession) return;
    socketService.approveExit(currentSession.id);
    setIncomingExitRequest(null);
  }, [currentSession]);

  const handleDeclineExit = useCallback(() => {
    if (!currentSession) return;
    socketService.declineExit(currentSession.id);
    setIncomingExitRequest(null);
  }, [currentSession]);

  const handleForceQuit = useCallback(() => {
    if (!currentSession) return;
    socketService.forceQuit(currentSession.id);
    setShowForceQuitConfirm(false);
    endSession();
    navigate('/dashboard');
  }, [currentSession, endSession, navigate]);

  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const task = currentSession?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    updateTask({ ...task, status: newStatus, updatedAt: new Date() });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitProject(submissionLink, submissionDescription);
    setShowSubmitModal(false);
  };

  if (!currentSession || !currentMatch) {
    return null;
  }

  const messages = currentSession.messages;
  const tasks = currentSession.tasks;
  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  const partnerId = currentMatch.user1Id === user?.id
    ? currentMatch.user2Id
    : currentMatch.user1Id;

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
                  {currentMatch.projectIdea?.title}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Partner: {partnerName || partnerId.substring(0, 8) + '...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Timer */}
              <div className="flex items-center gap-2 px-4 py-2 bg-pairon-accent-light dark:bg-pairon-accent/10 rounded-full">
                <Clock className="w-4 h-4 text-pairon-accent" />
                <span className="font-mono font-semibold text-pairon-accent">
                  {formatTime(timeRemaining)}
                </span>
              </div>

              {/* Request to Leave */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExitModal(true)}
                className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Request to leave
              </Button>

              {/* Force Leave (always available) */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForceQuitConfirm(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-1" />
                Force leave
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* AI hint */}
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-600 dark:text-blue-400">
              Type <strong>@ai your question</strong> to ask the AI assistant for help. Both you and your partner will see the response.
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => {
              const isMe = message.senderId === user?.id;
              const isSystem = message.type === 'system';
              const isAI = message.senderId === 'ai-assistant' || message.type === 'ai';

              if (isSystem) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                      {message.content}
                    </span>
                  </div>
                );
              }

              if (isAI) {
                return (
                  <div key={message.id} className="flex justify-start">
                    <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200 dark:border-blue-800 rounded-bl-md">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bot className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">AI Assistant</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{message.content}</p>
                      <span className="text-xs text-gray-400 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] px-4 py-2 rounded-2xl ${isMe
                      ? 'bg-pairon-accent text-white rounded-br-md'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md shadow-sm'
                      }`}
                  >
                    <p>{message.content}</p>
                    <span
                      className={`text-xs mt-1 ${isMe ? 'text-white/70' : 'text-gray-400'
                        }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message... (or @ai your question)"
                className="flex-1 rounded-full"
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-full bg-pairon-accent hover:bg-pairon-accent-dark"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Kanban Panel */}
        <div className="w-96 bg-gray-50 dark:bg-gray-900/50 flex flex-col border-r border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 className="font-display font-semibold text-gray-900 dark:text-white">
              Tasks
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* To Do */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Circle className="w-3 h-3" />
                To Do ({todoTasks.length})
              </h3>
              <div className="space-y-2">
                {todoTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskStatusChange(task.id, 'in-progress')}
                    className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {task.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* In Progress */}
            <div>
              <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <MoreHorizontal className="w-3 h-3" />
                In Progress ({inProgressTasks.length})
              </h3>
              <div className="space-y-2">
                {inProgressTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskStatusChange(task.id, 'done')}
                    className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {task.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Done */}
            <div>
              <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" />
                Done ({doneTasks.length})
              </h3>
              <div className="space-y-2">
                {doneTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl opacity-60"
                  >
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-through">
                      {task.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Project & Actions */}
        <div className="w-64 bg-white dark:bg-gray-800 p-4 space-y-6">
          {/* Match Info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Match Details
            </h3>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Score</span>
                <span className="font-medium text-pairon-accent">{currentMatch.matchScore}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Mode</span>
                <span className="font-medium text-gray-900 dark:text-white capitalize">{currentMatch.mode}</span>
              </div>
            </div>
          </div>

          {/* Project Info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Project
            </h3>
            <div className="p-3 bg-pairon-accent-light dark:bg-pairon-accent/10 rounded-xl">
              <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                {currentMatch.projectIdea?.title}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {currentMatch.projectIdea?.description}
              </p>
            </div>
          </div>

          {/* Submission Status */}
          {currentSession.submission ? (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                ✅ Project Submitted
              </p>
              <a
                href={currentSession.submission.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-pairon-accent hover:underline break-all"
              >
                {currentSession.submission.link}
              </a>
            </div>
          ) : (
            <Button
              onClick={() => setShowSubmitModal(true)}
              className="w-full pairon-btn-primary"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Submit project
            </Button>
          )}
        </div>
      </main>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] p-8 max-w-md w-full"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white">
                Submit project
              </h2>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project link
                </label>
                <Input
                  type="url"
                  value={submissionLink}
                  onChange={(e) => setSubmissionLink(e.target.value)}
                  placeholder="https://github.com/..."
                  className="rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={submissionDescription}
                  onChange={(e) => setSubmissionDescription(e.target.value)}
                  placeholder="What did you build?"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none h-24"
                  required
                />
              </div>

              <Button type="submit" className="w-full pairon-btn-primary">
                Submit
              </Button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Exit Request Modal */}
      <AnimatePresence>
        {showExitModal && (
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
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6"
            >
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
                Request to leave?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                Your partner must approve your request. If they decline, you can force-quit but your <strong className="text-red-500">reputation will decrease</strong> and your partner will receive <strong className="text-green-500">10 credits</strong>.
              </p>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Reason (optional)
                </label>
                <Input
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  placeholder="Why do you want to leave?"
                  className="rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowExitModal(false)}
                  className="flex-1 rounded-xl"
                >
                  Stay
                </Button>
                <Button
                  onClick={handleRequestExit}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl"
                >
                  Send request
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming Exit Request Modal */}
      <AnimatePresence>
        {incomingExitRequest && (
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
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white mb-2">
                Partner wants to leave
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                <strong>{incomingExitRequest.requesterName}</strong> has requested to end the collaboration.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 italic">
                Reason: "{incomingExitRequest.reason}"
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleDeclineExit}
                  className="flex-1 rounded-xl"
                >
                  Decline
                </Button>
                <Button
                  onClick={handleApproveExit}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-xl"
                >
                  Approve
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Request Sent Banner */}
      {exitRequestSent && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3"
          >
            <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            Waiting for partner to approve your exit request...
          </motion.div>
        </div>
      )}

      {/* Exit Declined Banner */}
      {exitDeclined && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Your exit request was declined.</span>
            <Button
              size="sm"
              onClick={() => setShowForceQuitConfirm(true)}
              className="bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs px-3"
            >
              Force quit (-reputation)
            </Button>
          </motion.div>
        </div>
      )}

      {/* Force Quit Confirm */}
      <AnimatePresence>
        {showForceQuitConfirm && (
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
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white mb-2">
                Force quit?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This will <strong className="text-red-500">reduce your reputation by 5</strong> and award your partner <strong className="text-green-500">10 credits</strong>. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowForceQuitConfirm(false)}
                  className="flex-1 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleForceQuit}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl"
                >
                  Force quit
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity Check Overlay */}
      <AnimatePresence>
        {showActivityCheck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white mb-1">
                Activity Check
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Slide to the <strong className="text-green-500">green zone</strong> to verify you're active
              </p>

              {/* Timer */}
              <div className="flex items-center justify-center gap-1 mb-4">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={`text-sm font-mono font-semibold ${activityCheckTimer <= 10 ? 'text-red-500' : 'text-gray-500'}`}>
                  {activityCheckTimer}s
                </span>
              </div>

              {/* Slider track with target zone */}
              <div className="relative mb-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                  {/* Target zone highlight */}
                  <div
                    className="absolute top-0 bottom-0 bg-green-200 dark:bg-green-800/50 border-l-2 border-r-2 border-green-500"
                    style={{
                      left: `${targetZone.min}%`,
                      width: `${targetZone.max - targetZone.min}%`,
                    }}
                  />
                  {/* Current position indicator */}
                  <div
                    className={`absolute top-0 bottom-0 w-2 rounded-full transition-all ${sliderValue >= targetZone.min && sliderValue <= targetZone.max
                        ? 'bg-green-500 shadow-lg shadow-green-500/50'
                        : 'bg-pairon-accent'
                      }`}
                    style={{ left: `${sliderValue}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="w-full absolute top-0 left-0 h-8 opacity-0 cursor-pointer"
                />
              </div>

              {/* Status */}
              <p className={`text-sm font-medium mb-4 ${sliderValue >= targetZone.min && sliderValue <= targetZone.max
                  ? 'text-green-500'
                  : 'text-gray-400'
                }`}>
                {sliderValue >= targetZone.min && sliderValue <= targetZone.max
                  ? '✅ Perfect! Click verify!'
                  : `Slide to the green zone (${targetZone.min}% - ${targetZone.max}%)`
                }
              </p>

              <Button
                onClick={handleActivityVerified}
                disabled={sliderValue < targetZone.min || sliderValue > targetZone.max}
                className="w-full pairon-btn-primary rounded-xl"
              >
                Verify
              </Button>

              {activityCheckTimer === 0 && (
                <p className="text-xs text-red-500 mt-3">
                  ⚠️ Time's up! Your partner has been notified you may be inactive.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Expired Overlay */}
      <AnimatePresence>
        {timeExpired && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center"
            >
              <div className="w-16 h-16 bg-pairon-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-pairon-accent" />
              </div>
              <h3 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                ⏰ Time's Up!
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                Your collaboration session has ended. Great work!
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
                {currentSession?.submission
                  ? '✅ Your project has been submitted.'
                  : '💡 You can still submit your project before leaving.'}
              </p>

              <div className="flex gap-3">
                {!currentSession?.submission && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSubmitModal(true);
                    }}
                    className="flex-1 rounded-xl"
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    Submit project
                  </Button>
                )}
                <Button
                  onClick={() => {
                    endSession();
                    navigate('/dashboard');
                  }}
                  className="flex-1 pairon-btn-primary rounded-xl"
                >
                  Exit session
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
