import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Zap, ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP verification state
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Step 1: Validate form and send OTP
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    // Password constraints
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      setError('Password must contain at least one special character (!@#$%^&*...)');
      return;
    }

    setOtpSending(true);
    try {
      await api.sendOTP(email);
      setStep('otp');
      startResendCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setOtpSending(false);
    }
  };

  // Start 60s cooldown for resend
  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Resend OTP
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setOtpSending(true);
    try {
      await api.sendOTP(email);
      startResendCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setOtpSending(false);
    }
  };

  // Step 2: Verify OTP and create account
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setOtpVerifying(true);
    try {
      // First verify OTP
      const { verified } = await api.verifyOTP(email, otpCode);
      if (!verified) {
        setError('Invalid or expired code');
        setOtpVerifying(false);
        return;
      }

      // OTP verified — now create account
      setIsLoading(true);
      await register({ email, password, name });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setOtpVerifying(false);
      setIsLoading(false);
    }
  };

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
        onClick={() => step === 'otp' ? setStep('form') : navigate('/')}
        className="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 text-gray-600 dark:text-gray-400"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm">{step === 'otp' ? 'Back' : 'Home'}</span>
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
          <AnimatePresence mode="wait">
            {step === 'form' ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Create your account
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Start your journey to better collaborations
                </p>

                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-pairon-accent text-white flex items-center justify-center text-xs font-bold">1</div>
                    <span className="text-xs font-medium text-pairon-accent">Details</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-gray-200 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-xs text-gray-400">Verify</span>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                      Full name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="mt-1 rounded-xl"
                      required
                    />
                  </div>

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
                        minLength={8}
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
                    <div className="mt-2 space-y-1">
                      {[
                        { label: '8+ characters', met: password.length >= 8 },
                        { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
                        { label: 'Lowercase letter', met: /[a-z]/.test(password) },
                        { label: 'Number', met: /[0-9]/.test(password) },
                        { label: 'Special character (!@#$...)', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
                      ].map(({ label, met }) => (
                        <p key={label} className={`text-xs flex items-center gap-1.5 ${met ? 'text-green-500' : 'text-gray-400'}`}>
                          {met ? '✓' : '○'} {label}
                        </p>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={otpSending}
                    className="w-full pairon-btn-primary py-3 h-auto mt-6"
                  >
                    {otpSending ? (
                      <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Sending code...</>
                    ) : (
                      <><Mail className="w-4 h-4 mr-2" /> Continue — Verify Email</>
                    )}
                  </Button>
                </form>

                <p className="text-center mt-6 text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{' '}
                  <Link to="/login" className="text-pairon-accent hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-pairon-accent/10 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-pairon-accent" />
                  </div>
                  <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Verify your email
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    We sent a 6-digit code to
                  </p>
                  <p className="text-pairon-accent font-semibold text-sm">{email}</p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-xs text-green-600 font-medium">Details</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-pairon-accent" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-pairon-accent text-white flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-xs font-medium text-pairon-accent">Verify</span>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleVerifyAndRegister} className="space-y-4">
                  <div>
                    <Label htmlFor="otp" className="text-gray-700 dark:text-gray-300">
                      Verification Code
                    </Label>
                    <Input
                      id="otp"
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="mt-1 rounded-xl text-center text-2xl tracking-[0.5em] font-mono"
                      maxLength={6}
                      autoFocus
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Check your inbox (and spam folder)
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={otpVerifying || isLoading || otpCode.length !== 6}
                    className="w-full pairon-btn-primary py-3 h-auto"
                  >
                    {otpVerifying || isLoading ? (
                      <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Verifying...</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4 mr-2" /> Verify & Create Account</>
                    )}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendCooldown > 0 || otpSending}
                      className={`text-sm ${resendCooldown > 0 ? 'text-gray-400' : 'text-pairon-accent hover:underline cursor-pointer'}`}
                    >
                      {otpSending ? 'Sending...' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
