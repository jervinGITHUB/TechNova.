import React, { useState, useRef } from 'react';
import { Video } from '../../types';
import { Avatar } from '../common/Avatar';
import { Play, Pause, Volume2, VolumeX, Film, ExternalLink, Heart, MessageCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface MessageVideoCardProps {
  video: Video;
  note?: string;
  isMe: boolean;
}

export const MessageVideoCard: React.FC<MessageVideoCardProps> = ({
  video,
  note,
  isMe,
}) => {
  const { navigateToUserProfile, setActiveTab } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const safeMediaUrl = video.mediaUrl && !video.mediaUrl.startsWith('blob:')
    ? video.mediaUrl
    : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    setActiveTab('home');
  };

  return (
    <div className="w-full select-none text-left">
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
              if (video.creator?.id) navigateToUserProfile(video.creator.id);
            }}
            className="flex items-center gap-2 cursor-pointer group/creator"
          >
            <Avatar
              src={video.creator?.avatar}
              alt={video.creator?.displayName || video.creator?.username || 'Creator'}
              size="sm"
              className="w-7 h-7 border border-white/20 group-hover/creator:border-[#ff007a] transition-all"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white group-hover/creator:text-[#ff007a] transition-colors truncate">
                {video.creator?.displayName || video.creator?.username || 'Creator'}
              </div>
              <div className="text-[9px] text-neutral-400 truncate">
                @{video.creator?.username || 'creator'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleWatchInFeed}
            className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg bg-white/5 hover:bg-white/15 transition-all cursor-pointer"
            title="Watch in feed"
          >
            <span>Open</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Video Player Container */}
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
            className="w-full h-full object-cover"
          />

          {/* Big Center Play/Pause Button Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center transition-all group-hover/video:bg-black/30">
              <div className="w-12 h-12 rounded-full bg-[#ff007a] text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,0,122,0.8)] transform transition-transform group-hover/video:scale-110">
                <Play className="w-6 h-6 fill-white ml-0.5" />
              </div>
              <span className="text-[11px] font-bold text-white/90 mt-2 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/20">
                Click to Play
              </span>
            </div>
          )}

          {/* Top Video Tag Badge */}
          <div className="absolute top-2 left-2 pointer-events-none">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[9px] font-extrabold text-white uppercase tracking-wider">
              <Film className="w-2.5 h-2.5 text-[#ff007a]" />
              <span>Video</span>
            </span>
          </div>

          {/* Bottom Floating Control Bar */}
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

              {/* Likes & Comments Counter */}
              <div className="flex items-center gap-2 text-[10px] text-neutral-300">
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a]" />
                  <span>{video.likesCount || 0}</span>
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-cyan-400" />
                  <span>{video.commentsCount || 0}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Video Caption & Hashtags Footer */}
        {video.caption && (
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
    </div>
  );
};
