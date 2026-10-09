import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, ChevronRight, CheckCircle2, ShieldAlert, Flag, Ban, UserCheck } from 'lucide-react';
import { Avatar } from '../common/Avatar';

export const ReportModals: React.FC = () => {
  const {
    reportModal,
    closeReportModal,
    submitReport,
    setActiveTab,
    isUserBlockedByMe,
    blockUser,
    unblockUser,
  } = useApp();

  const [step, setStep] = useState<'scenarios' | 'more_reason' | 'submitted'>('scenarios');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [description, setDescription] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // ALWAYS reset step to 'scenarios' whenever a report modal is opened!
  useEffect(() => {
    if (reportModal?.isOpen) {
      setStep('scenarios');
      setSelectedScenario('');
      setCustomReason('');
      setDescription('');
      setToastMessage('');
    }
  }, [reportModal?.isOpen, reportModal?.targetId, reportModal?.type]);

  if (!reportModal || !reportModal.isOpen) return null;

  const isTargetBlocked = isUserBlockedByMe(reportModal.targetId);

  // Video Scenarios matching Screenshot 1 bottom right
  const videoScenarios = [
    'Exploitation and abuse of people under 18',
    'Physical violent and violent threats',
    'Sexual exploitation and abuse',
    'Human exploitation',
    'Animal abuse',
    'Harassment, bullying, or intimidation',
    'Hate speech or hateful behavior',
    'Scam, fraud, or spam',
    'Other reasons',
  ];

  // User Scenarios matching Screenshot 1 top right and community guidelines
  const userScenarios = [
    'Pretending to Be Someone',
    'Exploitation and abuse of people under 18',
    'Physical violent and violent threats',
    'Harassment, bullying, or intimidation',
    'Inappropriate Profile Info (Bio / Avatar / Name)',
    'Sexual exploitation and abuse',
    'User could be under 13 years old',
    'Hate speech or discrimination',
    'Scam, fraud, or spam',
    'Other reasons',
  ];

  // Live Stream Scenarios
  const liveStreamScenarios = [
    'Inappropriate or dangerous live broadcast',
    'Physical violence, threats, or weapon display',
    'Harassment, bullying, or intimidation in stream',
    'Hate speech or hateful behavior',
    'Nudity, sexual content, or exploitation',
    'Self-harm or dangerous activities',
    'Scam, fraud, or commercial spam',
    'Copyright infringement / unauthorized broadcast',
    'Other reasons',
  ];

  const scenarios =
    reportModal.type === 'video'
      ? videoScenarios
      : reportModal.type === 'live_stream'
      ? liveStreamScenarios
      : userScenarios;

  // Clicking any scenario opens the "More Reason" form (Screenshot 1 bottom left)
  const handleSelectScenario = (scenario: string) => {
    setSelectedScenario(scenario);
    setCustomReason(scenario === 'Other reasons' || scenario === 'Something else' ? '' : scenario);
    setStep('more_reason');
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = customReason.trim() || selectedScenario || 'Community Guideline Violation';

    submitReport({
      type: reportModal.type,
      targetId: reportModal.targetId,
      targetName: reportModal.targetName,
      targetSubtitle: `for ${finalReason.toLowerCase()}.`,
      targetThumbnail: reportModal.targetThumbnail,
      scenario: selectedScenario || finalReason,
      description: description.trim() || finalReason,
    });
    setStep('submitted');
  };

  const handleToggleBlock = async () => {
    if (isTargetBlocked) {
      await unblockUser(reportModal.targetId);
      setToastMessage(`${reportModal.targetName} has been unblocked.`);
    } else {
      await blockUser(reportModal.targetId);
      setToastMessage(`${reportModal.targetName} has been blocked.`);
    }
    setTimeout(() => setToastMessage(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn select-none overflow-y-auto">
      <div className="fixed inset-0" onClick={closeReportModal} />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-60 bg-[#1e1e2c] border border-neutral-700 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Ban className="w-4 h-4 text-red-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Modal Container */}
      <div className="relative w-full max-w-md flex flex-col gap-3 z-10 my-auto">
        {/* ========================================================================= */}
        {/* TOP: User Profile Card (Screenshot 1 top right: Jan Ahron @imhandsome)     */}
        {/* SEPARATE Report & Block buttons with full interactivity                   */}
        {/* ========================================================================= */}
        {reportModal.type === 'user' && step === 'scenarios' && (
          <div className="bg-[#13131a] border border-neutral-800 rounded-3xl p-4 sm:p-5 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar
                src={reportModal.targetThumbnail}
                alt={reportModal.targetName}
                size="lg"
                className="w-14 h-14 shrink-0"
              />
              <div className="text-left min-w-0">
                <div className="text-base font-bold text-white font-brand truncate">
                  {reportModal.targetName.replace("'s profile", '')}
                </div>
                <div className="text-xs text-neutral-400 truncate">
                  {reportModal.targetSubtitle || '@user'}
                </div>
              </div>
            </div>

            {/* Actions: Follow + SEPARATE Report button + SEPARATE Block button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="py-1.5 px-3 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-colors cursor-pointer"
              >
                Follow
              </button>

              {/* SEPARATE 1: Report Button */}
              <button
                type="button"
                onClick={() => setStep('scenarios')}
                className="py-1.5 px-2.5 rounded-xl bg-[#ff007a]/20 border border-[#ff007a]/50 text-[#ff007a] hover:bg-[#ff007a]/30 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Select Report Reason"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Report</span>
              </button>

              {/* SEPARATE 2: Block Button */}
              <button
                type="button"
                onClick={handleToggleBlock}
                className={`py-1.5 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  isTargetBlocked
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300 hover:text-white'
                }`}
                title="Block or Unblock user"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" />
                <span>{isTargetBlocked ? 'Blocked' : 'Block'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MAIN REPORT MODAL CARD matching Screenshot 1                              */}
        {/* ========================================================================= */}
        <div className="bg-[#13131a] border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col text-left">
          {/* Header: "Report" with X close button (Screenshot match) */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#ff007a]" />
              <h2 className="text-lg font-bold text-white font-brand">
                {reportModal.type === 'user' ? 'Report User' : reportModal.type === 'live_stream' ? 'Report Live Stream' : 'Report Video'}
              </h2>
            </div>
            <button
              onClick={closeReportModal}
              className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ======================================================================= */}
          {/* STEP 1: Full List of Reasons (Screenshot 1 bottom right)                 */}
          {/* ======================================================================= */}
          {step === 'scenarios' && (
            <div className="py-3">
              <p className="text-xs text-neutral-300 mb-3.5 font-semibold">
                Please select a scenario.
              </p>

              {/* Scrollable list of reasons if many options */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {scenarios.map(sc => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => handleSelectScenario(sc)}
                    className="w-full flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-[#181824] hover:bg-[#212132] border border-neutral-800 hover:border-[#ff007a]/50 text-left transition-all cursor-pointer group shadow-sm"
                  >
                    <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#ff007a] transition-colors">
                      {sc}
                    </span>
                    <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ======================================================================= */}
          {/* STEP 2: "More Reason" / "Other Reasons" Form (Screenshot 1 bottom left)  */}
          {/* ======================================================================= */}
          {step === 'more_reason' && (
            <form onSubmit={handleFinalSubmit} className="py-3 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider truncate pr-2">
                  {selectedScenario === 'Other reasons' || selectedScenario === 'Something else'
                    ? 'Other Reasons'
                    : selectedScenario}
                </span>
                {/* "View history" hot pink pill button matching Screenshot 1 bottom left */}
                <button
                  type="button"
                  onClick={() => {
                    closeReportModal();
                    setActiveTab('report_history');
                  }}
                  className="py-1 px-3.5 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-[11px] font-bold shadow-md transition-colors cursor-pointer shrink-0"
                >
                  View history
                </button>
              </div>

              {/* Input with hot pink outline: "Other reason..." (Screenshot match) */}
              <div>
                <input
                  type="text"
                  placeholder="Other reason..."
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  className="w-full bg-[#181824] text-xs sm:text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-2xl border-2 border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                  required
                />
              </div>

              {/* Textarea: "Description (Optional)" (Screenshot match) */}
              <div>
                <textarea
                  rows={5}
                  placeholder="Description (Optional)"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-[#181824] text-xs sm:text-sm text-white placeholder-neutral-500 p-4 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none leading-relaxed transition-all"
                />
              </div>

              {/* Submit Button (hot pink, right aligned) matching Screenshot 1 bottom left */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('scenarios')}
                  className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                >
                  ← Back to scenarios
                </button>

                <button
                  type="submit"
                  className="py-2.5 px-7 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
                >
                  Submit
                </button>
              </div>
            </form>
          )}

          {/* ======================================================================= */}
          {/* STEP 3: Submitted Confirmation Notice                                    */}
          {/* ======================================================================= */}
          {step === 'submitted' && (
            <div className="py-6 text-center space-y-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-brand">Report Submitted</h3>
              <p className="text-xs text-neutral-300 max-w-sm mx-auto leading-relaxed">
                You anonymously reported <span className="font-bold text-white">{reportModal.targetName}</span>. Your report has been recorded in Report History and is under review.
              </p>
              <div className="pt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    closeReportModal();
                    setActiveTab('report_history');
                  }}
                  className="py-2 px-5 rounded-2xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
                >
                  View in Report History
                </button>
                <button
                  type="button"
                  onClick={closeReportModal}
                  className="py-2 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
