import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp, deduplicateVideos } from '../../context/AppContext';
import { Video } from '../../types';
import { isSameUser, checkIsUserBanned } from '../../lib/supabase';
import { formatRealtimeAgo } from '../../utils/time';
import { ShareVideoModal } from '../modals/ShareVideoModal';
import { Avatar } from '../common/Avatar';
import {
  Heart,
  MessageCircle,
  Share2,
  Flag,
  Play,
  Pause,
  Music,
  Radio,
  Flame,
  Plus,
  Video as VideoIcon,
  Clock,
  Search,
  Users,
  UserCheck,
  MoreVertical,
  Copy,
  Download,
  Check,
} from 'lucide-react';

interface VideoFeedCardProps {
  video: Video;
  isActive: boolean;
  onShare: (video: Video) => void;
}

const VideoFeedCard: React.FC<VideoFeedCardProps> = ({
  video,
  isActive,
  onShare,
}) => {
  const {
    toggleLikeVideo,
    setCommentsVideoId,
    openReportModal,
    navigateToUserProfile,
    setSearchQuery,
    setActiveTab,
    recordVideoView,
    currentUser,
    getFollowStatus,
    toggleFollowUser,
  } = useApp();

  const [isPlaying, setIsPlaying] = useState(false);
  const [showFeedbackIcon, setShowFeedbackIcon] = useState(false);
  const [videoSrc, setVideoSrc] = useState(video.mediaUrl);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots dropdown when clicking outside
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [moreMenuOpen]);

  const handleCopyLink = () => {
    const videoUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/video/${video.id}`
      : `https://viralhub.app/video/${video.id}`;
    navigator.clipboard?.writeText(videoUrl);
    setCopyFeedback(true);
    setTimeout(() => {
      setCopyFeedback(false);
      setMoreMenuOpen(false);
    }, 1800);
  };

  const handleDownloadVideo = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(video.mediaUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeCaption = (video.caption.slice(0, 20) || 'viralhub_video').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `${safeCaption}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = video.mediaUrl;
      link.target = '_blank';
      link.download = 'video.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
      setMoreMenuOpen(false);
    }
  };

  useEffect(() => {
    setVideoSrc(video.mediaUrl);
  }, [video.mediaUrl]);

  const isVideoUrl = Boolean(
    videoSrc && (
      videoSrc.includes('.mp4') ||
      videoSrc.includes('.webm') ||
      videoSrc.includes('.mov') ||
      videoSrc.includes('/videos/') ||
      videoSrc.includes('/storage/v1/object/public/') ||
      videoSrc.startsWith('blob:') ||
      videoSrc.startsWith('data:video/') ||
      videoSrc.startsWith('http')
    )
  );

  // Automatically count view when video card becomes active / visible in home feed
  useEffect(() => {
    if (isActive) {
      recordVideoView(video.id);
    }
  }, [isActive, video.id]);

  // Audio & Playback management strictly tied to isActive state:
  // ONLY the active visible video plays with sound! Other videos are paused.
  useEffect(() => {
    const videoEl = videoRef.current;
    const bgAudioEl = bgAudioRef.current;
    if (!videoEl) return;

    if (isActive) {
      videoEl.currentTime = 0;
      setIsPlaying(prev => (prev ? prev : true));

      // Raw audio volume & mute controls from video author
      const isMuted = Boolean(video.originalAudioMuted);
      videoEl.muted = isMuted;
      videoEl.volume = isMuted
        ? 0
        : Math.max(0, Math.min(1, (video.originalAudioVolume ?? 100) / 100));

      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser restricts unmuted autoplay before gesture, start muted
          // and unmute on first window click/touch
          videoEl.muted = true;
          videoEl.play().catch(() => {
            setIsPlaying(prev => (!prev ? prev : false));
          });
        });
      }

      // Background audio track playback
      if (bgAudioEl && video.audioTrack?.audioUrl) {
        const startPos = video.audioStartTime ?? video.audioTrack.trimStart ?? 0;
        bgAudioEl.currentTime = startPos;
        bgAudioEl.volume = Math.max(0, Math.min(1, (video.audioVolume ?? 100) / 100));
        bgAudioEl.play().catch(() => {});
      }
    } else {
      videoEl.pause();
      videoEl.muted = true;
      videoEl.currentTime = 0;
      if (bgAudioEl) {
        bgAudioEl.pause();
        bgAudioEl.currentTime = video.audioStartTime ?? video.audioTrack?.trimStart ?? 0;
      }
      setIsPlaying(prev => (!prev ? prev : false));
      setCurrentTime(prev => (prev === 0 ? prev : 0));
    }
  }, [isActive, videoSrc, video.originalAudioMuted, video.originalAudioVolume, video.audioVolume, video.audioStartTime, video.audioEndTime]);

  // Window-level interaction handler to ensure audio is unmuted on gesture
  useEffect(() => {
    const handleGesture = () => {
      if (isActive && videoRef.current && !video.originalAudioMuted) {
        videoRef.current.muted = false;
        videoRef.current.volume = Math.max(0, Math.min(1, (video.originalAudioVolume ?? 100) / 100));
      }
      if (isActive && bgAudioRef.current && video.audioTrack?.audioUrl) {
        bgAudioRef.current.volume = Math.max(0, Math.min(1, (video.audioVolume ?? 100) / 100));
        bgAudioRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('click', handleGesture, { once: true });
    window.addEventListener('touchstart', handleGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, [isActive, video.originalAudioMuted, video.originalAudioVolume, video.audioVolume, video.audioTrack?.audioUrl]);

  const togglePlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const videoEl = videoRef.current;
    const bgAudioEl = bgAudioRef.current;
    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
      if (bgAudioEl) bgAudioEl.pause();
      setIsPlaying(false);
      setShowFeedbackIcon(true);
    } else {
      if (!video.originalAudioMuted) {
        videoEl.muted = false;
        videoEl.volume = Math.max(0, Math.min(1, (video.originalAudioVolume ?? 100) / 100));
      }
      videoEl.play().catch(() => {});
      if (bgAudioEl && video.audioTrack?.audioUrl) {
        bgAudioEl.volume = Math.max(0, Math.min(1, (video.audioVolume ?? 100) / 100));
        bgAudioEl.play().catch(() => {});
      }
      setIsPlaying(true);
      setShowFeedbackIcon(true);
      setTimeout(() => setShowFeedbackIcon(false), 800);
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const videoEl = videoRef.current;
    if (!videoEl || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * duration;
    videoEl.currentTime = newTime;
    setCurrentTime(newTime);
    if (bgAudioRef.current && bgAudioRef.current.duration) {
      bgAudioRef.current.currentTime = newTime % bgAudioRef.current.duration;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      onClick={() => togglePlayPause()}
      className="snap-start snap-always w-full aspect-[9/16] max-h-[calc(100vh-6rem)] bg-[#101017] rounded-3xl overflow-hidden shadow-2xl border border-neutral-800/90 relative group select-none shrink-0 mb-6 flex flex-col justify-between cursor-pointer"
    >
      {/* Background Video Media / Canvas */}
      {videoSrc ? (
        isVideoUrl ? (
          <video
            ref={videoRef}
            src={videoSrc}
            loop
            playsInline
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
                if (bgAudioRef.current && bgAudioRef.current.duration) {
                  const diff = Math.abs(
                    bgAudioRef.current.currentTime - (videoRef.current.currentTime % bgAudioRef.current.duration)
                  );
                  if (diff > 0.4) {
                    bgAudioRef.current.currentTime = videoRef.current.currentTime % bgAudioRef.current.duration;
                  }
                }
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration || 0);
              }
            }}
            onPlay={() => {
              setIsPlaying(true);
              if (bgAudioRef.current && video.audioTrack?.audioUrl) {
                bgAudioRef.current.play().catch(() => {});
              }
            }}
            onPause={() => {
              setIsPlaying(false);
              if (bgAudioRef.current) {
                bgAudioRef.current.pause();
              }
            }}
            onError={() => {
              if (videoSrc !== 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4') {
                setVideoSrc('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
              }
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={videoSrc}
            alt={video.caption}
            className="w-full h-full object-cover transition-transform duration-500"
          />
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181824] to-[#0c0c12] text-neutral-500 p-6 text-center">
          <VideoIcon className="w-12 h-12 mb-2 text-neutral-600 stroke-1" />
          <span className="text-xs font-semibold text-neutral-400">Video Canvas</span>
        </div>
      )}

      {/* Synchronized Background Audio Track */}
      {video.audioTrack?.audioUrl && (
        <audio
          ref={bgAudioRef}
          src={video.audioTrack.audioUrl}
          loop={!video.audioEndTime && !video.audioTrack.trimEnd}
          preload="auto"
          onTimeUpdate={() => {
            const startPos = video.audioStartTime ?? video.audioTrack?.trimStart ?? 0;
            const endPos = video.audioEndTime ?? video.audioTrack?.trimEnd;
            if (endPos && bgAudioRef.current && bgAudioRef.current.currentTime >= endPos) {
              bgAudioRef.current.currentTime = startPos;
            }
          }}
        />
      )}

      {/* Dark Overlay Scrim for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/85 pointer-events-none" />

      {/* Center Play / Pause Indicator (Shown when video is paused or briefly when resuming) */}
      {(!isPlaying || showFeedbackIcon) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-all duration-300">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl animate-in zoom-in-75 duration-200">
            {isPlaying ? (
              <Play className="w-8 h-8 fill-white translate-x-0.5 text-white" />
            ) : (
              <Pause className="w-8 h-8 fill-white text-white" />
            )}
          </div>
        </div>
      )}

      {/* Pending Moderation Banner for Creator's POV */}
      {video.status === 'pending' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-black text-[10px] font-extrabold shadow-lg backdrop-blur-md animate-pulse whitespace-nowrap">
          <Clock className="w-3 h-3" />
          <span>Awaiting Admin Approval (Only you see this)</span>
        </div>
      )}

      {/* Right Action Rail (Avatar, Like, Comment, Share, Report) */}
      <div
        className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Creator Avatar with click to navigate & Quick Follow Plus */}
        <div
          onClick={() => navigateToUserProfile(video.creator.id)}
          className="relative group/avatar cursor-pointer"
        >
          <Avatar
            src={video.creator.avatar}
            alt={video.creator.displayName}
            size="md"
            className="border-2 border-white group-hover/avatar:border-[#ff007a] transition-all"
          />
          {currentUser &&
            !isSameUser(currentUser.id, video.creator.id) &&
            getFollowStatus(video.creator.id) === 'none' && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  toggleFollowUser(video.creator.id);
                }}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                title="Follow creator"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            )}
        </div>

        {/* Like Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => toggleLikeVideo(video.id)}
            className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer transform active:scale-125 ${
              video.isLiked
                ? 'bg-pink-500/20 text-[#ff007a]'
                : 'bg-black/40 text-white hover:text-[#ff007a] hover:bg-black/60'
            }`}
            title="Like"
          >
            <Heart
              className={`w-6 h-6 transition-transform ${
                video.isLiked ? 'fill-[#ff007a] scale-110' : ''
              }`}
            />
          </button>
          <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
            {formatCount(video.likesCount)}
          </span>
        </div>

        {/* Comment Button (Count only fetched on-demand inside comment section) */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => setCommentsVideoId(video.id)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-cyan-400 hover:bg-black/60 transition-all cursor-pointer"
            title="Comments"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Share Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => onShare(video)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-emerald-400 hover:bg-black/60 transition-all cursor-pointer"
            title="Share"
          >
            <Share2 className="w-6 h-6" />
          </button>
          <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
            {formatCount(video.sharesCount)}
          </span>
        </div>

        {/* 3 Dots Options Button (Copy Link, Download Video, Report Video) */}
        <div className="relative flex flex-col items-center" ref={menuRef}>
          <button
            onClick={e => {
              e.stopPropagation();
              setMoreMenuOpen(prev => !prev);
            }}
            className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
              moreMenuOpen
                ? 'bg-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.6)]'
                : 'bg-black/40 text-white hover:text-[#ff007a] hover:bg-black/60'
            }`}
            title="More Options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* 3 Dots Dropdown Menu */}
          {moreMenuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute right-12 bottom-0 z-50 w-44 bg-[#14141e]/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 text-left animate-fadeIn"
            >
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {copyFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-neutral-400 shrink-0" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={isDownloading}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{isDownloading ? 'Downloading...' : 'Download Video'}</span>
              </button>

              <div className="h-px bg-neutral-800 my-0.5" />

              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  openReportModal({
                    type: 'video',
                    targetId: video.id,
                    targetName: `${video.creator.displayName || 'Creator'}'s video`,
                    targetSubtitle: video.caption.slice(0, 35),
                    targetThumbnail: video.thumbnailUrl,
                  });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
              >
                <Flag className="w-4 h-4 text-red-400 shrink-0" />
                <span>Report</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Details Overlay: Creator, Caption, Hashtags, Audio */}
      <div className="absolute bottom-12 left-4 right-16 z-20 text-left">
        {/* Creator Handle */}
        <button
          onClick={() => navigateToUserProfile(video.creator.id)}
          className="text-sm font-bold text-white hover:text-[#ff007a] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>{video.creator.displayName || 'Creator'}</span>
          {video.creator.username && (
            <span className="text-xs text-neutral-300 font-normal">
              @{video.creator.username}
            </span>
          )}
        </button>

        {/* Caption with "see more.." for expanded 250 characters */}
        {video.caption && (
          <div className="mt-1">
            <p className="text-xs sm:text-sm text-neutral-100 leading-snug drop-shadow-md">
              {video.caption.length > 75 && !isCaptionExpanded ? (
                <>
                  <span>{video.caption.slice(0, 75)}...</span>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setIsCaptionExpanded(true);
                    }}
                    className="text-neutral-300 hover:text-white font-bold ml-1 cursor-pointer underline text-xs"
                  >
                    see more..
                  </button>
                </>
              ) : (
                <>
                  <span>{video.caption}</span>
                  {video.caption.length > 75 && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setIsCaptionExpanded(false);
                      }}
                      className="text-neutral-400 hover:text-white font-semibold ml-1 cursor-pointer text-xs"
                    >
                      see less
                    </button>
                  )}
                </>
              )}
            </p>
          </div>
        )}

        {/* Hashtags */}
        {video.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {video.hashtags.map((tag, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSearchQuery(tag);
                  setActiveTab('explore');
                }}
                className="text-xs font-semibold text-[#ff007a] hover:underline cursor-pointer drop-shadow"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp: how long ago video was posted (placed below hashtags) */}
        {video.createdAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-300 font-medium mt-1 drop-shadow">
            <Clock className="w-3 h-3 text-neutral-400 shrink-0" />
            <span>{formatRealtimeAgo(video.createdAt)}</span>
          </div>
        )}

        {/* Audio Track Ticker */}
        {video.audioTrack && (
          <div className="flex items-center gap-2 text-[11px] text-neutral-300 mt-1.5">
            <Music className="w-3.5 h-3.5 text-[#ff007a] animate-spin shrink-0" />
            <span className="truncate">
              {video.audioTrack.title} — {video.audioTrack.artist}
            </span>
          </div>
        )}
      </div>

      {/* Interactive Video Scrubber & Playback Progress Line with Time Stamp (e.g. 00:05 - 00:12) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-2 pt-3 bg-gradient-to-t from-black/90 to-transparent group/scrubber cursor-pointer"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300 mb-1 px-1 drop-shadow">
          <span className="font-semibold text-white">
            {formatTime(currentTime)} - {formatTime(duration || 15)}
          </span>
          <span className="text-[10px] text-neutral-400 font-sans tracking-wide">
            {isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>

        <div
          onClick={handleScrubberClick}
          className="relative h-1.5 hover:h-2.5 bg-white/20 hover:bg-white/30 rounded-full overflow-hidden transition-all"
        >
          <div
            className="h-full bg-gradient-to-r from-[#ff007a] to-pink-500 rounded-full transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// Empty state for Friends feed
const EmptyFriendsFeedCard: React.FC<{ onDiscover: () => void }> = ({ onDiscover }) => {
  return (
    <div className="snap-start snap-always w-full aspect-[9/16] max-h-[calc(100vh-6rem)] bg-gradient-to-b from-[#14141d] to-[#0c0c12] rounded-3xl overflow-hidden shadow-2xl border border-neutral-800/90 relative select-none shrink-0 mb-6 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-[#ff007a]/15 border border-[#ff007a]/30 flex items-center justify-center text-[#ff007a] mb-4 shadow-[0_0_20px_rgba(255,0,122,0.3)]">
        <Users className="w-8 h-8" />
      </div>
      <h3 className="text-base font-bold text-white font-brand mb-1">Friends Feed</h3>
      <p className="text-xs text-neutral-400 max-w-xs mb-5 leading-relaxed">
        When you and another creator follow each other, you become friends! Their newest videos will show up here.
      </p>
      <button
        onClick={onDiscover}
        className="flex items-center gap-2 py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
      >
        <span>Discover on For You</span>
      </button>
    </div>
  );
};

// Empty state for Following feed
const EmptyFollowingFeedCard: React.FC<{ onDiscover: () => void }> = ({ onDiscover }) => {
  return (
    <div className="snap-start snap-always w-full aspect-[9/16] max-h-[calc(100vh-6rem)] bg-gradient-to-b from-[#14141d] to-[#0c0c12] rounded-3xl overflow-hidden shadow-2xl border border-neutral-800/90 relative select-none shrink-0 mb-6 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-[#ff007a]/15 border border-[#ff007a]/30 flex items-center justify-center text-[#ff007a] mb-4 shadow-[0_0_20px_rgba(255,0,122,0.3)]">
        <UserCheck className="w-8 h-8" />
      </div>
      <h3 className="text-base font-bold text-white font-brand mb-1">Following Feed</h3>
      <p className="text-xs text-neutral-400 max-w-xs mb-5 leading-relaxed">
        Follow your favorite creators to see their latest videos right here in your Following feed.
      </p>
      <button
        onClick={onDiscover}
        className="flex items-center gap-2 py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
      >
        <span>Discover Creators</span>
      </button>
    </div>
  );
};

// Wireframe Layout Card displayed when feed has no uploaded videos yet
const EmptyFeedLayoutCard: React.FC = () => {
  const { setActiveTab } = useApp();

  return (
    <div className="snap-start snap-always w-full aspect-[9/16] max-h-[calc(100vh-6rem)] bg-gradient-to-b from-[#14141d] to-[#0c0c12] rounded-3xl overflow-hidden shadow-2xl border border-neutral-800/90 relative group select-none shrink-0 mb-6 flex flex-col justify-between">
      {/* Center Wireframe Info */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
        <div className="w-16 h-16 rounded-3xl bg-[#1c1c28] border border-neutral-700/80 flex items-center justify-center text-neutral-400 mb-4 shadow-xl">
          <VideoIcon className="w-8 h-8 text-[#ff007a]" />
        </div>
        <h3 className="text-base font-bold text-white font-brand mb-1">Video Player Feed</h3>
        <p className="text-xs text-neutral-400 max-w-xs mb-5 leading-relaxed">
          Upload videos with custom captions, audio tracks, and hashtags to display them here in full 9:16 layout.
        </p>
        <button
          onClick={() => setActiveTab('upload')}
          className="flex items-center gap-2 py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Upload Video</span>
        </button>
      </div>

      {/* Top Right: Flag */}
      <div className="absolute top-4 right-4 z-20">
        <div className="p-2 rounded-full bg-black/40 backdrop-blur-md text-neutral-500">
          <Flag className="w-4 h-4" />
        </div>
      </div>

      {/* Right Action Rail Placeholder */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
        <Avatar size="md" className="border-2 border-neutral-700" />
        <div className="flex flex-col items-center">
          <div className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-neutral-400">
            <Heart className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-semibold text-neutral-400 mt-1">0</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-neutral-400">
            <MessageCircle className="w-6 h-6" />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-neutral-400">
            <Share2 className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-semibold text-neutral-400 mt-1">0</span>
        </div>
      </div>

      {/* Bottom Details Placeholder */}
      <div className="absolute bottom-12 left-4 right-16 z-20 text-left">
        <div className="text-sm font-bold text-neutral-300">@creator</div>
        <p className="text-xs text-neutral-500 mt-1">Your video caption will appear here</p>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-2">
          <Music className="w-3.5 h-3.5 text-neutral-500" />
          <span>Original Audio</span>
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
        <div className="h-full bg-neutral-700 w-1/4" />
      </div>
    </div>
  );
};

