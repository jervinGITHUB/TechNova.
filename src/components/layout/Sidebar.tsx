import React, { useState } from 'react';
import { useApp, AppTab } from '../../context/AppContext';
import { ViralHubLogo } from '../common/ViralHubLogo';
import { Avatar } from '../common/Avatar';
import { isGoogleAccount, isAccountLoggedInOnDevice } from '../../lib/supabase';
import {
  Home,
  Compass,
  UserCheck,
  Users,
  Radio,
  MessageSquare,
  User as UserIcon,
  LogOut,
  Sliders,
  ChevronDown,
  ArrowRightLeft,
  ShieldAlert,
  Ban,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  onNavigate?: () => void;
  hideLogo?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate, hideLogo = false }) => {
  const {
    currentUser,
    users,
    savedAccounts,
    quickLoginAs,
    activeTab,
    setActiveTab,
    totalUnreadMessages,
    setMessagesMobileView,
    logout,
    navigateToUserProfile,
    setSwitchAccountModalOpen,
    setBlockedUsersModalOpen,
    refreshFeed,
    loginWithGoogle,
    setAuthView,
    sidebarCollapsed,
    toggleSidebarCollapsed,
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
      tab: 'following',
      label: 'Following',
      icon: <UserCheck className="w-5 h-5" />,
    },
    {
      tab: 'friends',
      label: 'Friends',
      icon: <Users className="w-5 h-5" />,
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
    <aside
      className={`w-full ${
        sidebarCollapsed ? 'md:w-20 px-2' : 'md:w-64 px-4'
      } shrink-0 bg-[#0d0d12] border-r-0 md:border-r border-neutral-800/80 flex flex-col justify-between h-full md:h-screen sticky top-0 py-4 md:py-5 select-none z-30 transition-all duration-300 ease-in-out`}
    >
      {/* Top Brand Logo & Collapse Button */}
      <div>
        {!hideLogo && (
          <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-3 justify-center' : 'justify-between'} mb-6 px-1`}>
            <div
              onClick={() => {
                setActiveTab('home');
                refreshFeed();
                onNavigate?.();
              }}
              className="cursor-pointer hover:opacity-90 transition-opacity"
              title="ViralHub"
            >
              {sidebarCollapsed ? (
                <ViralHubLogo size="sm" showText={false} />
              ) : (
                <ViralHubLogo size="md" />
              )}
            </div>

            {/* Collapse / Expand Toggle Button (like in TikTok) */}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden md:flex p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors cursor-pointer border border-transparent hover:border-neutral-700/60"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label="Toggle sidebar collapse"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5 text-neutral-300" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-neutral-300" />
              )}
            </button>
          </div>
        )}

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
                  if (item.tab === 'home' || item.tab === 'following' || item.tab === 'friends') {
                    refreshFeed();
                  }
                  setActiveTab(item.tab);
                  onNavigate?.();
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${
                  sidebarCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
                } rounded-2xl font-medium text-sm transition-all cursor-pointer relative group ${
                  isActive
                    ? sidebarCollapsed
                      ? 'bg-[#1b1b24] text-[#ff007a] shadow-[0_0_12px_rgba(255,0,122,0.25)]'
                      : 'bg-[#1b1b24] text-white font-semibold border-l-4 border-[#ff007a] shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-[#15151c]'
                }`}
              >
                <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3.5'}`}>
                  <span className={isActive ? 'text-[#ff007a]' : 'text-neutral-400 group-hover:text-white transition-colors'}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </div>

                {/* Unread Counter Badge */}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  sidebarCollapsed ? (
                    <span className="absolute top-1.5 right-2 min-w-4 h-4 px-1 rounded-full bg-[#ff0033] text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(255,0,51,0.7)] animate-pulse">
                      {item.badge}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#ff0033] text-white text-[11px] font-bold shadow-[0_0_8px_rgba(255,0,51,0.7)] animate-pulse">
                      {item.badge}
                    </span>
                  )
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
              className={`flex items-center ${
                sidebarCollapsed ? 'justify-center p-1.5' : 'justify-between p-2.5'
              } rounded-2xl hover:bg-[#16161f] transition-all cursor-pointer group`}
              title={sidebarCollapsed ? (currentUser.displayName || 'Profile') : undefined}
            >
              <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} min-w-0`}>
                <Avatar
                  src={currentUser.avatar}
                  alt={currentUser.displayName || 'User'}
                  size={sidebarCollapsed ? 'sm' : 'md'}
                />
                {!sidebarCollapsed && (
                  <div className="min-w-0 text-left">
                    <div className="text-sm font-semibold text-white truncate group-hover:text-[#ff007a] transition-colors">
                      {currentUser.displayName || 'Profile'}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">
                      {currentUser.username ? `@${currentUser.username}` : '@user'}
                    </div>
                  </div>
                )}
              </div>
              {!sidebarCollapsed && (
                <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0 group-hover:text-white transition-colors" />
              )}
            </div>

            {/* Profile Menu Popup */}
            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className={`absolute bottom-16 ${
                  sidebarCollapsed ? 'left-2 w-64' : 'left-0 w-full'
                } bg-[#181822] border border-neutral-700/80 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 backdrop-blur-xl`}>
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateToUserProfile(currentUser.id);
                      onNavigate?.();
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
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-blue-400" />
                    <span>Edit Profile & Privacy</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setSwitchAccountModalOpen(true);
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-[#ff007a]" />
                    <span>Switch Account</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveTab('report_history');
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Report History</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setBlockedUsersModalOpen(true);
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-white hover:bg-[#252535] rounded-xl transition-colors cursor-pointer"
                  >
                    <Ban className="w-4 h-4 text-red-400" />
                    <span>Blocked Accounts</span>
                  </button>

                  <div className="h-px bg-neutral-800 my-1" />

                  {/* Switch Account Quick List */}
                  {(() => {
                    const accountsToShow = savedAccounts.length > 0 ? savedAccounts : users.slice(0, 4);
                    return accountsToShow.length > 0 ? (
                      <div className="space-y-0.5">
                        {accountsToShow.slice(0, 4).map(u => {
                          const isCurrent = currentUser.id === u.id;
                          const isAdminAccount = String(u.role || '').toLowerCase() === 'admin' || String(u.role || '').toLowerCase() === 'super admin';
                          return (
                            <button
                              key={u.id}
                              onClick={async () => {
                                setProfileMenuOpen(false);
                                if (isCurrent) return;
                                if (isAccountLoggedInOnDevice(u.id, u.email)) {
                                  quickLoginAs(u.id);
                                  return;
                                }
                                if (isGoogleAccount(u)) {
                                  await loginWithGoogle({ prompt: 'select_account' });
                                } else {
                                  logout();
                                  if (typeof window !== 'undefined') {
                                    sessionStorage.setItem('viralhub_prefill_login', u.email || u.username);
                                  }
                                  setAuthView('login');
                                }
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
                                {isAdminAccount && (
                                  <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shrink-0">
                                    Admin
                                  </span>
                                )}
                              </div>
                              {isCurrent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#ff007a] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : null;
                  })()}

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
