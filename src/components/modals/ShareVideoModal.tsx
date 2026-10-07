import React, { useState, useEffect } from 'react';
import { Video, User } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  X,
  Copy,
  Check,
  Send,
  Search,
  Lock,
  Users,
  Share2,
  Film
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { checkIsUserBanned } from '../../lib/supabase';

interface ShareVideoModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareVideoModal: React.FC<ShareVideoModalProps> = ({
  video,
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    users,
    videos,
    getFollowStatus,
    shareVideoToUser,
    shareVideo,
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentUserIds, setSentUserIds] = useState<string[]>([]);
  const [personalNote, setPersonalNote] = useState('');

  // Lock body scroll while modal is open to prevent background scrolling
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !video) return null;

  // Reactively track the latest shares count from app context
  const liveVideo = videos.find(v => v.id === video.id) || video;

  const videoUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/video/${liveVideo.id}`
    : `https://viralhub.app/video/${liveVideo.id}`;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(videoUrl);
    shareVideo(liveVideo.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleSendToUser = (targetUser: User) => {
    if (sentUserIds.includes(targetUser.id)) return;
    setSentUserIds(prev => [...prev, targetUser.id]);
    shareVideoToUser(liveVideo, targetUser.id, personalNote);
  };

  // Eligible users: not currentUser, not banned, and either public OR mutual friends
  const eligibleUsers = users.filter(u => {
    if (u.id === currentUser?.id) return false;
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
        {/* Header with Share Count badge */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-[#ff007a]" />
            <h3 className="font-bold text-white font-brand text-base">Share Video</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#ff007a]/15 text-[#ff007a] font-bold border border-[#ff007a]/30 flex items-center gap-1 shadow-sm">
              <Share2 className="w-3 h-3" />
              <span>{liveVideo.sharesCount ?? 0} shares</span>
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

        {/* Video Preview Snippet with live Share Count */}
        <div className="flex items-center gap-3 my-3 p-2.5 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-[#232336] shrink-0 flex items-center justify-center">
            {liveVideo.thumbnailUrl || liveVideo.mediaUrl ? (
              <img
                src={liveVideo.thumbnailUrl || liveVideo.mediaUrl}
                alt={liveVideo.caption}
                className="w-full h-full object-cover"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <Film className="w-4 h-4 text-white/80" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">
              @{liveVideo.creator.username}
            </div>
            <p className="text-xs text-neutral-300 line-clamp-2 mt-0.5 leading-snug">
              {liveVideo.caption}
            </p>
            <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
              <span className="text-[#ff007a] font-semibold flex items-center gap-1">
                <Share2 className="w-3 h-3 inline" />
                {liveVideo.sharesCount ?? 0} shares
              </span>
              <span>•</span>
              <span>{liveVideo.likesCount ?? 0} likes</span>
            </div>
          </div>
        </div>

        {/* Action 1: Copy Link Button */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleCopyLink}
            className={`w-full py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
              copied
                ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-[#ff007a] hover:bg-[#e0006c] text-white shadow-[0_0_12px_rgba(255,0,122,0.3)]'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Link Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Link ({liveVideo.sharesCount ?? 0} shares)</span>
              </>
            )}
          </button>
        </div>

        {/* Action 2: Send to Users / Mutual Friends Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">Send to Friends & Creators</span>
            <span className="text-[11px] text-neutral-400">
              {eligibleUsers.length} available
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
              placeholder="Search user..."
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

          {/* Recipient Users List: Isolated scrolling so background never scrolls */}
          <div
            onWheel={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            className="max-h-56 overflow-y-auto space-y-1.5 pr-1 mt-2 overscroll-contain"
          >
            {filteredUsers.map(u => {
              const isSent = sentUserIds.includes(u.id);
              const followStatus = getFollowStatus(u.id);
              const isFriend = followStatus === 'friends';

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2 rounded-2xl bg-[#181824] hover:bg-[#20202e] border border-neutral-800/80 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0 mr-2 flex-1">
                    <Avatar
                      src={u.avatar}
                      alt={u.displayName || u.username}
                      size="sm"
                      className="w-8 h-8 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                        <span>{u.displayName}</span>
                        {isFriend && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30">
                            <Users className="w-2.5 h-2.5" />
                            <span>Friend</span>
                          </span>
                        )}
                        {!u.isPrivate && !isFriend && (
                          <span className="text-[10px] text-neutral-400 font-normal">
                            Public
                          </span>
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
                    className={`py-1 px-3 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isSent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                        : 'bg-[#ff007a] hover:bg-[#e0006c] text-white shadow-[0_0_8px_rgba(255,0,122,0.3)]'
                    }`}
                  >
                    {isSent ? (
                      <>
                        <Check className="w-3 h-3" />
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
                {searchQuery ? 'No matching users found.' : 'No users available to send to.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
