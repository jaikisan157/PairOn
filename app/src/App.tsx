import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, ThemeProvider, MatchingProvider } from '@/context';
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
} from '@/pages';
import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/lib/socket';
import { useNavigate } from 'react-router-dom';

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

// ===== Global Friend Request Popup =====
interface FriendNotif {
  friendshipId: string;
  requesterId: string;
  requesterName: string;
  requesterReputation: number;
}

function FriendRequestNotifier() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [notif, setNotif] = useState<FriendNotif | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = socketService.getSocket();
    if (!socket) return;

    const handler = (data: FriendNotif) => {
      setNotif(data);
      // Auto-dismiss after 8s
      setTimeout(() => setNotif(null), 8000);
    };

    socket.on('friend:request-received', handler);
    return () => { socket.off('friend:request-received', handler); };
  }, [isAuthenticated]);

  if (!notif) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up"
      style={{ animation: 'slideUp 0.3s ease' }}
    >
      <div className="bg-[#1e2030] border border-indigo-500/40 rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 max-w-sm">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {notif.requesterName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{notif.requesterName}</p>
          <p className="text-xs text-gray-400">sent you a friend request · ⭐ {notif.requesterReputation}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => { navigate('/friends'); setNotif(null); }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg font-medium transition-colors"
          >
            View
          </button>
          <button
            onClick={() => setNotif(null)}
            className="px-2 py-1.5 text-gray-500 hover:text-white text-xs rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <FriendRequestNotifier />
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
        <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MatchingProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </MatchingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

