import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface Notification {
  id: string;
  type: 'friend-request' | 'friend-accepted' | 'friend-declined' | 'dm' | 'collab-proposal' | 'collab-declined' | 'info' | 'force-quit-partner' | 'session-completed' | 'time-up' | 'project-edit' | 'partner-submitted';
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  data?: any;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  add: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  markReadByData: (dataId: string, field?: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const STORAGE_KEY = 'pairon_notifications';
const MAX_NOTIFICATIONS = 50;

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Apply TTL rules on load
    const now = Date.now();
    return parsed.filter(n => {
      // 5-min TTL for actionable invites
      if (n.type === 'collab-proposal' && !n.read && (now - n.timestamp > 5 * 60 * 1000)) {
        return false;
      }
      // 30-day purge for read notifications
      if (n.read && (now - n.timestamp > 30 * 24 * 60 * 60 * 1000)) {
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

function saveNotifications(notifs: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, MAX_NOTIFICATIONS)));
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(loadNotifications);

  // Persist on change
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  // Periodic TTL cleanup for active sessions
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications(prev => {
        const now = Date.now();
        const filtered = prev.filter(n => {
          if (n.type === 'collab-proposal' && !n.read && (now - n.timestamp > 5 * 60 * 1000)) return false;
          if (n.read && (now - n.timestamp > 30 * 24 * 60 * 60 * 1000)) return false;
          return true;
        });
        // Only return new array if length changed to prevent unnecessary renders
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const add = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: Notification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markReadByData = useCallback((dataId: string, field = 'id') => {
    setNotifications(prev => prev.map(n => {
      if (!n.read && n.data && n.data[field] === dataId) {
        return { ...n, read: true };
      }
      return n;
    }));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, add, markRead, markAllRead, remove, markReadByData, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
