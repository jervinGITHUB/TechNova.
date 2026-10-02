import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Video } from '../../types';
import { ShareVideoModal } from '../modals/ShareVideoModal';
import { Avatar } from '../common/Avatar';
import {
  Heart,
  MessageCircle,
  Share2,
  Flag,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Music,
  Radio,
  Flame,
  Sparkles,
  Plus,
  Video as VideoIcon,
  Clock
} from 'lucide-react';

interface VideoFeedCardProps {
  video: Video;
  isMuted: boolean;
  onToggleMute: () => void;
  onShare: (video: Video) => void;
}

const VideoFeedCard: React.FC<VideoFeedCardProps> = ({
  video,
  isMuted,
  onToggleMute,
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

  // Automatically count view when video card mounts in home feed
  useEffect(() => {
    recordVideoView(video.id);
  }, [video.id]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  };

  return (
    <div className="snap-start snap-always w-full aspect-[9/16] max-h-[calc(100vh-6rem)] bg-[#101017] rounded-3xl overflow-hidden shadow-2xl border border-neutral-800/90 relative group select-none shrink-0 mb-6 flex flex-col justify-between">
      {/* Background Video Media / Canvas */}
      {video.mediaUrl ? (
        video.mediaUrl.endsWith('.mp4') || video.mediaUrl.endsWith('.webm') || video.mediaUrl.startsWith('blob:') ? (
          <video
            src={video.mediaUrl}
            autoPlay={isPlaying}
            loop
            muted={isMuted}
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={video.mediaUrl}
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/85 pointer-events-none" />

      {/* Pending Moderation Banner for Creator's POV */}
      {video.status === 'pending' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-black text-[10px] font-extrabold shadow-lg backdrop-blur-md animate-pulse whitespace-nowrap">
          <Clock className="w-3 h-3" />
          <span>Awaiting Admin Approval (Only you see this)</span>
        </div>
      )}

      {/* Top Header: Flag / Report Icon at top-right */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
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

      {/* Top Left: Sound and Play/Pause Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className="p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-all cursor-pointer"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-all cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      {/* Right Action Rail (Avatar, Like, Comment, Share, Report) */}
      <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">
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
            className={`p-2.5 rounded-full transition-all cursor-pointer transform active:scale-125 ${
              video.isLiked
                ? 'text-[#ff007a] bg-pink-500/20'
                : 'text-white hover:text-[#ff007a] bg-black/40 backdrop-blur-md hover:bg-black/60'
            }`}
            title="Like"
          >
            <Heart
              className={`w-6 h-6 ${video.isLiked ? 'fill-[#ff007a]' : ''}`}
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
      <div className="absolute bottom-4 left-4 right-16 z-20 text-left">
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

      {/* Animated Playing Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
        <div className="h-full bg-[#ff007a] w-3/4 animate-pulse" />
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
          Upload MP4 videos with custom captions, audio tracks, and hashtags to display them here in full 9:16 layout.
        </p>
        <button
          onClick={() => setActiveTab('upload')}
          className="flex items-center gap-2 py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Upload Video</span>
        </button>
      </div>

      {/* Top Left: Sound and Play/Pause Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="p-2 rounded-full bg-black/40 backdrop-blur-md text-neutral-400">
          <Volume2 className="w-4 h-4" />
        </div>
        <div className="p-2 rounded-full bg-black/40 backdrop-blur-md text-neutral-400">
          <Play className="w-4 h-4" />
        </div>
      </div>

      {/* Top Right: Flag */}
      <div className="absolute top-4 right-4 z-20">
        <div className="p-2 rounded-full bg-black/40 backdrop-blur-md text-neutral-500">
          <Flag className="w-4 h-4" />
        </div>
      </div>

      {/* Right Action Rail Placeholder */}
      <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">
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
      <div className="absolute bottom-4 left-4 right-16 z-20 text-left">
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
    shareVideo,
    setActiveTab,
    setSearchQuery,
    openLiveStreamAsViewer,
    currentLiveStream,
  } = useApp();

  const [isMuted, setIsMuted] = useState(false);
  const [shareModalVideo, setShareModalVideo] = useState<Video | null>(null);

  // Filter: Public feed only shows approved videos (or pending videos to their creator)
  const visibleVideos = videos.filter(v => {
    if (v.status === 'rejected') return false;
    if (v.status === 'pending') {
      return currentUser && v.creatorId === currentUser.id;
    }
    return true;
  });

  // Reference to the middle scrollable video container
  const videoFeedRef = useRef<HTMLDivElement>(null);

  const handleShare = (video: Video) => {
    setShareModalVideo(video);
  };

  // If user scrolls anywhere in the home feed area, ensure the video feed scrolls smoothly
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
        className="flex-1 max-w-[430px] h-full overflow-y-auto snap-y snap-mandatory overscroll-contain no-scrollbar pt-1 pb-16"
      >
        {visibleVideos.length === 0 ? (
          <EmptyFeedLayoutCard />
        ) : (
          visibleVideos.map(video => (
            <VideoFeedCard
              key={video.id}
              video={video}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted(!isMuted)}
              onShare={handleShare}
            />
          ))
        )}
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
