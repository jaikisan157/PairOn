import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  Clock,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Link2,
  X,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useMatching } from '@/context/MatchingContext';
import { formatTime } from '@/lib/utils';
import type { TaskStatus } from '@/types';

export function CollaborationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentMatch,
    currentSession,
    timeRemaining,
    endSession,
    submitProject,
    sendMessage,
    updateTask,
  } = useMatching();

  const [newMessage, setNewMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionDescription, setSubmissionDescription] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirect if no active session
  useEffect(() => {
    if (!currentSession) {
      navigate('/dashboard');
    }
  }, [currentSession, navigate]);

  // Auto-scroll messages when new ones arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessage(newMessage.trim());
    setNewMessage('');
  };

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

  // Determine partner ID
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
                onClick={() => {
                  endSession();
                  navigate('/dashboard');
                }}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="font-display font-semibold text-gray-900 dark:text-white">
                  {currentMatch.projectIdea?.title}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Partner: {partnerId.substring(0, 8)}...
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

              {/* End Session */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  endSession();
                  navigate('/dashboard');
                }}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                End session
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => {
              const isMe = message.senderId === user?.id;
              const isSystem = message.type === 'system';

              if (isSystem) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                      {message.content}
                    </span>
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
                placeholder="Type a message..."
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
    </div>
  );
}
