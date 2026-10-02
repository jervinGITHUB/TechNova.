import React from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, Heart, UserPlus, MessageCircle, Share2, Check, CheckCheck, Clock, Users, UserCheck } from 'lucide-react';
import { Avatar } from '../common/Avatar';

export const NotificationsView: React.FC = () => {
  const {
    notifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    navigateToUserProfile,
    acceptFollowRequest,
    declineFollowRequest,
  } = useApp();

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
      default:
        return <Bell className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const unreadCount = notifications.filter(n => n.isUnread).length;

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-3xl mx-auto w-full select-none text-left">
      {/* Top Header matching Screenshot 3 top right */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold font-brand text-white">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full bg-[#ff007a] text-white text-xs font-bold shadow-[0_0_8px_rgba(255,0,122,0.6)]">
              {unreadCount} unread
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-xs font-semibold">
              All caught up
            </span>
          )}
        </div>

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

      {/* Notifications list */}
      <div className="space-y-3">
        {notifications.map(item => {
          return (
            <div
              key={item.id}
              onClick={() => {
                // If unread, clicking the notification removes the highlight and marks it as read!
                if (item.isUnread) {
                  markNotificationAsRead(item.id);
                }
              }}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${
                item.isUnread
                  ? 'bg-gradient-to-r from-[#ff007a]/15 via-[#211726] to-[#151520] border-l-4 border-l-[#ff007a] border-[#ff007a]/50 shadow-[0_0_15px_rgba(255,0,122,0.15)] ring-1 ring-[#ff007a]/30'
                  : 'bg-[#121218] border-neutral-800/80 border-l border-neutral-800/80 hover:bg-[#171722] hover:border-neutral-700/80'
              }`}
            >
              {/* Actor Avatar + Content Info */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  onClick={e => {
                    e.stopPropagation();
                    if (item.isUnread) {
                      markNotificationAsRead(item.id);
                    }
                    navigateToUserProfile(item.actor.id);
                  }}
                  className="relative shrink-0 group/avatar cursor-pointer"
                  title={`View ${item.actor.displayName}'s profile`}
                >
                  <Avatar
                    src={item.actor.avatar}
                    alt={item.actor.displayName || item.actor.username}
                    size="md"
                    className={`w-11 h-11 border transition-all ${
                      item.isUnread
                        ? 'border-[#ff007a] shadow-[0_0_8px_rgba(255,0,122,0.4)]'
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
                        navigateToUserProfile(item.actor.id);
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
                            className="py-1 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors cursor-pointer"
                          >
                            Confirm
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
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2">
                    <span>{item.timestamp}</span>
                    {!item.isUnread && (
                      <span className="text-[10px] text-neutral-500 flex items-center gap-0.5">
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                        <span>Read</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Status Badge & Glowing Dot if Unread */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {item.isUnread ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ff007a]/25 text-[#ff007a] border border-[#ff007a]/40 text-[10px] font-extrabold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a] animate-ping" />
                      Unread
                    </span>
                    {/* Glowing highlight dot (Screenshot 3 match) */}
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-[#ff007a] shadow-[0_0_10px_rgba(255,0,122,0.9)] animate-pulse"
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

        {notifications.length === 0 && (
          <div className="text-center py-16 text-neutral-500 text-xs">
            No notifications at this time.
          </div>
        )}
      </div>
    </div>
  );
};
