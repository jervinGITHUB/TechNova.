import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Video } from '../../types';
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
  RotateCw,
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
  } = useApp();

  const [isPlaying, setIsPlaying] = useState(true);
  const [showFeedbackIcon, setShowFeedbackIcon] = useState(false);
  const [videoSrc, setVideoSrc] = useState(video.mediaUrl);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Automatically count view when video card mounts in home feed
  useEffect(() => {
    recordVideoView(video.id);
  }, [video.id]);

  // Audio & Playback management strictly tied to isActive state:
  // ONLY the active visible video plays with sound! Other videos are paused.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isActive) {
      videoEl.currentTime = 0;
      setIsPlaying(true);
      // Attempt unmuted playback with full audio
      videoEl.muted = false;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser restricts unmuted autoplay before gesture, start muted
          // and unmute on first window click/touch
          videoEl.muted = true;
          videoEl.play().catch(() => {
            setIsPlaying(false);
          });
        });
      }
    } else {
      videoEl.pause();
      videoEl.muted = true;
      videoEl.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [isActive, videoSrc]);

  // Window-level interaction handler to ensure audio is unmuted on gesture
  useEffect(() => {
    const handleGesture = () => {
      if (isActive && videoRef.current && videoRef.current.muted) {
        videoRef.current.muted = false;
      }
    };
    window.addEventListener('click', handleGesture, { once: true });
    window.addEventListener('touchstart', handleGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, [isActive]);

  const togglePlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
      setIsPlaying(false);
      setShowFeedbackIcon(true);
    } else {
      videoEl.muted = false;
      videoEl.play().catch(() => {});
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
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration || 0);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-black text-[10px] font-extrabold shadow-lg backdrop-blur-md animate-pulse whitespace-nowrap">
          <Clock className="w-3 h-3" />
          <span>Awaiting Admin Approval (Only you see this)</span>
        </div>
      )}

      {/* Top Header: Flag / Report Icon at top-right */}
      <div
        className="absolute top-4 right-4 z-20 flex items-center gap-2"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() =>
            openReportModal({
              type: 'video',
              targetId: video.id,
              targetName: `${video.creator.displayName || 'Creator'}'s video`,
              targetSubtitle: video.caption.slice(0, 30),
              targetThumbnail: video.thumbnailUrl,
            })
          }
          className="p-2 rounded-full bg-black/40 backdrop-blur-md text-neutral-300 hover:text-red-400 hover:bg-black/60 transition-all cursor-pointer"
          title="Report Video"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>

      {/* Right Action Rail (Avatar, Like, Comment, Share, Report) */}
      <div
        className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Creator Avatar with click to navigate */}
        <div
          onClick={() => navigateToUserProfile(video.creator.id)}
          className="relative cursor-pointer group/avatar"
        >
          <Avatar
            src={video.creator.avatar}
            alt={video.creator.displayName}
            size="md"
            className="border-2 border-white group-hover/avatar:border-[#ff007a] transition-all"
          />
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

        {/* Comment Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => setCommentsVideoId(video.id)}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-cyan-400 hover:bg-black/60 transition-all cursor-pointer"
            title="Comments"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
          <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
            {formatCount(video.commentsCount)}
          </span>
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

        {/* Report Video Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={() =>
              openReportModal({
                type: 'video',
                targetId: video.id,
                targetName: `${video.creator.displayName || 'Creator'}'s video`,
                targetSubtitle: video.caption.slice(0, 35),
                targetThumbnail: video.thumbnailUrl,
              })
            }
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-red-400 hover:bg-black/60 transition-all cursor-pointer"
            title="Report Video"
          >
            <Flag className="w-5 h-5" />
          </button>
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

        {/* Caption */}
        {video.caption && (
          <p className="text-xs sm:text-sm text-neutral-100 mt-1 line-clamp-2 leading-snug drop-shadow-md">
            {video.caption}
          </p>
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
                className="text-xs font-semibold text-[#ff007a] hover:underline cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Audio Track Ticker */}
        {video.audioTrack && (
          <div className="flex items-center gap-2 text-[11px] text-neutral-300 mt-2">
            <Music className="w-3.5 h-3.5 text-[#ff007a] animate-spin" />
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
          <span className="text-[11px] font-semibold text-neutral-400 mt-1">0</span>
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
    videos,
    setActiveTab,
    setSearchQuery,
    openLiveStreamAsViewer,
    currentLiveStream,
    syncWithSupabase,
  } = useApp();

  const [shareModalVideo, setShareModalVideo] = useState<Video | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string>('');
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Filter: Public feed only shows approved videos (or pending videos to their creator)
  const visibleApprovedVideos = useMemo(() => {
    return videos.filter(v => {
      if (v.status === 'rejected') return false;
      if (v.status === 'pending') {
        return currentUser && v.creatorId === currentUser.id;
      }
      return true;
    });
  }, [videos, currentUser]);

  // Feed ordering rule:
  // "every user when logging in on the app will see their feed randomly videos , but the recently uploaded must be on the first feed, also when refreshing home the video will be random again/shuffle."
  const feedVideos = useMemo(() => {
    if (visibleApprovedVideos.length <= 1) return visibleApprovedVideos;

    // 1. Sort by upload date to find the most recent upload
    const sortedByRecent = [...visibleApprovedVideos].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });

    const newestVideo = sortedByRecent[0];
    const otherVideos = sortedByRecent.slice(1);

    // 2. Shuffle remaining videos randomly based on shuffleSeed
    const shuffledOthers = [...otherVideos].sort(() => Math.random() - 0.5);

    // 3. Newest is strictly first, rest are shuffled
    return [newestVideo, ...shuffledOthers];
  }, [visibleApprovedVideos, shuffleSeed]);

  // Set initial active video
  useEffect(() => {
    if (feedVideos.length > 0 && (!activeVideoId || !feedVideos.some(v => v.id === activeVideoId))) {
      setActiveVideoId(feedVideos[0].id);
    }
  }, [feedVideos, activeVideoId]);

  // Reference to the middle scrollable video container
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // IntersectionObserver to detect which video is currently visible in feed
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const vidId = entry.target.getAttribute('data-video-id');
            if (vidId) {
              setActiveVideoId(vidId);
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
  }, [feedVideos]);

  const handleShare = (video: Video) => {
    setShareModalVideo(video);
  };

  // Re-shuffle feed on demand and refresh remote data
  const handleRefreshFeed = () => {
    setShuffleSeed(prev => prev + 1);
    syncWithSupabase();
    if (videoFeedRef.current) {
      videoFeedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Scroll handler for wheel events
  const handleContainerWheel = (e: React.WheelEvent) => {
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
      {/* MIDDLE: ONLY THIS SCROLLS (Scrollable Videos Feed Container with snap-y)    */}
      {/* ========================================================================= */}
      <div
        ref={videoFeedRef}
        className="flex-1 max-w-[430px] h-full overflow-y-auto snap-y snap-mandatory overscroll-contain no-scrollbar pt-1 pb-16 relative"
      >
        {feedVideos.length === 0 ? (
          <EmptyFeedLayoutCard />
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

      {/* ========================================================================= */}
      {/* RIGHT SIDE: COMPLETELY STATIC & FIXED (Live now & Trending do NOT scroll)  */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex flex-col w-80 shrink-0 space-y-6 pt-1 overflow-hidden pointer-events-auto">
        {/* Fresh Feed Shuffle / Refresh Button */}
        <button
          onClick={handleRefreshFeed}
          className="w-full py-2.5 px-4 rounded-2xl bg-[#14141e] hover:bg-[#1a1a28] border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md group"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#ff007a] group-hover:rotate-180 transition-transform duration-500" />
          <span>Shuffle & Refresh Feed</span>
        </button>

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

        {/* "Trending" Widget */}
        <div className="bg-[#13131a] border border-neutral-800/80 rounded-3xl p-5 shadow-xl text-left">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-brand">
              Trending
            </h3>
          </div>

          <div className="space-y-3">
            {[
              { tag: '#Trending', count: '0 videos', icon: '🔥' },
              { tag: '#Viral', count: '0 videos', icon: '✨' },
              { tag: '#Live', count: '0 videos', icon: '🎙️' },
              { tag: '#Community', count: '0 videos', icon: '⚡' },
            ].map(({ tag, count, icon }) => (
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
