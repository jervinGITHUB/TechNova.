import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import {
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  Users,
  MessageSquare,
  Lock,
  X,
  UserCheck,
  Check,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const InAppNotificationToast: React.FC = () => {
  const {
    activeNotificationPopup,
    dismissNotificationPopup,
    acceptFollowRequest,
    declineFollowRequest,
    setActiveTab,
    openConversationWithUser,
    navigateToUserProfile,
    navigateToVideo,
    setCommentsVideoId,
  } = useApp();

  const [progress, setProgress] = useState(100);

  // Auto-dismiss countdown (only for regular notifications, keep follow requests visible longer)
  useEffect(() => {
    if (!activeNotificationPopup) {
      setProgress(100);
      return;
    }

    const duration = activeNotificationPopup.type === 'follow_request' ? 12000 : 6000;
    const intervalTime = 50;
    const step = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          dismissNotificationPopup();
          return 0;
        }
        return prev - step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [activeNotificationPopup]);

  if (!activeNotificationPopup) return null;

  const notif = activeNotificationPopup;
  const isFollowReq = notif.type === 'follow_request';

  const handleClickToast = (e: React.MouseEvent) => {
    // If clicking action buttons, do nothing here
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    dismissNotificationPopup();

    if (isFollowReq) {
      setActiveTab('notifications');
      return;
    }

    if (notif.type === 'message' && notif.actor?.id) {
      openConversationWithUser(notif.actor.id);
      return;
    }

    if (notif.type === 'follow' && notif.actor?.id) {
      navigateToUserProfile(notif.actor.id);
      return;
    }

    if (notif.videoId) {
      const isComment =
        notif.type === 'comment' ||
        (notif.targetText && (notif.targetText.toLowerCase().includes('comment') || notif.targetText.toLowerCase().includes('replied')));
      navigateToVideo(notif.videoId, Boolean(isComment));
      return;
    }

    if (notif.type === 'like' || notif.type === 'share') {
      setActiveTab('notifications');
      return;
    }

    setActiveTab('notifications');
  };

  const getIcon = () => {
    switch (notif.type) {
      case 'like':
        return <Heart className="w-3.5 h-3.5 text-white fill-white" />;
      case 'comment':
        return <MessageCircle className="w-3.5 h-3.5 text-white fill-white" />;
      case 'share':
        return <Share2 className="w-3.5 h-3.5 text-white" />;
      case 'follow':
        return <UserPlus className="w-3.5 h-3.5 text-white" />;
      case 'follow_request':
        return <Lock className="w-3.5 h-3.5 text-white" />;
      case 'message':
        return <MessageSquare className="w-3.5 h-3.5 text-white fill-white" />;
      case 'video_revoked':
      case 'appeal_status':
        return <ShieldAlert className="w-3.5 h-3.5 text-white" />;
      default:
        return <Heart className="w-3.5 h-3.5 text-white fill-white" />;
    }
  };

  const getIconBg = () => {
    switch (notif.type) {
      case 'like':
        return 'bg-gradient-to-tr from-[#ff007a] to-pink-600';
      case 'comment':
        return 'bg-gradient-to-tr from-cyan-500 to-blue-600';
      case 'share':
        return 'bg-gradient-to-tr from-emerald-500 to-teal-600';
      case 'follow':
        return 'bg-gradient-to-tr from-purple-500 to-indigo-600';
      case 'follow_request':
        return 'bg-gradient-to-tr from-amber-500 to-orange-600';
      case 'message':
        return 'bg-gradient-to-tr from-blue-500 to-indigo-600';
      default:
        return 'bg-gradient-to-tr from-[#ff007a] to-pink-600';
    }
  };

  return (
    <aside
      aria-label="Real-time notification"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[420px] z-[9999] pointer-events-auto animate-bounce-in"
    >
      <div
        onClick={handleClickToast}
        className="relative overflow-hidden rounded-2xl bg-[#14141f]/95 border border-[#ff007a]/40 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl p-3.5 sm:p-4 text-left cursor-pointer transition-all hover:border-[#ff007a]"
      >
        {/* Progress timer bar */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[#ff007a] to-cyan-400 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />

        <div className="flex items-start gap-3">
          {/* Avatar with action badge */}
          <div className="relative shrink-0">
            <Avatar
              src={notif.actor?.avatar}
              alt={notif.actor?.displayName || notif.actor?.username || 'User'}
              size="md"
              className="border-2 border-neutral-700 shadow-md"
            />
            <div
              className={`absolute -bottom-1 -right-1 p-1 rounded-full shadow-md ${getIconBg()}`}
            >
              {getIcon()}
            </div>
          </div>

          {/* Text Information */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white truncate max-w-[150px]">
                {notif.actor?.displayName || notif.actor?.username}
              </span>
              <span className="text-[11px] text-neutral-400">
                @{notif.actor?.username}
              </span>
            </div>

            <p className="text-xs text-neutral-200 mt-0.5 line-clamp-2 leading-relaxed">
              {isFollowReq
                ? 'requested to follow your private account.'
                : notif.type === 'message'
                ? `sent you a message: "${notif.targetText}"`
                : notif.targetText}
            </p>

            {/* Action Buttons for Follow Request */}
            {isFollowReq && notif.requestId && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {/* 1. Accept (allow user to follow private account) */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    acceptFollowRequest(notif.requestId!, false);
                    dismissNotificationPopup();
                  }}
                  className="py-1 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Allow user to follow your private account"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Accept</span>
                </button>

                {/* 2. Follow Back (Friends / Mutuals) */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    acceptFollowRequest(notif.requestId!, true);
                    dismissNotificationPopup();
                  }}
                  className="py-1 px-3 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-[0_0_10px_rgba(255,0,122,0.4)] cursor-pointer"
                  title="Accept request and follow them back to become Friends"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Follow Back (Friends)</span>
                </button>

                {/* 3. Decline (Remove follow request) */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    declineFollowRequest(notif.requestId!);
                    dismissNotificationPopup();
                  }}
                  className="py-1 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition-colors cursor-pointer"
                  title="Decline and remove follow request"
                >
                  <span>Decline</span>
                </button>
              </div>
            )}

            {/* Quick reply button for messages */}
            {notif.type === 'message' && notif.actor?.id && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    openConversationWithUser(notif.actor.id);
                    dismissNotificationPopup();
                  }}
                  className="py-1 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Reply</span>
                </button>
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              dismissNotificationPopup();
            }}
            className="absolute top-3 right-3 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800/80 transition-colors cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
