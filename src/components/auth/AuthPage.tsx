import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { Avatar } from '../common/Avatar';
import {
  User as UserIcon,
  Lock,
  CheckCircle2,
  AlertCircle,
  Mail,
  ArrowRight,
  RotateCw,
  UserPlus,
  X,
  Users,
} from 'lucide-react';
import { resendConfirmationEmail, sendPasswordResetEmail, isGoogleAccount, isAccountLoggedInOnDevice } from '../../lib/supabase';

export const AuthPage: React.FC = () => {
  const {
    authView,
    setAuthView,
    login,
    register,
    loginWithGoogle,
    quickLoginAs,
    savedAccounts,
    removeSavedAccount,
  } = useApp();

  // Saved accounts available on this device (limited to 5)
  const validSavedAccounts = savedAccounts
    .filter(a => a && a.id && (a.username || a.displayName))
    .slice(0, 5);

  const [showManualLoginForm, setShowManualLoginForm] = useState(false);

  // Prefill login identifier if redirected from switch account or sidebar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prefill = sessionStorage.getItem('viralhub_prefill_login');
      if (prefill) {
        sessionStorage.removeItem('viralhub_prefill_login');
        setLoginIdentifier(prefill);
        setShowManualLoginForm(true);
        setInfoMessage(`Please enter your password for ${prefill} to continue.`);
      }
    }
  }, []);

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

  // Email confirmation view state
  const [confirmationPendingEmail, setConfirmationPendingEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Forgot password view state
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotSuccessMessage, setForgotSuccessMessage] = useState('');

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    setErrorMessage('');
    setForgotSuccessMessage('');
    setIsSendingReset(true);
    try {
      const res = await sendPasswordResetEmail(forgotEmail);
      if (res.success) {
        setForgotSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message || 'Failed to dispatch password reset email.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error sending password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

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
    setResendStatus(null);
    setIsSubmitting(true);
    try {
      const res = await register(regUsername, regEmail, regPassword);
      if (!res.success) {
        setErrorMessage(res.message || 'Registration failed');
      } else if (res.needsEmailConfirmation) {
        setConfirmationPendingEmail(regEmail.trim());
      } else if (res.message) {
        setInfoMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!confirmationPendingEmail) return;
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await resendConfirmationEmail(confirmationPendingEmail);
      setResendStatus(res);
    } catch {
      setResendStatus({ success: false, message: 'Could not send verification email.' });
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle({ prompt: 'select_account' });
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google sign-in could not be initiated.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAccountClick = async (acc: any) => {
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle({ prompt: 'select_account' });
      if (!res.success && res.message) {
        setErrorMessage(res.message);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google sign-in could not be initiated.');
      setIsSubmitting(false);
    }
  };

  const handleCredentialAccountClick = (acc: any) => {
    setErrorMessage('');
    setInfoMessage(`Welcome back, @${acc.username || acc.displayName}! Please enter your password to sign in.`);
    setLoginIdentifier(acc.email || acc.username);
    setLoginPassword('');
    setShowManualLoginForm(true);
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0e] text-white flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ff007a]/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top bar with Brand Logo */}
      <div className="w-full flex items-center justify-between z-10">
        <ViralHubLogo size="md" />
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
        <div className="w-full max-w-md bg-[#13131a]/90 border border-neutral-800/90 rounded-3xl p-7 sm:p-9 shadow-2xl backdrop-blur-xl">
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

          {confirmationPendingEmail ? (
            /* Email Confirmation Screen */
            <div className="text-center py-2 space-y-5 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-[#ff007a]/20 text-[#ff007a] flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(255,0,122,0.4)]">
                <Mail className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-2xl font-extrabold font-brand tracking-wide text-white">Check Your Email</h2>
                <p className="text-xs text-neutral-300 mt-2 max-w-sm mx-auto leading-relaxed">
                  We sent an account activation link to{' '}
                  <span className="text-[#ff007a] font-bold break-all">{confirmationPendingEmail}</span>.
                </p>
                <p className="text-[11px] text-neutral-400 mt-2">
                  Please open the email and click the confirmation link. After confirming, you will be automatically signed in and taken to your Home feed!
                </p>
              </div>

              {resendStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center justify-center gap-2 ${
                    resendStatus.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{resendStatus.message}</span>
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const email = confirmationPendingEmail;
                    setConfirmationPendingEmail(null);
                    setAuthView('login');
                    setLoginIdentifier(email);
                    setShowManualLoginForm(true);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Go to Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={isResending}
                  onClick={handleResendConfirmation}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isResending ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{isResending ? 'Sending...' : 'Resend Confirmation Email'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConfirmationPendingEmail(null);
                    setErrorMessage('');
                    setInfoMessage('');
                  }}
                  className="text-[11px] text-neutral-500 hover:text-neutral-400 transition-colors cursor-pointer mt-1"
                >
                  Register with another email
                </button>
              </div>
            </div>
          ) : authView === 'login' ? (
            /* Forgot Password View */
            isForgotPasswordView ? (
              <form onSubmit={handleForgotSubmit} className="flex flex-col animate-fadeIn text-left">
                <div className="text-center mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordView(false);
                      setErrorMessage('');
                      setForgotSuccessMessage('');
                    }}
                    className="text-xs text-[#ff007a] hover:underline mb-2 inline-flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    ← Back to Login
                  </button>
                  <h2 className="text-2xl sm:text-3xl font-extrabold font-brand tracking-wide text-white">
                    Forgot Password
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                    Enter your email to receive a password reset link
                  </p>
                </div>

                {forgotSuccessMessage ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold text-white block">Email Sent!</span>
                        <p>{forgotSuccessMessage}</p>
                        <p className="text-neutral-400 text-[11px] pt-1">
                          Click the link inside your email to choose your new password. For security, changing your password will automatically log you out on all other devices.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordView(false);
                        setForgotSuccessMessage('');
                        setErrorMessage('');
                      }}
                      className="w-full py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Return to Log In
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/80 text-neutral-300 text-[11px] leading-relaxed">
                      We'll send a password recovery link to your inbox. Make sure to check your spam or junk folder if you don't see it within a couple minutes.
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                        Registered Email
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-4 text-neutral-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          placeholder="Your email address"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          className="w-full bg-[#181822] text-sm text-white placeholder-neutral-500 pl-11 pr-4 py-3.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingReset}
                      className="mt-2 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSendingReset ? (
                        <>
                          <RotateCw className="w-4 h-4 animate-spin" />
                          <span>Sending Reset Link...</span>
                        </>
                      ) : (
                        <span>Send Password Reset Link</span>
                      )}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPasswordView(false);
                          setErrorMessage('');
                        }}
                        className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Cancel and return to login
                      </button>
                    </div>
                  </div>
                )}
              </form>
            ) : validSavedAccounts.length > 0 && !showManualLoginForm ? (
              /* ============================================================= */
              /* SCENARIO A: Saved Logged-In Accounts on this Device (Max 5)   */
              /* ============================================================= */
              <div className="flex flex-col space-y-4 animate-fadeIn text-left">
                <div className="text-center mb-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff007a]/15 text-[#ff007a] text-xs font-bold mb-2">
                    <Users className="w-3.5 h-3.5" />
                    <span>Logged-in on this device ({validSavedAccounts.length}/5)</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold font-brand tracking-wide text-white">
                    Choose an Account
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Select an account to authenticate and sign in to ViralHub
                  </p>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {validSavedAccounts.map(acc => {
                    const isGoogle = isGoogleAccount(acc);
                    const isDeviceLoggedIn = isAccountLoggedInOnDevice(acc.id, acc.email);
                    const roleLower = String(acc.role || '').toLowerCase();
                    const isAdmin = roleLower === 'admin' || roleLower === 'super admin' || roleLower === 'administrator';

                    const handleClick = () => {
                      if (isDeviceLoggedIn) {
                        quickLoginAs(acc.id);
                      } else if (isGoogle) {
                        handleGoogleAccountClick(acc);
                      } else {
                        handleCredentialAccountClick(acc);
                      }
                    };

                    return (
                      <div
                        key={acc.id}
                        onClick={handleClick}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-[#181824] hover:bg-[#202030] border border-neutral-800 hover:border-[#ff007a]/70 transition-all cursor-pointer group shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={acc.avatar}
                            alt={acc.displayName || acc.username}
                            size="md"
                            className="border border-neutral-700 group-hover:border-[#ff007a] transition-colors"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-[#ff007a] transition-colors">
                                {acc.displayName || acc.username}
                              </span>
                              {isDeviceLoggedIn ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                  Active on device
                                </span>
                              ) : isGoogle ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] font-bold shrink-0">
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
                                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z"/>
                                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                                    <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"/>
                                    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"/>
                                  </svg>
                                  Google Account
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700 text-[9px] font-bold shrink-0">
                                  <Lock className="w-2.5 h-2.5 text-neutral-400" />
                                  Password
                                </span>
                              )}
                              {isAdmin && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-extrabold uppercase tracking-wider shrink-0">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                              @{acc.username} {acc.email ? `· ${acc.email}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              removeSavedAccount(acc.id);
                            }}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                            title="Remove account from device"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          <div className="h-7 px-2.5 rounded-full bg-[#ff007a]/15 group-hover:bg-[#ff007a] text-[#ff007a] group-hover:text-white flex items-center justify-center gap-1 text-[11px] font-bold transition-all">
                            <span>{isDeviceLoggedIn ? 'Switch to Account' : isGoogle ? 'Choose Account' : 'Enter Password'}</span>
                            <ArrowRight className="w-3 h-3" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Switch to manual credentials form */}
                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setShowManualLoginForm(true)}
                    className="w-full py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4 text-cyan-400" />
                    <span>Log in with Another Account or Password</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleGoogleSignIn}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#1c1c27] hover:bg-[#232332] border border-neutral-700/80 text-white text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
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
                </div>

                {/* Bottom switch to Register */}
                <div className="mt-4 text-center text-xs text-neutral-400">
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
              </div>
            ) : (
              /* ============================================================= */
              /* SCENARIO B: Manual Login with Username/Email and Password      */
              /* ============================================================= */
              <form onSubmit={handleLoginSubmit} className="flex flex-col animate-fadeIn">
                <div className="text-center mb-6">
                  {validSavedAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowManualLoginForm(false)}
                      className="text-xs text-[#ff007a] hover:underline mb-2 inline-flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      ← Back to saved accounts ({validSavedAccounts.length})
                    </button>
                  )}
                  <h2 className="text-3xl font-extrabold font-brand tracking-wide text-white">Login</h2>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-1">
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
                        onClick={() => {
                          setForgotEmail(loginIdentifier.includes('@') ? loginIdentifier : '');
                          setIsForgotPasswordView(true);
                          setErrorMessage('');
                          setInfoMessage('');
                        }}
                        className="text-[11px] text-neutral-400 hover:text-white transition-colors cursor-pointer"
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
            )
          ) : (
            /* Register Form */
            <form onSubmit={handleRegisterSubmit} className="flex flex-col animate-fadeIn">
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
                    setShowManualLoginForm(false);
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
    </div>
  );
};
