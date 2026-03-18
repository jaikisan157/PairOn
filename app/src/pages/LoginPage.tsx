import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Zap, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { socketService } from '@/lib/socket';

// Google OAuth SVG icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

// GitHub SVG icon
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google/GitHub OAuth redirect callbacks
  useEffect(() => {
    // GitHub Sign-In callback — token is passed directly in query
    const githubToken = searchParams.get('github_token');
    if (githubToken) {
      window.history.replaceState({}, '', '/login');
      setGithubLoading(true);
      // Fetch user data with the token
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/me`, {
        headers: { Authorization: `Bearer ${githubToken}` },
      })
        .then((r) => r.json())
        .then(({ user }) => {
          localStorage.setItem('pairon_token', githubToken);
          localStorage.setItem('pairon_user', JSON.stringify(user));
          socketService.connect(githubToken);
          window.location.href = '/dashboard';
        })
        .catch(() => {
          setError('GitHub sign-in failed. Please try again.');
          setGithubLoading(false);
        });
      return;
    }

    // GitHub error
    const githubError = searchParams.get('github');
    if (githubError === 'error') {
      const reason = searchParams.get('reason') || 'unknown';
      window.history.replaceState({}, '', '/login');
      setError(`GitHub sign-in failed: ${reason.replace(/_/g, ' ')}`);
      return;
    }

    // Google OAuth callback (authorization code)
    const code = searchParams.get('code');
    if (!code) return;
    window.history.replaceState({}, '', '/login');
    setGoogleLoading(true);
    setError('');
    api.googleAuth(code)
      .then(({ token, user }) => {
        localStorage.setItem('pairon_token', token);
        localStorage.setItem('pairon_user', JSON.stringify(user));
        socketService.connect(token);
        window.location.href = '/dashboard';
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
        setGoogleLoading(false);
      });
  }, [searchParams]);

  // Google Sign-In via redirect
  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/login`;
    const googleAuthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&prompt=select_account`;
    window.location.href = googleAuthUrl;
  };

  // GitHub Sign-In via backend redirect
  const handleGitHubSignIn = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.location.href = `${apiUrl}/api/auth/github/login`;
  };

  const oauthLoading = googleLoading || githubLoading;

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center p-4">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
      >
        {theme === 'light' ? (
          <span className="text-gray-600">🌙</span>
        ) : (
          <span className="text-gray-400">☀️</span>
        )}
      </button>

      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 text-gray-600 dark:text-gray-400"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm">Back</span>
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-pairon-accent flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="font-display font-bold text-2xl text-gray-900 dark:text-white">
              PairOn
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8">
          <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            Welcome back
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            Sign in to continue building together
          </p>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-4">
            {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={oauthLoading}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl py-3 h-auto font-medium transition-colors"
              >
                {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><GoogleIcon />Sign in with Google</>}
              </Button>
            )}

            <Button
              type="button"
              onClick={handleGitHubSignIn}
              disabled={oauthLoading}
              className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-xl py-3 h-auto font-medium transition-colors"
            >
              {githubLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><GitHubIcon />Sign in with GitHub</>}
            </Button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400">
                or sign in with email
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-gray-700 dark:text-gray-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 rounded-xl"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <input type="checkbox" className="rounded border-gray-300" />
                Remember me
              </label>
              <a href="#" className="text-pairon-accent hover:underline">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full pairon-btn-primary py-3 h-auto"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <p className="text-center mt-6 text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-pairon-accent hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
