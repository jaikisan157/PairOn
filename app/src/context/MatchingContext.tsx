import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { Match, MatchMode, CollaborationSession } from '@/types';
import { socketService } from '@/lib/socket';

interface MatchingContextType {
  isSearching: boolean;
  currentMatch: Match | null;
  currentSession: CollaborationSession | null;
  timeRemaining: number;
  partnerName: string;
  timeExpired: boolean;
  sessionEnded: boolean;
  searchMatch: (mode: MatchMode) => void;
  cancelSearch: () => void;
  endSession: () => void;
  submitProject: (link: string, description: string) => void;
  sendMessage: (content: string) => void;
  updateTask: (task: any) => void;
  error: string | null;
}

const MatchingContext = createContext<MatchingContextType | undefined>(undefined);

export function MatchingProvider({ children }: { children: React.ReactNode }) {
  const [isSearching, setIsSearching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentSession, setCurrentSession] = useState<CollaborationSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [timeExpired, setTimeExpired] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const savedMatch = localStorage.getItem('pairon_active_match');
      const savedSession = localStorage.getItem('pairon_active_session');
      if (savedMatch && savedSession) {
        const match = JSON.parse(savedMatch);
        const session = JSON.parse(savedSession);
        // Rehydrate dates
        match.startedAt = new Date(match.startedAt);
        match.endsAt = new Date(match.endsAt);
        session.startedAt = new Date(session.startedAt);
        session.endsAt = new Date(session.endsAt);

        // Check if session is still valid (not expired)
        const remaining = Math.max(0, Math.floor((session.endsAt.getTime() - Date.now()) / 1000));
        if (remaining > 0 && session.status === 'active') {
          setCurrentMatch(match);
          setCurrentSession(session);
          setTimeRemaining(remaining);
          setPartnerName(localStorage.getItem('pairon_partner_name') || '');

          // Rejoin the session room
          socketService.joinSession(session.id);

          // Restart countdown
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          // Session expired, clean up
          localStorage.removeItem('pairon_active_match');
          localStorage.removeItem('pairon_active_session');
        }
      }
    } catch {
      // Invalid data, clean up
      localStorage.removeItem('pairon_active_match');
      localStorage.removeItem('pairon_active_session');
    }
  }, []);

  // Setup socket event listeners — wait for socket to be ready
  useEffect(() => {
    let cleanedUp = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function setupListeners() {
      const socket = socketService.getSocket();
      if (!socket || cleanedUp) return false;

      // Match found
      socket.on('match:found', (data: any) => {
        setIsSearching(false);
        setError(null);

        const match: Match = {
          id: data.match.id,
          user1Id: data.match.user1Id,
          user2Id: data.match.user2Id,
          mode: data.match.mode,
          status: data.match.status,
          startedAt: new Date(data.match.startedAt),
          endsAt: new Date(data.match.endsAt),
          projectIdea: data.match.projectIdea,
          matchScore: data.match.matchScore,
        };

        // Store partner name
        if (data.match.partnerName) {
          setPartnerName(data.match.partnerName);
          localStorage.setItem('pairon_partner_name', data.match.partnerName);
        }

        const session: CollaborationSession = {
          id: data.session.id,
          matchId: data.session.matchId,
          participants: data.session.participants,
          messages: data.session.messages || [],
          tasks: data.session.tasks || [],
          status: data.session.status,
          startedAt: new Date(data.session.startedAt),
          endsAt: new Date(data.session.endsAt),
        };

        setCurrentMatch(match);
        setCurrentSession(session);

        // Persist to localStorage for session recovery on refresh
        localStorage.setItem('pairon_active_match', JSON.stringify(match));
        localStorage.setItem('pairon_active_session', JSON.stringify(session));

        // Calculate initial time remaining
        const remaining = Math.max(0, Math.floor((session.endsAt.getTime() - Date.now()) / 1000));
        setTimeRemaining(remaining);

        // Join the session room
        socketService.joinSession(data.session.id);

        // Start client-side countdown
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTimeRemaining(prev => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      });

      // Waiting for match
      socket.on('match:waiting', () => {
        // Still searching — no action needed
      });

      // Match error
      socket.on('match:error', (msg: string) => {
        setIsSearching(false);
        setError(msg);
      });

      // Match cancelled
      socket.on('match:cancelled', () => {
        setIsSearching(false);
      });

      // New message from partner
      socket.on('session:message', (message: any) => {
        setCurrentSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, message],
          };
        });
      });

      // Task updated
      socket.on('session:task-updated', (task: any) => {
        setCurrentSession(prev => {
          if (!prev) return prev;
          const existingIndex = prev.tasks.findIndex(t => t.id === task.id);
          const updatedTasks = [...prev.tasks];
          if (existingIndex >= 0) {
            updatedTasks[existingIndex] = task;
          } else {
            updatedTasks.push(task);
          }
          return { ...prev, tasks: updatedTasks };
        });
      });

      // Server timer sync
      socket.on('session:timer-update', (serverTimeRemaining: number) => {
        setTimeRemaining(serverTimeRemaining);
      });

      // Session completed
      socket.on('session:completed', (submission: any) => {
        setCurrentSession(prev => {
          if (!prev) return prev;
          return { ...prev, submission, status: 'completed' };
        });
      });

      // Time's up
      socket.on('session:time-up', () => {
        setTimeRemaining(0);
        setTimeExpired(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setCurrentSession(prev => {
          if (!prev) return prev;
          return { ...prev, status: 'completed' };
        });
      });

      // Exit approved
      socket.on('session:exit-approved', () => {
        setSessionEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setCurrentMatch(null);
        setCurrentSession(null);
        setTimeRemaining(0);
        localStorage.removeItem('pairon_active_match');
        localStorage.removeItem('pairon_active_session');
        localStorage.removeItem('pairon_partner_name');
      });

      // Force quit by partner
      socket.on('session:force-quit', () => {
        setSessionEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setCurrentMatch(null);
        setCurrentSession(null);
        setTimeRemaining(0);
        localStorage.removeItem('pairon_active_match');
        localStorage.removeItem('pairon_active_session');
        localStorage.removeItem('pairon_partner_name');
      });

      return true; // listeners registered
    }

    // Try immediately
    if (!setupListeners()) {
      // Socket not ready — poll every 500ms until it's available
      pollTimer = setInterval(() => {
        if (setupListeners()) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 500);
    }

    return () => {
      cleanedUp = true;
      if (pollTimer) clearInterval(pollTimer);
      socketService.removeAllListeners();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const searchMatch = useCallback((mode: MatchMode) => {
    setIsSearching(true);
    setError(null);
    socketService.requestMatch(mode);
  }, []);

  const cancelSearch = useCallback(() => {
    socketService.cancelMatch();
    setIsSearching(false);
  }, []);

  const endSession = useCallback(() => {
    if (currentSession) {
      socketService.leaveSession(currentSession.id);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setCurrentMatch(null);
    setCurrentSession(null);
    setTimeRemaining(0);
    setTimeExpired(false);
    setSessionEnded(false);
    setPartnerName('');

    // Clear persisted session
    localStorage.removeItem('pairon_active_match');
    localStorage.removeItem('pairon_active_session');
    localStorage.removeItem('pairon_partner_name');
  }, [currentSession]);

  const submitProject = useCallback((link: string, description: string) => {
    if (!currentSession) return;
    socketService.submitProject(currentSession.id, link, description);
  }, [currentSession]);

  const sendMessage = useCallback((content: string) => {
    if (!currentSession) return;
    socketService.sendMessage(currentSession.id, content);
  }, [currentSession]);

  const updateTask = useCallback((task: any) => {
    if (!currentSession) return;
    socketService.updateTask(currentSession.id, task);
  }, [currentSession]);

  return (
    <MatchingContext.Provider
      value={{
        isSearching,
        currentMatch,
        currentSession,
        timeRemaining,
        partnerName,
        timeExpired,
        sessionEnded,
        searchMatch,
        cancelSearch,
        endSession,
        submitProject,
        sendMessage,
        updateTask,
        error,
      }}
    >
      {children}
    </MatchingContext.Provider>
  );
}

export function useMatching() {
  const context = useContext(MatchingContext);
  if (context === undefined) {
    throw new Error('useMatching must be used within a MatchingProvider');
  }
  return context;
}
