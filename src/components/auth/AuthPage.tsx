import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { User as UserIcon, Lock, CheckCircle2, Shield, KeyRound, AlertCircle } from 'lucide-react';
import { SupabaseVercelModal } from '../modals/SupabaseVercelModal';

export const AuthPage: React.FC = () => {
  const {
    authView,
    setAuthView,
    login,
    register,
    loginWithGoogle,
    supabaseModalOpen,
    setSupabaseModalOpen,
    syncWithSupabase,
    isSupabaseConnected,
  } = useApp();

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim()) {
      setErrorMessage('Please enter your username or email');
      return;
    }
    if (!loginPassword.trim()) {
      setErrorMessage('Please enter your password');
      return;
    }
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      const res = await login(loginIdentifier, loginPassword);
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim()) {
      setErrorMessage('Please choose a username');
      return;
    }
    if (!regEmail.trim()) {
      setErrorMessage('Please enter a valid email');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMessage('Your password must be 6-20 characters');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      const res = await register(regUsername, regEmail, regPassword);
      if (res.message) {
        if (!res.success) {
          setErrorMessage(res.message);
        } else {
          setInfoMessage(res.message);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle();
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google sign-in could not be initiated.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0e] text-white flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ff007a]/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top bar with Brand Logo & Supabase Connection helper */}
      <div className="w-full flex items-center justify-between z-10">
        <ViralHubLogo size="md" />
        <button
          type="button"
          onClick={() => setSupabaseModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181824] hover:bg-[#222232] border border-neutral-700/80 text-xs font-semibold text-neutral-300 hover:text-white transition-all cursor-pointer"
          title="Configure Supabase Database"
        >
          <span className={`w-2 h-2 rounded-full ${isSupabaseConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
          <span>{isSupabaseConnected ? 'Supabase Connected' : 'Connect Supabase'}</span>
        </button>
      </div>

      {/* Main Form Center Card */}
      <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 my-auto py-8 z-10">
        {/* Left Hero Graphic with Brand Logo */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
            <ViralHubLogo size="xl" showText={false} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold font-brand tracking-tight mt-2">
            VIRAL<span className="text-[#ff007a] drop-shadow-[0_0_12px_rgba(255,0,122,0.8)]">HUB</span>
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base mt-3 max-w-sm">
            Watch, create, stream, and connect with millions of viral creators and live streams worldwide.
          </p>
        </div>

        {/* Right Form Card: Login or Register */}
        <div className="w-full max-w-md bg-[#13131a]/90 border border-neutral-800/90 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {authView === 'login' ? (
            /* Login Form */
            <form onSubmit={handleLoginSubmit} className="flex flex-col">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold font-brand tracking-wide text-white">Login</h2>
                <p className="text-xs sm:text-sm text-neutral-400 mt-2">
                  Please enter your Login and your Password
                </p>
              </div>

              <div className="space-y-4">
                {/* Username or Email Input */}
                <div>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 text-neutral-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="Username or Email"
                      value={loginIdentifier}
                      onChange={e => setLoginIdentifier(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 pl-11 pr-4 py-3.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      placeholder="Password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 pl-11 pr-4 py-3.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => setErrorMessage('Password reset instructions will be sent to your registered email.')}
                      className="text-[11px] text-neutral-400 hover:text-white transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </div>

              {/* Log In Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? 'Signing in...' : 'Log In'}
              </button>

              {/* Continue with Google OAuth Button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGoogleSignIn}
                className="mt-3 w-full py-3 px-4 rounded-xl bg-[#1c1c27] hover:bg-[#232332] border border-neutral-700/80 text-white text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"
                  />
                </svg>
                <span>{isSubmitting ? 'Connecting...' : 'Continue with Google'}</span>
              </button>

              {/* Bottom switch to Register */}
              <div className="mt-8 text-center text-xs text-neutral-400">
                Not a member yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setInfoMessage('');
                    setAuthView('register');
                  }}
                  className="text-[#ff007a] hover:underline font-semibold cursor-pointer"
                >
                  Register!
                </button>
              </div>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegisterSubmit} className="flex flex-col">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-extrabold font-brand tracking-wide text-white">Register</h2>
                <p className="text-xs sm:text-sm text-neutral-400 mt-2">
                  Please enter your Name, Login and your Password
                </p>
              </div>

              <div className="space-y-3.5">
                {/* Username */}
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Username</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="Enter your username"
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Email</label>
                  <div className="relative flex items-center">
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Password</label>
                  <div className="relative flex items-center">
                    <input
                      type="password"
                      placeholder="Your password must be 6-20 characters"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Confirm Password</label>
                  <div className="relative flex items-center">
                    <input
                      type="password"
                      placeholder="Please confirm your password"
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Register Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? 'Creating account...' : 'Register'}
              </button>

              {/* Continue with Google OAuth Button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGoogleSignIn}
                className="mt-3 w-full py-3 px-4 rounded-xl bg-[#1c1c27] hover:bg-[#232332] border border-neutral-700/80 text-white text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"
                  />
                </svg>
                <span>{isSubmitting ? 'Connecting...' : 'Continue with Google'}</span>
              </button>

              {/* Back to Login link */}
              <div className="mt-6 text-center text-xs text-neutral-400">
                Already have an Account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setInfoMessage('');
                    setAuthView('login');
                  }}
                  className="text-[#ff007a] hover:underline font-semibold cursor-pointer"
                >
                  Login!
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Bottom Footer Credits */}
      <div className="w-full text-center text-xs text-neutral-500 z-10 flex flex-col items-center gap-2">
        <div>ViralHub &copy; 2026 · Social Video Platform & Live Stream Broadcast Studio</div>
      </div>

      <SupabaseVercelModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
        onConnected={syncWithSupabase}
      />
    </div>
  );
};
