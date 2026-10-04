import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { formatRealtimeAgo } from '../../utils/time';
import {
  ShieldAlert,
  Ban,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  LogOut,
  ArrowRightLeft,
  RefreshCw,
  AlertTriangle,
  FileText,
} from 'lucide-react';

export const BannedAccountView: React.FC = () => {
  const {
    currentUser,
    logout,
    submitUserAppeal,
    syncWithSupabase,
    setSwitchAccountModalOpen,
  } = useApp();

  const [appealExplanation, setAppealExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!currentUser) return null;

  const banReason = currentUser.banReason || 'Violation of ViralHub Community Guidelines';
  const appealStatus = currentUser.appealStatus || 'none';

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReason = appealExplanation.trim();
    if (!cleanReason) {
      setErrorMsg('Please enter an explanation of why your account should be unbanned.');
      return;
    }
    if (cleanReason.length < 10) {
      setErrorMsg('Please provide a more detailed explanation (at least 10 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await submitUserAppeal(cleanReason);
      if (res) {
        setSuccessMsg('Your appeal has been submitted to the ViralHub Administration Team for review.');
        setAppealExplanation('');
      } else {
        setErrorMsg('Failed to submit appeal. Please check your connection and try again.');
      }
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncWithSupabase();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#09090d] text-white flex flex-col justify-between p-4 sm:p-6 antialiased selection:bg-[#ff007a] selection:text-white overflow-y-auto">
      {/* Top Bar */}
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between py-2 border-b border-neutral-800/80">
        <ViralHubLogo size="sm" showText={true} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
            title="Check if admin has unbanned your account"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#ff007a]' : ''}`} />
            <span className="hidden sm:inline">Refresh Status</span>
          </button>
          <button
            onClick={() => setSwitchAccountModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Switch Account</span>
          </button>
          <button
            onClick={() => logout(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-xl mx-auto my-auto py-8">
        <div className="bg-[#12121a] border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_40px_rgba(239,68,68,0.12)] space-y-6 text-left">
          
          {/* Header Warning */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
              <Ban className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold tracking-wider uppercase">
                  Account Suspended
                </span>
                {currentUser.bannedAt && (
                  <span className="text-neutral-500 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRealtimeAgo(currentUser.bannedAt)}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-brand text-white mt-1">
                Your Account Has Been Banned
              </h1>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Access to this account is temporarily restricted. You cannot browse feeds, post videos, send messages, or participate in live streams.
              </p>
            </div>
          </div>

          {/* User Profile Info Card */}
          <div className="p-3.5 rounded-2xl bg-[#171722] border border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar
                src={currentUser.avatar}
                alt={currentUser.displayName || currentUser.username}
                size="md"
                className="w-11 h-11 border border-neutral-700"
              />
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{currentUser.displayName}</span>
                  <span className="text-xs text-neutral-400 font-normal">(@{currentUser.username})</span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  {currentUser.email || 'No email associated'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-red-400 bg-red-950/60 px-2.5 py-1 rounded-lg border border-red-500/30">
                Suspended
              </span>
            </div>
          </div>

          {/* Reason Highlight Box */}
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/30 space-y-1.5">
            <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>Reason for Suspension:</span>
            </div>
            <p className="text-sm text-neutral-200 font-medium pl-5.5 leading-relaxed">
              "{banReason}"
            </p>
          </div>

          {/* Appeal Status / Form Area */}
          <div className="border-t border-neutral-800/80 pt-5 space-y-4">
            
            {/* Case 1: Appeal is Pending */}
            {appealStatus === 'pending' && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Appeal Submitted — Under Review</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Your ban appeal has been recorded and is currently being reviewed by the ViralHub Administration Team. You will receive an in-app notice and account status update once a decision is made.
                </p>
                {currentUser.appealReason && (
                  <div className="p-3 rounded-xl bg-black/40 border border-amber-500/20 text-xs">
                    <span className="text-amber-400/80 font-semibold block text-[11px] mb-1">
                      Your submitted explanation:
                    </span>
                    <p className="text-neutral-200 italic">
                      "{currentUser.appealReason}"
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                  <span>Status: Pending Administrator Decision</span>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Check for Updates
                  </button>
                </div>
              </div>
            )}

            {/* Case 2: Appeal Declined */}
            {appealStatus === 'declined' && (
              <div className="p-4 sm:p-5 rounded-2xl bg-red-950/30 border border-red-500/30 space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span>Appeal Reviewed & Declined</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Our moderation team reviewed your appeal and determined that the community guidelines violation stands. Your account suspension remains active.
                </p>
                <div className="pt-1">
                  <button
                    onClick={() => {
                      // Allow re-submitting if user wants to add further evidence
                      currentUser.appealStatus = 'none';
                      setAppealExplanation('');
                      setSuccessMsg('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                  >
                    Submit additional context or revised appeal
                  </button>
                </div>
              </div>
            )}

            {/* Case 3: No appeal submitted yet or ready to appeal */}
            {appealStatus !== 'pending' && appealStatus !== 'declined' && (
              <form onSubmit={handleAppealSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#ff007a]" />
                    <span>Appeal Ban Decision</span>
                  </label>
                  <span className="text-[11px] text-neutral-400">
                    {appealExplanation.length} / 500 characters
                  </span>
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  If you believe this ban was placed in error or have context that resolves this issue, explain why your account should be reinstated below.
                </p>

                <textarea
                  value={appealExplanation}
                  onChange={e => setAppealExplanation(e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="Explain why your account was reported, provide context, and explain why your suspension should be lifted..."
                  className="w-full bg-[#181824] border border-neutral-700/80 rounded-2xl p-3 text-xs text-white placeholder-neutral-500 outline-none focus:border-[#ff007a] transition-all resize-none"
                />

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !appealExplanation.trim()}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#ff007a] to-pink-600 hover:from-[#ff1a8c] hover:to-pink-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,0,122,0.35)] transition-all transform active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Appeal to Moderation...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Ban Appeal</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer Notice */}
      <div className="w-full max-w-xl mx-auto text-center text-[11px] text-neutral-500 py-2">
        ViralHub Safety & Community Moderation • Appeals are reviewed in the order received.
      </div>
    </div>
  );
};
