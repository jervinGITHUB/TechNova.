import React, { useState, useRef, useEffect } from 'react';
import { Video } from '../../types';
import { Avatar } from '../common/Avatar';
import { toUuid } from '../../lib/supabase';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Film,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  ShieldAlert,
  Eye,
  Lock,
  Trash2,
  X,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface MessageVideoCardProps {
  video: Video;
  note?: string;
  isMe: boolean;
  messageId?: string;
  conversationId?: string;
  senderName?: string;
  onDeleteMessage?: () => void;
}

export const MessageVideoCard: React.FC<MessageVideoCardProps> = ({
  video,
  note,
  isMe,
  messageId,
  senderName,
  onDeleteMessage,
}) => {
  const { currentUser, navigateToUserProfile, setActiveTab, users, videos } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Authoritatively resolve the video and its creator so '@creator' never appears
  const realVideo = videos.find(v => v.id === video.id || toUuid(v.id) === toUuid(video.id)) || video;

  const creatorUser =
    (realVideo.creator?.username && realVideo.creator.username !== 'creator' ? realVideo.creator : null) ||
    users.find(u => u.id === realVideo.creatorId || toUuid(u.id) === toUuid(realVideo.creatorId)) ||
    (video.creator?.username && video.creator.username !== 'creator' ? video.creator : null) ||
    users.find(u => u.id === video.creatorId || toUuid(u.id) === toUuid(video.creatorId)) ||
    (senderName ? users.find(u => u.displayName === senderName || u.username === senderName) : null);

  const displayCreator = creatorUser || realVideo.creator || video.creator;
  const creatorUsername = displayCreator?.username && displayCreator.username !== 'creator'
    ? displayCreator.username
    : (displayCreator?.displayName && displayCreator.displayName !== 'creator'
      ? displayCreator.displayName.toLowerCase().replace(/\s+/g, '')
      : (senderName ? senderName.toLowerCase().replace(/\s+/g, '') : 'creator'));
  const creatorDisplayName = displayCreator?.displayName && displayCreator.displayName !== 'creator'
    ? displayCreator.displayName
    : (displayCreator?.username && displayCreator.username !== 'creator'
      ? displayCreator.username
      : (senderName || 'Creator'));
  const creatorAvatar = displayCreator?.avatar || '';

  // Storage key for receiver confirmation preference
  const storageKey = currentUser?.id && (messageId || video.id)
    ? `vh_video_sec_${currentUser.id}_${messageId || video.id}`
    : null;

  // Receiver privacy filter state:
  // - Senders always see their video unlocked.
  // - Receivers default to 'blurred' unless previously unlocked or declined.
  const [privacyState, setPrivacyState] = useState<'blurred' | 'unlocked' | 'declined'>(() => {
    if (isMe) return 'unlocked';
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'unlocked' || saved === 'declined') return saved;
      } catch (err) {
        console.warn('Could not read privacy state:', err);
      }
    }
    return 'blurred';
  });

  const [showWarningModal, setShowWarningModal] = useState(false);

  const safeMediaUrl = video.mediaUrl && !video.mediaUrl.startsWith('blob:')
    ? video.mediaUrl
    : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();

    // If blurred for receiver, prompt security warning dialog instead of playing!
    if (!isMe && privacyState === 'blurred') {
      setShowWarningModal(true);
      return;
    }

    if (privacyState === 'declined') {
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;

    if (isPlaying) {
      vid.pause();
      setIsPlaying(false);
    } else {
      vid.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('Video play blocked:', err);
      });
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    setProgress((vid.currentTime / vid.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (vid) {
      setVideoDuration(vid.duration);
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (privacyState !== 'unlocked') return;
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    vid.currentTime = ratio * vid.duration;
    setProgress(ratio * 100);
  };

  const handleWatchInFeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMe && privacyState === 'blurred') {
      setShowWarningModal(true);
      return;
    }
    setActiveTab('home');
  };

  // User accepts to reveal & play video
  const handleAcceptAndPlay = () => {
    setPrivacyState('unlocked');
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'unlocked');
      } catch (e) {
        console.warn(e);
      }
    }
    setShowWarningModal(false);

    // Auto-play the video smoothly
    setTimeout(() => {
      const vid = videoRef.current;
      if (vid) {
        vid.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn('Play error:', err);
        });
      }
    }, 150);
  };

  // User declines video: Delete completely or lock video
  const handleDeclineAndDelete = () => {
    setShowWarningModal(false);
    if (onDeleteMessage) {
      onDeleteMessage();
    } else {
      handleDeclineAndLock();
    }
  };

  const handleDeclineAndLock = () => {
    setPrivacyState('declined');
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'declined');
      } catch (e) {
        console.warn(e);
      }
    }
    setShowWarningModal(false);
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleResetToReview = () => {
    setShowWarningModal(true);
  };

  return (
    <div className="w-full select-none text-left relative">
      {/* Optional User Note */}
      {note && note.trim().length > 0 && (
        <p className="text-xs sm:text-sm font-medium mb-2 leading-relaxed">
          {note}
        </p>
      )}

      {/* Embedded Video Card */}
      <div
        className={`rounded-2xl overflow-hidden border transition-all shadow-xl ${
          isMe
            ? 'bg-[#180a1c] border-pink-400/30 ring-1 ring-pink-500/20'
            : 'bg-[#151522] border-neutral-700/80 ring-1 ring-white/5'
        }`}
      >
        {/* Creator Header Bar */}
        <div className="p-2.5 bg-black/40 border-b border-white/10 flex items-center justify-between">
          <div
            onClick={e => {
              e.stopPropagation();
              if (displayCreator?.id) navigateToUserProfile(displayCreator.id);
            }}
            className="flex items-center gap-2 cursor-pointer group/creator"
          >
            <Avatar
              src={creatorAvatar}
              alt={creatorDisplayName}
              size="sm"
              className="w-7 h-7 border border-white/20 group-hover/creator:border-[#ff007a] transition-all"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white group-hover/creator:text-[#ff007a] transition-colors truncate">
                {creatorDisplayName}
              </div>
              <div className="text-[9px] text-neutral-400 truncate">
                @{creatorUsername}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Privacy Badge for Receiver */}
            {!isMe && privacyState === 'blurred' && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-bold">
                <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                <span>Protected</span>
              </span>
            )}

            {privacyState === 'unlocked' && (
              <button
                type="button"
                onClick={handleWatchInFeed}
                className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg bg-white/5 hover:bg-white/15 transition-all cursor-pointer"
                title="Watch in feed"
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Video Player or Locked State Container */}
        {privacyState === 'declined' ? (
          /* Locked State Placeholder when user declined */
          <div className="p-6 bg-gradient-to-b from-[#1a1118] to-[#12121c] flex flex-col items-center justify-center text-center gap-3 border-y border-neutral-800">
            <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white mb-1">
                Shared Video Declined & Locked
              </h4>
              <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                You declined to play this shared video for your privacy and security. Playback has been disabled.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {onDeleteMessage && (
                <button
                  type="button"
                  onClick={onDeleteMessage}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Message</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetToReview}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Review Video</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal / Blurred Video Player Container */
          <div
            onClick={handleTogglePlay}
            className="relative aspect-[9/12] max-h-72 sm:max-h-80 w-full bg-black flex items-center justify-center cursor-pointer group/video overflow-hidden"
          >
            <video
              ref={videoRef}
              src={safeMediaUrl}
              poster={video.thumbnailUrl || undefined}
              playsInline
              loop
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className={`w-full h-full object-cover transition-all duration-300 ${
                !isMe && privacyState === 'blurred'
                  ? 'filter blur-2xl brightness-50 contrast-125 scale-110 pointer-events-none'
                  : ''
              }`}
            />

            {/* BLURRED RECEIVER PRIVACY OVERLAY */}
            {!isMe && privacyState === 'blurred' ? (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-10 transition-all hover:bg-black/50">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#ff007a]/30 to-amber-500/30 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.3)] mb-2.5 transform transition-transform group-hover/video:scale-105">
                  <ShieldAlert className="w-7 h-7 text-amber-300 animate-pulse" />
                </div>
                <div className="space-y-1 max-w-[240px]">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                    Privacy Shield Active
                  </span>
                  <p className="text-xs font-bold text-white">
                    Video Blurred For Safety
                  </p>
                  <p className="text-[10px] text-neutral-300 line-clamp-2 leading-tight">
                    Sent by @{senderName || creatorUsername}. Tap to review and confirm playback.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setShowWarningModal(true);
                  }}
                  className="mt-3.5 px-3.5 py-1.5 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,0,122,0.5)] transition-all cursor-pointer transform group-hover/video:scale-105"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Review & Play Video</span>
                </button>
              </div>
            ) : (
              /* UNBLURRED / SENDER PLAY BUTTON OVERLAY */
              !isPlaying && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center transition-all group-hover/video:bg-black/30">
                  <div className="w-12 h-12 rounded-full bg-[#ff007a] text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,0,122,0.8)] transform transition-transform group-hover/video:scale-110">
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  </div>
                  <span className="text-[11px] font-bold text-white/90 mt-2 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/20">
                    Click to Play
                  </span>
                </div>
              )
            )}

            {/* Top Video Tag Badge */}
            <div className="absolute top-2 left-2 pointer-events-none">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[9px] font-extrabold text-white uppercase tracking-wider">
                <Film className="w-2.5 h-2.5 text-[#ff007a]" />
                <span>Video</span>
              </span>
            </div>

            {/* Bottom Floating Control Bar (Only interactive when unlocked) */}
            {privacyState === 'unlocked' && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 flex flex-col gap-1.5 opacity-90 group-hover/video:opacity-100 transition-opacity"
              >
                {/* Scrubber Bar */}
                <div
                  onClick={handleScrubberClick}
                  className="h-1.5 w-full bg-white/20 hover:h-2 rounded-full cursor-pointer relative overflow-hidden transition-all"
                >
                  <div
                    className="h-full bg-[#ff007a] rounded-full relative"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Quick Actions Bar */}
                <div className="flex items-center justify-between text-white text-[10px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className="p-1 text-white hover:text-[#ff007a] transition-colors cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-white" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="p-1 text-white hover:text-[#ff007a] transition-colors cursor-pointer"
                    >
                      {isMuted ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Likes, Comments & Share Counter */}
                  <div className="flex items-center gap-2.5 text-[10px] text-neutral-300">
                    <span className="flex items-center gap-1" title="Likes">
                      <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a]" />
                      <span>{video.likesCount || 0}</span>
                    </span>
                    <span className="flex items-center gap-1" title="Comments">
                      <MessageCircle className="w-3 h-3 text-cyan-400" />
                      <span>{video.commentsCount || 0}</span>
                    </span>
                    <span className="flex items-center gap-1" title="Shares">
                      <Share2 className="w-3 h-3 text-emerald-400" />
                      <span>{video.sharesCount || 0}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Caption & Hashtags Footer */}
        {video.caption && privacyState !== 'declined' && (
          <div className="p-2.5 bg-black/30 border-t border-white/10">
            <p className="text-xs text-neutral-200 line-clamp-2 leading-snug">
              {video.caption}
            </p>
            {video.hashtags && video.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {video.hashtags.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="text-[10px] text-[#ff007a] font-medium">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECURITY / PRIVACY WARNING CONFIRMATION MODAL                            */}
      {/* ========================================================================= */}
      {showWarningModal && (
        <div
          onWheel={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
        >
          {/* Backdrop Click Dismiss */}
          <div className="absolute inset-0" onClick={() => setShowWarningModal(false)} />

          <div
            onWheel={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-[#14141f] border border-neutral-700/80 rounded-3xl p-5 shadow-2xl z-10 text-left space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Shared Video Warning
                  </h3>
                  <p className="text-[11px] text-amber-400 font-medium">
                    Security & Privacy Protection
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning Message Box */}
            <div className="p-3.5 bg-[#1b1b29] rounded-2xl border border-neutral-700/80 text-xs text-neutral-300 leading-relaxed space-y-2">
              <p>
                This video was sent to you by <strong className="text-white">@{senderName || creatorUsername}</strong>.
              </p>
              <p className="text-[11px] text-neutral-400">
                To protect your privacy and ensure inappropriate content control, all shared videos are blurred by default until you confirm.
              </p>
              <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 flex items-center gap-2 mt-1">
                <Avatar
                  src={creatorAvatar}
                  alt={creatorDisplayName}
                  size="sm"
                  className="w-7 h-7 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-white truncate">
                    @{creatorUsername}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {realVideo.caption || video.caption || 'Shared video'}
                  </div>
                </div>
              </div>
              <p className="font-semibold text-white pt-1">
                Are you sure you want to reveal and play this video?
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Play / Accept */}
              <button
                type="button"
                onClick={handleAcceptAndPlay}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#e0006c] hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Yes, Reveal & Play Video</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {/* Decline & Lock */}
                <button
                  type="button"
                  onClick={handleDeclineAndLock}
                  className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-neutral-700 transition-colors cursor-pointer"
                >
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Decline & Lock</span>
                </button>

                {/* Decline & Delete Message */}
                <button
                  type="button"
                  onClick={handleDeclineAndDelete}
                  className="w-full py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-red-500/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span>Decline & Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