export const HomeFeed: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    activeTab,
    setActiveTab,
    setSearchQuery,
    openLiveStreamAsViewer,
    currentLiveStream,
    syncWithSupabase,
    feedRefreshKey,
    followRelations,
    getFollowStatus,
    toggleFollowUser,
  } = useApp();

  type FeedTab = 'friends' | 'following' | 'foryou';
  const feedTab: FeedTab = activeTab === 'friends' ? 'friends' : activeTab === 'following' ? 'following' : 'foryou';

  const [shareModalVideo, setShareModalVideo] = useState<Video | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string>('');
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Automatically refresh and re-shuffle feed whenever Home is clicked or feedRefreshKey increments
  useEffect(() => {
    if (feedRefreshKey > 0) {
      setShuffleSeed(prev => prev + 1);
      if (videoFeedRef.current) {
        videoFeedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [feedRefreshKey]);

  // Filter: Public feed only shows approved videos (or pending videos to their creator) & never shows banned creators
  const visibleApprovedVideos = useMemo(() => {
    return deduplicateVideos(videos).filter(v => {
      if (v.status === 'rejected') return false;
      if (v.creator?.isBanned) return false;
      if (checkIsUserBanned(v.creatorId || v.creator?.id, v.creator?.email, v.creator).isBanned) return false;
      const creatorUser = users.find(u => isSameUser(u.id, v.creatorId) || isSameUser(u.id, v.creator?.id));
      if (creatorUser?.isBanned || (creatorUser && checkIsUserBanned(creatorUser.id, creatorUser.email, creatorUser).isBanned)) return false;
      if (v.status === 'pending') {
        return currentUser && v.creatorId === currentUser.id;
      }
      return true;
    });
  }, [videos, users, currentUser]);

  // Following videos: videos from creators followed by currentUser
  const followingVideos = useMemo(() => {
    if (!currentUser) return [];
    return visibleApprovedVideos.filter(v => {
      const creatorId = v.creatorId || v.creator?.id;
      if (!creatorId) return false;
      const status = getFollowStatus(creatorId);
      return status === 'following' || status === 'friends';
    }).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });
  }, [visibleApprovedVideos, currentUser, getFollowStatus, followRelations]);

  // Friends videos: videos from mutual friends (both users follow each other)
  const friendsVideos = useMemo(() => {
    if (!currentUser) return [];
    return visibleApprovedVideos.filter(v => {
      const creatorId = v.creatorId || v.creator?.id;
      if (!creatorId) return false;
      return getFollowStatus(creatorId) === 'friends';
    }).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });
  }, [visibleApprovedVideos, currentUser, getFollowStatus, followRelations]);

  // For You videos: randomized discovery feed with newest video first
  const forYouVideos = useMemo(() => {
    if (visibleApprovedVideos.length <= 1) return visibleApprovedVideos;

    // 1. Sort by upload date to find the most recent upload
    const sortedByRecent = [...visibleApprovedVideos].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });

    const newestVideo = sortedByRecent[0];
    const otherVideos = sortedByRecent.slice(1);

    // 2. Deterministic pseudo-random shuffle based on shuffleSeed so re-renders don't cause random reordering
    let s = (shuffleSeed + 1) * 9301;
    const shuffledOthers = [...otherVideos].sort(() => {
      s = (s * 9301 + 49297) % 233280;
      return (s / 233280) - 0.5;
    });

    // 3. Newest is strictly first, rest are shuffled
    return [newestVideo, ...shuffledOthers];
  }, [visibleApprovedVideos, shuffleSeed]);

  // Active video list based on selected feed tab
  const feedVideos = useMemo(() => {
    switch (feedTab) {
      case 'friends':
        return friendsVideos;
      case 'following':
        return followingVideos;
      case 'foryou':
      default:
        return forYouVideos;
    }
  }, [feedTab, friendsVideos, followingVideos, forYouVideos]);

  const hasFriendsVideos = friendsVideos.length > 0;

  // Set initial active video and reset scroll position when changing tabs
  useEffect(() => {
    if (feedVideos.length > 0) {
      setActiveVideoId(prev => (feedVideos.some(v => v.id === prev) ? prev : feedVideos[0].id));
    } else {
      setActiveVideoId('');
    }
    if (videoFeedRef.current) {
      videoFeedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [feedTab]);

  // Reference to the middle scrollable video container
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Stringified video IDs to avoid re-running observer when individual video properties (views, likes) update
  const feedVideoIdsKey = feedVideos.map(v => v.id).join(',');

  // IntersectionObserver to detect which video is currently visible in feed
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const vidId = entry.target.getAttribute('data-video-id');
            if (vidId) {
              setActiveVideoId(prev => (prev === vidId ? prev : vidId));
            }
          }
        });
      },
      {
        root: videoFeedRef.current,
        threshold: [0.5, 0.75],
      }
    );

    itemRefs.current.forEach(el => {
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [feedVideoIdsKey]);

  // Dynamic trending hashtags calculation based on all videos currently in state
  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();

    videos.forEach(v => {
      // Tags from hashtags array
      (v.hashtags || []).forEach(tag => {
        let cleaned = tag.trim();
        if (!cleaned) return;
        if (!cleaned.startsWith('#')) cleaned = `#${cleaned}`;
        cleaned = cleaned.toLowerCase();
        counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
      });

      // Parse hashtags from caption
      const captionMatches = (v.caption || '').match(/#[a-zA-Z0-9_]+/g);
      if (captionMatches) {
        captionMatches.forEach(tag => {
          const cleaned = tag.trim().toLowerCase();
          const already = (v.hashtags || []).some(
            t => (t.startsWith('#') ? t : `#${t}`).toLowerCase() === cleaned
          );
          if (!already) {
            counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
          }
        });
      }
    });

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count], index) => {
        const icons = ['🔥', '✨', '⚡', '🎙️', '🚀', '💥'];
        return {
          tag,
          count: `${count} ${count === 1 ? 'video' : 'videos'}`,
          rawCount: count,
          icon: icons[index % icons.length],
        };
      });

    return sorted.slice(0, 5);
  }, [videos]);

  const handleShare = (video: Video) => {
    setShareModalVideo(video);
  };

  // Scroll handler for wheel events
  const handleContainerWheel = (e: React.WheelEvent) => {
    // Never scroll background videos when share video modal is open
    if (shareModalVideo) return;

    if (videoFeedRef.current && e.target !== videoFeedRef.current && !videoFeedRef.current.contains(e.target as Node)) {
      videoFeedRef.current.scrollBy({
        top: e.deltaY,
        behavior: 'auto',
      });
    }
  };

  return (
    <div
      onWheel={handleContainerWheel}
      className="w-full h-full overflow-hidden flex justify-center items-start gap-8 lg:gap-12 px-4 sm:px-8 py-3 select-none"
    >
      {/* Share Video Modal */}
      <ShareVideoModal
        video={shareModalVideo}
        isOpen={!!shareModalVideo}
        onClose={() => setShareModalVideo(null)}
      />

      {/* ========================================================================= */}
      {/* MIDDLE: VIDEOS FEED CONTAINER (SNAP-Y)                                    */}
      {/* ========================================================================= */}
      <div className="flex-1 max-w-[430px] h-full relative flex flex-col items-center">
        {/* Scrollable Videos Feed Container */}
        <div
          ref={videoFeedRef}
          className="w-full h-full overflow-y-auto snap-y snap-mandatory overscroll-contain no-scrollbar pt-1 pb-16 relative"
        >
          {feedVideos.length === 0 ? (
            feedTab === 'friends' ? (
              <EmptyFriendsFeedCard onDiscover={() => setActiveTab('explore')} />
            ) : feedTab === 'following' ? (
              <EmptyFollowingFeedCard onDiscover={() => setActiveTab('explore')} />
            ) : (
              <EmptyFeedLayoutCard />
            )
          ) : (
            feedVideos.map(video => (
              <div
                key={video.id}
                data-video-id={video.id}
                ref={el => {
                  if (el) itemRefs.current.set(video.id, el);
                  else itemRefs.current.delete(video.id);
                }}
                className="snap-start snap-always w-full flex justify-center"
              >
                <VideoFeedCard
                  video={video}
                  isActive={activeVideoId === video.id}
                  onShare={handleShare}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT SIDE: COMPLETELY STATIC & FIXED (Live now & Trending do NOT scroll)  */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex flex-col w-80 shrink-0 space-y-6 pt-1 overflow-hidden pointer-events-auto">
        {/* "Live now" Widget */}
        <div className="bg-[#13131a] border border-neutral-800/80 rounded-3xl p-5 shadow-xl text-left">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#ff007a] animate-pulse" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
                Live now
              </h3>
            </div>
            <button
              onClick={() => setActiveTab('live')}
              className="text-xs text-[#ff007a] hover:underline font-semibold cursor-pointer"
            >
              See all
            </button>
          </div>

          {currentLiveStream && currentLiveStream.isLive ? (
            <div
              onClick={() => openLiveStreamAsViewer(currentLiveStream.id)}
              className="relative rounded-2xl overflow-hidden aspect-[16/9] group cursor-pointer border border-neutral-800 hover:border-[#ff007a]/60 transition-all bg-[#1a1a26]"
            >
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
                <Radio className="w-8 h-8 text-[#ff007a] animate-pulse" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

              {/* Live Indicator Pill */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ff007a] text-white text-[10px] font-bold shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>LIVE</span>
              </div>

              {/* Stream info */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 text-left">
                <div className="text-xs font-bold text-white group-hover:text-[#ff007a] transition-colors truncate">
                  {currentLiveStream.title || 'Live Broadcast'}
                </div>
                <div className="text-[10px] text-neutral-300">
                  {currentLiveStream.viewersCount || 1} watching
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setActiveTab('live_host_setup')}
              className="rounded-2xl p-5 border border-dashed border-neutral-700/80 bg-[#161622]/60 hover:bg-[#161622] transition-colors cursor-pointer text-center group"
            >
              <Radio className="w-6 h-6 text-neutral-500 group-hover:text-[#ff007a] transition-colors mx-auto mb-2" />
              <div className="text-xs font-bold text-white mb-1">No Active Streams</div>
              <p className="text-[11px] text-neutral-400 mb-3">
                Broadcast live to your audience anytime
              </p>
              <span className="inline-block text-[11px] font-bold text-[#ff007a] bg-[#ff007a]/15 px-3 py-1 rounded-xl">
                Go Live Now →
              </span>
            </div>
          )}
        </div>

        {/* "Trending" Widget (Automatic from videos) */}
        <div className="bg-[#13131a] border border-neutral-800/80 rounded-3xl p-5 shadow-xl text-left">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
              Trending
            </h3>
          </div>

          <div className="space-y-3">
            {trendingHashtags.length > 0 ? (
              trendingHashtags.map(({ tag, count, icon }) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSearchQuery(tag);
                    setActiveTab('explore');
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#181824] hover:bg-[#20202e] border border-neutral-800/80 transition-all cursor-pointer group text-left"
                >
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-[#ff007a] transition-colors">
                      {tag}
                    </div>
                    <div className="text-[11px] text-neutral-400">{count}</div>
                  </div>
                  <span className="text-sm">{icon}</span>
                </button>
              ))
            ) : (
              <p className="text-xs text-neutral-500 py-3 text-center italic">
                No hashtags yet. Tag videos with #hashtag to feature here automatically!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
