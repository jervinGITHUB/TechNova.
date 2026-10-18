import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { Search, Bell, Plus, Menu, User as UserIcon, Film, X, ChevronRight, ArrowLeft, Clock, Radio } from 'lucide-react';
import { checkIsUserBanned } from '../../lib/supabase';

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
    sidebarCollapsed,
    toggleSidebarCollapsed,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    refreshFeed,
  } = useApp();

  const isLiveStudio = activeTab === 'live_host_setup' || activeTab === 'live_host_active';

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);

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

  // Listen for global search focus trigger (e.g. clicking search button on video in feed)
  useEffect(() => {
    const handleFocusSearch = () => {
      if (window.innerWidth < 768) {
        setMobileSearchOpen(true);
        setTimeout(() => mobileInputRef.current?.focus(), 60);
      } else {
        desktopInputRef.current?.focus();
        setDropdownOpen(true);
      }
    };
    window.addEventListener('focus-search-input', handleFocusSearch);
    return () => window.removeEventListener('focus-search-input', handleFocusSearch);
  }, []);

  // In Live Studio (Setup or Active): hide search bar, notification icon, and upload button. Show 3 lines menu icon to keep layout wide.
  if (isLiveStudio) {
    const isLiveActive = activeTab === 'live_host_active';
    return (
      <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-neutral-800/80 bg-[#0d0d12]/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-3 select-none">
        {/* Left: 3-Lines (Hamburger) Button + Logo + Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileNav}
            className="p-2 text-neutral-300 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors flex items-center justify-center cursor-pointer border border-neutral-800 hover:border-neutral-700"
            aria-label="Toggle navigation menu"
            title="Navigation Menu"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>

          <div
            onClick={() => setActiveTab('home')}
            className="cursor-pointer py-1 px-1 hover:opacity-90 transition-opacity"
            title="ViralHub Home"
          >
            <ViralHubLogo size="sm" />
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-neutral-800">
            <span className="w-2 h-2 rounded-full bg-[#ff007a] animate-pulse" />
            <span className="text-xs font-bold font-brand text-white tracking-wider">
              {isLiveActive ? 'LIVE BROADCAST' : 'LIVE STUDIO SETUP'}
            </span>
          </div>
        </div>

        {/* Right: Exit Studio Button (Search bar, Notification Bell, and + Upload are hidden) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('live')}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors flex items-center gap-1.5 cursor-pointer border border-neutral-800 hover:border-neutral-700"
            title="Exit Live Studio"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Exit Studio</span>
          </button>
        </div>
      </header>
    );
  }

  // On Messages page: remove the search bar on top and make messages page full screen
  if (activeTab === 'messages') {
    return (
      <header className="md:hidden h-14 px-3.5 border-b border-neutral-800/80 bg-[#0d0d12]/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileNav}
            className="p-2 text-neutral-300 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors flex items-center justify-center cursor-pointer border border-neutral-800 hover:border-neutral-700"
            aria-label="Toggle navigation menu"
            title="Navigation Menu"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
          <div
            onClick={() => setActiveTab('home')}
            className="cursor-pointer py-1 px-1 hover:opacity-90 transition-opacity"
            title="ViralHub Home"
          >
            <ViralHubLogo size="sm" />
          </div>
          <span className="text-xs font-bold font-brand text-white tracking-wider border-l border-neutral-800 pl-3">
            MESSAGES
          </span>
        </div>
      </header>
    );
  }

  const cleanQuery = searchQuery.trim().toLowerCase().replace('@', '').replace('#', '');

  // Filter matching creators - strictly hide banned accounts
  const matchedUsers = cleanQuery
    ? users.filter(
        u =>
          !u.isBanned &&
          !checkIsUserBanned(u.id, u.email, u).isBanned &&
          (u.username.toLowerCase().includes(cleanQuery) ||
          u.displayName.toLowerCase().includes(cleanQuery) ||
          u.bio.toLowerCase().includes(cleanQuery))
      )
    : [];

  // Filter matching videos - hide videos from banned creators, rejected videos, or only_me private videos
  const matchedVideos = cleanQuery
    ? videos.filter(
        v =>
          v.status !== 'rejected' &&
          v.audience !== 'only_me' &&
          v.privacy !== 'private' &&
          !v.creator?.isBanned &&
          !checkIsUserBanned(v.creatorId || v.creator?.id, v.creator?.email, v.creator).isBanned &&
          (v.caption.toLowerCase().includes(cleanQuery) ||
          v.hashtags.some(tag => tag.toLowerCase().includes(cleanQuery)))
      ).slice(0, 4)
    : [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
      setDropdownOpen(false);
      setMobileSearchOpen(false);
      setActiveTab('explore');
    }
  };

  const handleSelectUser = (userId: string) => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
    }
    setDropdownOpen(false);
    setMobileSearchOpen(false);
    navigateToUserProfile(userId);
  };

  const handleSelectRecentSearch = (term: string) => {
    setSearchQuery(term);
    addRecentSearch(term);
    setDropdownOpen(false);
    setMobileSearchOpen(false);
    setActiveTab('explore');
  };

  return (
    <header className="h-16 px-3 sm:px-6 border-b border-neutral-800/80 bg-[#0d0d12] sticky top-0 z-[70] flex items-center justify-between gap-3 shadow-md">
      {/* Background Dim Backdrop: Ensures search is always in the foreground and NEVER "on the back" of videos or feeds */}
      {(dropdownOpen || mobileSearchOpen) && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-[2px] z-30 transition-opacity animate-fadeIn cursor-pointer"
          onClick={() => {
            setDropdownOpen(false);
            if (!searchQuery) {
              setMobileSearchOpen(false);
            }
          }}
          title="Click to dismiss search"
        />
      )}

      {/* Mobile Search Active Full-Width Header */}
      {mobileSearchOpen ? (
        <div ref={searchContainerRef} className="w-full flex items-center gap-2 md:hidden animate-fadeIn relative z-40">
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
              maxLength={50}
              value={searchQuery}
              onChange={e => {
                const val = e.target.value.slice(0, 50);
                setSearchQuery(val);
                setDropdownOpen(true);
              }}
              placeholder="Search users, creators, videos, hashtags..."
              className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-10 pr-20 py-2.5 rounded-full border border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none shadow-lg"
            />
            <div className="absolute right-3 flex items-center gap-1.5">
              {searchQuery.length >= 35 && (
                <span
                  className={`text-[10px] font-mono select-none px-1 py-0.5 rounded ${
                    searchQuery.length >= 50
                      ? 'text-pink-400 font-bold bg-pink-950/60 border border-pink-500/40'
                      : 'text-neutral-400'
                  }`}
                >
                  {searchQuery.length}/50
                </span>
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDropdownOpen(false);
                  }}
                  className="text-neutral-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Full-width suggestions dropdown for mobile */}
          {dropdownOpen && (
            !cleanQuery ? (
              /* Recent Searches for Mobile */
              <div className="fixed top-16 left-2 right-2 bg-[#14141e] border border-neutral-700/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-3 z-[100] text-left animate-fadeIn space-y-2 max-h-[75vh] overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                    <Clock className="w-3.5 h-3.5 text-[#ff007a]" />
                    <span>Recent searches</span>
                  </div>
                  {recentSearches.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearRecentSearches();
                      }}
                      className="text-[11px] font-semibold text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {recentSearches.length > 0 ? (
                  <div className="space-y-1">
                    {recentSearches.map((term, idx) => (
                      <div
                        key={`${term}-${idx}`}
                        onClick={() => handleSelectRecentSearch(term)}
                        className="flex items-center justify-between px-2.5 py-2.5 rounded-xl bg-[#1d1d2b]/80 hover:bg-[#25253a] border border-neutral-800/60 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <span className="text-xs text-neutral-200 truncate">{term}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeRecentSearch(term);
                          }}
                          className="p-1 text-neutral-500 hover:text-white rounded-lg transition-colors ml-2 shrink-0 cursor-pointer"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-neutral-500">
                    No recent searches yet
                  </div>
                )}
              </div>
            ) : (
              /* Live Results for Mobile */
              <div className="fixed top-16 left-2 right-2 bg-[#14141e] border border-neutral-700/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-3 z-[100] text-left max-h-[75vh] overflow-y-auto animate-fadeIn space-y-3">
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
                            if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
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
                      if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
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
            )
          )}
        </div>
      ) : (
        <>
          {/* Left Controls: Desktop Sidebar Toggle + Mobile LIVE Button + Desktop Search Bar */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Desktop Sidebar Collapse Toggle */}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden md:flex p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors cursor-pointer border border-neutral-800/80 hover:border-neutral-700"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label="Toggle sidebar collapse"
            >
              <Menu className="w-5 h-5 text-neutral-300" />
            </button>

            {/* Mobile LIVE Button (like TikTok top-left) */}
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all text-xs font-bold cursor-pointer ${
                activeTab === 'live' || activeTab === 'live_viewer'
                  ? 'bg-[#ff007a]/20 border-[#ff007a] text-[#ff007a] shadow-[0_0_10px_rgba(255,0,122,0.4)]'
                  : 'bg-[#181822]/90 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
              title="Watch Live Streams"
              aria-label="Live Streams"
            >
              <Radio className="w-3.5 h-3.5 text-[#ff007a] animate-pulse" />
              <span>LIVE</span>
            </button>

            {/* Desktop Search Bar (Strictly on the LEFT side like in TikTok / 3rd screenshot) */}
            <div ref={searchContainerRef} className="hidden md:block relative z-40 w-72 lg:w-96 xl:w-[420px]">
              <form onSubmit={handleSearchSubmit} className="w-full relative flex items-center">
                <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  ref={desktopInputRef}
                  type="text"
                  maxLength={50}
                  value={searchQuery}
                  onFocus={() => {
                    setDropdownOpen(true);
                  }}
                  onChange={e => {
                    const val = e.target.value.slice(0, 50);
                    setSearchQuery(val);
                    setDropdownOpen(true);
                  }}
                  placeholder="Search users, creators, videos, hashtags..."
                  className="w-full bg-[#181822] text-xs sm:text-sm text-white placeholder-neutral-500 pl-10 pr-20 py-2 sm:py-2.5 rounded-full border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all cursor-text shadow-sm"
                />
                <div className="absolute right-3 flex items-center gap-1.5">
                  {searchQuery.length >= 35 && (
                    <span
                      className={`text-[10px] font-mono select-none px-1 py-0.5 rounded ${
                        searchQuery.length >= 50
                          ? 'text-pink-400 font-bold bg-pink-950/60 border border-pink-500/40'
                          : 'text-neutral-400'
                      }`}
                    >
                      {searchQuery.length}/50
                    </span>
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setDropdownOpen(false);
                      }}
                      className="text-neutral-400 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>

              {/* Desktop Dropdown: Recent Searches (when query empty) OR Live Search Results */}
              {dropdownOpen && (
                !cleanQuery ? (
                  /* Recent Searches View (Empty query) */
                  <div className="absolute top-12 left-0 right-0 bg-[#14141e] border border-neutral-700/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-3 z-[100] text-left animate-fadeIn space-y-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                        <Clock className="w-3.5 h-3.5 text-[#ff007a]" />
                        <span>Recent searches</span>
                      </div>
                      {recentSearches.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearRecentSearches();
                          }}
                          className="text-[11px] font-semibold text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {recentSearches.length > 0 ? (
                      <div className="space-y-0.5 max-h-64 overflow-y-auto no-scrollbar">
                        {recentSearches.map((term, idx) => (
                          <div
                            key={`${term}-${idx}`}
                            onClick={() => handleSelectRecentSearch(term)}
                            className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-[#222232] cursor-pointer group transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Clock className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 shrink-0" />
                              <span className="text-xs text-neutral-200 group-hover:text-white truncate font-medium">
                                {term}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeRecentSearch(term);
                              }}
                              className="p-1 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors ml-2 shrink-0 cursor-pointer"
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-neutral-500">
                        No recent searches yet
                      </div>
                    )}
                  </div>
                ) : (
                  /* Live Query Results View */
                  <div className="absolute top-12 left-0 right-0 bg-[#14141e] border border-neutral-700/90 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-3 z-[100] text-left max-h-96 overflow-y-auto animate-fadeIn space-y-3">
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
                                if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
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
                          if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
                          setDropdownOpen(false);
                          setActiveTab('explore');
                        }}
                        className="w-full text-center py-2 rounded-xl bg-[#1d1d2b] hover:bg-[#252538] text-xs font-bold text-[#ff007a] transition-colors cursor-pointer"
                      >
                        Search all in Explore for "{searchQuery}" →
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Center Area: Desktop Spacer, Mobile Feed Switcher / Logo */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-1">
            {/* Mobile Top Feed Switcher: Following | Friends | For You */}
            {(activeTab === 'home' || activeTab === 'following' || activeTab === 'friends') ? (
              <div className="md:hidden flex items-center justify-center gap-3.5 sm:gap-5 text-sm font-semibold select-none">
                <button
                  type="button"
                  onClick={() => setActiveTab('following')}
                  className={`relative py-1 transition-colors cursor-pointer text-xs sm:text-sm ${
                    activeTab === 'following' ? 'text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Following
                  {activeTab === 'following' && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className={`relative py-1 transition-colors cursor-pointer text-xs sm:text-sm ${
                    activeTab === 'friends' ? 'text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Friends
                  {activeTab === 'friends' && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'home') refreshFeed();
                    else setActiveTab('home');
                  }}
                  className={`relative py-1 transition-colors cursor-pointer text-xs sm:text-sm ${
                    activeTab === 'home' ? 'text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  For You
                  {activeTab === 'home' && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                  )}
                </button>
              </div>
            ) : (
              <div className="md:hidden flex items-center justify-center">
                <ViralHubLogo size="sm" />
              </div>
            )}
          </div>

          {/* Right Controls: Mobile Search + Notifications + Mobile More Drawer Button + Desktop Upload Button */}
          <div className="flex items-center justify-end gap-1 sm:gap-3.5 shrink-0">
            {/* Mobile Search Icon Button */}
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen(true);
                setDropdownOpen(true);
              }}
              className="md:hidden p-2 text-neutral-300 hover:text-white rounded-full hover:bg-[#181822] transition-colors cursor-pointer"
              aria-label="Search"
              title="Search"
            >
              <Search className="w-5 h-5 text-neutral-200" />
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

            {/* Mobile Options Drawer Button */}
            <button
              type="button"
              onClick={onToggleMobileNav}
              className="md:hidden p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800/80 transition-colors cursor-pointer"
              aria-label="More options"
              title="More options"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop "+ Upload" Button (On mobile, + button is in the TikTok Bottom Navigation bar) */}
            <button
              onClick={() => setActiveTab('upload')}
              className="hidden md:flex items-center gap-1.5 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-semibold text-xs sm:text-sm shadow-[0_0_15px_rgba(255,0,122,0.35)] transition-all cursor-pointer transform active:scale-95 shrink-0"
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
