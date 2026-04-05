import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AuthState, LoginCredentials, RegisterCredentials } from '@/types';
import { api } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('pairon_token');

    if (token) {
      // Validate token with backend
      api.getMe()
        .then(({ user }) => {
          localStorage.setItem('pairon_user', JSON.stringify(user));
          // Connect socket with valid token
          socketService.connect(token);
          setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        })
        .catch(() => {
          // Token invalid/expired — clean up
          localStorage.removeItem('pairon_token');
          localStorage.removeItem('pairon_user');
          setState(prev => ({ ...prev, isLoading: false }));
        });
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Listen for session expiration (another device/tab logged in)
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const handleConnectError = (err: Error) => {
      if (err.message === 'SESSION_EXPIRED') {
        socketService.disconnect();
        localStorage.removeItem('pairon_token');
        localStorage.removeItem('pairon_user');
        localStorage.removeItem('challenge_session');
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        setTerminatedReason('You logged in from another device. To prevent conflicts, this session has been disconnected.');
      }
    };

    const handleForceTerminate = () => {
      socketService.disconnect();
      localStorage.removeItem('pairon_token');
      localStorage.removeItem('pairon_user');
      localStorage.removeItem('challenge_session');
      setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
      });
      setTerminatedReason('A new tab or device connected to this session. To prevent conflicts, this old session has been disconnected.');
    };

    socketService.onConnectError(handleConnectError);
    // Bind force_terminate here instead of GlobalNotifier
    const socket = socketService.getSocket();
    if (socket) {
      socket.on('force_terminate', handleForceTerminate);
    } else {
      // wait until connected
      const checkSocket = setInterval(() => {
        const s = socketService.getSocket();
        if (s) {
          s.on('force_terminate', handleForceTerminate);
          clearInterval(checkSocket);
        }
      }, 500);
      return () => {
        clearInterval(checkSocket);
        const s = socketService.getSocket();
        if (s) s.off('force_terminate', handleForceTerminate);
      };
    }

    return () => {
      const s = socketService.getSocket();
      if (s) s.off('force_terminate', handleForceTerminate);
    };
  }, [state.isAuthenticated]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { token, user } = await api.login(credentials.email, credentials.password);

    localStorage.setItem('pairon_token', token);
    localStorage.setItem('pairon_user', JSON.stringify(user));

    // Connect socket
    socketService.connect(token);

    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const { token, user } = await api.register(
      credentials.email,
      credentials.password,
      credentials.name
    );

    localStorage.setItem('pairon_token', token);
    localStorage.setItem('pairon_user', JSON.stringify(user));

    // Connect socket
    socketService.connect(token);

    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    // Disconnect socket
    socketService.disconnect();

    localStorage.removeItem('pairon_token');
    localStorage.removeItem('pairon_user');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    if (!state.user) return;

    const { user: updatedUser } = await api.updateProfile(updates);

    localStorage.setItem('pairon_user', JSON.stringify(updatedUser));

    setState(prev => ({
      ...prev,
      user: updatedUser,
    }));
  }, [state.user]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {terminatedReason && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(8px)' }}>
           <div style={{ background: '#1e2030', padding: 40, borderRadius: 24, border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxWidth: 420, textAlign: 'center', animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 100001 }}>
               <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}>⚠️</div>
               <h2 style={{ color: 'white', fontSize: 24, margin: '0 0 12px', fontWeight: 700 }}>Session Terminated</h2>
               <p style={{ color: '#9ca3af', fontSize: 15, margin: '0 0 24px', lineHeight: 1.5 }}>{terminatedReason}</p>
               <button onClick={() => { setTerminatedReason(null); window.location.href = '/login'; }} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', width: '100%', transition: 'all 0.2s' }}>Return to Login</button>
           </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
