import React, { useState, useEffect } from 'react';
import { Video } from '../../types';
import { useApp } from '../../context/AppContext';
import { Lock, Users, Sliders, X, Loader2, Check } from 'lucide-react';

interface AudienceSettingsModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onAudienceChanged?: (newAudience: 'public' | 'friends' | 'only_me') => void;
}

export const AudienceSettingsModal: React.FC<AudienceSettingsModalProps> = ({
  video,
  isOpen,
  onClose,
  onAudienceChanged,
}) => {
  const { updateVideoAudience } = useApp();

  const getInitialAudience = (v: Video | null): 'public' | 'friends' | 'only_me' => {
    if (!v) return 'public';
    if (v.audience) return v.audience;
    if (v.privacy === 'private') return 'only_me';
    if (v.privacy === 'friends') return 'friends';
    return 'public';
  };

  const [selectedAudience, setSelectedAudience] = useState<'public' | 'friends' | 'only_me'>('public');
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    if (video && isOpen) {
      setSelectedAudience(getInitialAudience(video));
      setFeedbackMsg('');
    }
  }, [video, isOpen]);

  if (!isOpen || !video) return null;

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await updateVideoAudience(video.id, selectedAudience);
      if (onAudienceChanged) {
        onAudienceChanged(selectedAudience);
      }
      const label =
        selectedAudience === 'only_me'
          ? 'Only me'
          : selectedAudience === 'friends'
          ? 'Friends Only'
          : 'Everyone (Public)';
      setFeedbackMsg(`Audience updated to ${label}`);
      setTimeout(() => {
        onClose();
      }, 600);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      <div
        className="absolute inset-0"
        onClick={() => !isUpdating && onClose()}
      />
      <div className="relative w-full max-w-sm bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-2xl z-10 text-left space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pink-500/15 text-[#ff007a] border border-pink-500/30">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-brand">Audience Settings</h3>
              <p className="text-[11px] text-neutral-400">Who can watch this video</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isUpdating}
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Options */}
        <div className="space-y-2 pt-1">
          {/* Option 1: Everyone (Public) */}
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => setSelectedAudience('public')}
            className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              selectedAudience === 'public'
                ? 'bg-pink-500/15 border-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] border-neutral-800 hover:border-neutral-700 text-neutral-300'
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                selectedAudience === 'public' ? 'bg-[#ff007a] text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Everyone</span>
                {selectedAudience === 'public' && (
                  <span className="text-[10px] text-pink-400 font-semibold">• Active</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                Anyone on or off ViralHub can view this video
              </p>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedAudience === 'public' ? 'border-[#ff007a] bg-[#ff007a]' : 'border-neutral-600'
              }`}
            >
              {selectedAudience === 'public' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          {/* Option 2: Friends Only */}
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => setSelectedAudience('friends')}
            className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              selectedAudience === 'friends'
                ? 'bg-pink-500/15 border-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] border-neutral-800 hover:border-neutral-700 text-neutral-300'
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                selectedAudience === 'friends' ? 'bg-[#ff007a] text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Friends</span>
                {selectedAudience === 'friends' && (
                  <span className="text-[10px] text-pink-400 font-semibold">• Active</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                Only followers that you follow back can view this video
              </p>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedAudience === 'friends' ? 'border-[#ff007a] bg-[#ff007a]' : 'border-neutral-600'
              }`}
            >
              {selectedAudience === 'friends' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          {/* Option 3: Only me (Private) */}
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => setSelectedAudience('only_me')}
            className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              selectedAudience === 'only_me'
                ? 'bg-pink-500/15 border-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] border-neutral-800 hover:border-neutral-700 text-neutral-300'
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                selectedAudience === 'only_me' ? 'bg-[#ff007a] text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Only me</span>
                {selectedAudience === 'only_me' && (
                  <span className="text-[10px] text-pink-400 font-semibold">• Active</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                Only you can view this video (stored in your "Only me" tab)
              </p>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedAudience === 'only_me' ? 'border-[#ff007a] bg-[#ff007a]' : 'border-neutral-600'
              }`}
            >
              {selectedAudience === 'only_me' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={isUpdating}
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md shadow-pink-900/30"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
