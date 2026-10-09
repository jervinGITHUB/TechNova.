import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { Ban, Search, X, Check, AlertCircle } from 'lucide-react';

interface BlockedUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BlockedUsersModal: React.FC<BlockedUsersModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, users, blockRelations, unblockUser } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  if (!isOpen || !currentUser) return null;

  // Filter relations where blocker is current user
  const myBlockedRelations = blockRelations.filter(
    r => r.blockerId === currentUser.id
  );

  // Map to user objects
  const blockedUsers = myBlockedRelations
    .map(rel => {
      const userObj = users.find(u => u.id === rel.blockedId);
      return {
        relation: rel,
        user: userObj || {
          id: rel.blockedId,
          username: 'user',
          displayName: 'Blocked User',
          email: '',
          avatar: '',
          bio: '',
          followingCount: 0,
          followersCount: 0,
          likesCount: 0,
          isPrivate: false,
        },
      };
    })
    .filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.user.username.toLowerCase().includes(q) ||
        item.user.displayName.toLowerCase().includes(q)
      );
    });

  const handleUnblock = async (userId: string, username: string) => {
    await unblockUser(userId);
    setToastMsg(`@${username} has been unblocked.`);
    setTimeout(() => setToastMsg(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#13131a] border border-neutral-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-brand">Blocked Accounts</h2>
              <p className="text-xs text-neutral-400">
                Blocked users cannot message you or view your profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast confirmation */}
        {toastMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-fadeIn shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Search Bar */}
        {myBlockedRelations.length > 3 && (
          <div className="mt-4 relative shrink-0">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search blocked users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-10 pr-4 py-2.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-all"
            />
          </div>
        )}

        {/* Blocked List */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1 min-h-[220px]">
          {blockedUsers.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 space-y-3">
              <div className="w-12 h-12 rounded-full bg-neutral-800/80 flex items-center justify-center mx-auto text-neutral-500">
                <Ban className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">No Blocked Accounts</p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                {myBlockedRelations.length === 0
                  ? 'You haven’t blocked anyone yet. Users you block in messages or profile will appear here.'
                  : 'No blocked users match your search.'}
              </p>
            </div>
          ) : (
            blockedUsers.map(({ relation, user }) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#181824]/60 border border-neutral-800/80 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={user.avatar}
                    alt={user.displayName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">
                      {user.displayName}
                    </h4>
                    <p className="text-xs text-neutral-400 truncate">
                      @{user.username}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleUnblock(user.id, user.username)}
                  className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-200 hover:text-red-400 border border-neutral-700 hover:border-red-500/40 text-xs font-semibold transition-colors cursor-pointer shrink-0 ml-3"
                >
                  Unblock
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-between shrink-0">
          <span>{myBlockedRelations.length} blocked {myBlockedRelations.length === 1 ? 'user' : 'users'}</span>
          <button
            onClick={onClose}
            className="text-xs text-neutral-300 hover:text-white font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
