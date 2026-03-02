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
