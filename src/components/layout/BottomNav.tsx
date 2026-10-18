import React from 'react';
import { Home, Compass, Plus, MessageSquare, User as UserIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const BottomNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    totalUnreadMessages,
    setMessagesMobileView,
    currentUser,
    navigateToUserProfile,
    setAuthView,
    refreshFeed,
  } = useApp();

  const isHomeActive = activeTab === 'home' || activeTab === 'following' || activeTab === 'friends';
  const isExploreActive = activeTab === 'explore';
  const isMessagesActive = activeTab === 'messages';
  const isProfileActive = activeTab === 'profile' || activeTab === 'edit_profile';

  return (
    <nav
      className="md:hidden shrink-0 w-full h-14 bg-[#0d0d12]/95 backdrop-blur-md border-t border-neutral-800/80 px-2 select-none flex items-center justify-around z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile Bottom Navigation"
    >
      {/* 1. Home Button */}
      <button
        type="button"
        onClick={() => {
          if (activeTab === 'home') {
            refreshFeed();
          } else {
            setActiveTab('home');
          }
        }}
        className={`flex flex-col items-center justify-center flex-1 h-full cursor-pointer transition-colors ${
          isHomeActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        aria-label="Home"
      >
        <Home className={`w-5 h-5 ${isHomeActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        <span className={`text-[10px] mt-0.5 ${isHomeActive ? 'font-bold text-white' : 'font-medium'}`}>
          Home
        </span>
      </button>

      {/* 2. Explore Button */}
      <button
        type="button"
        onClick={() => setActiveTab('explore')}
        className={`flex flex-col items-center justify-center flex-1 h-full cursor-pointer transition-colors ${
          isExploreActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        aria-label="Explore"
      >
        <Compass className={`w-5 h-5 ${isExploreActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        <span className={`text-[10px] mt-0.5 ${isExploreActive ? 'font-bold text-white' : 'font-medium'}`}>
          Explore
        </span>
      </button>

      {/* 3. Iconic TikTok Center (+) Create Button */}
      <div className="flex items-center justify-center flex-1 h-full">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className="relative group cursor-pointer active:scale-95 transition-transform"
          aria-label="Create Video"
          title="Create Video"
        >
          {/* TikTok Cyan & Pink 3D Accent Borders */}
          <div className="relative w-11 h-7 flex items-center justify-center">
            {/* Cyan layer (left) */}
            <div className="absolute inset-0 bg-[#00f2fe] rounded-lg -translate-x-1" />
            {/* Magenta/Pink layer (right) */}
            <div className="absolute inset-0 bg-[#ff007a] rounded-lg translate-x-1" />
            {/* Black / Dark Center Box */}
            <div className="relative z-10 w-9 h-7 bg-white text-black rounded-lg flex items-center justify-center shadow-md">
              <Plus className="w-5 h-5 stroke-[3] text-black" />
            </div>
          </div>
        </button>
      </div>

      {/* 4. Inbox / Messages Button */}
      <button
        type="button"
        onClick={() => {
          setMessagesMobileView('list');
          setActiveTab('messages');
        }}
        className={`flex flex-col items-center justify-center flex-1 h-full cursor-pointer transition-colors relative ${
          isMessagesActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        aria-label="Inbox"
      >
        <div className="relative">
          <MessageSquare className={`w-5 h-5 ${isMessagesActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          {totalUnreadMessages > 0 && (
            <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-[#ff0033] text-white text-[9px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(255,0,51,0.8)] animate-pulse">
              {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
            </span>
          )}
        </div>
        <span className={`text-[10px] mt-0.5 ${isMessagesActive ? 'font-bold text-white' : 'font-medium'}`}>
          Inbox
        </span>
      </button>

      {/* 5. Profile Button */}
      <button
        type="button"
        onClick={() => {
          if (currentUser) {
            navigateToUserProfile(currentUser.id);
          } else {
            setAuthView('login');
          }
        }}
        className={`flex flex-col items-center justify-center flex-1 h-full cursor-pointer transition-colors ${
          isProfileActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        aria-label="Profile"
      >
        {currentUser?.avatar ? (
          <img
            src={currentUser.avatar}
            alt={currentUser.displayName || 'Profile'}
            className={`w-5 h-5 rounded-full object-cover border ${
              isProfileActive ? 'border-white' : 'border-neutral-600'
            }`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <UserIcon className={`w-5 h-5 ${isProfileActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        )}
        <span className={`text-[10px] mt-0.5 ${isProfileActive ? 'font-bold text-white' : 'font-medium'}`}>
          Profile
        </span>
      </button>
    </nav>
  );
};
export default BottomNav;
