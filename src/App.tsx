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
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { BannedAccountView } from './components/auth/BannedAccountView';
import { InAppNotificationToast } from './components/notifications/InAppNotificationToast';
import { X } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentUser,
    activeTab,
    supabaseModalOpen,
    setSupabaseModalOpen,
    syncWithSupabase,
    isAdmin,
    switchAccountModalOpen,
    setSwitchAccountModalOpen,
  } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // If user is not authenticated, show Auth Page first
  if (!currentUser) {
    return <AuthPage />;
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
        return (
          <div className="flex-1 h-full overflow-y-auto">
            <LiveStreamHostStudio initialMode="setup" />
          </div>
        );
      case 'live_host_active':
        return <LiveStreamHostStudio initialMode="active" />;
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

  const isLiveStudioSetup = activeTab === 'live_host_setup';

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0c0c10] text-white flex flex-col md:flex-row antialiased selection:bg-[#ff007a] selection:text-white">
      {/* Desktop Fixed Sidebar: Hidden in Live Studio Setup so workspace is wide */}
      {!isLiveStudioSetup && (
        <div className="hidden md:block h-full shrink-0">
          <Sidebar />
        </div>
      )}

      {/* Slide-over Drawer Navigation: Available on mobile, and on desktop when in Live Studio Setup */}
      {mobileNavOpen && (
        <div className={`fixed inset-0 z-50 flex ${!isLiveStudioSetup ? 'md:hidden' : ''}`}>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 bg-[#0d0d12] h-full shadow-2xl z-10 flex flex-col border-r border-neutral-800">
            <div className="absolute top-4 right-4 z-20">
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer"
                title="Close Navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Region: Locked Viewport so only the content sub-container scrolls */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)} />

        <main className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {renderActiveTabContent()}
        </main>
      </div>

      {/* Global Modals & Drawers */}
      <InAppNotificationToast />
      <CommentsDrawer />
      <ReportModals />
      <AudioLibraryModal />
      <SwitchAccountModal
        isOpen={switchAccountModalOpen}
        onClose={() => setSwitchAccountModalOpen(false)}
      />
      <SupabaseVercelModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
        onConnected={syncWithSupabase}
      />
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

