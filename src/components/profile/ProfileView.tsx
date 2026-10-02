import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Video } from '../../types';
import { ShareVideoModal } from '../modals/ShareVideoModal';
import { Avatar } from '../common/Avatar';
import { DEFAULT_USER } from '../../services/storage';
import {
  MessageSquare,
  UserPlus,
  Check,
  MoreVertical,
  Flag,
  Ban,
  Lock,
  Play,
  Pause,
  Sliders,
  Users,
  Clock,
  X,
  Search,
  ChevronRight,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const {
    currentUser,
    selectedUserId,
    users,
    videos,
    toggleFollowUser,
    getFollowStatus,
    isTargetFollowingMe,
    followRequests,
    acceptFollowRequest,
    declineFollowRequest,
    openReportModal,
    openConversationWithUser,
    setActiveTab,
    getUserFollowers,
    getUserFollowing,
    canMessageUser,
    canViewUserFollows,
    navigateToUserProfile,
    recordVideoView,
    toggleLikeVideo,
    setCommentsVideoId,
    getUserLikedVideos,
  } = useApp();

  const [activeTabSub, setActiveTabSub] = useState<'videos' | 'liked'>('videos');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Video Preview & Share states
  const [selectedVideoModal, setSelectedVideoModal] = useState<Video | null>(null);
  const [shareModalVideo, setShareModalVideo] = useState<Video | null>(null);

  // Follow Modal states
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<'followers' | 'following'>('followers');
  const [followPrivacyNoticeOpen, setFollowPrivacyNoticeOpen] = useState(false);
  const [followSearchQuery, setFollowSearchQuery] = useState('');

  // Identify target profile: either selected user or current user
  const isSelf = !selectedUserId || (currentUser && selectedUserId === currentUser.id);
  const targetUser = isSelf
    ? (users.find(u => u.id === currentUser?.id) || currentUser || DEFAULT_USER)
    : (users.find(u => u.id === selectedUserId) || currentUser || DEFAULT_USER);

  if (!targetUser) {
    return <div className="p-8 text-neutral-400">User not found</div>;
  }

  // Videos associated with this user
  const userVideos = videos.filter(v => {
    if (v.creatorId !== targetUser.id) return false;
    if (!isSelf && (v.status === 'pending' || v.status === 'rejected')) return false;
    return true;
  });
  // User's liked videos are strictly isolated to targetUser!
  const likedVideos = getUserLikedVideos(targetUser.id);

  // Dynamic likes count for user's profile
  const totalVideoLikes = userVideos.reduce((sum, v) => sum + (v.likesCount || 0), 0);
  const formatCount = (count: number) => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  };

  const handleOpenVideo = (video: Video) => {
    recordVideoView(video.id);
    setSelectedVideoModal(video);
  };

  // Follow & Relationship states
  const followStatus = getFollowStatus(targetUser.id);
  const targetFollowsMe = isTargetFollowingMe(targetUser.id);
  const isFollowingTarget = followStatus === 'following' || followStatus === 'friends';

  // Following & Followers lists
  const targetFollowersList = getUserFollowers(targetUser.id);
  const targetFollowingList = getUserFollowing(targetUser.id);

  // Privacy rules:
  // - Private profile videos locked if not following/friends
  // - Private profile following & followers viewable ONLY if friends or isSelf
  // - Private profile messages sendable ONLY if friends or isSelf
  const isPrivateLocked = !isSelf && targetUser.isPrivate && !isFollowingTarget;
  const canViewFollows = canViewUserFollows(targetUser.id);
  const canMessage = canMessageUser(targetUser.id);

  // Pending incoming request from targetUser to currentUser (if currentUser is private)
  const incomingRequest = followRequests.find(
    r => r.fromUserId === targetUser.id && r.toUserId === currentUser?.id
  );

  const handleMessageUser = () => {
    if (!canMessage) {
      setToastMessage(`🔒 @${targetUser.username} has a private profile. Only friends can exchange messages.`);
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }
    openConversationWithUser(targetUser.id);
  };

  const handleOpenFollowModal = (tab: 'followers' | 'following') => {
    if (!canViewFollows) {
      setFollowPrivacyNoticeOpen(true);
      return;
    }
    setFollowModalTab(tab);
    setFollowSearchQuery('');
    setFollowModalOpen(true);
  };

  const handleBlockUser = () => {
    setMenuOpen(false);
    setIsBlocked(prev => !prev);
    const msg = !isBlocked
      ? `${targetUser.displayName} has been blocked.`
      : `${targetUser.displayName} has been unblocked.`;
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleReportUser = () => {
    setMenuOpen(false);
    openReportModal({
      type: 'user',
      targetId: targetUser.id,
      targetName: `${targetUser.displayName}'s profile`,
      targetSubtitle: `@${targetUser.username}`,
      targetThumbnail: targetUser.avatar,
    });
  };

  // Filtered follow list for modal
  const rawList = followModalTab === 'followers' ? targetFollowersList : targetFollowingList;
  const cleanFilter = followSearchQuery.trim().toLowerCase().replace('@', '');
  const activeFollowList = cleanFilter
    ? rawList.filter(
        u =>
          u.displayName.toLowerCase().includes(cleanFilter) ||
          u.username.toLowerCase().includes(cleanFilter) ||
          u.bio.toLowerCase().includes(cleanFilter)
      )
    : rawList;

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full text-left relative">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e1e2c] border border-neutral-700 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Ban className="w-4 h-4 text-red-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Profile Header matching Screenshot 5 & Screenshot 1 top right */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b border-neutral-800">
        {/* Avatar */}
        <div className="relative">
          <Avatar
            src={targetUser.avatar}
            alt={targetUser.displayName || targetUser.username}
            size="xl"
            className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-neutral-700/80 shadow-2xl"
          />
          {targetUser.isPrivate && (
            <div className="absolute bottom-1 right-1 p-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-amber-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Profile Info */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-brand text-white">
                {targetUser.displayName}
              </h1>
              {/* @user placed below display name */}
              <div className="text-xs sm:text-sm text-neutral-400 mt-1 font-medium">
                @{targetUser.username}
              </div>
            </div>

            {/* Action Buttons */}
            {isSelf ? (
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setActiveTab('edit_profile')}
                  className="py-1.5 px-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 relative self-start sm:self-auto">
                {/* Incoming Request Actions (if targetUser requested to follow currentUser) */}
                {incomingRequest ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => acceptFollowRequest(incomingRequest.id, false)}
                      className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => acceptFollowRequest(incomingRequest.id, true)}
                      className="py-1.5 px-3 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors cursor-pointer shadow-[0_0_12px_rgba(255,0,122,0.3)]"
                    >
                      Accept & Follow Back
                    </button>
                    <button
                      onClick={() => declineFollowRequest(incomingRequest.id)}
                      className="py-1.5 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  /* Follow / Following / Friends / Request Sent Button */
                  <button
                    onClick={() => toggleFollowUser(targetUser.id)}
                    className={`py-1.5 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      followStatus === 'friends'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : followStatus === 'following'
                        ? 'bg-neutral-800 border border-neutral-600 text-neutral-300 hover:text-white'
                        : followStatus === 'requested'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                        : targetFollowsMe
                        ? 'bg-[#ff007a] hover:bg-[#e0006c] text-white shadow-[0_0_12px_rgba(255,0,122,0.3)]'
                        : 'bg-white hover:bg-neutral-200 text-black'
                    }`}
                  >
                    {followStatus === 'friends' ? (
                      <>
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Friends</span>
                      </>
                    ) : followStatus === 'following' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Following</span>
                      </>
                    ) : followStatus === 'requested' ? (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Request Sent</span>
                      </>
                    ) : targetFollowsMe ? (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow Back</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                )}

                {/* Message Button */}
                {canMessage ? (
                  <button
                    onClick={handleMessageUser}
                    className="py-1.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Message
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setToastMessage(`🔒 @${targetUser.username} is a private account. You must be friends to exchange messages.`);
                      setTimeout(() => setToastMessage(''), 3500);
                    }}
                    className="py-1.5 px-3.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-400 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-not-allowed"
                    title="Only friends can message private accounts"
                  >
                    <Lock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Message</span>
                  </button>
                )}

                {/* 3 Dots Menu Button on the right corner after Follow and Message */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors border border-neutral-700 cursor-pointer flex items-center justify-center"
                    title="More options"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown with Report and Block */}
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute top-10 right-0 w-36 bg-[#181824] border border-neutral-700 rounded-2xl p-1.5 shadow-2xl z-40 flex flex-col gap-1 backdrop-blur-xl animate-fadeIn">
                        {/* Report Option */}
                        <button
                          onClick={handleReportUser}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-neutral-200 hover:text-[#ff007a] hover:bg-[#222232] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5 text-[#ff007a]" />
                          <span>Report</span>
                        </button>

                        <div className="h-px bg-neutral-700/60 my-0.5" />

                        {/* Block Option */}
                        <button
                          onClick={handleBlockUser}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5 text-red-400" />
                          <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bio */}
          <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed max-w-xl">
            {targetUser.bio}
          </p>

          {/* Stats: Following, Followers, Likes */}
          <div className="flex items-center gap-6 pt-1 text-sm font-semibold">
            {/* Following Button */}
            <button
              type="button"
              onClick={() => handleOpenFollowModal('following')}
              className="flex items-center gap-1.5 text-left group cursor-pointer hover:opacity-90 transition-opacity"
              title={canViewFollows ? 'View following' : 'Followers & following are private'}
            >
              <span className="text-white font-bold group-hover:text-[#ff007a] transition-colors">
                {targetFollowingList.length}
              </span>
              <span className="text-neutral-400 text-xs font-normal group-hover:text-neutral-200 flex items-center gap-0.5">
                <span>Following</span>
                {!canViewFollows && <Lock className="w-3 h-3 text-neutral-500 ml-0.5" />}
              </span>
            </button>

            {/* Followers Button */}
            <button
              type="button"
              onClick={() => handleOpenFollowModal('followers')}
              className="flex items-center gap-1.5 text-left group cursor-pointer hover:opacity-90 transition-opacity"
              title={canViewFollows ? 'View followers' : 'Followers & following are private'}
            >
              <span className="text-white font-bold group-hover:text-[#ff007a] transition-colors">
                {targetFollowersList.length >= 1000
                  ? `${(targetFollowersList.length / 1000).toFixed(0)}K`
                  : targetFollowersList.length}
              </span>
              <span className="text-neutral-400 text-xs font-normal group-hover:text-neutral-200 flex items-center gap-0.5">
                <span>Followers</span>
                {!canViewFollows && <Lock className="w-3 h-3 text-neutral-500 ml-0.5" />}
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold">{formatCount(totalVideoLikes)}</span>
              <span className="text-neutral-400 text-xs font-normal">Likes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked notice banner if user is blocked */}
      {isBlocked && (
        <div className="my-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 shrink-0" />
            <span>You have blocked this account. You won't receive messages or see new updates from them.</span>
          </div>
          <button
            onClick={handleBlockUser}
            className="text-white underline hover:no-underline font-semibold"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Tabs: Videos vs Liked */}
      <div className="flex items-center gap-8 border-b border-neutral-800 mt-6 mb-6">
        <button
          onClick={() => setActiveTabSub('videos')}
          className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
            activeTabSub === 'videos'
              ? 'text-white border-b-2 border-[#ff007a]'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Videos
        </button>

        {isSelf && (
          <button
            onClick={() => setActiveTabSub('liked')}
            className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
              activeTabSub === 'liked'
                ? 'text-white border-b-2 border-[#ff007a]'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Liked
          </button>
        )}
      </div>

      {/* Content Display: Private notice OR Blocked notice OR Video Grid */}
      {isBlocked ? (
        <div className="py-20 text-center space-y-2 text-neutral-400 text-xs">
          <Ban className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
          <p>Content hidden because this user is blocked.</p>
        </div>
      ) : isPrivateLocked ? (
        /* Private Profile POV matching Screenshot 5 top right */
        <div className="py-20 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white">
            Only approved followers can see these videos.
          </h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            This account is private. Follow {targetUser.displayName} to send a follow request and view their content.
          </p>
        </div>
      ) : (
        /* Public Video Grid matching Screenshot 5 */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {(activeTabSub === 'videos' ? userVideos : likedVideos).length === 0 ? (
            <div className="col-span-full py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-[#181824] border border-neutral-800 text-neutral-500 flex items-center justify-center mx-auto">
                <Play className="w-6 h-6 text-[#ff007a]" />
              </div>
              <p className="text-xs text-neutral-400">
                {activeTabSub === 'videos'
                  ? 'No videos uploaded yet.'
                  : 'No liked videos yet.'}
              </p>
              {isSelf && activeTabSub === 'videos' && (
                <button
                  onClick={() => setActiveTab('upload')}
                  className="py-2 px-5 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  Upload Your First Video
                </button>
              )}
            </div>
          ) : (
            (activeTabSub === 'videos' ? userVideos : likedVideos).map((video, idx) => {
              const isImageThumbnail =
                video.thumbnailUrl &&
                (video.thumbnailUrl.startsWith('data:image/') ||
                  video.thumbnailUrl.endsWith('.jpg') ||
                  video.thumbnailUrl.endsWith('.jpeg') ||
                  video.thumbnailUrl.endsWith('.png') ||
                  video.thumbnailUrl.endsWith('.webp'));

              return (
                <div
                  key={`${video.id}_${idx}`}
                  onClick={() => handleOpenVideo(video)}
                  className="group relative aspect-[9/13] bg-[#181824] rounded-2xl overflow-hidden cursor-pointer border border-neutral-800 hover:border-[#ff007a]/60 transition-all shadow-md flex items-center justify-center"
                >
                  {isImageThumbnail ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.caption}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : video.mediaUrl ? (
                    <video
                      src={video.mediaUrl}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Play className="w-8 h-8 text-neutral-600" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                  {/* Status Badges for Creator's POV */}
                  {video.status === 'pending' && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[10px] font-extrabold shadow backdrop-blur-sm animate-pulse">
                      <Clock className="w-2.5 h-2.5" />
                      <span>In Review</span>
                    </div>
                  )}
                  {video.status === 'rejected' && (
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-red-600/90 text-white text-[10px] font-extrabold shadow backdrop-blur-sm">
                      Declined
                    </div>
                  )}

                  {/* View count at bottom-left */}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[11px] font-bold text-white drop-shadow">
                    <Play className="w-3 h-3 fill-white" />
                    <span>{video.viewsCount || '0'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* Followers & Following List Modal                                          */}
      {/* ========================================================================= */}
      {followModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setFollowModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[#13131a] border border-neutral-800 rounded-3xl p-5 shadow-2xl z-10 text-left">
            {/* Header with Title & Close button */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="font-bold text-white font-brand text-base">
                  {targetUser.displayName}
                </h3>
                <div className="text-[11px] text-neutral-400">@{targetUser.username}</div>
              </div>
              <button
                type="button"
                onClick={() => setFollowModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs: Followers vs Following */}
            <div className="flex items-center gap-2 my-3 p-1 bg-[#181824] rounded-2xl">
              <button
                type="button"
                onClick={() => setFollowModalTab('followers')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  followModalTab === 'followers'
                    ? 'bg-[#ff007a] text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Followers ({targetFollowersList.length})
              </button>
              <button
                type="button"
                onClick={() => setFollowModalTab('following')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  followModalTab === 'following'
                    ? 'bg-[#ff007a] text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Following ({targetFollowingList.length})
              </button>
            </div>

            {/* Search within list */}
            <div className="relative mb-3 flex items-center">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={followSearchQuery}
                onChange={e => setFollowSearchQuery(e.target.value)}
                placeholder={`Search ${followModalTab}...`}
                className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-8 pr-7 py-2 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
              />
              {followSearchQuery && (
                <button
                  type="button"
                  onClick={() => setFollowSearchQuery('')}
                  className="absolute right-2.5 text-neutral-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* User Items List */}
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {activeFollowList.map(u => {
                const isCurr = currentUser?.id === u.id;
                const uStatus = getFollowStatus(u.id);

                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-[#181824] hover:bg-[#20202e] border border-neutral-800/80 transition-all"
                  >
                    <div
                      onClick={() => {
                        setFollowModalOpen(false);
                        navigateToUserProfile(u.id);
                      }}
                      className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 mr-2"
                    >
                      <Avatar
                        src={u.avatar}
                        alt={u.displayName || u.username}
                        size="md"
                        className="w-10 h-10 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white hover:text-[#ff007a] transition-colors truncate flex items-center gap-1.5">
                          <span>{u.displayName}</span>
                          {u.isPrivate && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate">@{u.username}</div>
                      </div>
                    </div>

                    {/* Action Button: Follow / Following / Friends / Request Sent */}
                    {!isCurr && currentUser ? (
                      <button
                        type="button"
                        onClick={() => toggleFollowUser(u.id)}
                        className={`py-1 px-3 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                          uStatus === 'friends'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : uStatus === 'following'
                            ? 'bg-neutral-800 border border-neutral-600 text-neutral-300 hover:text-white'
                            : uStatus === 'requested'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-white hover:bg-neutral-200 text-black'
                        }`}
                      >
                        {uStatus === 'friends' ? (
                          <>
                            <Users className="w-3 h-3" />
                            <span>Friends</span>
                          </>
                        ) : uStatus === 'following' ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Following</span>
                          </>
                        ) : uStatus === 'requested' ? (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>Requested</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    ) : isCurr ? (
                      <span className="text-[11px] font-bold text-neutral-500 bg-neutral-800/60 px-2.5 py-1 rounded-xl">
                        You
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {activeFollowList.length === 0 && (
                <div className="py-12 text-center text-xs text-neutral-500">
                  {followSearchQuery
                    ? `No users found matching "${followSearchQuery}".`
                    : followModalTab === 'followers'
                    ? 'No followers yet.'
                    : 'Not following anyone yet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Private Account Lock Notice Modal                                         */}
      {/* ========================================================================= */}
      {followPrivacyNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setFollowPrivacyNoticeOpen(false)} />
          <div className="relative w-full max-w-sm bg-[#13131a] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">This Account is Private</h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Follow and become friends with <span className="text-white font-semibold">@{targetUser.username}</span> to view their followers and following lists.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFollowPrivacyNoticeOpen(false)}
                className="flex-1 py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              {followStatus !== 'friends' && followStatus !== 'requested' && (
                <button
                  type="button"
                  onClick={() => {
                    toggleFollowUser(targetUser.id);
                    setFollowPrivacyNoticeOpen(false);
                  }}
                  className="flex-1 py-2 px-4 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors cursor-pointer shadow-lg"
                >
                  Send Request
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Video Player Modal from Profile                                           */}
      {/* ========================================================================= */}
      {selectedVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setSelectedVideoModal(null)} />
          <div className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col justify-between z-10">
            {/* Top Bar: Close Button + Views Count */}
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-bold border border-white/10">
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{selectedVideoModal.viewsCount || '1'} views</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideoModal(null)}
                className="p-1.5 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            {selectedVideoModal.mediaUrl ? (
              <video
                src={selectedVideoModal.mediaUrl}
                autoPlay
                loop
                playsInline
                controls
                className="w-full h-full object-cover"
              />
            ) : selectedVideoModal.thumbnailUrl ? (
              <img
                src={selectedVideoModal.thumbnailUrl}
                alt={selectedVideoModal.caption}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#181824] flex items-center justify-center">
                <Play className="w-12 h-12 text-neutral-600" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/85 pointer-events-none" />

            {/* Right Action Rail */}
            <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-4">
              {/* Like Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    toggleLikeVideo(selectedVideoModal.id);
                    setSelectedVideoModal(prev =>
                      prev
                        ? {
                            ...prev,
                            isLiked: !prev.isLiked,
                            likesCount: !prev.isLiked ? prev.likesCount + 1 : Math.max(0, prev.likesCount - 1),
                          }
                        : prev
                    );
                  }}
                  className={`p-2.5 rounded-full transition-all cursor-pointer ${
                    selectedVideoModal.isLiked
                      ? 'text-[#ff007a] bg-pink-500/20'
                      : 'text-white hover:text-[#ff007a] bg-black/40 backdrop-blur-md'
                  }`}
                >
                  <Heart className={`w-6 h-6 ${selectedVideoModal.isLiked ? 'fill-[#ff007a]' : ''}`} />
                </button>
                <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
                  {formatCount(selectedVideoModal.likesCount)}
                </span>
              </div>

              {/* Comment Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setCommentsVideoId(selectedVideoModal.id)}
                  className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-cyan-400 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
                  {formatCount(selectedVideoModal.commentsCount)}
                </span>
              </div>

              {/* Share Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setShareModalVideo(selectedVideoModal)}
                  className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-emerald-400 transition-all cursor-pointer"
                >
                  <Share2 className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-semibold text-white mt-1 drop-shadow">
                  {formatCount(selectedVideoModal.sharesCount)}
                </span>
              </div>
            </div>

            {/* Bottom Caption Overlay */}
            <div className="absolute bottom-4 left-4 right-16 z-20 text-left">
              <div className="text-sm font-bold text-white">
                @{selectedVideoModal.creator.username}
              </div>
              <p className="text-xs text-neutral-200 mt-1 line-clamp-2">
                {selectedVideoModal.caption}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Share Video Modal from Profile */}
      <ShareVideoModal
        video={shareModalVideo}
        isOpen={!!shareModalVideo}
        onClose={() => setShareModalVideo(null)}
      />
    </div>
  );
};
