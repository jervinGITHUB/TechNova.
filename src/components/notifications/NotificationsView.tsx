import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatRealtimeAgo } from '../../utils/time';
import { deduplicateNotifications } from '../../utils/notifications';
import {
  Bell,
  Heart,
  UserPlus,
  MessageCircle,
  Share2,
  Check,
  CheckCheck,
  Clock,
  Users,
  UserCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
  ShieldAlert,
  Ban,
  AtSign,
  Tag,
  Sparkles,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { NotificationItem } from '../../types';

type NotificationFilter = 'all' | 'likes' | 'comments' | 'mentions' | 'followers';

export const NotificationsView: React.FC = () => {
  const {
    currentUser,
    users,
    notifications,
    videos,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    navigateToUserProfile,
    acceptFollowRequest,
    declineFollowRequest,
    submitVideoAppeal,
    setPreBanAppealModalOpen,
    addCustomNotification,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');

  // Realtime relative timestamp ticker (updates "Just now" to "1m ago", "5m ago", etc. automatically)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Appeal Modal State
  const [appealModalVideoId, setAppealModalVideoId] = useState<string | null>(null);
  const [appealReasonText, setAppealReasonText] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [appealSuccessMsg, setAppealSuccessMsg] = useState('');

  const targetAppealVideo = appealModalVideoId ? videos.find(v => v.id === appealModalVideoId) : null;

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
      setAppealSuccessMsg('Your appeal has been submitted successfully! Moderation will review your request.');
      setTimeout(() => {
        handleCloseAppealModal();
      }, 1800);
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="w-3.5 h-3.5 text-[#ff007a] fill-[#ff007a]" />;
      case 'follow':
        return <UserPlus className="w-3.5 h-3.5 text-blue-400" />;
      case 'follow_request':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'comment':
        return <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'share':
        return <Share2 className="w-3.5 h-3.5 text-purple-400" />;
      case 'video_revoked':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
      case 'account_banned':
        return <Ban className="w-3.5 h-3.5 text-red-400" />;
      case 'account_warning':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      case 'pre_ban_appeal_update':
        return <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />;
      case 'appeal_status':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      case 'mention':
        return <AtSign className="w-3.5 h-3.5 text-cyan-400" />;
      case 'tag':
        return <Tag className="w-3.5 h-3.5 text-[#ff007a]" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  // Filter and deduplicate notifications, discarding duplicates and generic trigger notifications
  const validNotifications = React.useMemo(() => {
    return deduplicateNotifications(notifications);
  }, [notifications]);

  const isNotificationMatchingFilter = (item: NotificationItem, filter: NotificationFilter) => {
    switch (filter) {
      case 'likes':
        return (
          item.type === 'like' ||
          item.targetText?.toLowerCase().includes('liked') ||
          item.targetText?.toLowerCase().includes('like')
        );
      case 'comments':
        return (
          item.type === 'comment' ||
          item.targetText?.toLowerCase().includes('comment') ||
          item.targetText?.toLowerCase().includes('replied')
        );
      case 'mentions':
        return (
          item.type === 'mention' ||
          item.type === 'tag' ||
          item.targetText?.toLowerCase().includes('mention') ||
          item.targetText?.toLowerCase().includes('tagged') ||
          item.targetText?.toLowerCase().includes('tag') ||
          item.targetText?.includes('@')
        );
      case 'followers':
        return (
          item.type === 'follow' ||
          item.type === 'follow_request' ||
          item.targetText?.toLowerCase().includes('follow') ||
          item.targetText?.toLowerCase().includes('friend')
        );
      case 'all':
      default:
        return true;
    }
  };

  const filterCounts = React.useMemo(() => {
    return {
      all: validNotifications.length,
      likes: validNotifications.filter(n => isNotificationMatchingFilter(n, 'likes')).length,
      comments: validNotifications.filter(n => isNotificationMatchingFilter(n, 'comments')).length,
      mentions: validNotifications.filter(n => isNotificationMatchingFilter(n, 'mentions')).length,
      followers: validNotifications.filter(n => isNotificationMatchingFilter(n, 'followers')).length,
    };
  }, [validNotifications]);

  const filterUnreadCounts = React.useMemo(() => {
    return {
      all: validNotifications.filter(n => n.isUnread).length,
      likes: validNotifications.filter(n => n.isUnread && isNotificationMatchingFilter(n, 'likes')).length,
      comments: validNotifications.filter(n => n.isUnread && isNotificationMatchingFilter(n, 'comments')).length,
      mentions: validNotifications.filter(n => n.isUnread && isNotificationMatchingFilter(n, 'mentions')).length,
      followers: validNotifications.filter(n => n.isUnread && isNotificationMatchingFilter(n, 'followers')).length,
    };
  }, [validNotifications]);

  const filteredNotifications = React.useMemo(() => {
    return validNotifications.filter(n => isNotificationMatchingFilter(n, activeFilter));
  }, [validNotifications, activeFilter]);

  const unreadCount = validNotifications.filter(n => n.isUnread).length;

  const handleSimulateNotification = (type: 'like' | 'comment' | 'mention' | 'follow') => {
    const candidateActors = users.filter(u => !currentUser || u.id !== currentUser.id);
    const actorUser = candidateActors.length > 0
      ? candidateActors[Math.floor(Math.random() * candidateActors.length)]
      : {
          id: 'user_alex',
          username: 'alex_creator',
          displayName: 'Alex Rivers',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        };

    const targetVideo = videos[0];

    if (type === 'like') {
      addCustomNotification({
        type: 'like',
        actor: {
          id: actorUser.id,
          username: actorUser.username,
          displayName: actorUser.displayName,
          avatar: actorUser.avatar,
        },
        targetText: targetVideo ? `liked your video: "${targetVideo.caption.slice(0, 30)}"` : 'liked your recent video post',
        videoId: targetVideo?.id,
      });
      setActiveFilter('likes');
    } else if (type === 'comment') {
      addCustomNotification({
        type: 'comment',
        actor: {
          id: actorUser.id,
          username: actorUser.username,
          displayName: actorUser.displayName,
          avatar: actorUser.avatar,
        },
        targetText: 'commented: "This video is absolute fire! Keep it going! 🔥"',
        videoId: targetVideo?.id,
      });
      setActiveFilter('comments');
    } else if (type === 'mention') {
      addCustomNotification({
        type: 'mention',
        actor: {
          id: actorUser.id,
          username: actorUser.username,
          displayName: actorUser.displayName,
          avatar: actorUser.avatar,
        },
        targetText: `mentioned you in a comment: "@${currentUser?.username || 'you'} definitely need to see this clip!"`,
        videoId: targetVideo?.id,
      });
      setActiveFilter('mentions');
    } else if (type === 'follow') {
      addCustomNotification({
        type: 'follow',
        actor: {
          id: actorUser.id,
          username: actorUser.username,
          displayName: actorUser.displayName,
          avatar: actorUser.avatar,
        },
        targetText: 'started following you',
      });
      setActiveFilter('followers');
    }
  };

  const tabs: {
    id: NotificationFilter;
    label: string;
    icon: React.ReactNode;
    count: number;
    unread: number;
  }[] = [
    {
      id: 'all',
      label: 'ALL ACTIVITY',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      count: filterCounts.all,
      unread: filterUnreadCounts.all,
    },
    {
      id: 'likes',
      label: 'LIKED',
      icon: <Heart className="w-3.5 h-3.5" />,
      count: filterCounts.likes,
      unread: filterUnreadCounts.likes,
    },
    {
      id: 'comments',
      label: 'COMMENT',
      icon: <MessageCircle className="w-3.5 h-3.5" />,
      count: filterCounts.comments,
      unread: filterUnreadCounts.comments,
    },
    {
      id: 'mentions',
      label: 'MENTION OR TAG',
      icon: <AtSign className="w-3.5 h-3.5" />,
      count: filterCounts.mentions,
      unread: filterUnreadCounts.mentions,
    },
    {
      id: 'followers',
      label: 'FOLLOWERS',
      icon: <Users className="w-3.5 h-3.5" />,
      count: filterCounts.followers,
      unread: filterUnreadCounts.followers,
    },
  ];

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-3xl mx-auto w-full select-none text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold font-brand text-white">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full bg-[#ff007a] text-white text-xs font-bold shadow-[0_0_8px_rgba(255,0,122,0.4)]">
              {unreadCount} unread
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-xs font-semibold">
              All caught up
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsAsRead}
              className="text-xs text-[#ff007a] hover:text-[#ff3399] font-bold flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-[#ff007a]/10 hover:bg-[#ff007a]/20 border border-[#ff007a]/30 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Categories Filter Tabs: ALL ACTIVITY, LIKED, COMMENT, MENTION OR TAG, FOLLOWERS */}
      <div className="mb-6 overflow-x-auto no-scrollbar pb-1">
        <div className="flex items-center gap-2 min-w-max">
          {tabs.map(tab => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                  isActive
                    ? 'bg-gradient-to-r from-[#ff007a] to-[#d00062] text-white shadow-[0_0_15px_rgba(255,0,122,0.35)] scale-[1.02]'
                    : 'bg-[#161622] text-neutral-400 hover:text-white hover:bg-[#202030] border border-neutral-800/80'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-neutral-400'}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : tab.unread > 0
                        ? 'bg-[#ff007a] text-white'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.unread > 0 && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a] shadow-[0_0_5px_rgba(255,0,122,0.8)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications list */}
      <div className="space-y-3">
        {filteredNotifications.map(item => {
          const matchedVideo = item.videoId ? videos.find(v => v.id === item.videoId) : null;
          const currentAppealStatus = matchedVideo?.appealStatus || item.appealStatus || 'none';

          return (
            <div
              key={item.id}
              onClick={() => {
                if (item.isUnread) {
                  markNotificationAsRead(item.id);
                }
              }}
              className={`flex items-start sm:items-center justify-between p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${
                item.type === 'video_revoked' || item.type === 'account_banned'
                  ? 'bg-[#191118] border-red-500/40 hover:bg-[#1f131f]'
                  : item.type === 'appeal_status'
                  ? 'bg-[#141822] border-amber-500/30 hover:bg-[#181d2a]'
                  : item.isUnread
                  ? 'bg-[#151119] border border-[#ff007a]/25 border-l-4 border-l-[#ff007a]/70 hover:bg-[#1a1420]'
                  : 'bg-[#121218] border border-neutral-800/80 hover:bg-[#171722] hover:border-neutral-700/80'
              }`}
            >
              {/* Actor Avatar + Content Info */}
              <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                <div
                  onClick={e => {
                    e.stopPropagation();
                    if (item.isUnread) {
                      markNotificationAsRead(item.id);
                    }
                    if (item.actor.id && item.actor.id !== 'admin' && item.actor.id !== 'system_moderation') {
                      navigateToUserProfile(item.actor.id);
                    }
                  }}
                  className="relative shrink-0 group/avatar cursor-pointer"
                  title={`View profile`}
                >
                  <Avatar
                    src={item.actor.avatar}
                    alt={item.actor.displayName || item.actor.username}
                    size="md"
                    className={`w-11 h-11 border transition-all ${
                      item.type === 'video_revoked'
                        ? 'border-red-500/60'
                        : item.isUnread
                        ? 'border-[#ff007a]/60 shadow-[0_0_6px_rgba(255,0,122,0.25)]'
                        : 'border-neutral-700 group-hover/avatar:border-neutral-500'
                    }`}
                  />
                  <div className="absolute -bottom-1 -right-1 p-1 bg-[#13131a] rounded-full border border-neutral-700 shadow">
                    {getIcon(item.type)}
                  </div>
                </div>

                <div className="min-w-0 text-left flex-1 pr-2">
                  <div className="text-xs sm:text-sm">
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        if (item.isUnread) {
                          markNotificationAsRead(item.id);
                        }
                        if (item.actor.id && item.actor.id !== 'admin' && item.actor.id !== 'system_moderation') {
                          navigateToUserProfile(item.actor.id);
                        }
                      }}
                      className="font-bold text-white hover:text-[#ff007a] transition-colors cursor-pointer"
                    >
                      {item.actor.displayName}{' '}
                    </span>
                    <span className={item.isUnread ? 'text-neutral-100 font-medium' : 'text-neutral-400'}>
                      {item.targetText}
                    </span>

                    {/* Follow Request Interactive Buttons or Status */}
                    {item.type === 'follow_request' && (
                      item.status === 'accepted' || item.targetText?.includes('friends') ? (
                        <div className="flex items-center gap-1.5 mt-2 py-1 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-xs w-fit shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          <span>You are now friends!</span>
                        </div>
                      ) : item.status === 'confirmed' ? (
                        <div className="flex items-center gap-1.5 mt-2 py-1 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-xs w-fit">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Follow request accepted</span>
                        </div>
                      ) : item.status === 'declined' ? (
                        <div className="mt-2 text-xs text-neutral-500 font-medium italic">
                          <span>Request declined</span>
                        </div>
                      ) : item.requestId ? (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              acceptFollowRequest(item.requestId!, false);
                            }}
                            className="py-1 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Allow user to follow your private account"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              acceptFollowRequest(item.requestId!, true);
                            }}
                            className="py-1 px-3 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors cursor-pointer shadow-[0_0_10px_rgba(255,0,122,0.4)]"
                          >
                            Follow Back (Friends)
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              declineFollowRequest(item.requestId!);
                            }}
                            className="py-1 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      ) : null
                    )}

                    {/* Video Revoked & Appeal Status Interactive Area */}
                    {(item.type === 'video_revoked' || item.type === 'appeal_status') && item.videoId && (
                      <div className="mt-2.5 space-y-2">
                        {currentAppealStatus === 'none' && item.type === 'video_revoked' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleOpenAppealModal(item.videoId!);
                              }}
                              className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-[#ff007a] to-pink-600 hover:from-[#ff1a8c] hover:to-pink-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(255,0,122,0.4)] transition-all transform active:scale-95"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Submit Appeal</span>
                            </button>
                          </div>
                        )}

                        {currentAppealStatus === 'pending' && (
                          <div className="flex items-center gap-1.5 py-1 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold text-xs w-fit">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            <span>Appeal Status: Pending Review</span>
                          </div>
                        )}

                        {currentAppealStatus === 'approved' && (
                          <div className="flex items-center gap-1.5 py-1 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-xs w-fit shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Appeal Status: Approved & Reinstated</span>
                          </div>
                        )}

                        {currentAppealStatus === 'declined' && (
                          <div className="flex items-center gap-1.5 py-1 px-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-xs w-fit">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Appeal Status: Declined</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pre-Ban Warning & Appeal Action Button */}
                    {item.type === 'account_warning' && (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setPreBanAppealModalOpen(true);
                          }}
                          className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#ff007a] hover:from-amber-400 hover:to-pink-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Submit Defense & Counter-Proof</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-2">
                    <span>{formatRealtimeAgo(item.createdAt || item.timestamp)}</span>
                    {!item.isUnread && (
                      <span className="text-[10px] text-neutral-500 flex items-center gap-0.5">
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                        <span>Read</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Status Badge & Dot if Unread */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {item.isUnread ? (
                  <div className="flex items-center gap-1.5">
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ff007a]/15 text-[#ff007a] border border-[#ff007a]/30 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a]" />
                      Unread
                    </span>
                    <span
                      className="w-2 h-2 rounded-full bg-[#ff007a] shadow-[0_0_6px_rgba(255,0,122,0.6)]"
                      title="Unread notification"
                    />
                  </div>
                ) : (
                  <span className="text-[10px] text-neutral-500 font-medium px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800">
                    Read
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {filteredNotifications.length === 0 && (
          <div className="py-12 px-6 rounded-2xl bg-[#14141e]/60 border border-neutral-800/80 text-center flex flex-col items-center gap-3 animate-fadeIn">
            <div className="w-12 h-12 rounded-2xl bg-[#1d1d2b] flex items-center justify-center text-[#ff007a] shadow-inner">
              {activeFilter === 'likes' ? (
                <Heart className="w-6 h-6 text-[#ff007a]" />
              ) : activeFilter === 'comments' ? (
                <MessageCircle className="w-6 h-6 text-emerald-400" />
              ) : activeFilter === 'mentions' ? (
                <AtSign className="w-6 h-6 text-cyan-400" />
              ) : activeFilter === 'followers' ? (
                <Users className="w-6 h-6 text-blue-400" />
              ) : (
                <Bell className="w-6 h-6 text-amber-400" />
              )}
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">
                {activeFilter === 'likes'
                  ? 'No Likes Yet'
                  : activeFilter === 'comments'
                  ? 'No Comments Yet'
                  : activeFilter === 'mentions'
                  ? 'No Mentions or Tags Yet'
                  : activeFilter === 'followers'
                  ? 'No Follower Activity Yet'
                  : 'All Caught Up!'}
              </h4>
              <p className="text-xs text-neutral-400 max-w-sm mt-1 leading-relaxed">
                {activeFilter === 'likes'
                  ? 'When users like your videos or comments, they will appear here.'
                  : activeFilter === 'comments'
                  ? 'When someone leaves a comment on your posts or replies to you, it will be listed here.'
                  : activeFilter === 'mentions'
                  ? `When creators tag you or mention @${currentUser?.username || 'you'}, you will get notified here.`
                  : activeFilter === 'followers'
                  ? 'When new creators follow you or send follow requests, they will show up here.'
                  : 'No new notifications right now. Check back soon for fresh community activity!'}
              </p>
            </div>

            {/* Quick interactive test simulation button */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              {activeFilter === 'likes' && (
                <button
                  type="button"
                  onClick={() => handleSimulateNotification('like')}
                  className="px-3.5 py-2 rounded-xl bg-[#ff007a]/15 hover:bg-[#ff007a]/25 text-[#ff007a] border border-[#ff007a]/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Heart className="w-3.5 h-3.5" />
                  <span>Simulate Like Notification</span>
                </button>
              )}
              {activeFilter === 'comments' && (
                <button
                  type="button"
                  onClick={() => handleSimulateNotification('comment')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Simulate Comment Notification</span>
                </button>
              )}
              {activeFilter === 'mentions' && (
                <button
                  type="button"
                  onClick={() => handleSimulateNotification('mention')}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <AtSign className="w-3.5 h-3.5" />
                  <span>Simulate Mention / Tag Notification</span>
                </button>
              )}
              {activeFilter === 'followers' && (
                <button
                  type="button"
                  onClick={() => handleSimulateNotification('follow')}
                  className="px-3.5 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Simulate Follower Notification</span>
                </button>
              )}
              {activeFilter === 'all' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSimulateNotification('like')}
                    className="px-2.5 py-1.5 rounded-lg bg-[#ff007a]/15 text-[#ff007a] text-xs font-bold hover:bg-[#ff007a]/25 transition-colors cursor-pointer"
                  >
                    + Test Like
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateNotification('comment')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-colors cursor-pointer"
                  >
                    + Test Comment
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateNotification('mention')}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 text-xs font-bold hover:bg-cyan-500/25 transition-colors cursor-pointer"
                  >
                    + Test Mention
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateNotification('follow')}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-bold hover:bg-blue-500/25 transition-colors cursor-pointer"
                  >
                    + Test Follower
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Test Bar at the bottom */}
      <div className="mt-8 pt-4 border-t border-neutral-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
        <div className="flex items-center gap-1.5 text-neutral-400 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[#ff007a]" />
          <span>Quick test category activities:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSimulateNotification('like')}
            className="px-2.5 py-1 rounded-lg bg-[#181824] hover:bg-[#222232] text-neutral-300 hover:text-white border border-neutral-800 transition-colors cursor-pointer text-[11px] font-semibold"
            title="Create a test Like notification"
          >
            + Test Like
          </button>
          <button
            type="button"
            onClick={() => handleSimulateNotification('comment')}
            className="px-2.5 py-1 rounded-lg bg-[#181824] hover:bg-[#222232] text-neutral-300 hover:text-white border border-neutral-800 transition-colors cursor-pointer text-[11px] font-semibold"
            title="Create a test Comment notification"
          >
            + Test Comment
          </button>
          <button
            type="button"
            onClick={() => handleSimulateNotification('mention')}
            className="px-2.5 py-1 rounded-lg bg-[#181824] hover:bg-[#222232] text-neutral-300 hover:text-white border border-neutral-800 transition-colors cursor-pointer text-[11px] font-semibold"
            title="Create a test Mention / Tag notification"
          >
            + Test Mention/Tag
          </button>
          <button
            type="button"
            onClick={() => handleSimulateNotification('follow')}
            className="px-2.5 py-1 rounded-lg bg-[#181824] hover:bg-[#222232] text-neutral-300 hover:text-white border border-neutral-800 transition-colors cursor-pointer text-[11px] font-semibold"
            title="Create a test Follower notification"
          >
            + Test Follower
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* CREATOR APPEAL MODAL                                                 */}
      {/* ===================================================================== */}
      {appealModalVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={handleCloseAppealModal} />
          <div className="relative w-full max-w-lg bg-[#14141e] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-left space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#ff007a]" />
                <span>Submit Video Appeal</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseAppealModal}
                className="text-neutral-400 hover:text-white p-1 text-xs"
              >
                ✕
              </button>
            </div>

            {targetAppealVideo ? (
              <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate max-w-[280px]">
                    "{targetAppealVideo.caption || 'Video'}"
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                    Revoked
                  </span>
                </div>
                {targetAppealVideo.rejectionReason && (
                  <p className="text-[11px] text-neutral-400">
                    <strong className="text-neutral-300">Revocation reason:</strong> {targetAppealVideo.rejectionReason}
                  </p>
                )}
              </div>
            ) : null}

            <p className="text-xs text-neutral-300 leading-relaxed">
              If you believe this video was revoked by mistake or meets community guidelines, please describe why it should be reinstated. Administrators will review your appeal.
            </p>

            <form onSubmit={handleSubmitAppeal} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Why should this video be approved?
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
    </div>
  );
};

