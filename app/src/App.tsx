import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, ThemeProvider, MatchingProvider, CallProvider } from '@/context';
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

// ===== Global Notification System =====
interface FriendNotif {
  friendshipId: string;
  requesterId: string;
  requesterName: string;
  requesterReputation: number;
}

interface Toast {
  id: string;
  type: 'friend-request' | 'friend-accepted' | 'friend-declined' | 'dm';
  title: string;
  body: string;
  data?: any;
}

function GlobalNotifier() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [responding, setResponding] = useState<string | null>(null);

  const addToast = (t: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev.slice(-2), { ...t, id }]); // max 3 toasts
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 8000);
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = socketService.getSocket();
    if (!socket) return;

    // Friend request received
    socket.on('friend:request-received', (data: FriendNotif) => {
      addToast({ type: 'friend-request', title: `${data.requesterName} sent you a friend request`, body: `⭐ ${data.requesterReputation} reputation`, data });
    });

    // Friend request accepted — you sent a request and they accepted
    socket.on('friend:request-accepted', (data: { accepterName: string }) => {
      addToast({ type: 'friend-accepted', title: `${data.accepterName} accepted your friend request!`, body: '🎉 You are now friends' });
    });

    // Friend request declined
    socket.on('friend:request-declined', () => {
      addToast({ type: 'friend-declined', title: 'Friend request was declined', body: '' });
    });

    // New DM message (when not on messages page)
    socket.on('dm:new-message', (data: { fromId: string; fromName: string; message: { content: string } }) => {
      const onMessagesPage = window.location.pathname === '/messages';
      if (!onMessagesPage) {
        addToast({
          type: 'dm',
          title: `💬 ${data.fromName}`,
          body: data.message.content.slice(0, 60),
          data,
        });
      }
    });

    return () => {
      socket.off('friend:request-received');
      socket.off('friend:request-accepted');
      socket.off('friend:request-declined');
      socket.off('dm:new-message');
    };
  }, [isAuthenticated]);


  const respond = async (friendshipId: string, action: 'accept' | 'decline', toastId: string) => {
    setResponding(friendshipId);
    try {
      const token = localStorage.getItem('pairon_token') || '';
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      await fetch(`${API}/api/friends/${friendshipId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* best effort */ }
    setResponding(null);
    removeToast(toastId);
  };

  return (
    <>
      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: '100%', maxWidth: 360, pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              background: '#1e2030', border: `1px solid ${toast.type === 'friend-request' ? 'rgba(99,102,241,0.4)' : toast.type === 'friend-accepted' ? 'rgba(16,185,129,0.4)' : toast.type === 'friend-declined' ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
              borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '14px 16px', width: '100%', pointerEvents: 'all',
              animation: 'slideUp 0.3s ease',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: toast.type === 'dm' ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (toast.type === 'dm' && toast.data?.fromId) {
                navigate(`/messages?friendId=${toast.data.fromId}&friendName=${encodeURIComponent(toast.data.fromName || '')}`);
                removeToast(toast.id);
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                background: toast.type === 'friend-request' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : toast.type === 'friend-accepted' ? 'linear-gradient(135deg,#10b981,#059669)' : toast.type === 'friend-declined' ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg,#6366f1,#06b6d4)',
              }}>
                {toast.type === 'friend-request' ? toast.data.requesterName.charAt(0).toUpperCase() : toast.type === 'friend-accepted' ? '✓' : toast.type === 'friend-declined' ? '✗' : '💬'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{toast.title}</div>
                {toast.body && <div style={{ color: '#9ca3af', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.body}</div>}

                {/* Actions for friend request */}
                {toast.type === 'friend-request' && toast.data && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => respond(toast.data.friendshipId, 'accept', toast.id)}
                      disabled={responding === toast.data.friendshipId}
                      style={{ padding: '5px 14px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: responding === toast.data.friendshipId ? 0.6 : 1 }}
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={() => respond(toast.data.friendshipId, 'decline', toast.id)}
                      disabled={responding === toast.data.friendshipId}
                      style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✗ Decline
                    </button>
                  </div>
                )}
              </div>

              <button onClick={() => removeToast(toast.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { box-shadow: 0 4px 24px rgba(99,102,241,0.5); } 50% { box-shadow: 0 4px 32px rgba(99,102,241,0.9); } }
      `}</style>
    </>
  );
}

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          <MatchingProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </MatchingProvider>
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

