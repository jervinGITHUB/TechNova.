import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import {
  Heart,
  MessageCircle,
  Share2,
  Play,
  Flag,
  User as UserIcon,
  Users,
  Check,
  Clock,
  UserPlus,
  ArrowRight
} from 'lucide-react';

export const ExploreGrid: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    toggleLikeVideo,
    shareVideo,
    setCommentsVideoId,
    openReportModal,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    navigateToUserProfile,
    toggleFollowUser,
    getFollowStatus,
    isTargetFollowingMe,
    getUserFollowers,
    getUserFollowing,
  } = useApp();

  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'creators' | 'videos'>('all');

  const cleanQuery = searchQuery.toLowerCase().replace('#', '').replace('@', '').trim();

  // Filter matching creators
  const matchedUsers = users.filter(u => {
    if (!cleanQuery) return true;
    return (
      u.displayName.toLowerCase().includes(cleanQuery) ||
      u.username.toLowerCase().includes(cleanQuery) ||
      u.bio.toLowerCase().includes(cleanQuery)
    );
  });

  // Filter matching videos (only approved videos or creator's own pending videos)
  const filteredVideos = videos.filter(v => {
    if (v.status === 'rejected') return false;
    if (v.status === 'pending') {
      if (!currentUser || v.creatorId !== currentUser.id) return false;
    }
    if (!cleanQuery) return true;
    return (
      v.caption.toLowerCase().includes(cleanQuery) ||
      v.creator.displayName.toLowerCase().includes(cleanQuery) ||
      v.creator.username.toLowerCase().includes(cleanQuery) ||
      v.hashtags.some(tag => tag.toLowerCase().includes(cleanQuery))
    );
  });

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full text-left">
      {/* Header section with active search tags if any */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold font-brand text-white">Explore</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Discover viral creators, trending sounds, and featured videos
          </p>
        </div>

        {searchQuery && (
          <div className="flex items-center gap-2 bg-[#181824] px-3.5 py-1.5 rounded-full border border-neutral-700 text-xs">
            <span className="text-neutral-400">Search results for:</span>
            <span className="text-[#ff007a] font-bold">"{searchQuery}"</span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-neutral-400 hover:text-white ml-1 font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Tabs Filter: All, Creators, Videos */}
      <div className="flex items-center gap-2 pb-4 mb-6 border-b border-neutral-800">
        <button
          onClick={() => setActiveFilterTab('all')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeFilterTab === 'all'
              ? 'bg-[#ff007a] text-white shadow-[0_0_12px_rgba(255,0,122,0.4)]'
              : 'bg-[#181824] text-neutral-400 hover:text-white hover:bg-[#20202e]'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilterTab('creators')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeFilterTab === 'creators'
              ? 'bg-[#ff007a] text-white shadow-[0_0_12px_rgba(255,0,122,0.4)]'
              : 'bg-[#181824] text-neutral-400 hover:text-white hover:bg-[#20202e]'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span>Creators ({matchedUsers.length})</span>
        </button>
        <button
          onClick={() => setActiveFilterTab('videos')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeFilterTab === 'videos'
              ? 'bg-[#ff007a] text-white shadow-[0_0_12px_rgba(255,0,122,0.4)]'
              : 'bg-[#181824] text-neutral-400 hover:text-white hover:bg-[#20202e]'
          }`}
        >
          Videos ({filteredVideos.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. CREATORS SECTION (Visible when tab is 'all' or 'creators')              */}
      {/* ========================================================================= */}
      {(activeFilterTab === 'all' || activeFilterTab === 'creators') && matchedUsers.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-[#ff007a]" />
              <span>Creators</span>
            </h3>
            {activeFilterTab === 'all' && matchedUsers.length > 4 && (
              <button
                onClick={() => setActiveFilterTab('creators')}
                className="text-xs text-[#ff007a] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>View all ({matchedUsers.length})</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(activeFilterTab === 'all' ? matchedUsers.slice(0, 4) : matchedUsers).map(u => {
              const isSelf = currentUser?.id === u.id;
              const status = getFollowStatus(u.id);
              const targetFollowsMe = isTargetFollowingMe(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => navigateToUserProfile(u.id)}
                  className="bg-[#13131a] rounded-3xl p-4 border border-neutral-800 hover:border-[#ff007a]/40 transition-all flex flex-col justify-between cursor-pointer group shadow-lg"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="relative">
                        <Avatar
                          src={u.avatar}
                          alt={u.displayName || u.username}
                          size="lg"
                          className="border-2 border-neutral-700 group-hover:border-[#ff007a] transition-all"
                        />
                        {u.isPrivate && (
                          <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-neutral-900 border border-neutral-700 text-[10px] flex items-center justify-center text-amber-400">
                            🔒
                          </span>
                        )}
                      </div>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFollowUser(u.id);
                          }}
                          className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                            status === 'friends'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                              : status === 'following'
                              ? 'bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white'
                              : status === 'requested'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : targetFollowsMe
                              ? 'bg-[#ff007a] text-white shadow-[0_0_10px_rgba(255,0,122,0.3)]'
                              : 'bg-white hover:bg-neutral-200 text-black'
                          }`}
                        >
                          {status === 'friends' ? (
                            <>
                              <Users className="w-3 h-3 text-emerald-400" />
                              <span>Friends</span>
                            </>
                          ) : status === 'following' ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Following</span>
                            </>
                          ) : status === 'requested' ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>Request Sent</span>
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

                    <h4 className="text-sm font-bold text-white group-hover:text-[#ff007a] transition-colors truncate">
                      {u.displayName}
                    </h4>
                    <p className="text-xs text-neutral-400 truncate">@{u.username}</p>
                    <p className="text-xs text-neutral-300 mt-2 line-clamp-2 leading-relaxed">
                      {u.bio}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-neutral-800/80 text-[11px] text-neutral-400 font-medium">
                    <div>
                      <span className="font-bold text-white">{getUserFollowers(u.id).length}</span> followers
                    </div>
                    <div>
                      <span className="font-bold text-white">{getUserFollowing(u.id).length}</span> following
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VIDEOS GRID SECTION (Visible when tab is 'all' or 'videos')              */}
      {/* ========================================================================= */}
      {(activeFilterTab === 'all' || activeFilterTab === 'videos') && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
              <Play className="w-4 h-4 text-[#ff007a] fill-[#ff007a]" />
              <span>Videos ({filteredVideos.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredVideos.map(video => (
              <div
                key={video.id}
                className="group relative bg-[#13131a] rounded-3xl overflow-hidden border border-neutral-800 hover:border-[#ff007a]/60 shadow-lg transition-all flex flex-col aspect-[9/14]"
              >
                {/* Thumbnail with overlay gradient */}
                <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#191926] to-[#0f0f16]">
                  {video.thumbnailUrl || video.mediaUrl ? (
                    <img
                      src={video.thumbnailUrl || video.mediaUrl}
                      alt={video.caption}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Play className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                  {/* Play icon overlay on hover */}
                  <button
                    onClick={() => setActiveTab('home')}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-[#ff007a]/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm shadow-xl cursor-pointer"
                  >
                    <Play className="w-5 h-5 ml-0.5 fill-white" />
                  </button>

                  {/* Action buttons on the right side of the card */}
                  <div className="absolute right-3 bottom-14 flex flex-col items-center gap-3 z-10">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleLikeVideo(video.id);
                      }}
                      className={`p-2 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                        video.isLiked
                          ? 'bg-pink-500/20 text-[#ff007a]'
                          : 'bg-black/40 text-white hover:text-[#ff007a]'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${video.isLiked ? 'fill-[#ff007a]' : ''}`}
                      />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setCommentsVideoId(video.id);
                      }}
                      className="p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-cyan-400 transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        shareVideo(video.id);
                      }}
                      className="p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-emerald-400 transition-colors cursor-pointer"
                      title="Share"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        openReportModal({
                          type: 'video',
                          targetId: video.id,
                          targetName: `${video.creator.displayName}'s video`,
                          targetSubtitle: video.caption.slice(0, 35),
                          targetThumbnail: video.thumbnailUrl || video.mediaUrl,
                        });
                      }}
                      className="p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-red-400 transition-colors cursor-pointer"
                      title="Report Video"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Creator handle above caption */}
                  <div
                    onClick={() => navigateToUserProfile(video.creator.id)}
                    className="absolute bottom-16 left-3 z-10 flex items-center gap-2 cursor-pointer hover:underline"
                  >
                    <Avatar
                      src={video.creator.avatar}
                      alt={video.creator.displayName || 'Creator'}
                      size="xs"
                    />
                    <span className="text-xs font-bold text-white drop-shadow">
                      {video.creator.displayName || video.creator.username || 'Creator'}
                    </span>
                  </div>

                  {/* Bottom Caption and Hashtags */}
                  <div className="absolute bottom-3 left-3 right-12 z-10 text-left">
                    <p className="text-xs font-semibold text-white line-clamp-2 leading-tight">
                      {video.caption}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {video.hashtags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-bold text-[#ff007a]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {matchedUsers.length === 0 && filteredVideos.length === 0 && (
        <div className="text-center py-20 text-neutral-400 text-sm">
          {searchQuery
            ? `No creators or videos matched "${searchQuery}". Try searching for another keyword!`
            : 'No creators or videos yet. Content will appear here once posted!'}
        </div>
      )}
    </div>
  );
};
