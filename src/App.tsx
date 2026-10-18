import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { AuthPage } from './components/auth/AuthPage';
import { HomeFeed } from './components/feed/HomeFeed';
import { ExploreGrid } from './components/feed/ExploreGrid';
import { CommentsDrawer } from './components/feed/CommentsDrawer';
import { LiveBrowse } from './components/live/LiveBrowse';
import { LiveStreamViewer } from './components/live/LiveStreamViewer';
import { LiveStreamHostStudio } from './components/live/LiveStreamHostStudio';
import { MessagesView } from './components/messages/MessagesView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { UploadView } from './components/upload/UploadView';
import { ProfileView } from './components/profile/ProfileView';
import { EditProfileView } from './components/profile/EditProfileView';
import { ReportModals } from './components/modals/ReportModals';
import { ReportHistoryView } from './components/modals/ReportHistoryView';
import { AudioLibraryModal } from './components/modals/AudioLibraryModal';
import { SupabaseVercelModal } from './components/modals/SupabaseVercelModal';
import { SwitchAccountModal } from './components/modals/SwitchAccountModal';
import { BlockedUsersModal } from './components/modals/BlockedUsersModal';
import { ResetPasswordModal } from './components/modals/ResetPasswordModal';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { BannedAccountView } from './components/auth/BannedAccountView';
import { InAppNotificationToast } from './components/notifications/InAppNotificationToast';
import { PreBanWarningBanner } from './components/notifications/PreBanWarningBanner';
import { PreBanAppealModal } from './components/modals/PreBanAppealModal';
import { ViralHubLogo } from './components/common/ViralHubLogo';
import { Avatar } from './components/common/Avatar';
import { X } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentUser,
    isAuthLoading,
    activeTab,
    supabaseModalOpen,
    setSupabaseModalOpen,
    syncWithSupabase,
    isAdmin,
    switchAccountModalOpen,
    setSwitchAccountModalOpen,
    switchingAccountTarget,
    resolvedTheme,
    blockedUsersModalOpen,
    setBlockedUsersModalOpen,
    resetPasswordModalOpen,
    setResetPasswordModalOpen,
  } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Show full-screen branded loader while authenticating via Google OAuth
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0c0c10] text-white select-none">
        <ViralHubLogo size="xl" />
        <div className="mt-6 flex items-center gap-3 text-neutral-400 text-sm font-medium">
          <div className="w-4 h-4 border-2 border-[#ff007a] border-t-transparent rounded-full animate-spin" />
          <span>Signing in with Google...</span>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show Auth Page first
  if (!currentUser) {
    return (
      <>
        <AuthPage />
        <ResetPasswordModal
          isOpen={resetPasswordModalOpen}
          onClose={() => setResetPasswordModalOpen(false)}
        />
      </>
    );
  }

  // If user account is suspended/banned, show Banned Account View with appeal capability
  if (currentUser.isBanned) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#0c0c10] text-white flex flex-col antialiased selection:bg-[#ff007a] selection:text-white">
        <BannedAccountView />
        <InAppNotificationToast />
        <SupabaseVercelModal
          isOpen={supabaseModalOpen}
          onClose={() => setSupabaseModalOpen(false)}
          onConnected={syncWithSupabase}
        />
        <SwitchAccountModal
          isOpen={switchAccountModalOpen}
          onClose={() => setSwitchAccountModalOpen(false)}
        />
      </div>
    );
  }

  // If logged-in user is an administrator (queried from Supabase), they ONLY have the Admin Dashboard
  if (isAdmin) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#0c0c10] text-white flex flex-col antialiased selection:bg-[#ff007a] selection:text-white">
        <div className="flex-1 h-full overflow-y-auto">
          <AdminDashboardView />
        </div>
        <InAppNotificationToast />
        <SupabaseVercelModal
          isOpen={supabaseModalOpen}
          onClose={() => setSupabaseModalOpen(false)}
          onConnected={syncWithSupabase}
        />
        <SwitchAccountModal
          isOpen={switchAccountModalOpen}
          onClose={() => setSwitchAccountModalOpen(false)}
        />
      </div>
    );
  }

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'home':
      case 'following':
      case 'friends':
        return <HomeFeed />;
      case 'explore':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <ExploreGrid />
          </div>
        );
      case 'live':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <LiveBrowse />
          </div>
        );
      case 'live_viewer':
        return <LiveStreamViewer />;
      case 'live_host_setup':
      case 'live_host_active':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <LiveStreamHostStudio initialMode={activeTab === 'live_host_active' ? 'active' : 'setup'} />
          </div>
        );
      case 'messages':
        return <MessagesView />;
      case 'notifications':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <NotificationsView />
          </div>
        );
      case 'upload':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <UploadView />
          </div>
        );
      case 'profile':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <ProfileView />
          </div>
        );
      case 'edit_profile':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <EditProfileView />
          </div>
        );
      case 'report_history':
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <ReportHistoryView />
          </div>
        );
      default:
        return <HomeFeed />;
    }
  };

  const isLiveStudio = activeTab === 'live_host_setup' || activeTab === 'live_host_active';

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0c0c10] text-white flex flex-col md:flex-row antialiased selection:bg-[#ff007a] selection:text-white">
      {/* Desktop Fixed Sidebar: Hidden in Live Studio Setup & Active Broadcast so workspace is wide */}
      {!isLiveStudio && (
        <div className="hidden md:block h-full shrink-0">
          <Sidebar />
        </div>
      )}

      {/* Slide-over Drawer Navigation: Available on mobile, and on desktop when in Live Studio */}
      {mobileNavOpen && (
        <div className={`fixed inset-0 z-50 flex ${!isLiveStudio ? 'md:hidden' : ''}`}>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0d0d12] h-full shadow-2xl z-10 flex flex-col border-r border-neutral-800">
            {/* Header inside the 3 lines menu drawer: Branded ViralHub Logo + Close button */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800/80 shrink-0">
              <div
                onClick={() => {
                  setMobileNavOpen(false);
                }}
                className="cursor-pointer hover:opacity-90 transition-opacity"
              >
                <ViralHubLogo size="md" />
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer transition-colors"
                title="Close Navigation"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Drawer Body: Navigation Items & Profile */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <Sidebar onNavigate={() => setMobileNavOpen(false)} hideLogo />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Region: Locked Viewport so only the content sub-container scrolls */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <Header onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)} />
        <PreBanWarningBanner />

        <main className="flex-1 min-h-0 overflow-hidden relative flex flex-col z-0">
          {renderActiveTabContent()}
        </main>
      </div>

      {/* Global Modals & Drawers */}
      <InAppNotificationToast />
      <PreBanAppealModal />
      <CommentsDrawer />
      <ReportModals />
      <AudioLibraryModal />
      <SwitchAccountModal
        isOpen={switchAccountModalOpen}
        onClose={() => setSwitchAccountModalOpen(false)}
      />
      <BlockedUsersModal
        isOpen={blockedUsersModalOpen}
        onClose={() => setBlockedUsersModalOpen(false)}
      />
      <ResetPasswordModal
        isOpen={resetPasswordModalOpen}
        onClose={() => setResetPasswordModalOpen(false)}
      />
      <SupabaseVercelModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
        onConnected={syncWithSupabase}
      />

      {/* Account Switching Loading Screen (guarantees switching is never plain) */}
      {switchingAccountTarget && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a10]/95 backdrop-blur-2xl text-white select-none animate-fadeIn">
          {/* Ambient radial glow in brand hot pink */}
          <div className="absolute w-96 h-96 rounded-full bg-[#ff007a]/15 blur-[100px] pointer-events-none animate-pulse" />

          <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-sm">
            <ViralHubLogo size="lg" />

            {/* Glowing Avatar Frame with spinning gradient ring */}
            <div className="relative mt-8 mb-5">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-[#ff007a] via-purple-500 to-cyan-400 animate-spin blur-md opacity-75" />
              <div className="relative p-1 rounded-full bg-[#12121c]">
                <Avatar
                  src={switchingAccountTarget.avatar}
                  alt={switchingAccountTarget.displayName || 'User'}
                  size="xl"
                  className="w-20 h-20 rounded-full border-2 border-white/90 shadow-2xl"
                />
              </div>
            </div>

            <div className="text-xl font-extrabold text-white font-brand drop-shadow">
              {switchingAccountTarget.displayName || 'Creator'}
            </div>
            <div className="text-xs text-pink-400 font-mono mt-0.5">
              @{switchingAccountTarget.username || 'user'}
            </div>

            {/* Loading Badge */}
            <div className="mt-6 flex items-center gap-3 px-5 py-2.5 rounded-full bg-[#161622]/90 border border-neutral-700/80 shadow-2xl backdrop-blur-md">
              <div className="w-4 h-4 border-2 border-[#ff007a] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-white tracking-wide">
                Switching accounts...
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 mt-3 font-medium">
              Preparing your personalized feed & creator studio
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
