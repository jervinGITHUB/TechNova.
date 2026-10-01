import React from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, Clock, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';

export const ReportHistoryView: React.FC = () => {
  const { reports } = useApp();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="text-emerald-400 font-semibold flex items-center gap-1 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved</span>
          </span>
        );
      case 'Rejected':
        return (
          <span className="text-neutral-400 font-semibold flex items-center gap-1 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </span>
        );
      default:
        return (
          <span className="text-pink-400 font-semibold flex items-center gap-1 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>Under Review</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-3xl mx-auto w-full text-left">
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-brand text-white flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-[#ff007a]" />
          <span>Report History</span>
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          Review the status and outcomes of complaints submitted under platform community guidelines
        </p>
      </div>

      {/* Reports List matching Screenshot 1 top left */}
      <div className="space-y-4">
        {reports.map(rep => (
          <div
            key={rep.id}
            className="flex items-center justify-between p-5 rounded-3xl bg-[#161622] border border-neutral-800 shadow-xl transition-all"
          >
            {/* Left Report Information */}
            <div className="space-y-1.5 min-w-0 pr-4">
              <div className="text-xs font-bold text-neutral-300 uppercase tracking-wide">
                Your report
              </div>
              <p className="text-xs sm:text-sm text-neutral-200 leading-snug">
                You anonymously reported{' '}
                <span className="font-semibold text-white">{rep.targetName}</span>{' '}
                {rep.targetSubtitle || `for ${rep.scenario.toLowerCase()}.`}
              </p>

              <div className="pt-2 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-neutral-400">Status:</span>
                  {getStatusBadge(rep.status)}
                </div>
                <div className="text-neutral-500 font-mono text-[11px]">
                  {rep.timestamp}
                </div>
              </div>
            </div>

            {/* Right Thumbnail */}
            <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#1e1e2d] border border-neutral-700/80 shadow-md flex items-center justify-center overflow-hidden">
              {rep.targetThumbnail ? (
                <img
                  src={rep.targetThumbnail}
                  alt="Reported content"
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <ShieldAlert className="w-6 h-6 text-neutral-500" />
              )}
            </div>
          </div>
        ))}

        {reports.length === 0 && (
          <div className="text-center py-16 text-neutral-500 text-xs">
            No reports filed yet.
          </div>
        )}
      </div>
    </div>
  );
};
