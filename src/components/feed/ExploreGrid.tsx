import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp, deduplicateVideos } from '../../context/AppContext';
import { Video } from '../../types';
import { isVideoUrl, checkIsUserBanned, isSameUser } from '../../lib/supabase';
import { Avatar } from '../common/Avatar';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  MessageCircle,
  Share2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  Music,
  UserPlus,
  Check,
  Users,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const formatCount = (count?: number | string): string => {
  const num = typeof count === 'string' ? parseInt(count, 10) || 0 : count || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
};

export const ExploreGrid: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    toggleLikeVideo,
    shareVideo,
    setCommentsVideoId,
    openReportModal,
    searchQuery,
    setSearchQuery,
    navigateToUserProfile,
    toggleFollowUser,
    getFollowStatus,
    isTargetFollowingMe,
  } = useApp();

  // Active category/hashtag filter (in-memory, 0 database overhead)
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Selected video for the Instant Popup Modal Player (keeps user on Explore page)
  const [modalVideo, setModalVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  // Extract dynamic trending hashtags from existing videos in memory
  const trendingTags = useMemo(() => {
    const tagCountMap = new Map<string, number>();
    const defaultTags = ['#fyp', '#viral', '#trending', '#music', '#dance', '#comedy', '#gaming'];

    defaultTags.forEach(t => tagCountMap.set(t.toLowerCase(), 1));

    videos.forEach(v => {
      (v.hashtags || []).forEach(h => {
        const clean = h.startsWith('#') ? h.toLowerCase() : `#${h.toLowerCase()}`;
        tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
      });
    });

    const sorted = Array.from(tagCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    return ['all', ...sorted.slice(0, 10)];
  }, [videos]);

  const cleanQuery = searchQuery.toLowerCase().replace('#', '').replace('@', '').trim();

  // Filter matching creators (only highlighted when user explicitly searches, hide banned accounts)
  const matchedUsers = useMemo(() => {
    if (!cleanQuery) return [];
    return users.filter(
      u =>
        !u.isBanned &&
        !checkIsUserBanned(u.id, u.email, u).isBanned &&
        (u.displayName.toLowerCase().includes(cleanQuery) ||
        u.username.toLowerCase().includes(cleanQuery) ||
        u.bio.toLowerCase().includes(cleanQuery))
    );
  }, [users, cleanQuery]);

  // Filter videos by search query and trending tag filter
  const filteredVideos = useMemo(() => {
    return deduplicateVideos(videos).filter(v => {
      if (v.status === 'rejected') return false;
      if (v.creator?.isBanned) return false;
      if (checkIsUserBanned(v.creatorId || v.creator?.id, v.creator?.email, v.creator).isBanned) return false;
      const creatorUser = users.find(u => isSameUser(u.id, v.creatorId) || isSameUser(u.id, v.creator?.id));
      if (creatorUser?.isBanned || (creatorUser && checkIsUserBanned(creatorUser.id, creatorUser.email, creatorUser).isBanned)) return false;
      if (v.status === 'pending') {
        if (!currentUser || v.creatorId !== currentUser.id) return false;
      }

      // Filter by active selected tag chip
      if (selectedTag !== 'all') {
        const tagToMatch = selectedTag.replace('#', '').toLowerCase();
        const hasMatchingTag =
          v.hashtags.some(t => t.toLowerCase().replace('#', '') === tagToMatch) ||
          v.caption.toLowerCase().includes(`#${tagToMatch}`) ||
          v.caption.toLowerCase().includes(tagToMatch);
        if (!hasMatchingTag) return false;
      }

      // Filter by global search query
      if (cleanQuery) {
        const matchesCaption = v.caption.toLowerCase().includes(cleanQuery);
        const matchesDisplayName = v.creator.displayName.toLowerCase().includes(cleanQuery);
        const matchesUsername = v.creator.username.toLowerCase().includes(cleanQuery);
        const matchesTags = v.hashtags.some(tag => tag.toLowerCase().includes(cleanQuery));
        if (!matchesCaption && !matchesDisplayName && !matchesUsername && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [videos, currentUser, selectedTag, cleanQuery]);

  // Keep modalVideo state in sync with updated video data (e.g. like count / like status)
  const activeModalVideo = useMemo(() => {
    if (!modalVideo) return null;
    const fresh = videos.find(v => v.id === modalVideo.id);
    return fresh || modalVideo;
  }, [videos, modalVideo]);

  // Keyboard navigation for popup modal player
  useEffect(() => {
    if (!activeModalVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalVideo(null);
      } else if (e.key === 'ArrowRight') {
        navigateModalVideo('next');
      } else if (e.key === 'ArrowLeft') {
        navigateModalVideo('prev');
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'm') {
        setIsMuted(m => !m);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModalVideo, filteredVideos]);

  const togglePlayPause = () => {
    if (!modalVideoRef.current) return;
    if (modalVideoRef.current.paused) {
      modalVideoRef.current.play();
      setIsPlaying(true);
    } else {
      modalVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const navigateModalVideo = (direction: 'next' | 'prev') => {
    if (!activeModalVideo || filteredVideos.length <= 1) return;
    const currentIndex = filteredVideos.findIndex(v => v.id === activeModalVideo.id);
    if (currentIndex === -1) return;

    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= filteredVideos.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = filteredVideos.length - 1;

    setModalVideo(filteredVideos[nextIndex]);
    setIsPlaying(true);
  };

  return (
    <div className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full text-left">
      {/* 1. Header with Title & Active Search Indicator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-brand text-white flex items-center gap-2">
            <span>Explore</span>
            <Sparkles className="w-5 h-5 text-[#ff007a]" />
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Discover viral moments, trending sounds, and featured community videos
          </p>
        </div>

        {/* Search query tag indicator with clear button */}
        {searchQuery && (
          <div className="flex items-center gap-2 bg-[#181824] px-3.5 py-1.5 rounded-full border border-[#ff007a]/40 text-xs shadow-[0_0_12px_rgba(255,0,122,0.15)]">
            <span className="text-neutral-400">Search:</span>
            <span className="text-[#ff007a] font-bold">"{searchQuery}"</span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-neutral-400 hover:text-white ml-1 font-bold cursor-pointer"
              title="Clear search"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* 2. Trending Hashtag Chips Bar (replaces clunky All / Creators / Videos tabs) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none select-none">
        {trendingTags.map(tag => {
          const isActive = selectedTag === tag;
          const isAll = tag === 'all';
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'bg-gradient-to-r from-[#ff007a] to-[#9900f0] text-white shadow-[0_0_14px_rgba(255,0,122,0.4)] scale-[1.02]'
                  : 'bg-[#151520] hover:bg-[#1f1f2e] text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {isAll ? (
                <>
                  <Flame className={`w-3.5 h-3.5 ${isActive ? 'text-amber-300' : 'text-[#ff007a]'}`} />
                  <span>Trending</span>
                </>
              ) : (
                <span>{tag}</span>
              )}
            </button>
          );
        })}

        {selectedTag !== 'all' && (
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className="text-[11px] text-neutral-400 hover:text-white underline px-2 cursor-pointer font-medium"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* 3. Matching Creators Rail (Contextual - Only shown when user searches for creators) */}
      {cleanQuery && matchedUsers.length > 0 && (
        <div className="mb-6 bg-[#13131c] rounded-2xl p-4 border border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Matching Creators</span>
              <span className="text-[#ff007a]">({matchedUsers.length})</span>
            </h3>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
            {matchedUsers.map(u => {
              const isSelf = currentUser?.id === u.id;
              const status = getFollowStatus(u.id);
              const targetFollowsMe = isTargetFollowingMe(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => navigateToUserProfile(u.id)}
                  className="flex-shrink-0 w-44 bg-[#1a1a26] hover:bg-[#202030] p-3 rounded-xl border border-neutral-800 hover:border-[#ff007a]/40 transition-all cursor-pointer flex flex-col items-center text-center group"
                >
                  <Avatar
                    src={u.avatar}
                    alt={u.displayName || u.username}
                    size="md"
                    className="border-2 border-neutral-700 group-hover:border-[#ff007a] transition-all mb-2"
                  />
                  <div className="w-full truncate text-xs font-bold text-white group-hover:text-[#ff007a] transition-colors">
                    {u.displayName}
                  </div>
                  <div className="w-full truncate text-[11px] text-neutral-400 mb-2">
                    @{u.username}
                  </div>

                  {!isSelf && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        toggleFollowUser(u.id);
                      }}
                      className={`w-full py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        status === 'friends'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : status === 'following'
                          ? 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                          : status === 'requested'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : targetFollowsMe
                          ? 'bg-[#ff007a] text-white shadow-sm'
                          : 'bg-white hover:bg-neutral-200 text-black'
                      }`}
                    >
                      {status === 'friends' ? (
                        <>
                          <Users className="w-3 h-3" />
                          <span>Friends</span>
                        </>
                      ) : status === 'following' ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Following</span>
                        </>
                      ) : status === 'requested' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>Requested</span>
                        </>
                      ) : targetFollowsMe ? (
                        <>
                          <UserPlus className="w-3 h-3" />
                          <span>Follow Back</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3 h-3" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Minimalist Edge-to-Edge Responsive Video Wall */}
      {filteredVideos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
          {filteredVideos.map(video => (
            <div
              key={video.id}
              onClick={() => {
                setModalVideo(video);
                setIsPlaying(true);
              }}
              className="group relative bg-[#13131a] rounded-2xl overflow-hidden border border-neutral-800/90 hover:border-[#ff007a]/70 shadow-lg hover:shadow-[0_8px_24px_rgba(255,0,122,0.2)] transition-all duration-300 flex flex-col aspect-[9/15] cursor-pointer"
            >
              {/* Thumbnail / Video Preview */}
              <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#181826] to-[#0d0d14]">
                {video.thumbnailUrl &&
                !isVideoUrl(video.thumbnailUrl) &&
                video.thumbnailUrl !== video.creator?.avatar &&
                !video.thumbnailUrl.includes('avatar_') &&
                !video.thumbnailUrl.includes('profile%20picture') &&
                !video.thumbnailUrl.includes('profile-picture') &&
                (video.thumbnailUrl.startsWith('data:image/') ||
                  video.thumbnailUrl.endsWith('.jpg') ||
                  video.thumbnailUrl.endsWith('.jpeg') ||
                  video.thumbnailUrl.endsWith('.png') ||
                  video.thumbnailUrl.endsWith('.webp')) ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.caption}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                ) : video.mediaUrl ? (
                  <video
                    src={video.mediaUrl}
                    preload="metadata"
                    muted
                    playsInline
                    className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600">
                    <Play className="w-8 h-8" />
                  </div>
                )}

                {/* Subtle dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

                {/* Play Button Icon on Hover */}
                <div className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-[#ff007a]/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 shadow-[0_0_16px_rgba(255,0,122,0.6)] pointer-events-none">
                  <Play className="w-5 h-5 ml-0.5 fill-white" />
                </div>

                {/* Top Badges (Likes & Views) */}
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] font-semibold">
                  <Eye className="w-3 h-3 text-neutral-300" />
                  <span>{formatCount(video.viewsCount || 0)}</span>
                </div>

                {/* Bottom Overlay: Creator info & Caption */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 text-left">
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      navigateToUserProfile(video.creator.id);
                    }}
                    className="flex items-center gap-1.5 mb-1 group/user hover:opacity-90 transition-opacity"
                  >
                    <Avatar
                      src={video.creator.avatar}
                      alt={video.creator.displayName || 'Creator'}
                      size="xs"
                      className="border border-white/40"
                    />
                    <span className="text-[11px] font-bold text-white truncate drop-shadow group-hover/user:text-[#ff007a] transition-colors">
                      {video.creator.displayName || video.creator.username || 'Creator'}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-neutral-200 line-clamp-2 leading-tight drop-shadow">
                    {video.caption}
                  </p>

                  {/* Likes badge bottom right */}
                  <div className="flex items-center justify-between mt-1 text-[10px] text-neutral-400 font-semibold">
                    <span className="text-[#ff007a] truncate font-bold">
                      {video.hashtags && video.hashtags[0] ? video.hashtags[0] : ''}
                    </span>
                    <span className="flex items-center gap-1 text-white/90">
                      <Heart
                        className={`w-3 h-3 ${
                          video.isLiked ? 'text-[#ff007a] fill-[#ff007a]' : 'text-neutral-400'
                        }`}
                      />
                      <span>{formatCount(video.likesCount)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 px-4 bg-[#12121a] rounded-3xl border border-neutral-800 text-neutral-400">
          <Flame className="w-10 h-10 text-[#ff007a]/40 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No videos found</h3>
          <p className="text-xs max-w-sm mx-auto text-neutral-400">
            {searchQuery
              ? `No videos matched "${searchQuery}". Try selecting another trending topic!`
              : selectedTag !== 'all'
              ? `No videos found under tag "${selectedTag}".`
              : 'No videos uploaded yet.'}
          </p>
          {(selectedTag !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedTag('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-[#ff007a] text-white text-xs font-bold hover:bg-[#ff1a8c] transition-all cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. INSTANT POPUP MODAL PLAYER (Keeps user on the Explore page!)           */}
      {/* ========================================================================= */}
      {activeModalVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-200"
          onClick={() => setModalVideo(null)}
        >
          {/* Previous Video Nav Button */}
          {filteredVideos.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigateModalVideo('prev');
              }}
              className="hidden md:flex absolute left-4 lg:left-8 z-50 w-11 h-11 rounded-full bg-black/60 hover:bg-[#ff007a] text-white items-center justify-center border border-white/20 transition-all cursor-pointer hover:scale-110 shadow-xl"
              title="Previous video (ArrowLeft)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Next Video Nav Button */}
          {filteredVideos.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigateModalVideo('next');
              }}
              className="hidden md:flex absolute right-4 lg:right-8 z-50 w-11 h-11 rounded-full bg-black/60 hover:bg-[#ff007a] text-white items-center justify-center border border-white/20 transition-all cursor-pointer hover:scale-110 shadow-xl"
              title="Next video (ArrowRight)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Modal Container */}
          <div
            className="relative w-full max-w-sm sm:max-w-md h-[88vh] max-h-[760px] bg-black rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col justify-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Top Bar with Close Button & Sound Toggle */}
            <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-auto">
              <button
                type="button"
                onClick={() => setIsMuted(m => !m)}
                className="p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setModalVideo(null)}
                className="p-2.5 rounded-full bg-black/50 hover:bg-[#ff007a] text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer hover:rotate-90 duration-200"
                title="Close (Escape)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Element */}
            <div
              className="relative w-full h-full flex items-center justify-center bg-black cursor-pointer"
              onClick={togglePlayPause}
            >
              {activeModalVideo.mediaUrl ? (
                <video
                  ref={modalVideoRef}
                  key={activeModalVideo.id}
                  src={activeModalVideo.mediaUrl}
                  poster={activeModalVideo.thumbnailUrl}
                  autoPlay
                  loop
                  playsInline
                  muted={isMuted}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-contain sm:object-cover"
                />
              ) : activeModalVideo.thumbnailUrl ? (
                <img
                  src={activeModalVideo.thumbnailUrl}
                  alt={activeModalVideo.caption}
                  className="w-full h-full object-contain sm:object-cover"
                />
              ) : (
                <div className="text-neutral-500">Video not available</div>
              )}

              {/* Play/Pause Center Indicator on pause */}
              {!isPlaying && (
                <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center pointer-events-none shadow-2xl">
                  <Play className="w-8 h-8 ml-1 fill-white" />
                </div>
              )}

              {/* Bottom Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none" />
            </div>

            {/* Right Action Rail (Avatar, Like, Comment, Share, Report) */}
            <div
              className="absolute right-3 bottom-20 z-30 flex flex-col items-center gap-4 pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Creator Avatar */}
              <div
                onClick={() => {
                  setModalVideo(null);
                  navigateToUserProfile(activeModalVideo.creator.id);
                }}
                className="relative cursor-pointer group/avatar"
                title="View Creator Profile"
              >
                <Avatar
                  src={activeModalVideo.creator.avatar}
                  alt={activeModalVideo.creator.displayName}
                  size="md"
                  className="border-2 border-white group-hover/avatar:border-[#ff007a] transition-all"
                />
              </div>

              {/* Like Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => toggleLikeVideo(activeModalVideo.id)}
                  className={`p-3 rounded-full backdrop-blur-md transition-all cursor-pointer active:scale-125 ${
                    activeModalVideo.isLiked
                      ? 'bg-pink-500/25 text-[#ff007a] shadow-[0_0_14px_rgba(255,0,122,0.4)]'
                      : 'bg-black/50 text-white hover:text-[#ff007a] hover:bg-black/70'
                  }`}
                  title="Like"
                >
                  <Heart
                    className={`w-6 h-6 transition-transform ${
                      activeModalVideo.isLiked ? 'fill-[#ff007a] scale-110' : ''
                    }`}
                  />
                </button>
                <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                  {formatCount(activeModalVideo.likesCount)}
                </span>
              </div>

              {/* Comment Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setCommentsVideoId(activeModalVideo.id)}
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md text-white hover:text-cyan-400 transition-all cursor-pointer active:scale-125"
                  title="Comments"
                >
                  <MessageCircle className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                  {formatCount(activeModalVideo.commentsCount)}
                </span>
              </div>

              {/* Share Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => shareVideo(activeModalVideo.id)}
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md text-white hover:text-emerald-400 transition-all cursor-pointer active:scale-125"
                  title="Share"
                >
                  <Share2 className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                  {formatCount(activeModalVideo.sharesCount)}
                </span>
              </div>

              {/* Report Video */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() =>
                    openReportModal({
                      type: 'video',
                      targetId: activeModalVideo.id,
                      targetName: `${activeModalVideo.creator.displayName || 'Creator'}'s video`,
                      targetSubtitle: activeModalVideo.caption.slice(0, 35),
                      targetThumbnail: activeModalVideo.thumbnailUrl,
                    })
                  }
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md text-white hover:text-red-400 transition-all cursor-pointer"
                  title="Report Video"
                >
                  <AlertTriangle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Bottom Caption & Sound Overlay */}
            <div className="absolute bottom-4 left-4 right-16 z-20 text-left pointer-events-auto">
              <div
                onClick={() => {
                  setModalVideo(null);
                  navigateToUserProfile(activeModalVideo.creator.id);
                }}
                className="inline-flex items-center gap-1.5 cursor-pointer hover:underline mb-1"
              >
                <span className="text-sm font-bold text-white drop-shadow">
                  {activeModalVideo.creator.displayName}
                </span>
                <span className="text-xs text-neutral-300 drop-shadow">
                  @{activeModalVideo.creator.username}
                </span>
              </div>

              <p className="text-xs text-neutral-100 font-medium line-clamp-3 leading-relaxed drop-shadow mb-2">
                {activeModalVideo.caption}
              </p>

              {/* Hashtags */}
              {activeModalVideo.hashtags && activeModalVideo.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {activeModalVideo.hashtags.map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      onClick={() => {
                        setSelectedTag(tag.toLowerCase());
                        setModalVideo(null);
                      }}
                      className="text-[11px] font-bold text-[#ff007a] hover:underline cursor-pointer drop-shadow"
                    >
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Sound / Music Track */}
              <div className="flex items-center gap-2 text-xs text-neutral-300 drop-shadow">
                <Music className="w-3.5 h-3.5 text-[#ff007a] animate-spin" />
                <span className="truncate text-[11px]">
                  {activeModalVideo.audioTrack?.title || 'Original audio - ViralHub'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
