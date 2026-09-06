import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  Shield,
  Lock,
  Brain,
  FileText,
  Mail,
  KeyRound,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Info,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    sendPasswordReset,
    error: authContextError,
    clearError,
    isConfigured,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register' | 'forgot'>('signin');

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & local validation states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeError = localError || authContextError;

  const handleModeChange = (newMode: 'signin' | 'register' | 'forgot') => {
    setMode(newMode);
    setLocalError(null);
    clearError();
    setSuccessMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    clearError();
    setSuccessMessage(null);
    setIsGoogleLoading(true);

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setLocalError(err?.message || 'Google sign in failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (mode === 'forgot') {
      setIsSubmitting(true);
      try {
        await sendPasswordReset(cleanEmail);
        setSuccessMessage(`Password recovery instructions sent to ${cleanEmail}. Check your inbox.`);
      } catch (err: any) {
        setLocalError(err?.message || 'Failed to send recovery email.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setLocalError('Please enter your full name or preferred display name.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please re-type your password.');
        return;
      }

      setIsSubmitting(true);
      try {
        await registerWithEmail(cleanEmail, password, displayName.trim());
      } catch (err: any) {
        setLocalError(err?.message || 'Registration failed. Please check your credentials.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Sign In mode
      setIsSubmitting(true);
      try {
        await signInWithEmail(cleanEmail, password);
      } catch (err: any) {
        setLocalError(err?.message || 'Sign in failed. Check your email and password.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col justify-between selection:bg-stone-200">
      {/* Top Navigation */}
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-xs sticky top-0 z-10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              J
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-stone-900">Personal Gemini Journal</h1>
              <p className="text-[11px] text-stone-500 font-mono">Zero-Trust AI Reflection Workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-600">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Encrypted Sovereign Storage</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        {/* Environment Status Badge */}
        {!isConfigured && (
          <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 shadow-2xs">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Interactive Preview Mode Active:</span> Both Google Sign-In and Email/Password Login &amp; Registration are fully functional in this preview sandbox with client-isolated cryptographic sessions. When you configure production Firebase credentials, it automatically connects to your live cloud project.
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Architectural Overview & Security Guarantees */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-xs font-medium text-stone-700">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sovereign Identity &amp; Tenant Isolation</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
                  Private, Reflective Journaling with Safe AI Memory
                </h2>
                <p className="text-stone-600 text-sm leading-relaxed">
                  A sanctuary designed from the ground up for introspection. Your journals, reflection conversations, AI memory bank, and weekly synthesized insights are strictly owned and accessible only by your verified identity.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3.5 pt-2">
                <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 shadow-2xs">
                    <Lock className="w-4 h-4 text-stone-700" />
                  </div>
                  <h3 className="text-xs font-semibold text-stone-900">Strict UID Scoping</h3>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Database security rules block cross-user access at the database engine.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 shadow-2xs">
                    <Brain className="w-4 h-4 text-stone-700" />
                  </div>
                  <h3 className="text-xs font-semibold text-stone-900">Protected AI Secrets</h3>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Gemini AI calls are mediated strictly via Cloud Run backend APIs.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 shadow-2xs">
                    <FileText className="w-4 h-4 text-stone-700" />
                  </div>
                  <h3 className="text-xs font-semibold text-stone-900">User Memory Control</h3>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Review, enable, disable, edit, or purge AI memories at any time.
                  </p>
                </div>
              </div>

              <div className="border-t border-stone-100 pt-4 flex items-center gap-3 text-xs text-stone-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Zero client-side authorization bypasses. Authenticated via Firebase Identity.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              {/* Header / Mode Switcher */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      id="tab-signin"
                      onClick={() => handleModeChange('signin')}
                      className={`text-sm font-semibold pb-1 cursor-pointer transition-colors ${
                        mode === 'signin'
                          ? 'text-stone-900 border-b-2 border-stone-900'
                          : 'text-stone-400 hover:text-stone-600'
                      }`}
                    >
                      Sign In
                    </button>
                    <span className="text-stone-300">|</span>
                    <button
                      type="button"
                      id="tab-register"
                      onClick={() => handleModeChange('register')}
                      className={`text-sm font-semibold pb-1 cursor-pointer transition-colors ${
                        mode === 'register'
                          ? 'text-stone-900 border-b-2 border-stone-900'
                          : 'text-stone-400 hover:text-stone-600'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>
                  {mode === 'forgot' && (
                    <span className="text-xs font-medium text-stone-500">Password Recovery</span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-stone-900 tracking-tight">
                    {mode === 'register'
                      ? 'Create your private journal'
                      : mode === 'forgot'
                      ? 'Reset your password'
                      : 'Welcome back to your journal'}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {mode === 'register'
                      ? 'Set up your secure, isolated workspace in seconds.'
                      : mode === 'forgot'
                      ? 'Enter your registered email to receive recovery instructions.'
                      : 'Enter your credentials or use Google to resume reflecting.'}
                  </p>
                </div>
              </div>

              {/* Error Message Display */}
              {activeError && (
                <div
                  id="auth-error-banner"
                  className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <p className="font-semibold text-red-900">Authentication Error</p>
                    <p className="mt-0.5 text-red-700">{activeError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      clearError();
                    }}
                    className="text-red-400 hover:text-red-700 font-bold text-sm px-1 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Success Message Display */}
              {successMessage && (
                <div
                  id="auth-success-banner"
                  className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5 animate-in fade-in duration-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <p className="font-semibold text-emerald-900">Success</p>
                    <p className="mt-0.5 text-emerald-700">{successMessage}</p>
                  </div>
                </div>
              )}

              {/* Primary Google Sign-In Button (shown for signin and register) */}
              {mode !== 'forgot' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    id="btn-google-auth"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-3 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl py-2.5 px-4 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-stone-600" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>
                      {mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}
                    </span>
                  </button>

                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-stone-200 w-full" />
                    <span className="bg-white px-3 text-[11px] font-medium uppercase tracking-wider text-stone-400 absolute">
                      or continue with email
                    </span>
                  </div>
                </div>
              )}

              {/* Email / Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {/* Full Name field (Register only) */}
                {mode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="register-name"
                      className="block text-xs font-semibold text-stone-700"
                    >
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="register-name"
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Alex Morgan"
                        autoComplete="name"
                        className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all text-stone-900"
                      />
                    </div>
                  </div>
                )}

                {/* Email field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-semibold text-stone-700"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@example.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all text-stone-900"
                    />
                  </div>
                </div>

                {/* Password field (Sign In and Register) */}
                {mode !== 'forgot' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-semibold text-stone-700"
                      >
                        Password
                      </label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          id="link-forgot-password"
                          onClick={() => handleModeChange('forgot')}
                          className="text-[11px] text-stone-500 hover:text-stone-900 cursor-pointer transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        className="w-full pl-9 pr-10 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all text-stone-900"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {mode === 'register' && (
                      <p className="text-[11px] text-stone-400">Must be at least 6 characters long.</p>
                    )}
                  </div>
                )}

                {/* Confirm Password field (Register only) */}
                {mode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="register-confirm-password"
                      className="block text-xs font-semibold text-stone-700"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="register-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all text-stone-900"
                      />
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  id="btn-submit-auth"
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 border border-stone-900 rounded-xl py-2.5 px-4 shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  <span>
                    {mode === 'register'
                      ? 'Create Account'
                      : mode === 'forgot'
                      ? 'Send Recovery Link'
                      : 'Sign In to Journal'}
                  </span>
                </button>

                {/* Back to sign in link when in forgot mode */}
                {mode === 'forgot' && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => handleModeChange('signin')}
                      className="text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                )}
              </form>

              {/* Mode switch helper in footer */}
              {mode !== 'forgot' && (
                <div className="border-t border-stone-100 pt-4 text-center text-xs text-stone-500">
                  {mode === 'signin' ? (
                    <span>
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => handleModeChange('register')}
                        className="font-semibold text-stone-900 hover:underline cursor-pointer"
                      >
                        Create one now
                      </button>
                    </span>
                  ) : (
                    <span>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => handleModeChange('signin')}
                        className="font-semibold text-stone-900 hover:underline cursor-pointer"
                      >
                        Sign in here
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white px-6 py-4 text-center text-xs text-stone-500">
        Personal Gemini Journal • Zero-Trust Production Architecture • Express + React + Firebase + Gemini
      </footer>
    </div>
  );
};
