import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, X, MessageCircle, UserPlus, Users, Handshake, AlertTriangle, Info, Clock } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import type { Notification } from '@/context/NotificationContext';
import { useNavigate } from 'react-router-dom';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getNotifIcon(type: Notification['type']) {
  switch (type) {
    case 'friend-request': return <UserPlus className="w-4 h-4 text-indigo-400" />;
    case 'friend-accepted': return <Users className="w-4 h-4 text-green-400" />;
    case 'friend-declined': return <Users className="w-4 h-4 text-red-400" />;
    case 'dm': return <MessageCircle className="w-4 h-4 text-blue-400" />;
    case 'collab-proposal': return <Handshake className="w-4 h-4 text-emerald-400" />;
    case 'collab-declined': return <Handshake className="w-4 h-4 text-red-400" />;
    case 'force-quit-partner': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'time-up': return <Clock className="w-4 h-4 text-orange-400" />;
    default: return <Info className="w-4 h-4 text-gray-400" />;
  }
}

function getNotifColor(type: Notification['type']) {
  switch (type) {
    case 'friend-request': return 'bg-indigo-500/10';
    case 'friend-accepted': return 'bg-green-500/10';
    case 'friend-declined': case 'collab-declined': return 'bg-red-500/10';
    case 'dm': return 'bg-blue-500/10';
    case 'collab-proposal': return 'bg-emerald-500/10';
    case 'force-quit-partner': return 'bg-amber-500/10';
    case 'time-up': return 'bg-orange-500/10';
    default: return 'bg-gray-500/10';
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNotifClick = (n: Notification) => {
    markRead(n.id);
    // Navigate based on type
    if (n.type === 'dm' && n.data?.fromId) {
      navigate(`/messages?friendId=${n.data.fromId}&friendName=${encodeURIComponent(n.data.fromName || '')}`);
      setOpen(false);
    } else if (n.type === 'friend-request' || n.type === 'friend-accepted') {
      navigate('/friends');
      setOpen(false);
    } else if (n.type === 'collab-proposal') {
      navigate('/quick-connect');
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Mobile overlay backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40 sm:hidden" onClick={() => setOpen(false)} />

          <div className="fixed left-2 right-2 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
            style={{ animation: 'slideDown 0.2s ease' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-pairon-accent hover:text-pairon-accent/80 px-2 py-1 rounded-lg hover:bg-pairon-accent/10 transition-colors flex items-center gap-1"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Read all
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                  <Bell className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No notifications</p>
                  <p className="text-xs mt-1">You're all caught up!</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-0
                      ${n.read
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        : 'bg-pairon-accent/5 hover:bg-pairon-accent/10'
                      }`}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-full ${getNotifColor(n.type)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      {getNotifIcon(n.type)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white font-medium'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{timeAgo(n.timestamp)}</p>
                    </div>
                    {/* Unread dot */}
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-pairon-accent flex-shrink-0 mt-2" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
