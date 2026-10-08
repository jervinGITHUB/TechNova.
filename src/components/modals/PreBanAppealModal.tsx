import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { supabaseDb } from '../../lib/supabase';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  FileText,
  Send,
  X,
  ExternalLink,
  Loader2,
  Sparkles,
  Info,
} from 'lucide-react';

export const PreBanAppealModal: React.FC = () => {
  const {
    currentUser,
    preBanAppealModalOpen,
    setPreBanAppealModalOpen,
    submitPreBanAppeal,
  } = useApp();

  const [statement, setStatement] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [proofLinkUrl, setProofLinkUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live countdown timer state
  const [timeLeftStr, setTimeLeftStr] = useState<string>('24h remaining');
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    if (!currentUser?.warningDeadline) return;

    const updateTimer = () => {
      const deadlineMs = new Date(currentUser.warningDeadline!).getTime();
      const nowMs = Date.now();
      const diffMs = deadlineMs - nowMs;

      if (diffMs <= 0) {
        setTimeLeftStr('Deadline Expired');
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      if (hours > 0) {
        setTimeLeftStr(`${hours}h ${minutes}m ${seconds}s remaining`);
      } else {
        setTimeLeftStr(`${minutes}m ${seconds}s remaining`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.warningDeadline]);

  if (!preBanAppealModalOpen || !currentUser) return null;

  const warningReason = currentUser.warningReason || 'Violation of Community Guidelines';
  const hasSubmitted = currentUser.preBanAppealStatus === 'pending';
  const isApproved = currentUser.preBanAppealStatus === 'approved';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
      setFeedback({ type: 'error', text: 'Please select an image screenshot or PDF document.' });
      return;
    }

    setProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setProofPreviewUrl(objectUrl);
    setFeedback(null);
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim()) {
      setFeedback({ type: 'error', text: 'Please provide an explanation describing your defense.' });
      return;
    }

    if (!proofFile && !proofLinkUrl.trim() && !proofPreviewUrl) {
      setFeedback({ type: 'error', text: 'Please provide supporting proof (upload a screenshot or link).' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let finalProofUrl = proofLinkUrl.trim();
      let proofName = proofFile?.name || (proofLinkUrl ? 'Evidence Link' : 'Submitted Proof');

      // Upload file to Supabase if a file was selected
      if (proofFile) {
        const uploadRes = await supabaseDb.uploadAppealProof(proofFile);
        finalProofUrl = uploadRes.url || proofPreviewUrl;
      } else if (!finalProofUrl && proofPreviewUrl) {
        finalProofUrl = proofPreviewUrl;
      }

      const success = await submitPreBanAppeal(statement.trim(), finalProofUrl, proofName);
      if (success) {
        setFeedback({
          type: 'success',
          text: 'Appeal & proofs submitted! Administration is reviewing your evidence.',
        });
        setStatement('');
        setProofFile(null);
        setProofPreviewUrl('');
        setProofLinkUrl('');
      } else {
        setFeedback({ type: 'error', text: 'Failed to submit appeal. Please try again.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      <div className="fixed inset-0" onClick={() => setPreBanAppealModalOpen(false)} />

      <div className="relative w-full max-w-lg bg-[#12121a] border border-amber-500/40 rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_rgba(245,158,11,0.2)] z-10 max-h-[90vh] overflow-y-auto space-y-5 text-left">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold tracking-wider uppercase border border-amber-500/30">
                  Pre-Ban Due Process Notice
                </span>
              </div>
              <h2 className="text-lg font-bold font-brand text-white mt-1">
                Account Flagged for Review
              </h2>
            </div>
          </div>
          <button
            onClick={() => setPreBanAppealModalOpen(false)}
            className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reason & Countdown Timer Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-red-950/20 border border-red-500/30 space-y-1">
            <div className="text-[11px] font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Flagged Reason:</span>
            </div>
            <p className="text-xs font-semibold text-white leading-snug">
              "{warningReason}"
            </p>
          </div>

          <div
            className={`p-3.5 rounded-2xl border space-y-1 ${
              isExpired
                ? 'bg-red-950/30 border-red-500/40 text-red-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <div className="text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>Appeal Window:</span>
            </div>
            <p className="text-xs font-extrabold font-mono text-white tracking-wide">
              {timeLeftStr}
            </p>
          </div>
        </div>

        {/* Informative Due Process Notice */}
        <div className="p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 text-white font-bold text-xs">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Fair Hearing & Due Process Protection</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            ViralHub does not ban accounts immediately without giving you the right to respond. You have a chance to provide context and upload proof/evidence. If you submit proof, administrators will review it before taking any action. If you do not appeal before the deadline expires, the account may be suspended.
          </p>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border-red-500/30 text-red-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* CASE A: Already Submitted Appeal */}
        {hasSubmitted ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Defense & Proofs Submitted — Under Review</span>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Your explanation and supporting evidence have been dispatched directly to the ViralHub Administration Team. Your account remains fully active while they review your proofs.
            </p>

            {currentUser.preBanAppealReason && (
              <div className="p-3 rounded-xl bg-black/40 border border-neutral-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Your Submitted Explanation:
                </span>
                <p className="text-neutral-200 italic">"{currentUser.preBanAppealReason}"</p>
              </div>
            )}

            {currentUser.preBanAppealProofUrl && (
              <div className="p-3 rounded-xl bg-black/40 border border-neutral-800 text-xs space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Submitted Proof Attachment:
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={currentUser.preBanAppealProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="relative group block w-16 h-16 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-900 shrink-0"
                  >
                    <img
                      src={currentUser.preBanAppealProofUrl}
                      alt="Proof"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ExternalLink className="w-4 h-4 text-white" />
                    </div>
                  </a>
                  <div className="text-[11px] text-neutral-300 truncate">
                    <span className="font-semibold">{currentUser.preBanAppealProofName || 'Supporting Screenshot'}</span>
                    <a
                      href={currentUser.preBanAppealProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline block mt-0.5 text-[10px]"
                    >
                      Open Full Size Evidence ↗
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreBanAppealModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : (
          /* CASE B: Form to submit defense and proof */
          <form onSubmit={handleSubmitAppeal} className="space-y-4 text-xs">
            {/* Statement text */}
            <div className="space-y-1.5">
              <label className="font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#ff007a]" />
                  <span>1. Your Explanation & Defense Statement *</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {statement.length}/500
                </span>
              </label>
              <textarea
                value={statement}
                onChange={e => setStatement(e.target.value.slice(0, 500))}
                required
                rows={3}
                placeholder="Explain why this report is inaccurate or provide context proving your compliance with community guidelines..."
                className="w-full bg-[#181824] border border-neutral-700 rounded-2xl p-3 text-white placeholder-neutral-500 outline-none focus:border-[#ff007a] resize-none"
              />
            </div>

            {/* Evidence & Proof upload */}
            <div className="space-y-2">
              <label className="font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>2. Upload Counter-Proof / Evidence * (Screenshots, Receipts, Logs)</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />

              {proofPreviewUrl ? (
                <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={proofPreviewUrl}
                      alt="Proof Preview"
                      className="w-12 h-12 rounded-xl object-cover border border-neutral-700 shrink-0"
                    />
                    <div className="min-w-0 text-left">
                      <div className="font-semibold text-white truncate text-xs">
                        {proofFile?.name || 'Evidence Attachment'}
                      </div>
                      <div className="text-[10px] text-emerald-400">
                        ✓ Proof file attached and ready for review
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProofFile(null);
                      setProofPreviewUrl('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 border-2 border-dashed border-neutral-700 hover:border-cyan-500/60 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors"
                >
                  <Upload className="w-5 h-5 text-neutral-400" />
                  <span className="font-semibold text-neutral-200">
                    Click to upload screenshot or image evidence
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    Supports PNG, JPG, WebP, PDF (Max 15MB)
                  </span>
                </div>
              )}

              {/* Or external proof URL input */}
              <div className="pt-1">
                <input
                  type="url"
                  placeholder="Or paste evidence link / document URL (optional)..."
                  value={proofLinkUrl}
                  onChange={e => setProofLinkUrl(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setPreBanAppealModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !statement.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#ff007a] hover:from-amber-400 hover:to-pink-600 text-white font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Proofs...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Appeal & Counter-Proof</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
