import React, { useEffect, useRef } from 'react';
import { User, FollowStatus } from '../../types';
import { Avatar } from './Avatar';
import { Users, Check } from 'lucide-react';

interface MentionAutocompleteProps {
  query: string;
  users: User[];
  currentUser: User | null;
  getFollowStatus: (userId: string) => FollowStatus;
  isTargetFollowingMe: (userId: string) => boolean;
  onSelect: (user: User) => void;
  onClose: () => void;
  positionClassName?: string;
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  query,
  users,
  currentUser,
  getFollowStatus,
  onSelect,
  onClose,
  positionClassName = 'bottom-full mb-2',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Filter out current user and sort: Friends first, then Following, then others
  const filteredUsers = React.useMemo(() => {
    const cleanQuery = query.toLowerCase().trim().replace(/^@/, '');
    const pool = users.filter(u => !currentUser || u.id !== currentUser.id);

    const scored = pool
      .map(u => {
        const uStatus = getFollowStatus(u.id);
        const username = (u.username || '').toLowerCase();
        const displayName = (u.displayName || '').toLowerCase();

        let matches = true;
        if (cleanQuery) {
          matches = username.includes(cleanQuery) || displayName.includes(cleanQuery);
        }

        let priority = 3;
        if (uStatus === 'friends') priority = 1;
        else if (uStatus === 'following') priority = 2;

        return { user: u, status: uStatus, matches, priority };
      })
      .filter(item => item.matches)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.user.displayName || '').localeCompare(b.user.displayName || '');
      });

    return scored.slice(0, 10);
  }, [query, users, currentUser, getFollowStatus]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredUsers.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredUsers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredUsers[selectedIndex]) {
          e.preventDefault();
          onSelect(filteredUsers[selectedIndex].user);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredUsers, selectedIndex, onSelect, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filteredUsers.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`absolute left-0 right-0 z-50 bg-[#161622]/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl p-3 shadow-2xl text-xs text-neutral-400 text-center ${positionClassName}`}
      >
        <span>No users matching "@{query}"</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`absolute left-0 right-0 z-50 bg-[#14141e]/98 backdrop-blur-2xl border border-neutral-700/80 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.7)] overflow-hidden max-h-64 flex flex-col ${positionClassName}`}
    >
      <div className="px-3 py-2 border-b border-neutral-800 text-[11px] font-bold text-neutral-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-[#ff007a] font-black">@</span>
          <span>Mention a friend or creator</span>
        </span>
        <span className="text-[10px] text-neutral-500 font-normal">Use ↑↓ and Enter</span>
      </div>

      <div className="overflow-y-auto divide-y divide-neutral-800/40 p-1">
        {filteredUsers.map((item, idx) => {
          const u = item.user;
          const isSelected = idx === selectedIndex;
          const isFriend = item.status === 'friends';
          const isFollowing = item.status === 'following';

          return (
            <button
              key={u.id}
              type="button"
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => onSelect(u)}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-neutral-800/90 text-white shadow-inner'
                  : 'hover:bg-neutral-850 text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  src={u.avatar}
                  alt={u.displayName || u.username}
                  size="sm"
                  className="w-7 h-7 shrink-0 border border-neutral-700"
                />
                <div className="min-w-0 truncate">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <span>{u.displayName || u.username}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1">
                    <span className="text-[#ff007a] font-semibold">@{u.username}</span>
                  </div>
                </div>
              </div>

              {/* Status Badges */}
              <div className="shrink-0 ml-2">
                {isFriend ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    <Users className="w-2.5 h-2.5" />
                    <span>Friend</span>
                  </span>
                ) : isFollowing ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold">
                    <Check className="w-2.5 h-2.5" />
                    <span>Following</span>
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
