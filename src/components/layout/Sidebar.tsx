import React, { useState } from 'react';
import { useApp, AppTab } from '../../context/AppContext';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { Avatar } from '../common/Avatar';
import {
  Home,
  Compass,
  Radio,
  MessageSquare,
  User as UserIcon,
  LogOut,
  Sliders,
  ChevronDown,
  ArrowRightLeft
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    currentUser,
    users,
    quickLoginAs,
    activeTab,
    setActiveTab,
    totalUnreadMessages,
    setMessagesMobileView,
    logout,
    navigateToUserProfile
  } = useApp();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const navItems: { tab: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      tab: 'home',
      label: 'Home',
      icon: <Home className="w-5 h-5" />,
    },
    {
      tab: 'explore',
      label: 'Explore',
      icon: <Compass className="w-5 h-5" />,
    },
    {
      tab: 'live',
      label: 'Live',
      icon: (
        <div className="relative">
          <Radio className="w-5 h-5" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#ff007a] animate-pulse" />
        </div>
      ),
    },
    {
      tab: 'messages',
      label: 'Messages',
      icon: <MessageSquare className="w-5 h-5" />,
      badge: totalUnreadMessages,
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#0d0d12] border-r border-neutral-800/80 flex flex-col justify-between h-screen sticky top-0 px-4 py-5 select-none z-30">
      {/* Top Brand Logo */}
      <div>
        <div
          onClick={() => setActiveTab('home')}
          className="cursor-pointer py-1 px-2 mb-8 hover:opacity-90 transition-opacity"
        >
          <ViralHubLogo size="md" />
        </div>

        {/* Primary Navigation Links */}
        <nav className="space-y-1.5">
          {navItems.map(item => {
            const isActive =
              activeTab === item.tab ||
              (item.tab === 'live' && (activeTab === 'live_host_setup' || activeTab === 'live_host_active' || activeTab === 'live_viewer'));

            return (
              <button
                key={item.tab}
                onClick={() => {
                  if (item.tab === 'messages') {
                    setMessagesMobileView('list');
                  }
                  setActiveTab(item.tab);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-medium text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1b1b24] text-white font-semibold border-l-4 border-[#ff007a] shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-[#15151c]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={isActive ? 'text-[#ff007a]' : 'text-neutral-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {/* Unread Counter Badge */}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#ff0033] text-white text-[11px] font-bold shadow-[0_0_8px_rgba(255,0,51,0.7)] animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile Section with Dropdown Options */}
      <div className="relative pt-4 border-t border-neutral-800/80">
        {currentUser && (
          <div className="relative">
            <div
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-[#16161f] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={currentUser.avatar}
                  alt={currentUser.displayName || 'User'}
                  size="md"
                />
                <div className="min-w-0 text-left">
                  <div className="text-sm font-semibold text-white truncate group-hover:text-[#ff007a] transition-colors">
                    {currentUser.displayName || 'Profile'}
                  </div>
                  <div className="text-xs text-neutral-400 truncate">
                    {currentUser.username ? `@${currentUser.username}` : '@user'}
                  </div>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0 group-hover:text-white transition-colors" />
            </div>

            {/* Profile Menu Popup */}
            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute bottom-16 left-0 w-full bg-[#181822] border border-neutral-700/80 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateToUserProfile(currentUser.id);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-[#ff007a]" />
                    <span>View Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveTab('edit_profile');
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-blue-400" />
                    <span>Edit Profile & Privacy</span>
                  </button>

                  <div className="h-px bg-neutral-800 my-1" />

                  {/* Switch Account Quick Selector */}
                  {users.length > 0 && (
                    <>
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                        <ArrowRightLeft className="w-3 h-3 text-[#ff007a]" />
                        <span>Switch Account</span>
                      </div>
                      <div className="space-y-0.5">
                        {users.slice(0, 4).map(u => {
                          const isCurrent = currentUser.id === u.id;
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                setProfileMenuOpen(false);
                                quickLoginAs(u.id);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-[#ff007a]/20 text-[#ff007a] font-bold'
                                  : 'text-neutral-300 hover:bg-[#252535] hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar
                                  src={u.avatar}
                                  alt={u.displayName || 'User'}
                                  size="xs"
                                />
                                <span className="truncate">{u.displayName || u.username || 'User'}</span>
                              </div>
                              {isCurrent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="h-px bg-neutral-800 my-1" />

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
