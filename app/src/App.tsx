import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, ThemeProvider, MatchingProvider, CallProvider, NotificationProvider, useNotifications } from '@/context';
import { GlobalCallUI } from '@/components/GlobalCallUI';
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  DashboardPage,
  CollaborationPage,
  ProfilePage,
  AdminDashboardPage,
  QuickConnectPage,
  OnboardingPage,
  CreditsPage,
  FriendsPage,
  MessagesPage,
  UserProfileViewPage,
  ProjectsPage,
  CommunityPage,
} from '@/pages';

import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/lib/socket';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pairon-bg dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pairon-bg dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

import { GlobalNotifier } from '@/components/GlobalNotifier';
import { GlobalThemeToggle } from '@/components/GlobalThemeToggle';

function AppRoutes() {
  return (
    <>
      <GlobalNotifier />
      <GlobalCallUI />
      <Routes>
        <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/collaborate" element={<ProtectedRoute><CollaborationPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/quick-connect" element={<ProtectedRoute><QuickConnectPage /></ProtectedRoute>} />
        <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/users/:userId" element={<ProtectedRoute><UserProfileViewPage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <CallProvider>
            <MatchingProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </MatchingProvider>
          </CallProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

