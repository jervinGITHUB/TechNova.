import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { Search, Bell, Plus, Menu, User as UserIcon, Film, X, ChevronRight, ArrowLeft, ArrowRightLeft } from 'lucide-react';

interface HeaderProps {
  onToggleMobileNav?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav }) => {
  const {
    activeTab,
    setActiveTab,
    totalUnreadNotifications,
    searchQuery,
    setSearchQuery,
    users,
    videos,
    navigateToUserProfile,
    setSwitchAccountModalOpen,
  } = useApp();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown and mobile search mode when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
        if (!searchQuery) {
          setMobileSearchOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  // Focus input automatically when mobile search opens
  useEffect(() => {
    if (mobileSearchOpen && mobileInputRef.current) {
      mobileInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const cleanQuery = searchQuery.trim().toLowerCase().replace('@', '').replace('#', '');

  // Filter matching creators
  const matchedUsers = cleanQuery
    ? users.filter(
        u =>
          u.username.toLowerCase().includes(cleanQuery) ||
          u.displayName.toLowerCase().includes(cleanQuery) ||
          u.bio.toLowerCase().includes(cleanQuery)
      )
    : [];

  // Filter matching videos
  const matchedVideos = cleanQuery
    ? videos.filter(
        v =>
          v.caption.toLowerCase().includes(cleanQuery) ||
          v.hashtags.some(tag => tag.toLowerCase().includes(cleanQuery))
      ).slice(0, 4)
    : [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setDropdownOpen(false);
      setMobileSearchOpen(false);
      setActiveTab('explore');
    }
  };

  const handleSelectUser = (userId: string) => {
    setDropdownOpen(false);
    setMobileSearchOpen(false);
    navigateToUserProfile(userId);
  };

  return (
    <header className="h-16 px-3 sm:px-8 border-b border-neutral-800/80 bg-[#0d0d12]/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-3">
      {/* Mobile Search Active Full-Width Header */}
      {mobileSearchOpen ? (
        <div ref={searchContainerRef} className="w-full flex items-center gap-2 md:hidden animate-fadeIn">
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen(false);
              setDropdownOpen(false);
            }}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-[#ff007a]" />
          </button>

          <form onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center">
            <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
              <Search className="w-4 h-4 text-[#ff007a]" />
            </div>
            <input
              ref={mobileInputRef}
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setDropdownOpen(true);
              }}
              placeholder="Search users, creators, videos, hashtags..."
              className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-10 pr-9 py-2.5 rounded-full border border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none shadow-lg"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDropdownOpen(false);
                }}
                className="absolute right-3 text-neutral-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Full-width suggestions dropdown for mobile */}
          {dropdownOpen && cleanQuery && (
            <div className="fixed top-16 left-2 right-2 bg-[#161622] border border-neutral-700/90 rounded-2xl shadow-2xl p-3 z-50 text-left max-h-[75vh] overflow-y-auto backdrop-blur-xl animate-fadeIn space-y-3">
              {/* Creators list */}
              {matchedUsers.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <UserIcon className="w-3 h-3 text-[#ff007a]" />
                    <span>Creators & Users ({matchedUsers.length})</span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {matchedUsers.map(u => (
                      <div
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#1d1d2b]/80 hover:bg-[#25253a] border border-neutral-800/60 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={u.avatar}
                            alt={u.displayName}
                            size="md"
                          />
                          <div className="min-w-0 text-left">
                            <div className="text-xs font-bold text-white truncate">
                              {u.displayName}
                            </div>
                            <div className="text-[11px] text-neutral-400 truncate">
                              @{u.username} · {u.followersCount} followers
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-[#ff007a] bg-[#ff007a]/15 px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-0.5">
                          <span>Profile</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos list */}
              {matchedVideos.length > 0 && (
                <div className="pt-2 border-t border-neutral-800">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <Film className="w-3 h-3 text-cyan-400" />
                    <span>Videos & Captions</span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {matchedVideos.map(v => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setDropdownOpen(false);
                          setMobileSearchOpen(false);
                          setActiveTab('explore');
                        }}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-[#1d1d2b]/60 hover:bg-[#25253a] cursor-pointer transition-colors"
                      >
                        <img
                          src={v.thumbnailUrl || v.mediaUrl}
                          alt={v.caption}
                          className="w-10 h-12 rounded-lg object-cover border border-neutral-700 shrink-0"
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-xs text-white truncate font-medium">
                            {v.caption}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            by {v.creator.displayName}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matchedUsers.length === 0 && matchedVideos.length === 0 && (
                <div className="py-6 text-center text-xs text-neutral-400">
                  No users or videos found matching "{searchQuery}".
                </div>
              )}

              {/* Bottom Search All button */}
              <div className="pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setMobileSearchOpen(false);
                    setActiveTab('explore');
                  }}
                  className="w-full text-center py-2.5 rounded-xl bg-[#ff007a]/15 hover:bg-[#ff007a]/25 text-xs font-bold text-[#ff007a] transition-colors cursor-pointer"
                >
                  Search all in Explore for "{searchQuery}" →
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Hamburger Menu Toggle */}
          <button
            onClick={onToggleMobileNav}
            className="md:hidden p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/80 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Center Search Input with Instant Dropdown (Desktop & Mobile Compact) */}
          <div ref={searchContainerRef} className="flex-1 max-w-xl relative">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onFocus={() => {
                  // On mobile screens, activate full-width wide search bar!
                  if (window.innerWidth < 768) {
                    setMobileSearchOpen(true);
                  }
                  if (searchQuery.trim()) setDropdownOpen(true);
                }}
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setMobileSearchOpen(true);
                  }
                }}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                placeholder="Search users, creators, videos, hashtags..."
                className="w-full bg-[#181822] text-xs sm:text-sm text-white placeholder-neutral-500 pl-10 pr-9 py-2 sm:py-2.5 rounded-full border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all cursor-pointer sm:cursor-text"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDropdownOpen(false);
                  }}
                  className="absolute right-3 text-neutral-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Dropdown Results for Desktop */}
            {dropdownOpen && cleanQuery && (
              <div className="absolute top-12 left-0 right-0 bg-[#161622] border border-neutral-700/80 rounded-2xl shadow-2xl p-3 z-50 text-left max-h-96 overflow-y-auto backdrop-blur-xl animate-fadeIn space-y-3">
                {/* Matching Users / Creators */}
                {matchedUsers.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <UserIcon className="w-3 h-3 text-[#ff007a]" />
                      <span>Creators & Users ({matchedUsers.length})</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {matchedUsers.map(u => (
                        <div
                          key={u.id}
                          onClick={() => handleSelectUser(u.id)}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#222232] cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={u.avatar}
                              alt={u.displayName}
                              size="sm"
                            />
                            <div className="min-w-0 text-left">
                              <div className="text-xs font-bold text-white group-hover:text-[#ff007a] transition-colors truncate">
                                {u.displayName}
                              </div>
                              <div className="text-[11px] text-neutral-400 truncate">
                                @{u.username} · {u.followersCount} followers
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white flex items-center gap-0.5">
                            <span>Profile</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matching Videos */}
                {matchedVideos.length > 0 && (
                  <div className="pt-2 border-t border-neutral-800">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <Film className="w-3 h-3 text-cyan-400" />
                      <span>Videos & Captions</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {matchedVideos.map(v => (
                        <div
                          key={v.id}
                          onClick={() => {
                            setDropdownOpen(false);
                            setActiveTab('explore');
                          }}
                          className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#222232] cursor-pointer transition-colors group"
                        >
                          <img
                            src={v.thumbnailUrl || v.mediaUrl}
                            alt={v.caption}
                            className="w-9 h-11 rounded-lg object-cover border border-neutral-700 shrink-0"
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="min-w-0 flex-1 text-left">
                            <div className="text-xs text-white group-hover:text-cyan-400 transition-colors truncate font-medium">
                              {v.caption}
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate">
                              by {v.creator.displayName}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {matchedUsers.length === 0 && matchedVideos.length === 0 && (
                  <div className="py-6 text-center text-xs text-neutral-400">
                    No users or videos found matching "{searchQuery}".
                  </div>
                )}

                {/* Bottom Search All button */}
                <div className="pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setActiveTab('explore');
                    }}
                    className="w-full text-center py-2 rounded-xl bg-[#1d1d2b] hover:bg-[#252538] text-xs font-bold text-[#ff007a] transition-colors cursor-pointer"
                  >
                    Search all in Explore for "{searchQuery}" →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Controls: Switch Account + Notification Bell + "+ Upload" Button */}
          <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
            {/* Switch Account Quick Button */}
            <button
              onClick={() => setSwitchAccountModalOpen(true)}
              className="p-2 sm:p-2.5 rounded-full text-neutral-300 hover:text-white hover:bg-[#181822] transition-colors cursor-pointer"
              title="Switch Account"
            >
              <ArrowRightLeft className="w-5 h-5 text-[#ff007a]" />
            </button>

            {/* Notification Bell */}
            <button
              onClick={() => setActiveTab('notifications')}
              className={`relative p-2 sm:p-2.5 rounded-full transition-colors cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-[#ff007a]/20 text-[#ff007a]'
                  : 'text-neutral-300 hover:text-white hover:bg-[#181822]'
              }`}
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-amber-400" />
              {totalUnreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#ff007a] shadow-[0_0_8px_rgba(255,0,122,0.8)] animate-pulse" />
              )}
            </button>

            {/* Hot Pink "+ Upload" Button */}
            <button
              onClick={() => setActiveTab('upload')}
              className="flex items-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-xs sm:text-sm shadow-[0_0_15px_rgba(255,0,122,0.35)] transition-all cursor-pointer transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Upload</span>
            </button>
          </div>
        </>
      )}
    </header>
  );
};
