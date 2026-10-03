import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import {
  supabaseDb,
  getSupabaseConfig,
  testSupabaseConnection,
  isSameUser,
  toUuid,
} from '../../lib/supabase';
import { formatRealtimeAgo } from '../../utils/time';
import { AdminRecord, SystemStats } from '../../types';
import {
  Shield,
  Users,
  Film,
  Heart,
  MessageSquare,
  Share2,
  AlertTriangle,
  Radio,
  RefreshCw,
  Database,
  Copy,
  Check,
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
  Plus,
  Activity,
  Server,
  Lock,
  Eye,
  Sliders,
  Sparkles,
  Clock,
  LogOut,
  ArrowRightLeft,
  UserCog,
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    reports,
    admins,
    addAdmin,
    removeAdmin,
    deleteUserAdmin,
    updateUserRoleAdmin,
    deleteVideoAdmin,
    deleteCommentAdmin,
    approveVideoAdmin,
    rejectVideoAdmin,
    reviewVideoAppeal,
    updateReportStatusAdmin,
    syncAllToSupabase,
    syncWithSupabase,
    setSupabaseModalOpen,
    navigateToUserProfile,
    setSwitchAccountModalOpen,
    savedAccounts,
    logout,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<
    'overview' | 'users' | 'videos' | 'reports' | 'comments' | 'admins'
  >('overview');

  const [toastMessage, setToastMessage] = useState<string>('');

  // Comments Moderation state
  const [commentSearchQuery, setCommentSearchQuery] = useState('');
  const [commentFilterVideoId, setCommentFilterVideoId] = useState<string>('all');
  const [commentsMap, setCommentsMap] = useState<Record<string, any[]>>(() => {
    try {
      const saved = localStorage.getItem('viralhub_video_comments_v2');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('viralhub_video_comments_v2');
      if (saved) {
        setCommentsMap(JSON.parse(saved));
      }
    } catch {}
  }, [activeAdminTab]);

  const allComments = React.useMemo(() => {
    const list: {
      id: string;
      videoId: string;
      video?: typeof videos[0];
      name: string;
      avatar: string;
      text: string;
      timestamp?: string;
      likesCount?: number;
    }[] = [];

    Object.entries(commentsMap).forEach(([vId, cList]) => {
      const matchedVideo = videos.find(v => v.id === vId || toUuid(v.id) === toUuid(vId));
      if (Array.isArray(cList)) {
        cList.forEach((c: any) => {
          list.push({
            id: c.id,
            videoId: vId,
            video: matchedVideo,
            name: c.name || 'User',
            avatar: c.avatar || '',
            text: c.text || '',
            timestamp: c.timestamp,
            likesCount: c.likesCount || 0,
          });
          if (Array.isArray(c.replies)) {
            c.replies.forEach((r: any) => {
              list.push({
                id: r.id,
                videoId: vId,
                video: matchedVideo,
                name: r.name || 'User',
                avatar: r.avatar || '',
                text: r.text || '',
                timestamp: r.timestamp,
                likesCount: 0,
              });
            });
          }
        });
      }
    });

    return list.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime() || 0;
      const timeB = new Date(b.timestamp || 0).getTime() || 0;
      return timeB - timeA;
    });
  }, [commentsMap, videos]);

  const filteredComments = React.useMemo(() => {
    return allComments.filter(c => {
      if (commentFilterVideoId !== 'all' && c.videoId !== commentFilterVideoId) {
        return false;
      }
      if (commentSearchQuery.trim()) {
        const q = commentSearchQuery.toLowerCase();
        const textMatch = c.text.toLowerCase().includes(q);
        const nameMatch = c.name.toLowerCase().includes(q);
        const videoMatch = c.video?.caption?.toLowerCase().includes(q) || false;
        return textMatch || nameMatch || videoMatch;
      }
      return true;
    });
  }, [allComments, commentFilterVideoId, commentSearchQuery]);

  const handleDeleteCommentAdmin = async (videoId: string, commentId: string) => {
    await deleteCommentAdmin(videoId, commentId);
    setCommentsMap(prev => {
      const updated = { ...prev };
      if (updated[videoId]) {
        updated[videoId] = updated[videoId].filter((c: any) => c.id !== commentId && toUuid(c.id) !== toUuid(commentId));
      }
      return updated;
    });
    setToastMessage('Comment deleted from video and database.');
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Deduplicate users so that even if database had duplicate rows for an email, each unique user account displays once!
  const uniqueUsers = React.useMemo(() => {
    const map = new Map<string, typeof users[0]>();
    for (const u of users) {
      const emailKey = u.email ? u.email.trim().toLowerCase() : u.id;
      if (map.has(emailKey)) {
        const existing = map.get(emailKey)!;
        if (u.role === 'admin' && existing.role !== 'admin') {
          existing.role = 'admin';
        }
        continue;
      }
      map.set(emailKey, u);
    }
    return Array.from(map.values());
  }, [users]);

  const [stats, setStats] = useState<SystemStats>({
    totalUsers: uniqueUsers.length,
    totalVideos: videos.length,
    totalLikes: videos.reduce((acc, v) => acc + (v.likesCount || 0), 0),
    totalComments: videos.reduce((acc, v) => acc + (v.commentsCount || 0), 0),
    totalShares: videos.reduce((acc, v) => acc + (v.sharesCount || 0), 0),
    totalReports: reports.length,
    activeLivestreams: 0,
    totalAdmins: admins.length || 1,
  });

  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingAll, setIsSyncAll] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [videoStatusFilter, setVideoStatusFilter] = useState<'approved' | 'rejected' | 'appeals' | 'all'>('approved');
  const [reportFilter, setReportFilter] = useState<'all' | 'video' | 'user'>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'Under Review' | 'Approved' | 'Rejected'>('all');

  // Video Rejection Modal
  const [rejectingVideoId, setRejectingVideoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Inappropriate visual content or guidelines violation');

  // Add Admin form modal
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'Super Admin' | 'Admin' | 'Content Moderator'>('Admin');

  const supabaseConfig = getSupabaseConfig();

  // Filtered lists
  const filteredUsers = uniqueUsers.filter(
    u =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      await syncWithSupabase();
      const [remoteStats, counts, testRes] = await Promise.all([
        supabaseDb.fetchSystemStats(),
        supabaseDb.fetchAllTableCounts(),
        testSupabaseConnection(),
      ]);

      if (testRes.latencyMs) {
        setConnectionLatency(testRes.latencyMs);
      }

      setStats({
        totalUsers: uniqueUsers.length,
        totalVideos: remoteStats.totalVideos || videos.length,
        totalLikes: remoteStats.totalLikes || videos.reduce((acc, v) => acc + (v.likesCount || 0), 0),
        totalComments: remoteStats.totalComments || videos.reduce((acc, v) => acc + (v.commentsCount || 0), 0),
        totalShares: remoteStats.totalShares || videos.reduce((acc, v) => acc + (v.sharesCount || 0), 0),
        totalReports: remoteStats.totalReports || reports.length,
        activeLivestreams: remoteStats.activeLivestreams,
        totalAdmins: remoteStats.totalAdmins || admins.length || 1,
      });

      setTableCounts(counts);
    } catch (err) {
      console.warn('Failed to load admin stats:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAll = async () => {
    setIsSyncAll(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncAllToSupabase();
      setSyncStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
      await loadData();
    } catch (e: any) {
      setSyncStatusMsg({
        type: 'error',
        text: e?.message || 'Sync failed. Please check Supabase credentials.',
      });
    } finally {
      setIsSyncAll(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUser.trim() || !newAdminEmail.trim()) return;

    await addAdmin({
      username: newAdminUser.trim(),
      email: newAdminEmail.trim(),
      role: newAdminRole,
      permissions:
        newAdminRole === 'Super Admin'
          ? ['manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_database']
          : ['manage_users', 'manage_videos', 'manage_reports'],
    });

    setNewAdminUser('');
    setNewAdminEmail('');
    setShowAddAdminModal(false);
    await loadData();
  };

  // Video counts
  const approvedVideosCount = videos.filter(v => v.status === 'approved' || (!v.status && v.id.startsWith('vid_sample'))).length;
  const rejectedVideosCount = videos.filter(v => v.status === 'rejected').length;
  const pendingAppealsCount = videos.filter(
    v =>
      v.appealStatus === 'pending' ||
      (v.status === 'rejected' && Boolean(v.appealReason && v.appealStatus !== 'declined' && v.appealStatus !== 'approved'))
  ).length;

  const pendingReportsCount = reports.filter(r => r.status === 'Under Review').length;
  const approvedReportsCount = reports.filter(r => r.status === 'Approved').length;
  const rejectedReportsCount = reports.filter(r => r.status === 'Rejected').length;

  const filteredVideos = videos.filter(v => {
    const matchesSearch =
      v.caption.toLowerCase().includes(videoSearch.toLowerCase()) ||
      v.creator.displayName.toLowerCase().includes(videoSearch.toLowerCase()) ||
      v.hashtags.some(tag => tag.toLowerCase().includes(videoSearch.toLowerCase()));
    if (!matchesSearch) return false;

    if (videoStatusFilter === 'approved') {
      return v.status === 'approved' || (!v.status && v.id.startsWith('vid_sample'));
    }
    if (videoStatusFilter === 'rejected') {
      return v.status === 'rejected';
    }
    if (videoStatusFilter === 'appeals') {
      return (
        v.appealStatus === 'pending' ||
        (v.status === 'rejected' && Boolean(v.appealReason && v.appealStatus !== 'declined' && v.appealStatus !== 'approved'))
      );
    }
    return true;
  });

  const filteredReports = reports.filter(r => {
    if (reportFilter !== 'all' && r.type !== reportFilter) return false;
    if (reportStatusFilter !== 'all' && r.status !== reportStatusFilter) return false;
    return true;
  });

  return (
    <div className="min-h-full bg-[#0c0c10] text-white p-4 sm:p-8 space-y-6 select-none max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#ff007a] to-purple-600 text-white shadow-[0_0_20px_rgba(255,0,122,0.4)]">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold font-brand tracking-tight">
                Admin Command Center
              </h1>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#ff007a]/20 text-[#ff007a] border border-[#ff007a]/30">
                System Active
              </span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Real-time synchronization with Supabase PostgreSQL database tables & Vercel deployment
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cloud Sync Status Badge */}
          <div
            onClick={() => setSupabaseModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#161622] border border-neutral-700/80 cursor-pointer hover:border-neutral-500 transition-colors"
            title="Click to configure Supabase URL & Anon Key"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                supabaseConfig.isConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-xs font-semibold text-neutral-200">
              {supabaseConfig.isConnected ? 'Supabase Synced' : 'Offline / Local Persistence'}
            </span>
            {connectionLatency !== null && supabaseConfig.isConnected && (
              <span className="text-[10px] text-emerald-400 font-mono">({connectionLatency}ms)</span>
            )}
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#ff007a]' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white text-xs font-bold shadow-[0_0_15px_rgba(255,0,122,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            <Activity className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>{isSyncingAll ? 'Syncing to Cloud...' : 'Sync All to Supabase'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSwitchAccountModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1d1d2b] hover:bg-[#252538] text-white border border-neutral-700/80 text-xs font-semibold transition-colors cursor-pointer"
            title="Switch between Administrator and Client accounts"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#ff007a]" />
            <span>Switch Account</span>
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer"
            title="Log out of Administrator Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs animate-fadeIn ${
            syncStatusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncStatusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{syncStatusMsg.text}</span>
          </div>
          <button
            onClick={() => setSyncStatusMsg(null)}
            className="text-neutral-400 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* High-Level Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Users */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Users</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalUsers}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Table: "User"</div>
          </div>
        </div>

        {/* Total Videos */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Videos</span>
            <div className="p-2 rounded-xl bg-[#ff007a]/10 text-[#ff007a]">
              <Film className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalVideos}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Table: "Video"</div>
          </div>
        </div>

        {/* Total Likes */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Likes</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalLikes}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Table: "Like"</div>
          </div>
        </div>

        {/* Total Comments */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Comments</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalComments}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Table: "Comment"</div>
          </div>
        </div>

        {/* Moderation Reports */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Reports</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalReports}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">ReportVideo / ReportUser</div>
          </div>
        </div>

        {/* Admin Team */}
        <div className="bg-[#14141e] border border-neutral-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Admins</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white font-brand">{stats.totalAdmins}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Table: "Admin"</div>
          </div>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#1e1e2c] border border-neutral-700 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview & Health', icon: <Activity className="w-4 h-4" /> },
          { id: 'users', label: `Users (${uniqueUsers.length})`, icon: <Users className="w-4 h-4" /> },
          {
            id: 'videos',
            label: pendingAppealsCount > 0 ? `Videos (${videos.length}) · ${pendingAppealsCount} Appeal${pendingAppealsCount > 1 ? 's' : ''}` : `Videos (${videos.length})`,
            icon: <Film className="w-4 h-4" />,
            highlight: pendingAppealsCount > 0,
          },
          {
            id: 'reports',
            label: pendingReportsCount > 0 ? `Reports (${reports.length}) · ${pendingReportsCount} Pending` : `Reports (${reports.length})`,
            icon: <AlertTriangle className="w-4 h-4" />,
            highlight: pendingReportsCount > 0,
          },
          {
            id: 'comments',
            label: allComments.length > 0 ? `Comments (${allComments.length})` : 'Comments',
            icon: <MessageSquare className="w-4 h-4" />,
          },
          { id: 'admins', label: `Admin Team (${admins.length || 1})`, icon: <Shield className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveAdminTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeAdminTab === tab.id
                ? 'bg-[#1e1e2c] text-white border border-neutral-700 shadow-sm text-[#ff007a]'
                : (tab as any).highlight
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-[#151520]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: OVERVIEW & HEALTH */}
      {/* =================================================================== */}
      {activeAdminTab === 'overview' && (
        <div className="space-y-6">
          {/* Creator Appeals Alert Banner */}
          {pendingAppealsCount > 0 && (
            <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 shrink-0">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-brand flex items-center gap-2">
                    <span>{pendingAppealsCount} Creator Appeal{pendingAppealsCount > 1 ? 's' : ''} Awaiting Admin Review</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      Needs Review
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    Creators have submitted appeals for revoked videos requesting reinstatement to the public feed.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveAdminTab('videos');
                  setVideoStatusFilter('appeals');
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shrink-0 cursor-pointer shadow-md transition-all flex items-center gap-1.5"
              >
                <span>Review Creator Appeals</span>
                <span>({pendingAppealsCount}) →</span>
              </button>
            </div>
          )}

          {/* Pending Reports Alert Banner */}
          {pendingReportsCount > 0 && (
            <div className="p-4 sm:p-5 rounded-3xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-brand">
                    {pendingReportsCount} Community Report{pendingReportsCount > 1 ? 's' : ''} Pending Review
                  </h4>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    User and video reports require administrator review to approve violation or dismiss.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveAdminTab('reports');
                  setReportStatusFilter('Under Review');
                }}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-extrabold text-xs shrink-0 cursor-pointer shadow-md transition-all flex items-center gap-1.5"
              >
                <span>Review Reports</span>
                <span>({pendingReportsCount}) →</span>
              </button>
            </div>
          )}
          {/* Administrative Quick Actions Grid */}
          <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-6 sm:p-7 space-y-5">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-brand mb-1">Administrative Actions</h3>
              <p className="text-xs text-neutral-400">Manage user accounts, moderate community content, review flags, and manage system moderators.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => setActiveAdminTab('users')}
                className="flex flex-col justify-between p-5 rounded-2xl bg-[#181824] hover:bg-[#202030] border border-neutral-800/80 hover:border-blue-500/40 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Manage Users</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{uniqueUsers.length} total accounts</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveAdminTab('videos');
                  setVideoStatusFilter('approved');
                }}
                className="flex flex-col justify-between p-5 rounded-2xl bg-[#181824] hover:bg-[#202030] border border-neutral-800/80 hover:border-[#ff007a]/40 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#ff007a]/10 text-[#ff007a] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Moderate Content</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{videos.length} videos · {pendingAppealsCount} appeals</div>
                </div>
              </button>

              <button
                onClick={() => setActiveAdminTab('reports')}
                className="flex flex-col justify-between p-5 rounded-2xl bg-[#181824] hover:bg-[#202030] border border-neutral-800/80 hover:border-amber-500/40 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Pending Reports</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{reports.length} reports · {pendingReportsCount} review</div>
                </div>
              </button>

              <button
                onClick={() => setActiveAdminTab('admins')}
                className="flex flex-col justify-between p-5 rounded-2xl bg-[#181824] hover:bg-[#202030] border border-neutral-800/80 hover:border-purple-500/40 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Admin Team</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{admins.length || 1} administrators</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: USERS MANAGEMENT */}
      {/* =================================================================== */}
      {activeAdminTab === 'users' && (
        <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div>
              <h3 className="text-base font-bold text-white font-brand">User Accounts ({filteredUsers.length})</h3>
              <p className="text-xs text-neutral-400">Users stored in the Supabase "User" table</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search username, name, email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-10 pr-3.5 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Followers</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      No user accounts found matching "{userSearch}".
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-[#171722] transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={u.avatar} alt={u.displayName} size="sm" />
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{u.displayName}</div>
                            <div className="text-[11px] text-neutral-400 truncate">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-neutral-300 font-mono text-[11px]">{u.email || '—'}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={u.role || 'creator'}
                            onChange={async e => {
                              const newRole = e.target.value as 'creator' | 'admin' | 'moderator';
                              if (u.id === currentUser?.id && newRole !== 'admin') {
                                const confirmSelf = window.confirm(
                                  'Are you sure you want to demote your own account from Admin? You will lose access to the Admin Dashboard.'
                                );
                                if (!confirmSelf) return;
                              }
                              await updateUserRoleAdmin(u.id, newRole);
                              setSyncStatusMsg({
                                type: 'success',
                                text: `Role for @${u.username} successfully updated to ${newRole.toUpperCase()}`,
                              });
                              setTimeout(() => setSyncStatusMsg(null), 3500);
                            }}
                            className={`text-xs font-bold py-1 px-2.5 rounded-xl border outline-none cursor-pointer transition-all ${
                              u.role === 'admin'
                                ? 'bg-purple-950/40 text-purple-300 border-purple-500/50 hover:border-purple-400'
                                : u.role === 'moderator'
                                ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/50 hover:border-cyan-400'
                                : 'bg-[#181824] text-neutral-300 border-neutral-700/80 hover:border-neutral-500'
                            }`}
                            title="Admin: Click to change role"
                          >
                            <option value="creator" className="bg-[#14141e] text-white">
                              Creator
                            </option>
                            <option value="moderator" className="bg-[#14141e] text-cyan-300">
                              Moderator
                            </option>
                            <option value="admin" className="bg-[#14141e] text-purple-300">
                              Admin
                            </option>
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-neutral-300">{u.followersCount}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigateToUserProfile(u.id)}
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                            title="View Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              const isTargetClientOnThisDevice = (savedAccounts || []).some(
                                a => isSameUser(a.id, u.id) || (a.email && u.email && a.email.toLowerCase() === u.email.toLowerCase())
                              );
                              const confirmPrompt = window.confirm(
                                `Are you sure you want to permanently delete user @${u.username} (${u.displayName})?\n\n` +
                                `This will remove the user from Supabase, delete all their uploaded videos from the Supabase Storage bucket, and clean up their account across all devices.` +
                                (isTargetClientOnThisDevice ? `\n\n(This client account is logged in/saved on this device and will be removed from your saved accounts).` : '')
                              );
                              if (!confirmPrompt) return;

                              const res = await deleteUserAdmin(u.id);
                              if (res) {
                                setSyncStatusMsg({
                                  type: 'success',
                                  text: `Account @${u.username} successfully deleted from Supabase & all devices.`,
                                });
                                setTimeout(() => setSyncStatusMsg(null), 4000);
                                await loadData();
                              }
                            }}
                            disabled={isSameUser(u.id, currentUser?.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer disabled:opacity-30"
                            title={isSameUser(u.id, currentUser?.id) ? 'Cannot delete active Admin session' : 'Permanently Delete User'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: VIDEOS MODERATION & APPROVAL QUEUE */}
      {/* =================================================================== */}
      {activeAdminTab === 'videos' && (
        <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white font-brand">
                  Video Moderation & Appeals
                </h3>
                {pendingAppealsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold animate-pulse">
                    {pendingAppealsCount} appeal{pendingAppealsCount > 1 ? 's' : ''} awaiting review
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Monitor live community videos, manage guidelines compliance, and review creator moderation appeals.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search caption, creator, hashtag..."
                value={videoSearch}
                onChange={e => setVideoSearch(e.target.value)}
                className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-10 pr-3.5 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
              />
            </div>
          </div>

          {/* Sub-Filter Tabs (Pending Approval removed as requested) */}
          {pendingAppealsCount > 0 && videoStatusFilter !== 'appeals' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span>
                  <strong>{pendingAppealsCount} creator appeal{pendingAppealsCount > 1 ? 's are' : ' is'} waiting for review.</strong> Re-approve or decline creator requests below.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setVideoStatusFilter('appeals')}
                className="py-1 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm"
              >
                Review Appeals Now ({pendingAppealsCount}) →
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'approved', label: `Live & Approved (${approvedVideosCount})` },
              { id: 'rejected', label: `Declined / Revoked (${rejectedVideosCount})` },
              { id: 'appeals', label: `Creator Appeals (${pendingAppealsCount})`, isAlert: pendingAppealsCount > 0 },
              { id: 'all', label: `All Videos (${videos.length})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setVideoStatusFilter(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  videoStatusFilter === tab.id
                    ? 'bg-[#ff007a] text-white shadow-sm'
                    : tab.isAlert
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Video Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.length === 0 ? (
              <div className="col-span-full py-16 text-center text-neutral-400 text-xs space-y-2 bg-[#171724] rounded-2xl border border-neutral-800">
                <Film className="w-8 h-8 mx-auto text-neutral-600 mb-1" />
                <div className="font-semibold text-neutral-300 text-sm">No videos found</div>
                <p className="text-neutral-500 max-w-sm mx-auto">
                  {videoStatusFilter === 'appeals'
                    ? 'There are currently no creator appeals awaiting review.'
                    : `No videos found matching your filter (${videoStatusFilter}).`}
                </p>
              </div>
            ) : (
              filteredVideos.map(video => (
                <div
                  key={video.id}
                  className={`bg-[#181824] border rounded-2xl overflow-hidden flex flex-col justify-between transition-all group ${
                    video.appealStatus === 'pending'
                      ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/40'
                      : video.status === 'rejected'
                      ? 'border-red-500/30 opacity-90'
                      : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="p-3.5 space-y-2.5">
                    {/* Header: Creator & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar src={video.creator.avatar} alt={video.creator.displayName} size="xs" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white truncate block">
                            {video.creator.displayName}
                          </span>
                          <span className="text-[10px] text-neutral-400 truncate block">
                            @{video.creator.username}
                          </span>
                        </div>
                      </div>

                      {/* Status Badges */}
                      {video.appealStatus === 'pending' ||
                      (video.status === 'rejected' &&
                        Boolean(video.appealReason && video.appealStatus !== 'declined' && video.appealStatus !== 'approved')) ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0 animate-pulse">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Appeal Pending</span>
                        </span>
                      ) : video.status === 'approved' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Approved & Live</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                          <XCircle className="w-2.5 h-2.5" />
                          <span>Declined / Revoked</span>
                        </span>
                      )}
                    </div>

                    {/* Video Player Preview */}
                    <div className="aspect-video w-full bg-black rounded-xl overflow-hidden relative border border-neutral-800">
                      <video
                        src={video.mediaUrl}
                        controls
                        className="w-full h-full object-cover"
                        poster={video.thumbnailUrl}
                      />
                    </div>

                    {/* Caption */}
                    <p className="text-xs text-neutral-200 line-clamp-2 leading-relaxed">
                      {video.caption || 'No caption provided'}
                    </p>

                    {/* Appeal details box if appeal is submitted */}
                    {(video.appealStatus === 'pending' ||
                      (video.status === 'rejected' && Boolean(video.appealReason && video.appealStatus !== 'declined'))) && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-amber-300">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Creator Submitted Appeal:</span>
                        </div>
                        <p className="text-[11px] text-neutral-200 italic">"{video.appealReason}"</p>
                      </div>
                    )}

                    {/* Rejection Note if Declined */}
                    {video.status === 'rejected' && video.rejectionReason && (
                      <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
                        <strong>Revocation reason:</strong> {video.rejectionReason}
                      </div>
                    )}

                    {/* Hashtags */}
                    {video.hashtags && video.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {video.hashtags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] text-[#ff007a] bg-[#ff007a]/10 px-2 py-0.5 rounded-full font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Rail & Buttons */}
                  <div className="p-3 border-t border-neutral-800/80 bg-[#14141e] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 text-red-400" /> {video.likesCount}
                        </span>
                        <button
                          onClick={() => {
                            setCommentFilterVideoId(video.id);
                            setActiveAdminTab('comments');
                          }}
                          className="flex items-center gap-1 text-neutral-400 hover:text-cyan-400 cursor-pointer transition-colors"
                          title="Manage comments on this video"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> {video.commentsCount}
                        </button>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-amber-400" /> {video.viewsCount || 0}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {video.createdAt ? String(video.createdAt).slice(0, 10) : ''}
                      </span>
                    </div>

                    {/* Decision Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/40">
                      {video.appealStatus === 'pending' ||
                      (video.status === 'rejected' &&
                        Boolean(video.appealReason && video.appealStatus !== 'declined' && video.appealStatus !== 'approved')) ? (
                        <>
                          <button
                            onClick={() => reviewVideoAppeal(video.id, 'approved')}
                            className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-1 shadow cursor-pointer transition-all"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Approve Appeal</span>
                          </button>
                          <button
                            onClick={() => reviewVideoAppeal(video.id, 'declined')}
                            className="py-1.5 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Decline Appeal</span>
                          </button>
                          <button
                            onClick={() => deleteVideoAdmin(video.id)}
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 cursor-pointer"
                            title="Delete Permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : video.status === 'approved' ? (
                        <>
                          <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Published on Feed</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setRejectingVideoId(video.id);
                                setRejectReason('Post-publication guidelines violation');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-red-500/20 hover:text-red-300 text-neutral-300 text-xs font-medium cursor-pointer transition-colors"
                            >
                              Revoke
                            </button>
                            <button
                              onClick={() => deleteVideoAdmin(video.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 text-xs cursor-pointer"
                              title="Delete Video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Declined</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => approveVideoAdmin(video.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold cursor-pointer"
                            >
                              Re-Approve
                            </button>
                            <button
                              onClick={() => deleteVideoAdmin(video.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 text-xs cursor-pointer"
                              title="Delete Video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: MODERATION REPORTS */}
      {/* =================================================================== */}
      {activeAdminTab === 'reports' && (
        <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-brand">
                  Community Reports ({filteredReports.length})
                </h3>
                {pendingReportsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold">
                    {pendingReportsCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Community reports submitted for videos and user accounts. Review and update report status.
              </p>
            </div>

            {/* Type Filters */}
            <div className="flex items-center gap-1.5">
              {(['all', 'video', 'user'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    reportFilter === f
                      ? 'bg-[#ff007a] text-white shadow-sm'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'All Types' : `${f} reports`}
                </button>
              ))}
            </div>
          </div>

          {/* Status Sub-Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: `All Reports (${reports.length})` },
              { id: 'Under Review', label: `Pending / Under Review (${pendingReportsCount})` },
              { id: 'Approved', label: `Action Taken / Approved (${approvedReportsCount})` },
              { id: 'Rejected', label: `Dismissed (${rejectedReportsCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setReportStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  reportStatusFilter === tab.id
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-neutral-800/80 text-neutral-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredReports.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs bg-[#171724] rounded-2xl border border-neutral-800">
                No moderation reports matching this filter.
              </div>
            ) : (
              filteredReports.map(report => (
                <div
                  key={report.id}
                  className="p-4 rounded-2xl bg-[#181824] border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-neutral-700 transition-colors"
                >
                  <div className="space-y-1.5 text-xs flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          report.type === 'video'
                            ? 'bg-[#ff007a]/15 text-[#ff007a] border border-[#ff007a]/30'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {report.type} report
                      </span>
                      <span className="font-bold text-white text-sm">{report.targetName}</span>
                      <span className="text-[11px] text-neutral-400">· {report.timestamp}</span>

                      {/* Current Status */}
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                          report.status === 'Approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : report.status === 'Rejected'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        Status: {report.status === 'Rejected' ? 'Declined' : report.status}
                      </span>
                    </div>

                    <div className="text-neutral-300">
                      <strong>Violation Reason:</strong> {report.scenario}
                      {report.description && <span className="text-neutral-400"> — "{report.description}"</span>}
                    </div>

                    {report.targetSubtitle && (
                      <div className="text-neutral-400 text-[11px]">
                        Target Details: {report.targetSubtitle}
                      </div>
                    )}
                  </div>

                  {/* Admin Resolution Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Approve Violation & Take Action */}
                    <button
                      onClick={async () => {
                        await updateReportStatusAdmin(report.id, report.type, 'Approved');
                        if (report.type === 'video') {
                          deleteVideoAdmin(report.targetId);
                        } else if (report.type === 'user') {
                          deleteUserAdmin(report.targetId);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      title={report.type === 'video' ? 'Approve & Take Down Video' : 'Approve & Ban User'}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{report.type === 'video' ? 'Approve & Remove Video' : 'Approve & Ban User'}</span>
                    </button>

                    {/* Mark Under Review */}
                    {report.status !== 'Under Review' && (
                      <button
                        onClick={() => updateReportStatusAdmin(report.id, report.type, 'Under Review')}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-medium text-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Under Review</span>
                      </button>
                    )}

                    {/* Dismiss / Decline Report */}
                    {report.status !== 'Rejected' && (
                      <button
                        onClick={() => updateReportStatusAdmin(report.id, report.type, 'Rejected')}
                        className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1 border border-red-500/30"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Decline Report</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Video Rejection Modal */}
      {rejectingVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setRejectingVideoId(null)} />
          <div className="relative w-full max-w-md bg-[#14141e] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-left space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span>Decline Video Upload</span>
              </h3>
              <button
                onClick={() => setRejectingVideoId(null)}
                className="text-neutral-400 hover:text-white p-1 text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300">
              Specify the reason for declining this video upload. The creator will see this status on their profile.
            </p>

            {/* Quick Reason buttons */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Quick Reasons:
              </label>
              {[
                'Inappropriate visual content or guidelines violation',
                'Copyrighted music or intellectual property infringement',
                'Harassment, bullying, or hate speech',
                'Spam, misleading, or low-quality content',
                'Violence or dangerous activities depicted',
              ].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRejectReason(r)}
                  className={`w-full text-left p-2 rounded-xl text-xs transition-colors cursor-pointer border ${
                    rejectReason === r
                      ? 'bg-red-500/15 border-red-500/40 text-red-300 font-semibold'
                      : 'bg-[#1b1b26] border-neutral-800 text-neutral-300 hover:bg-[#222232]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">
                Custom Note / Reason:
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={2}
                className="w-full bg-[#1b1b26] border border-neutral-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-red-500"
                placeholder="Enter reason for declining..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setRejectingVideoId(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await rejectVideoAdmin(rejectingVideoId, rejectReason);
                  setRejectingVideoId(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4.5: COMMENTS MODERATION */}
      {/* =================================================================== */}
      {activeAdminTab === 'comments' && (
        <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-5 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div>
              <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#ff007a]" />
                <span>Comments Moderation & Clean-up</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Review and delete user comments across all videos. Deleted comments are immediately removed from feed and database.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-neutral-800 text-xs font-semibold text-neutral-300">
                Total Comments: <strong className="text-white">{allComments.length}</strong>
              </span>
            </div>
          </div>

          {/* Search & Video Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={commentSearchQuery}
                onChange={e => setCommentSearchQuery(e.target.value)}
                placeholder="Search comments by text, author, or video caption..."
                className="w-full bg-[#181824] text-xs text-white pl-10 pr-4 py-2.5 rounded-xl border border-neutral-800 focus:border-[#ff007a] outline-none"
              />
              {commentSearchQuery && (
                <button
                  onClick={() => setCommentSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={commentFilterVideoId}
                onChange={e => setCommentFilterVideoId(e.target.value)}
                className="bg-[#181824] border border-neutral-800 text-xs text-neutral-200 px-3 py-2.5 rounded-xl outline-none focus:border-[#ff007a]"
              >
                <option value="all">All Videos ({allComments.length})</option>
                {videos.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.caption ? (v.caption.length > 30 ? `${v.caption.slice(0, 30)}...` : v.caption) : `Video ${v.id.slice(0, 8)}`} ({v.commentsCount || 0})
                  </option>
                ))}
              </select>

              {commentFilterVideoId !== 'all' && (
                <button
                  onClick={() => setCommentFilterVideoId('all')}
                  className="px-2.5 py-2 rounded-xl bg-neutral-800 text-[11px] text-neutral-300 hover:text-white cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-3">
            {filteredComments.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 bg-[#161622] rounded-2xl border border-neutral-800">
                {allComments.length === 0
                  ? 'No comments currently posted across videos.'
                  : 'No comments match your search filter.'}
              </div>
            ) : (
              filteredComments.map(comment => (
                <div
                  key={`${comment.videoId}_${comment.id}`}
                  className="p-4 rounded-2xl bg-[#181824] border border-neutral-800 hover:border-neutral-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar src={comment.avatar} alt={comment.name} size="sm" className="shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{comment.name}</span>
                        {comment.timestamp && (
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {formatRealtimeAgo(comment.timestamp)}
                          </span>
                        )}
                        {comment.video && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 truncate max-w-xs">
                            on "{comment.video.caption ? comment.video.caption.slice(0, 25) : 'Video'}"
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-200 mt-1 break-words font-sans bg-[#13131c] p-2.5 rounded-xl border border-neutral-800/80">
                        "{comment.text}"
                      </p>
                    </div>
                  </div>

                  {/* Delete Comment Action */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleDeleteCommentAdmin(comment.videoId, comment.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold cursor-pointer transition-colors shadow-sm"
                      title="Permanently delete this comment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Comment</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: ADMIN TEAM */}
      {/* =================================================================== */}
      {activeAdminTab === 'admins' && (
        <div className="bg-[#13131c] border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div>
              <h3 className="text-base font-bold text-white font-brand">Administrator Roles & Privileges</h3>
              <p className="text-xs text-neutral-400">
                Team accounts with administrative access stored in Supabase "Admin" table
              </p>
            </div>
            <button
              onClick={() => setShowAddAdminModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-colors cursor-pointer shadow-sm w-fit"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Admin</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {admins.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#181824] border border-neutral-800 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{currentUser?.displayName || 'Primary Admin'}</div>
                    <div className="text-xs text-neutral-400">{currentUser?.email || 'admin@viralhub.app'}</div>
                  </div>
                </div>
                <div className="text-[11px] text-purple-300 font-semibold pt-1">Role: Super Admin</div>
                <div className="text-[10px] text-neutral-400">Full system & database permissions</div>
              </div>
            ) : (
              admins.map(adm => (
                <div
                  key={adm.adminId}
                  className="p-4 rounded-2xl bg-[#181824] border border-neutral-800 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{adm.username}</div>
                        <div className="text-xs text-neutral-400">{adm.email}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {adm.role}
                    </span>
                  </div>

                  <div className="text-[11px] text-neutral-400">
                    <strong>Permissions:</strong>{' '}
                    {Array.isArray(adm.permissions) ? adm.permissions.join(', ') : 'all'}
                  </div>

                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
                    <span>Added: {adm.createdAt?.slice(0, 10) || 'Recent'}</span>
                    <button
                      onClick={() => removeAdmin(adm.adminId)}
                      className="text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}



      {/* Add Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#14141e] border border-neutral-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white font-brand flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#ff007a]" />
                <span>Add New Administrator</span>
              </h3>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Admin Username</label>
                <input
                  type="text"
                  placeholder="e.g. admin_jervin"
                  value={newAdminUser}
                  onChange={e => setNewAdminUser(e.target.value)}
                  className="w-full bg-[#181824] px-3.5 py-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                  required
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Admin Email</label>
                <input
                  type="email"
                  placeholder="e.g. admin@viralhub.app"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  className="w-full bg-[#181824] px-3.5 py-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                  required
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Administrative Role</label>
                <select
                  value={newAdminRole}
                  onChange={e => setNewAdminRole(e.target.value as any)}
                  className="w-full bg-[#181824] px-3.5 py-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                >
                  <option value="Super Admin">Super Admin (All permissions & database)</option>
                  <option value="Admin">Admin (Users, videos, and reports)</option>
                  <option value="Content Moderator">Content Moderator (Videos & reports)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold"
                >
                  Save Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
