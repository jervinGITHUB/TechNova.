import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, Clock, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const PreBanWarningBanner: React.FC = () => {
  const { currentUser, setPreBanAppealModalOpen } = useApp();

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
        setTimeLeftStr(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeftStr(`${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.warningDeadline]);

  if (!currentUser?.warningActive) return null;

  const hasSubmittedAppeal = currentUser.preBanAppealStatus === 'pending';
  const reason = currentUser.warningReason || 'Violation of Community Guidelines';

  return (
    <div className="w-full bg-gradient-to-r from-amber-950/90 via-neutral-900 to-amber-950/90 border-b border-amber-500/40 px-3 sm:px-4 py-2.5 z-40 select-none animate-fadeIn shrink-0">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4">
        {/* Left message */}
        <div className="flex items-center gap-2.5 min-w-0 text-left">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 animate-pulse">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="text-xs min-w-0">
            <span className="font-extrabold text-amber-300 mr-1.5 uppercase tracking-wider text-[11px]">
              ⚠️ Due Process Notice:
            </span>
            <span className="text-neutral-200">
              Account flagged for <strong className="text-white">"{reason}"</strong>.
            </span>
            {hasSubmittedAppeal ? (
              <span className="text-cyan-300 font-semibold ml-1.5 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-cyan-400 inline" />
                Proof submitted — Admins reviewing.
              </span>
            ) : (
              <span className="text-neutral-300 ml-1.5 hidden md:inline">
                Submit your appeal & proofs before suspension.
              </span>
            )}
          </div>
        </div>

        {/* Right countdown + Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
              isExpired
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'bg-black/50 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{timeLeftStr}</span>
          </div>

          <button
            onClick={() => setPreBanAppealModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
              hasSubmittedAppeal
                ? 'bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
            }`}
          >
            <span>{hasSubmittedAppeal ? 'View Appeal Status' : 'Submit Proofs'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
