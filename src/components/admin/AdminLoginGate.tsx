import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { Shield, Lock, ArrowLeft, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AdminLoginGateProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({ onSuccess, onCancel }) => {
  const { elevateToAdmin, setActiveTab } = useApp();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Please enter your administrator passcode');
      return;
    }

    setIsVerifying(true);
    setError('');

    setTimeout(() => {
      const ok = elevateToAdmin(passcode.trim());
      setIsVerifying(false);
      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          if (onSuccess) onSuccess();
          setActiveTab('admin');
        }, 500);
      } else {
        setError('Invalid administrative passcode. Please verify your credentials.');
      }
    }, 400);
  };

  const handleReturnHome = () => {
    if (onCancel) {
      onCancel();
    } else {
      setActiveTab('home');
    }
  };

  return (
    <div className="flex-1 w-full h-full flex items-center justify-center p-4 sm:p-6 select-none bg-[#0a0a0f]">
      {/* Background ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#ff007a]/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-[#12121a] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-left z-10 backdrop-blur-md">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <ViralHubLogo size="sm" />
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase tracking-wider">
            <Shield className="w-3 h-3" />
            <span>Admin Portal</span>
          </span>
        </div>

        {/* Shield graphic & Title */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#1b1b28] to-[#252538] border border-neutral-700/80 flex items-center justify-center mx-auto shadow-inner text-purple-400">
            <Lock className="w-8 h-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-extrabold text-white font-brand">
            Restricted Administrator Access
          </h2>
          <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
            The admin control center is isolated from the client platform. Authenticate with your administrative credentials to continue.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 flex items-center justify-between">
              <span>Admin Passcode</span>
              <span className="text-[10px] text-neutral-500 font-mono">PIN / Secret</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="password"
                value={passcode}
                onChange={e => {
                  setPasscode(e.target.value);
                  setError('');
                }}
                placeholder="Enter passcode (e.g. admin123 or technova2026)"
                autoFocus
                className="w-full bg-[#181824] text-sm text-white placeholder-neutral-500 pl-10 pr-4 py-3 rounded-2xl border border-neutral-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all shadow-inner"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Authorized! Loading Admin Command Center...</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || success}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-[#ff007a] hover:from-purple-500 hover:to-[#ff1a8c] text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(168,85,247,0.35)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <span>Verifying authorization...</span>
            ) : success ? (
              <span>Session Granted</span>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Unlock Admin Portal</span>
              </>
            )}
          </button>
        </form>

        {/* Quick test hints for developer */}
        <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
          <div className="font-semibold text-neutral-300">Default Passcodes:</div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {['technova2026', 'viralhub2026', 'admin123'].map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setPasscode(code)}
                className="px-2 py-0.5 rounded-md bg-[#1f1f2e] hover:bg-[#28283d] text-purple-300 font-mono text-[10px] transition-colors cursor-pointer border border-purple-500/20"
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* Back to Client App */}
        <div className="pt-2 border-t border-neutral-800/80 text-center">
          <button
            type="button"
            onClick={handleReturnHome}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to ViralHub Client App</span>
          </button>
        </div>
      </div>
    </div>
  );
};
