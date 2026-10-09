import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { updateSupabasePasswordAndSignOutAll } from '../../lib/supabase';
import { Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose }) => {
  const { logout, setAuthView } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateSupabasePasswordAndSignOutAll(newPassword);
      if (res.success) {
        setSuccessMessage(res.message);
        // Clear recovery hash or parameters from URL
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        setTimeout(() => {
          logout();
          setAuthView('login');
          onClose();
        }, 2500);
      } else {
        setErrorMessage(res.message || 'Failed to update password.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred while resetting password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#13131a] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#ff007a]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ff007a] to-[#7928ca] flex items-center justify-center text-white shadow-lg shadow-[#ff007a]/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-brand">Reset Password</h2>
              <p className="text-xs text-neutral-400">Choose a new, secure password</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">{successMessage}</span>
              <span className="text-[11px] text-emerald-500/80 mt-1 block">Redirecting to login in a moment...</span>
            </div>
          </div>
        )}

        {!successMessage ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
              <strong>Security Policy:</strong> Updating your password will immediately terminate all active sessions and log you out of all devices.
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                New Password
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-neutral-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-[#181824] text-sm text-white placeholder-neutral-500 pl-10 pr-10 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-neutral-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Confirm New Password
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-neutral-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full bg-[#181824] text-sm text-white placeholder-neutral-500 pl-10 pr-10 py-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-xs sm:text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating & Logging Out All Devices...</span>
                </>
              ) : (
                <span>Update Password & Log Out All Devices</span>
              )}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
};
