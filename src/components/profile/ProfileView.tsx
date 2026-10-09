import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Video } from '../../types';
import { ShareVideoModal } from '../modals/ShareVideoModal';
import { AudienceSettingsModal } from '../modals/AudienceSettingsModal';
import { VideoCaptionWithTags } from '../feed/VideoCaptionWithTags';
import { ExploreThumbnailCard } from '../feed/ExploreGrid';
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
  Trash2,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Send,
  Loader2,
  Pin,
} from 'lucide-react';
import { isSameUser, isVideoUrl, toUuid, checkIsUserBanned } from '../../lib/supabase';

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
    deleteVideo,
    submitVideoAppeal,
    togglePinVideo,
    isUserBlockedByMe,
    isUserBlockedMe,
    blockUser,
    unblockUser,
  } = useApp();

  const [activeTabSub, setActiveTabSub] = useState<'videos' | 'liked' | 'only_me'>('videos');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [deleteConfirmVideoId, setDeleteConfirmVideoId] = useState<string | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);

  // Video Preview & Share states
  const [selectedVideoModal, setSelectedVideoModal] = useState<Video | null>(null);
  const [shareModalVideo, setShareModalVideo] = useState<Video | null>(null);
  const [audienceModalVideo, setAudienceModalVideo] = useState<Video | null>(null);
  const [videoOptionsMenuOpen, setVideoOptionsMenuOpen] = useState(false);
  const [activeGridMenuVideoId, setActiveGridMenuVideoId] = useState<string | null>(null);

  // Creator Appeal Modal state
  const [appealModalVideoId, setAppealModalVideoId] = useState<string | null>(null);
  const [appealReasonText, setAppealReasonText] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [appealSuccessMsg, setAppealSuccessMsg] = useState('');

  const targetAppealVideo = appealModalVideoId ? videos.find(v => v.id === appealModalVideoId || toUuid(v.id) === toUuid(appealModalVideoId)) : null;

  const handleOpenAppealModal = (videoId: string) => {
    setAppealModalVideoId(videoId);
    setAppealReasonText('');
    setAppealSuccessMsg('');
  };

  const handleCloseAppealModal = () => {
    setAppealModalVideoId(null);
    setAppealReasonText('');
    setAppealSuccessMsg('');
    setIsSubmittingAppeal(false);
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealModalVideoId || !appealReasonText.trim()) return;

    setIsSubmittingAppeal(true);
    try {
      await submitVideoAppeal(appealModalVideoId, appealReasonText.trim());
      setAppealSuccessMsg('Your appeal has been submitted! Moderation will review your request.');
      // Update selected modal video if open
      setSelectedVideoModal(prev =>
        prev && (prev.id === appealModalVideoId || toUuid(prev.id) === toUuid(appealModalVideoId))
          ? { ...prev, appealStatus: 'pending', appealReason: appealReasonText.trim() }
          : prev
      );
      setTimeout(() => {
        handleCloseAppealModal();
      }, 1800);
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  // Follow Modal states
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<'followers' | 'following'>('followers');
  const [followPrivacyNoticeOpen, setFollowPrivacyNoticeOpen] = useState(false);
  const [followSearchQuery, setFollowSearchQuery] = useState('');

  // Identify target profile: either selected user or current user
  const isSelf = !selectedUserId || (currentUser && isSameUser(selectedUserId, currentUser.id));
  const targetUser = isSelf
    ? (users.find(u => isSameUser(u.id, currentUser?.id)) || currentUser || DEFAULT_USER)
    : (users.find(u => isSameUser(u.id, selectedUserId)) || currentUser || DEFAULT_USER);

  if (!targetUser) {
    return <div className="p-8 text-neutral-400">User not found</div>;
  }

  // If this other user's account is banned, show suspended account placeholder
  const isTargetBanned = !isSelf && (
    targetUser.isBanned ||
    checkIsUserBanned(targetUser.id, targetUser.email, targetUser).isBanned
  );

  if (isTargetBanned) {
    return (
      <div className="flex-1 p-6 sm:p-12 max-w-2xl mx-auto w-full text-center flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fadeIn">
        <div className="w-20 h-20 rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <Ban className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold uppercase tracking-wider">
            Account Suspended
          </span>
          <h2 className="text-2xl font-bold font-brand text-white mt-2">
            @{targetUser.username || 'user'} is unavailable
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
            This account has been suspended for violating the Community Guidelines. Their content, profile, and activities are hidden from the platform.
          </p>
        </div>
        <button
          onClick={() => {
            setActiveTab('home');
          }}
          className="px-6 py-2.5 rounded-2xl bg-[#1e1e2b] hover:bg-[#28283a] border border-neutral-700 text-white text-xs font-bold transition-all cursor-pointer shadow-lg"
        >
          Return to Feed
        </button>
      </div>
    );
  }

  // Follow & Relationship states
  const followStatus = getFollowStatus(targetUser.id);
  const targetFollowsMe = isTargetFollowingMe(targetUser.id);
  const isFollowingTarget = followStatus === 'following' || followStatus === 'friends';
  const areMutualFriends = targetFollowsMe && (followStatus === 'following' || followStatus === 'friends');

  // Videos associated with this user (matched reliably by UUID or string)
  // Pinned videos (up to 3) are strictly ALWAYS FIRST on the "Videos" tab!
  const userVideos = useMemo(() => {
    const list = videos.filter(v => {
      if (!isSameUser(v.creatorId || v.creator?.id, targetUser.id)) return false;
      if (!isSelf && (v.status === 'pending' || v.status === 'rejected')) return false;

      // "Only me" videos are strictly hidden from the public "Videos" tab and other users
      if (v.audience === 'only_me' || v.privacy === 'private') {
        return false;
      }

      // "Friends Only" videos are only visible to the creator or mutual friends
      if (v.audience === 'friends' || v.privacy === 'friends') {
        if (isSelf) return true;
        return areMutualFriends;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        // If both pinned, most recently pinned comes first
        const timeAPinned = new Date(a.pinnedAt || a.createdAt || 0).getTime() || 0;
        const timeBPinned = new Date(b.pinnedAt || b.createdAt || 0).getTime() || 0;
        return timeBPinned - timeAPinned;
      }
      // Both unpinned: newest uploads first
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });
  }, [videos, targetUser.id, isSelf, areMutualFriends]);

  // "Only me" videos (strictly isolated to personal profile of currentUser, hidden from other users)
  const onlyMeVideos = isSelf
    ? videos.filter(v => {
        if (!isSameUser(v.creatorId || v.creator?.id, currentUser?.id)) return false;
        return v.audience === 'only_me' || v.privacy === 'private';
      })
    : [];

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
    r => isSameUser(r.fromUserId, targetUser.id) && isSameUser(r.toUserId, currentUser?.id)
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

  const isBlockedByTarget = Boolean(!isSelf && currentUser && isUserBlockedMe(targetUser.id));
  const isBlockedByMe = Boolean(!isSelf && currentUser && isUserBlockedByMe(targetUser.id));

  const handleBlockUser = async () => {
    setMenuOpen(false);
    if (isBlockedByMe) {
      await unblockUser(targetUser.id);
      setToastMessage(`${targetUser.displayName} has been unblocked.`);
    } else {
      await blockUser(targetUser.id);
      setToastMessage(`${targetUser.displayName} has been blocked.`);
    }
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

  // If targetUser blocked current user, current user CANNOT view or visit their profile!
  if (isBlockedByTarget) {
    return (
      <div className="profile-view-container flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full text-center relative flex flex-col items-center justify-center min-h-[60vh] select-none animate-fadeIn">
        <div className="py-16 text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto shadow-xl shadow-red-500/10">
            <Ban className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-brand">Profile Unavailable</h2>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            You cannot view @{targetUser.username}'s profile or videos because this user has blocked you.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setActiveTab('home')}
              className="px-6 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Back to Home Feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-view-container flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full text-left relative">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e1e2c] border border-neutral-700 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          {toastMessage.toLowerCase().includes('pin') ? (
            <Pin className="w-4 h-4 text-[#ff007a] fill-[#ff007a]" />
          ) : toastMessage.toLowerCase().includes('success') ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Ban className="w-4 h-4 text-red-400" />
          )}
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
                          <span>{isBlockedByMe ? 'Unblock' : 'Block'}</span>
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
      {isBlockedByMe && (
        <div className="my-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 shrink-0" />
            <span>You have blocked this account. You won't receive messages or see new updates from them.</span>
          </div>
          <button
            onClick={handleBlockUser}
            className="text-white underline hover:no-underline font-semibold cursor-pointer"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Tabs: Videos vs Liked vs Only me */}
      <div className="flex items-center gap-6 sm:gap-8 border-b border-neutral-800 mt-6 mb-6">
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

        {/* "Only me" tab ONLY shown on user's own profile (strictly hidden when stalking other users) */}
        {isSelf && (
          <button
            onClick={() => setActiveTabSub('only_me')}
            className={`pb-3 text-sm font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              activeTabSub === 'only_me'
                ? 'text-white border-b-2 border-[#ff007a]'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Only me</span>
            {onlyMeVideos.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-800 text-neutral-300 font-bold">
                {onlyMeVideos.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Content Display: Private notice OR Blocked notice OR Video Grid */}
      {isBlockedByMe ? (
        <div className="py-20 text-center space-y-2 text-neutral-400 text-xs">
          <Ban className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
          <p>Content hidden because you blocked this user.</p>
          <button
            onClick={handleBlockUser}
            className="mt-2 text-xs text-[#ff007a] hover:underline font-semibold cursor-pointer"
          >
            Unblock to view content
          </button>
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
        /* Video Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {(activeTabSub === 'videos' ? userVideos : activeTabSub === 'only_me' ? onlyMeVideos : likedVideos).length === 0 ? (
            <div className="col-span-full py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-[#181824] border border-neutral-800 text-neutral-500 flex items-center justify-center mx-auto">
                {activeTabSub === 'only_me' ? (
                  <Lock className="w-6 h-6 text-amber-400" />
                ) : (
                  <Play className="w-6 h-6 text-[#ff007a]" />
                )}
              </div>
              <p className="text-sm font-bold text-white">
                {activeTabSub === 'videos'
                  ? 'No videos uploaded yet.'
                  : activeTabSub === 'only_me'
                  ? 'No "Only me" videos yet'
                  : 'No liked videos yet.'}
              </p>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                {activeTabSub === 'only_me'
                  ? 'Videos you upload with the "Only me" audience setting will appear here. They are strictly private and cannot be viewed by other users.'
                  : ''}
              </p>
              {isSelf && (activeTabSub === 'videos' || activeTabSub === 'only_me') && (
                <button
                  onClick={() => setActiveTab('upload')}
                  className="py-2 px-5 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-all cursor-pointer shadow-md inline-block"
                >
                  {activeTabSub === 'only_me' ? 'Upload a Private Video' : 'Upload Your First Video'}
                </button>
              )}
            </div>
          ) : (
            (activeTabSub === 'videos' ? userVideos : activeTabSub === 'only_me' ? onlyMeVideos : likedVideos).map((video, idx) => (
                <div
                  key={`${video.id}_${idx}`}
                  onClick={() => handleOpenVideo(video)}
                  className="group relative aspect-[9/13] bg-[#181824] rounded-2xl overflow-hidden cursor-pointer border border-neutral-800 hover:border-[#ff007a]/60 transition-all shadow-md flex items-center justify-center"
                >
                  <ExploreThumbnailCard video={video} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                  {/* Pinned Badge (Prominently displayed first at top-left) */}
                  {video.isPinned && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ff007a] text-white text-[10px] font-extrabold shadow-md backdrop-blur-sm border border-white/20">
                      <Pin className="w-2.5 h-2.5 fill-white rotate-45" />
                      <span>Pinned</span>
                    </div>
                  )}

                  {/* Audience Badges */}
                  {(video.audience === 'only_me' || video.privacy === 'private') && (
                    <div className={`absolute top-2 ${video.isPinned ? 'left-20' : 'left-2'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 border border-amber-500/50 text-amber-300 text-[10px] font-bold shadow backdrop-blur-sm`}>
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                      <span>Only me</span>
                    </div>
                  )}
                  {video.audience === 'friends' && isSelf && (
                    <div className={`absolute top-2 ${video.isPinned ? 'left-20' : 'left-2'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold shadow backdrop-blur-sm`}>
                      <Users className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Friends</span>
                    </div>
                  )}

                  {/* Status Badges for Creator's POV */}
                  {video.status === 'pending' && (!video.audience || video.audience === 'public') && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[10px] font-extrabold shadow backdrop-blur-sm animate-pulse">
                      <Clock className="w-2.5 h-2.5" />
                      <span>In Review</span>
                    </div>
                  )}
                  {video.status === 'rejected' && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                      {video.appealStatus === 'pending' ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-extrabold shadow backdrop-blur-sm animate-pulse">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Appeal Pending</span>
                        </div>
                      ) : video.appealStatus === 'declined' ? (
                        <div className="px-2 py-0.5 rounded-md bg-red-700/90 text-white text-[10px] font-extrabold shadow backdrop-blur-sm">
                          Appeal Declined
                        </div>
                      ) : (
                        <div className="px-2 py-0.5 rounded-md bg-red-600/90 text-white text-[10px] font-extrabold shadow backdrop-blur-sm flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Revoked · Can Appeal</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* View count at bottom-left */}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[11px] font-bold text-white drop-shadow">
                    <Play className="w-3 h-3 fill-white" />
                    <span>{video.viewsCount || '0'}</span>
                  </div>

                  {/* Options 3-dots menu on hover for creator's own video */}
                  {isSelf && (activeTabSub === 'videos' || activeTabSub === 'only_me') && (
                    <div className="absolute top-2 right-2 z-20" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setActiveGridMenuVideoId(prev => (prev === video.id ? null : video.id));
                        }}
                        className={`p-1.5 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer border ${
                          activeGridMenuVideoId === video.id
                            ? 'bg-[#ff007a] text-white border-[#ff007a] opacity-100'
                            : 'bg-black/70 hover:bg-black/90 text-neutral-300 hover:text-white border-white/10 opacity-80 sm:opacity-0 group-hover:opacity-100'
                        }`}
                        title="Video Options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeGridMenuVideoId === video.id && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="absolute right-0 top-8 z-30 w-56 bg-[#14141e]/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 text-left animate-fadeIn"
                        >
                          <button
                            type="button"
                            onClick={async () => {
                              setActiveGridMenuVideoId(null);
                              const res = await togglePinVideo(video.id);
                              setToastMessage(res.message || (res.isPinned ? 'Video pinned to profile' : 'Video unpinned from profile'));
                              setTimeout(() => setToastMessage(''), 3500);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Pin className={`w-3.5 h-3.5 ${video.isPinned ? 'text-[#ff007a] fill-[#ff007a]' : 'text-neutral-400'} shrink-0`} />
                            <span>{video.isPinned ? 'Unpin from profile' : 'Pin to profile (up to 3)'}</span>
                          </button>
                          <div className="h-px bg-neutral-800 my-0.5" />
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGridMenuVideoId(null);
                              setAudienceModalVideo(video);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                            <span>Change Audience Settings</span>
                          </button>
                          <div className="h-px bg-neutral-800 my-0.5" />
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGridMenuVideoId(null);
                              setDeleteConfirmVideoId(video.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
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
            {/* Top Bar: Close Button + Views Count + Delete (if own video) */}
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-bold border border-white/10">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>{selectedVideoModal.viewsCount || '1'} views</span>
                </div>
                {currentUser &&
                  (selectedVideoModal.creatorId === currentUser.id ||
                    selectedVideoModal.creator?.id === currentUser.id) && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setDeleteConfirmVideoId(selectedVideoModal.id);
                      }}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/25 hover:bg-red-500/40 text-red-300 border border-red-500/40 text-xs font-bold transition-all cursor-pointer backdrop-blur-md shadow-sm"
                      title="Delete your video"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete</span>
                    </button>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideoModal(null)}
                className="p-1.5 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Moderation Status Banner if Video was Revoked */}
            {selectedVideoModal.status === 'rejected' && (
              <div className="absolute top-16 left-3 right-3 z-30 p-3 rounded-2xl bg-red-950/90 border border-red-500/50 backdrop-blur-md shadow-2xl text-left space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-red-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Video Revoked by Moderation</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/30 text-red-200 font-bold">
                    Not Public
                  </span>
                </div>

                <p className="text-[11px] text-neutral-200 leading-relaxed">
                  <strong>Reason:</strong> {selectedVideoModal.rejectionReason || 'Community guidelines violation'}
                </p>

                {/* Appeal Status & Actions for Owner */}
                {isSelf && (
                  <div className="pt-1 border-t border-red-500/30 flex items-center justify-between gap-2">
                    {selectedVideoModal.appealStatus === 'pending' ? (
                      <div className="flex items-center gap-1.5 text-amber-300 text-xs font-semibold">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        <span>Appeal Under Admin Review</span>
                      </div>
                    ) : selectedVideoModal.appealStatus === 'declined' ? (
                      <span className="text-red-300 text-xs font-semibold">
                        Appeal Declined by Moderation
                      </span>
                    ) : selectedVideoModal.appealStatus === 'approved' ? (
                      <span className="text-emerald-300 text-xs font-semibold">
                        Appeal Approved · Restored
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenAppealModal(selectedVideoModal.id)}
                        className="py-1 px-3 rounded-xl bg-gradient-to-r from-[#ff007a] to-pink-600 hover:from-[#ff1a8c] hover:to-pink-500 text-white font-bold text-xs flex items-center gap-1.5 shadow cursor-pointer transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Appeal Decision</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

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
            ) : selectedVideoModal.thumbnailUrl &&
                selectedVideoModal.thumbnailUrl !== selectedVideoModal.creator?.avatar &&
                !selectedVideoModal.thumbnailUrl.includes('avatar_') ? (
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

              {/* Comment Button (Count only fetched on-demand inside comment section) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setCommentsVideoId(selectedVideoModal.id)}
                  className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:text-cyan-400 transition-all cursor-pointer"
                  title="Comments"
                >
                  <MessageCircle className="w-6 h-6" />
                </button>
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

              {/* If viewing own video, replace Trash icon with 3-dots: "Change Audience Settings" and "Delete" */}
              {currentUser &&
                (selectedVideoModal.creatorId === currentUser.id ||
                  selectedVideoModal.creator?.id === currentUser.id) && (
                  <div className="relative flex flex-col items-center">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setVideoOptionsMenuOpen(prev => !prev);
                      }}
                      className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer hover:scale-105 ${
                        videoOptionsMenuOpen
                          ? 'bg-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.6)]'
                          : 'bg-black/40 text-white hover:text-[#ff007a] hover:bg-black/60'
                      }`}
                      title="More Options"
                    >
                      <MoreVertical className="w-6 h-6" />
                    </button>
                    <span className="text-[10px] font-semibold text-neutral-300 mt-1 drop-shadow">
                      More
                    </span>

                    {/* Popover Menu with "Pin to Profile", "Change Audience Settings" and "Delete" */}
                    {videoOptionsMenuOpen && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-14 bottom-0 z-50 w-56 bg-[#14141e]/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 text-left animate-fadeIn"
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            setVideoOptionsMenuOpen(false);
                            const res = await togglePinVideo(selectedVideoModal.id);
                            setSelectedVideoModal(prev => prev ? { ...prev, isPinned: res.isPinned } : null);
                            setToastMessage(res.message || (res.isPinned ? 'Video pinned to profile' : 'Video unpinned from profile'));
                            setTimeout(() => setToastMessage(''), 3500);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Pin className={`w-4 h-4 ${selectedVideoModal.isPinned ? 'text-[#ff007a] fill-[#ff007a]' : 'text-neutral-400'} shrink-0`} />
                          <span>{selectedVideoModal.isPinned ? 'Unpin from profile' : 'Pin to profile (up to 3)'}</span>
                        </button>

                        <div className="h-px bg-neutral-800 my-0.5" />

                        <button
                          type="button"
                          onClick={() => {
                            setVideoOptionsMenuOpen(false);
                            setAudienceModalVideo(selectedVideoModal);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Lock className="w-4 h-4 text-pink-400 shrink-0" />
                          <span>Change Audience Settings</span>
                        </button>

                        <div className="h-px bg-neutral-800 my-0.5" />

                        <button
                          type="button"
                          onClick={() => {
                            setVideoOptionsMenuOpen(false);
                            setDeleteConfirmVideoId(selectedVideoModal.id);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* Bottom Caption Overlay */}
            <div className="absolute bottom-4 left-4 right-16 z-20 text-left">
              <div className="text-sm font-bold text-white">
                @{selectedVideoModal.creator.username}
              </div>
              <VideoCaptionWithTags
                caption={selectedVideoModal.caption}
                hashtags={selectedVideoModal.hashtags}
                maxChars={60}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Delete Video */}
      {deleteConfirmVideoId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
          <div
            className="absolute inset-0"
            onClick={() => !isDeletingVideo && setDeleteConfirmVideoId(null)}
          />
          <div className="relative w-full max-w-sm bg-[#13131c] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-brand">Delete Video?</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Are you sure you want to permanently delete this video? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingVideo}
                onClick={() => setDeleteConfirmVideoId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingVideo}
                onClick={async () => {
                  setIsDeletingVideo(true);
                  await deleteVideo(deleteConfirmVideoId);
                  setIsDeletingVideo(false);
                  setDeleteConfirmVideoId(null);
                  setSelectedVideoModal(null);
                  setToastMessage('Video deleted successfully.');
                  setTimeout(() => setToastMessage(''), 3000);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer disabled:opacity-50"
              >
                {isDeletingVideo ? 'Deleting...' : 'Yes, Delete'}
              </button>
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

      {/* Creator Appeal Modal */}
      {appealModalVideoId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
          <div className="absolute inset-0" onClick={handleCloseAppealModal} />
          <div className="relative w-full max-w-md bg-[#14141e] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-left space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#ff007a]/20 text-[#ff007a]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-brand">Appeal Moderation Decision</h3>
                  <p className="text-xs text-neutral-400">Request review to restore your video to the feed</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseAppealModal}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {targetAppealVideo && (
              <div className="p-3 rounded-2xl bg-[#181824] border border-neutral-800 text-xs space-y-1">
                <div className="text-neutral-400 font-semibold">Video Details:</div>
                <div className="text-white line-clamp-1 italic">"{targetAppealVideo.caption || 'Video upload'}"</div>
                {targetAppealVideo.rejectionReason && (
                  <div className="text-red-400 text-[11px] pt-1 border-t border-neutral-800/60">
                    <strong>Revocation reason:</strong> {targetAppealVideo.rejectionReason}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitAppeal} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1.5 uppercase tracking-wider">
                  Why should this video be approved & restored?
                </label>
                <textarea
                  value={appealReasonText}
                  onChange={e => setAppealReasonText(e.target.value)}
                  placeholder="Explain why your video complies with community guidelines (e.g. original content, family-friendly, educational context)..."
                  rows={4}
                  maxLength={500}
                  required
                  className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 p-3.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none"
                />
                <div className="flex justify-end text-[10px] text-neutral-500 mt-1">
                  {appealReasonText.length}/500
                </div>
              </div>

              {appealSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{appealSuccessMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={handleCloseAppealModal}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAppeal || !appealReasonText.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAppeal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{isSubmittingAppeal ? 'Submitting...' : 'Send Appeal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Audience Settings Modal */}
      <AudienceSettingsModal
        video={audienceModalVideo}
        isOpen={Boolean(audienceModalVideo)}
        onClose={() => setAudienceModalVideo(null)}
        onAudienceChanged={newAudience => {
          if (selectedVideoModal && audienceModalVideo && selectedVideoModal.id === audienceModalVideo.id) {
            setSelectedVideoModal(prev =>
              prev
                ? {
                    ...prev,
                    audience: newAudience,
                    privacy: newAudience === 'only_me' ? 'private' : newAudience === 'friends' ? 'friends' : 'public',
                  }
                : null
            );
          }
          const label =
            newAudience === 'only_me'
              ? 'Only me'
              : newAudience === 'friends'
              ? 'Friends Only'
              : 'Everyone (Public)';
          setToastMessage(`Audience settings updated to "${label}"`);
          setTimeout(() => setToastMessage(''), 3000);
        }}
      />
    </div>
  );
};
