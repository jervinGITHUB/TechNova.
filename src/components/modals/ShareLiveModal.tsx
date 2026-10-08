import React, { useState, useEffect } from 'react';
import { LiveStream, User } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  X,
  Check,
  Send,
  Search,
  Radio,
  Share2,
  Users,
  Lock,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { checkIsUserBanned, isSameUser } from '../../lib/supabase';

interface ShareLiveModalProps {
  stream: LiveStream | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareLiveModal: React.FC<ShareLiveModalProps> = ({
  stream,
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    users,
    getFollowStatus,
    shareLiveStreamToUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [sentUserIds, setSentUserIds] = useState<string[]>([]);
  const [personalNote, setPersonalNote] = useState('');

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !stream) return null;

  const handleSendToUser = (targetUser: User) => {
    if (sentUserIds.includes(targetUser.id)) return;
    setSentUserIds(prev => [...prev, targetUser.id]);
    shareLiveStreamToUser(stream, targetUser.id, personalNote);
  };

  // Eligible users: not currentUser, not banned, and either public OR mutual friends
  const eligibleUsers = users.filter(u => {
    if (isSameUser(u.id, currentUser?.id)) return false;
    if (u.isBanned || checkIsUserBanned(u.id, u.email, u).isBanned) return false;
    const followStatus = getFollowStatus(u.id);
    const isFriend = followStatus === 'friends';
    return !u.isPrivate || isFriend;
  });

  const query = searchQuery.trim().toLowerCase().replace('@', '');
  const filteredUsers = query
    ? eligibleUsers.filter(
        u =>
          u.displayName.toLowerCase().includes(query) ||
          u.username.toLowerCase().includes(query)
      )
    : eligibleUsers;

  return (
    <div
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none overscroll-contain"
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        onWheel={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#13131a] border border-neutral-800 rounded-3xl p-5 shadow-2xl z-10 text-left overscroll-contain"
      >
        {/* Header with Live Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-[#ff007a]" />
            <h3 className="font-bold text-white font-brand text-base">Share Live Stream</h3>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/30 flex items-center gap-1.5 shadow-sm animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>LIVE</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Stream Preview Snippet */}
        <div className="flex items-center gap-3 my-3 p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="relative shrink-0">
            <Avatar
              src={stream.host?.avatar}
              alt={stream.host?.displayName || 'Host'}
              size="md"
              className="border-2 border-[#ff007a]"
            />
            <span className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-red-600 border border-black flex items-center justify-center">
              <Radio className="w-2.5 h-2.5 text-white" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                {stream.host?.displayName || stream.host?.username || 'Host'}
              </span>
              <span className="text-[11px] text-neutral-400">
                @{stream.host?.username || 'host'}
              </span>
            </div>
            <p className="text-xs text-neutral-200 font-medium line-clamp-1 mt-0.5">
              {stream.title || 'Live Stream'}
            </p>
            <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
              <span className="text-pink-400 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" />
                {Math.max(stream.viewers?.length || 0, stream.viewersCount || 0, 1)} watching
              </span>
              {stream.topic && (
                <>
                  <span>•</span>
                  <span className="text-neutral-400 truncate">#{stream.topic}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Subheader: Send to Friends & Other Users on ViralHub */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">Send in Direct Message</span>
            <span className="text-[11px] text-neutral-400">
              {eligibleUsers.length} users available
            </span>
          </div>

          {/* Optional Message Input (200 characters limit) */}
          <div className="relative">
            <input
              type="text"
              maxLength={200}
              placeholder="Add an optional message..."
              value={personalNote}
              onChange={e => setPersonalNote(e.target.value.slice(0, 200))}
              className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-3.5 pr-14 py-2 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
            />
            {personalNote.length > 0 && (
              <span
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono pointer-events-none transition-colors ${
                  personalNote.length >= 200
                    ? 'text-red-400 font-bold'
                    : personalNote.length >= 180
                    ? 'text-amber-400 font-medium'
                    : 'text-neutral-500'
                }`}
              >
                {personalNote.length}/200
              </span>
            )}
          </div>

          {/* Search bar */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              maxLength={50}
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value.slice(0, 50))}
              className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-8 pr-7 py-2 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-neutral-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Recipient Users List */}
          <div
            onWheel={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            className="max-h-56 overflow-y-auto space-y-1.5 pr-1 mt-2 overscroll-contain"
          >
            {filteredUsers.map(u => {
              const isSent = sentUserIds.includes(u.id);
              const followStatus = getFollowStatus(u.id);

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2 rounded-2xl bg-[#181824]/60 hover:bg-[#181824] transition-colors border border-transparent hover:border-neutral-800"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={u.avatar} alt={u.displayName} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>{u.displayName}</span>
                        {followStatus === 'friends' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/30">
                            Friend
                          </span>
                        )}
                        {u.isPrivate && followStatus !== 'friends' && (
                          <Lock className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">
                        @{u.username}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSent}
                    onClick={() => handleSendToUser(u)}
                    className={`py-1 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      isSent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                        : 'bg-[#ff007a] hover:bg-[#e0006c] text-white active:scale-95 shadow-sm'
                    }`}
                  >
                    {isSent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Sent</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <div className="py-8 text-center text-xs text-neutral-500">
                {searchQuery ? 'No matching users found.' : 'No available users to share with.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
