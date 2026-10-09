import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import {
  supabaseDb,
  isSameUser,
  toUuid,
} from '../../lib/supabase';
import { getCuratedCoverForTrack, resolveTrackCover, isDeprecatedDefaultTrack } from '../../utils/audio';
import { AudioTrack, SystemStats } from '../../types';
import {
  Shield,
  ShieldAlert,
  FileText,
  Users,
  Film,
  AlertTriangle,
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
  Plus,
  Activity,
  Lock,
  Eye,
  Clock,
  LogOut,
  ArrowRightLeft,
  Ban,
  UserCheck,
  Check,
  Music,
  Play,
  Pause,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Database,
  Copy,
  ExternalLink,
  Info,
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    audioTracks,
    audioTracksList,
    addAudioTrack,
    deleteAudioTrack,
    reports,
    admins,
    addAdmin,
    removeAdmin,
    deleteUserAdmin,
    banUserAdmin,
    unbanUserAdmin,
    reviewUserAppeal,
    updateUserRoleAdmin,
    deleteVideoAdmin,
    approveVideoAdmin,
    rejectVideoAdmin,
    reviewVideoAppeal,
    updateReportStatusAdmin,
    warnLiveHostAdmin,
    removeActiveLiveStream,
    issueUserWarningAdmin,
    resolvePreBanAppealAdmin,
    syncWithSupabase,
    navigateToUserProfile,
    setSwitchAccountModalOpen,
    savedAccounts,
    logout,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<
    'overview' | 'users' | 'videos' | 'audio' | 'reports' | 'admins'
  >('overview');

  // Status feedback toast message
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setFeedbackToast({ type, text });
    setTimeout(() => {
      setFeedbackToast(prev => (prev?.text === text ? null : prev));
    }, 3800);
  };

  // Deduplicate users by email or ID
  const uniqueUsers = useMemo(() => {
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

  // System stats (Likes and Comments removed as requested)
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: uniqueUsers.length,
    totalVideos: videos.length,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalReports: reports.length,
    activeLivestreams: 0,
    totalAdmins: admins.length || 1,
    totalAudioTracks: audioTracks.length,
  });

  // Automatic Background Synchronization (Lightweight, IOPS-safe)
  const isSyncingRef = useRef(false);
  const autoSyncQuietly = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      await syncWithSupabase();
      const remoteStats = await supabaseDb.fetchSystemStats(false);
      setStats({
        totalUsers: uniqueUsers.length,
        totalVideos: remoteStats.totalVideos || videos.length,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalReports: remoteStats.totalReports || reports.length,
        activeLivestreams: remoteStats.activeLivestreams,
        totalAdmins: remoteStats.totalAdmins || admins.length || 1,
        totalAudioTracks: remoteStats.totalAudioTracks || audioTracks.length,
      });
    } catch {
      // Quiet background fallback
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Run initial sync on mount and low-frequency background check
  useEffect(() => {
    autoSyncQuietly();
    const interval = setInterval(autoSyncQuietly, 90000);
    return () => clearInterval(interval);
  }, []);

  // Update stats dynamically when local state changes
  useEffect(() => {
    setStats(prev => ({
      ...prev,
      totalUsers: uniqueUsers.length,
      totalVideos: videos.length,
      totalReports: reports.length,
      totalAdmins: admins.length || 1,
      totalAudioTracks: audioTracks.length,
    }));
  }, [uniqueUsers.length, videos.length, reports.length, admins.length, audioTracks.length]);

  // Filters & Search
  const [userSearch, setUserSearch] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [videoStatusFilter, setVideoStatusFilter] = useState<'approved' | 'rejected' | 'appeals' | 'all'>('approved');
  const [reportFilter, setReportFilter] = useState<'all' | 'video' | 'user' | 'live_stream'>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<
    'all' | 'Under Review' | 'Warning Issued' | 'Appeal Submitted' | 'Approved' | 'Rejected'
  >('all');

  // Audio Tab Filters & State
  const [audioSearch, setAudioSearch] = useState('');
  const [audioCategoryFilter, setAudioCategoryFilter] = useState<string>('all');
  const [audioSourceFilter, setAudioSourceFilter] = useState<'all' | 'curated' | 'video'>('all');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Audio Modal
  const [showAddAudioModal, setShowAddAudioModal] = useState(false);
  const [newAudioTitle, setNewAudioTitle] = useState('');
  const [newAudioArtist, setNewAudioArtist] = useState('');
  const [newAudioCategory, setNewAudioCategory] = useState('Trending');
  const [newAudioDuration, setNewAudioDuration] = useState('00:30');
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>('');
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>('');
  const [isAudioPreviewPlaying, setIsAudioPreviewPlaying] = useState<boolean>(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);

  // Modals for Moderation
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [banningUser, setBanningUser] = useState<{ id: string; username: string; displayName: string } | null>(null);
  const [banCustomReason, setBanCustomReason] = useState('Violation of Community Guidelines');
  const [banModeChoice, setBanModeChoice] = useState<'warning_first' | 'direct_ban'>('warning_first');
  const [rejectingVideoId, setRejectingVideoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Inappropriate visual content or guidelines violation');

  // Pre-Ban Warning Modal
  const [warningModalData, setWarningModalData] = useState<{
    userId: string;
    username: string;
    displayName: string;
    reportId?: string;
    defaultReason?: string;
  } | null>(null);
  const [warningReasonText, setWarningReasonText] = useState('Violation of Community Guidelines');
  const [warningHours, setWarningHours] = useState(24);
  const [isSubmittingWarning, setIsSubmittingWarning] = useState(false);

  // Reviewing User Pre-Ban Appeal & Proofs Modal
  const [reviewingProofModal, setReviewingProofModal] = useState<{
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
    statement: string;
    proofUrl?: string;
    proofName?: string;
    submittedAt?: string;
    reportId?: string;
  } | null>(null);

  // In-app Confirmation Modal (replaces browser window.confirm to support iframes safely)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // Add Admin Modal
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);

  // Filtered lists
  const filteredUsers = uniqueUsers.filter(
    u =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const approvedVideosCount = videos.filter(
    v => v.status === 'approved' || (!v.status && v.id.startsWith('vid_sample'))
  ).length;
  const rejectedVideosCount = videos.filter(v => v.status === 'rejected').length;
  const pendingAppealsCount = videos.filter(
    v =>
      v.appealStatus === 'pending' ||
      (v.status === 'rejected' &&
        Boolean(v.appealReason && v.appealStatus !== 'declined' && v.appealStatus !== 'approved'))
  ).length;

  const pendingReportsCount = reports.filter(r => r.status === 'Under Review').length;
  const warningReportsCount = reports.filter(r => r.status === 'Warning Issued').length;
  const appealsSubmittedCount = reports.filter(r => r.status === 'Appeal Submitted').length;
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
        (v.status === 'rejected' &&
          Boolean(v.appealReason && v.appealStatus !== 'declined' && v.appealStatus !== 'approved'))
      );
    }
    return true;
  });

  const filteredReports = reports.filter(r => {
    if (reportFilter !== 'all' && r.type !== reportFilter) return false;
    if (reportStatusFilter !== 'all' && r.status !== reportStatusFilter) return false;
    return true;
  });

  // Filtered audio tracks
  const filteredAudioTracks = audioTracks.filter(track => {
    if (isDeprecatedDefaultTrack(track)) return false;
    const isVideoSound = Boolean(track.sourceVideoId || track.title.toLowerCase().startsWith('original sound'));
    if (audioSourceFilter === 'curated' && isVideoSound) return false;
    if (audioSourceFilter === 'video' && !isVideoSound) return false;

    if (audioCategoryFilter !== 'all') {
      const cat = (track.category || 'Trending').toLowerCase();
      if (cat !== audioCategoryFilter.toLowerCase()) return false;
    }

    if (!audioSearch.trim()) return true;
    const q = audioSearch.toLowerCase().trim();
    return (
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      (track.sourceUsername && track.sourceUsername.toLowerCase().includes(q))
    );
  });

  // Audio Playback Preview
  const togglePlayTrack = (track: AudioTrack) => {
    if (!audioPlayerRef.current) return;

    if (playingTrackId === track.id) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    } else {
      if (track.audioUrl) {
        audioPlayerRef.current.src = track.audioUrl;
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current
          .play()
          .then(() => setPlayingTrackId(track.id))
          .catch(() => setPlayingTrackId(track.id));
      } else {
        setPlayingTrackId(track.id);
      }
    }
  };

  // Automatically sync any existing local curated tracks (e.g. "Sunova Heroes" by Jervin)
  // straight into Supabase AudioLibrary in the background - completely automatic with 0 Disk IO impact!
  useEffect(() => {
    if (!audioTracksList || audioTracksList.length === 0) return;
    const syncExistingCuratedTracks = async () => {
      for (const track of audioTracksList) {
        if (track.sourceVideoId || track.title.toLowerCase().startsWith('original sound')) continue;
        if (isDeprecatedDefaultTrack(track)) continue;
        try {
          await supabaseDb.insertAudioTrack(track);
        } catch {
          // background sync
        }
      }
    };
    syncExistingCuratedTracks();
  }, [audioTracksList.length]);

  // Handle Add Audio Form
  const handleCreateAudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAudioTitle.trim() || !newAudioArtist.trim()) {
      showToast('Please provide a track title and artist name.', 'error');
      return;
    }

    if (!selectedAudioFile && !audioPreviewUrl) {
      showToast('Please select an audio file (.mp3, .wav).', 'error');
      return;
    }

    setIsUploadingAudio(true);
    try {
      let finalAudioUrl = '';
      let finalCoverUrl = '';
      let storageAudioUploaded = false;
      let storageUploadError = '';

      // 1. Upload audio file to Supabase Storage (bucket 'audio')
      if (selectedAudioFile) {
        const uploadRes = await supabaseDb.uploadAudioFile(selectedAudioFile);
        if (uploadRes.url) {
          finalAudioUrl = uploadRes.url;
          storageAudioUploaded = true;
        } else {
          finalAudioUrl = audioPreviewUrl || URL.createObjectURL(selectedAudioFile);
          storageUploadError = uploadRes.error || 'Storage upload failed';
          if (uploadRes.error) {
            console.warn('[Admin Audio] Storage upload note:', uploadRes.error);
          }
        }
      }

      // 2. Upload cover image to Supabase Storage
      if (selectedCoverFile) {
        const coverRes = await supabaseDb.uploadAudioCover(selectedCoverFile);
        if (coverRes.url) {
          finalCoverUrl = coverRes.url;
        } else {
          finalCoverUrl = coverPreviewUrl || URL.createObjectURL(selectedCoverFile);
        }
      }

      // Fallback default audio URL if none provided
      if (!finalAudioUrl) {
        finalAudioUrl = 'https://actions.google.com/sounds/v1/science_fiction/alien_beacon.ogg';
      }

      // Fallback default cover artwork (generates beautiful themed artwork)
      if (!finalCoverUrl) {
        finalCoverUrl = getCuratedCoverForTrack(newAudioTitle.trim(), newAudioArtist.trim(), newAudioCategory);
      }

      const newTrack: Omit<AudioTrack, 'id'> = {
        title: newAudioTitle.trim(),
        artist: newAudioArtist.trim(),
        category: newAudioCategory || 'Trending',
        duration: newAudioDuration.trim() || '00:30',
        audioUrl: finalAudioUrl,
        coverUrl: finalCoverUrl,
        useCount: 0,
      };

      // Automatically saves locally AND automatically records into Supabase AudioLibrary table
      const savedResult = await addAudioTrack(newTrack);
      const dbSuccess = savedResult?.dbSuccess;
      const dbError = savedResult?.dbError;

      if (storageAudioUploaded && dbSuccess) {
        showToast(`Track "${newAudioTitle.trim()}" successfully recorded to Supabase AudioLibrary and Storage bucket! 🎉`);
      } else if (storageAudioUploaded && !dbSuccess) {
        showToast(`Audio stored in Supabase Storage. AudioLibrary table notice: ${dbError || 'check table RLS policies'}`);
      } else if (!storageAudioUploaded && dbSuccess) {
        if (storageUploadError.includes('RLS') || storageUploadError.includes('policy')) {
          showToast(`Track saved to AudioLibrary table! Storage bucket "audio" requires an INSERT policy on storage.objects.`);
        } else {
          showToast(`Track recorded to AudioLibrary! Storage note: ${storageUploadError}`);
        }
      } else {
        showToast(`Track saved locally. Supabase note: ${storageUploadError || dbError || 'verify Supabase storage and table policies.'}`);
      }

      // Reset form
      setNewAudioTitle('');
      setNewAudioArtist('');
      setNewAudioCategory('Trending');
      setNewAudioDuration('00:30');
      setSelectedAudioFile(null);
      setSelectedCoverFile(null);
      setCoverPreviewUrl('');
      setAudioPreviewUrl('');
      setIsAudioPreviewPlaying(false);
      if (modalAudioRef.current) {
        modalAudioRef.current.pause();
      }
      setShowAddAudioModal(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save audio track', 'error');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleDeleteAudio = async (track: AudioTrack) => {
    const isCurated = audioTracksList.some(t => t.id === track.id);
    if (!isCurated) {
      showToast('This sound is extracted from a video and cannot be deleted directly.', 'info');
      return;
    }

    setConfirmModal({
      title: 'Delete Audio Track',
      message: `Are you sure you want to delete "${track.title}" by ${track.artist}? This will remove it from the sound picker across all users.`,
      confirmText: 'Delete Track',
      isDanger: true,
      onConfirm: async () => {
        if (playingTrackId === track.id && audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          setPlayingTrackId(null);
        }
        await deleteAudioTrack(track.id);
        showToast(`Track "${track.title}" deleted.`);
      },
    });
  };

  const handleAudioFileSelection = (file: File) => {
    if (!file) return;
    setSelectedAudioFile(file);
    if (!newAudioTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setNewAudioTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }
    const tempUrl = URL.createObjectURL(file);
    setAudioPreviewUrl(tempUrl);
    setIsAudioPreviewPlaying(false);
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      modalAudioRef.current.src = tempUrl;
    }

    try {
      const audioObj = new Audio(tempUrl);
      audioObj.onloadedmetadata = () => {
        const secs = Math.round(audioObj.duration);
        if (!isNaN(secs) && secs > 0) {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          setNewAudioDuration(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        }
      };
    } catch {
      // fallback
    }
  };

  const handleCoverFileSelection = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP).', 'error');
      return;
    }
    setSelectedCoverFile(file);
    const objectUrl = URL.createObjectURL(file);
    setCoverPreviewUrl(objectUrl);
  };

  const toggleModalAudioPlayback = () => {
    if (!modalAudioRef.current || !audioPreviewUrl) return;
    if (isAudioPreviewPlaying) {
      modalAudioRef.current.pause();
      setIsAudioPreviewPlaying(false);
    } else {
      modalAudioRef.current.src = audioPreviewUrl;
      modalAudioRef.current
        .play()
        .then(() => setIsAudioPreviewPlaying(true))
        .catch(() => setIsAudioPreviewPlaying(false));
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUser.trim() || !newAdminEmail.trim() || isSubmittingAdmin) return;

    setIsSubmittingAdmin(true);
    try {
      const ok = await addAdmin({
        username: newAdminUser.trim(),
        email: newAdminEmail.trim(),
        role: 'Admin',
        permissions: ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
      });

      if (ok) {
        setNewAdminUser('');
        setNewAdminEmail('');
        setShowAddAdminModal(false);
        showToast(`Administrator @${newAdminUser.trim()} added and connected to Supabase.`);
      } else {
        showToast(`Could not add administrator. Please check your connection.`, 'error');
      }
    } catch {
      showToast(`Error adding administrator.`, 'error');
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  const audioCategories = [
    'Trending',
    'Electronic',
    'Hip Hop',
    'Pop',
    'Lo-Fi',
    'Rock',
    'Cinematic',
    'Meme / Sound FX',
  ];

  return (
    <div className="min-h-full bg-neutral-950 text-white p-4 sm:p-6 lg:p-8 select-none">
      {/* Hidden audio element for track playback */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setPlayingTrackId(null)}
        onError={() => setPlayingTrackId(null)}
      />

      {/* Floating Status Notification Toast */}
      {feedbackToast && (
        <div className="fixed top-5 right-5 z-50 animate-fadeIn flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-semibold bg-neutral-900/95 border-neutral-700 text-white">
          {feedbackToast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {feedbackToast.type === 'error' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
          {feedbackToast.type === 'info' && <Sparkles className="w-4 h-4 text-[#ff007a] shrink-0" />}
          <span>{feedbackToast.text}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* ================================================================= */}
        {/* OLD UI HEADER (With 'Supabase Synced' & 'Sync all' removed)       */}
        {/* ================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#ff007a] to-[#7928ca] text-white shadow-lg shadow-[#ff007a]/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-brand tracking-tight text-white flex items-center gap-2">
                <span>ADMIN COMMAND CENTER</span>
              </h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                Platform moderation, community controls & metrics
              </p>
            </div>
          </div>

          {/* Admin Profile & Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800">
              <Avatar
                src={currentUser?.avatar}
                alt={currentUser?.displayName || 'Admin'}
                size="xs"
              />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight">
                  {currentUser?.displayName || 'Administrator'}
                </div>
                <div className="text-[10px] text-neutral-400">
                  @{currentUser?.username || 'admin'}
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Admin
              </span>
            </div>

            {/* Switch Account */}
            <button
              type="button"
              onClick={() => setSwitchAccountModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-800 text-xs font-semibold transition-colors cursor-pointer"
              title="Switch user accounts"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#ff007a]" />
              <span className="hidden sm:inline">Switch</span>
            </button>

            {/* Log Out */}
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 text-xs font-semibold transition-colors cursor-pointer"
              title="End administrative session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* STATS CARDS (Likes and Comments removed; Audio added)             */}
        {/* ================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Total Users */}
          <div
            onClick={() => setActiveAdminTab('users')}
            className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 hover:border-neutral-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Users</span>
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-brand tabular-nums">
              {stats.totalUsers}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Registered Accounts</div>
          </div>

          {/* Total Videos */}
          <div
            onClick={() => {
              setActiveAdminTab('videos');
              setVideoStatusFilter('approved');
            }}
            className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 hover:border-neutral-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Videos</span>
              <div className="p-2 rounded-xl bg-[#ff007a]/15 text-[#ff007a] group-hover:scale-110 transition-transform">
                <Film className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-brand tabular-nums">
              {stats.totalVideos}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Catalog Videos</div>
          </div>

          {/* Audio Library (Requested Feature) */}
          <div
            onClick={() => setActiveAdminTab('audio')}
            className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 hover:border-neutral-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Audio Tracks</span>
              <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 group-hover:scale-110 transition-transform">
                <Music className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-brand tabular-nums">
              {audioTracks.length}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Sound Library</div>
          </div>

          {/* Platform Reports */}
          <div
            onClick={() => {
              setActiveAdminTab('reports');
              setReportStatusFilter('Under Review');
            }}
            className={`border rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group ${
              pendingReportsCount > 0
                ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500/60'
                : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Reports</span>
              <div
                className={`p-2 rounded-xl ${
                  pendingReportsCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-800 text-neutral-400'
                } group-hover:scale-110 transition-transform`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-brand tabular-nums">
              {reports.length}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              {pendingReportsCount > 0 ? (
                <span className="text-amber-400 font-semibold">{pendingReportsCount} Pending Review</span>
              ) : (
                'All Handled'
              )}
            </div>
          </div>

          {/* Platform Admins */}
          <div
            onClick={() => setActiveAdminTab('admins')}
            className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 hover:border-neutral-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Admins</span>
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 group-hover:scale-110 transition-transform">
                <Shield className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-brand tabular-nums">
              {admins.length || 1}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Active Roles</div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TABS NAVIGATION (Familiar Old UI Pill Tabs + Audio Tab)           */}
        {/* ================================================================= */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
            { id: 'users', label: `Users (${uniqueUsers.length})`, icon: <Users className="w-4 h-4" /> },
            {
              id: 'videos',
              label: pendingAppealsCount > 0 ? `Videos (${videos.length})` : `Videos (${videos.length})`,
              icon: <Film className="w-4 h-4" />,
              badge: pendingAppealsCount > 0 ? `${pendingAppealsCount} Appeal` : undefined,
            },
            {
              id: 'audio',
              label: `Audio (${audioTracks.length})`,
              icon: <Music className="w-4 h-4" />,
            },
            {
              id: 'reports',
              label: `Reports (${reports.length})`,
              icon: <AlertTriangle className="w-4 h-4" />,
              badge: pendingReportsCount > 0 ? `${pendingReportsCount}` : undefined,
            },
            { id: 'admins', label: `Admins (${admins.length || 1})`, icon: <Shield className="w-4 h-4" /> },
          ].map(tab => {
            const isActive = activeAdminTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveAdminTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#ff007a] text-white shadow-lg shadow-[#ff007a]/25'
                    : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-white text-black' : 'bg-amber-500 text-black'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW                                                     */}
        {/* =================================================================== */}
        {activeAdminTab === 'overview' && (
          <div className="space-y-6">
            {/* Creator Appeals Banner if pending */}
            {pendingAppealsCount > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white font-brand">
                      {pendingAppealsCount} Creator Appeal{pendingAppealsCount > 1 ? 's' : ''} Awaiting Review
                    </h2>
                    <p className="text-xs text-neutral-300 mt-0.5">
                      Creators submitted appeals for revoked content requesting reinstatement to the feed.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveAdminTab('videos');
                    setVideoStatusFilter('appeals');
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shrink-0 cursor-pointer shadow-sm transition-all"
                >
                  Review Appeals ({pendingAppealsCount}) →
                </button>
              </div>
            )}

            {/* Pending Reports Alert Banner if pending */}
            {pendingReportsCount > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white font-brand">
                      {pendingReportsCount} Community Report{pendingReportsCount > 1 ? 's' : ''} Pending Action
                    </h2>
                    <p className="text-xs text-neutral-300 mt-0.5">
                      Flagged videos and user accounts require administrator review to enforce guidelines.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveAdminTab('reports');
                    setReportStatusFilter('Under Review');
                  }}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-extrabold text-xs shrink-0 cursor-pointer shadow-sm transition-all"
                >
                  Review Reports ({pendingReportsCount}) →
                </button>
              </div>
            )}

            {/* Quick Management Shortcuts Grid */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-white font-brand">Quick Actions & Navigation</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Direct shortcuts to moderate content, curate audio soundtracks, and manage users.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Audio Library Shortcut */}
                <button
                  onClick={() => setActiveAdminTab('audio')}
                  className="p-5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-cyan-500/50 text-left transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-white">Audio & Music Library</div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {audioTracks.length} tracks · Add new audios
                  </div>
                </button>

                {/* Video Moderation Shortcut */}
                <button
                  onClick={() => {
                    setActiveAdminTab('videos');
                    setVideoStatusFilter('approved');
                  }}
                  className="p-5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-[#ff007a]/50 text-left transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#ff007a]/15 text-[#ff007a] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Film className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-white">Video Moderation</div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {videos.length} videos · {pendingAppealsCount} appeals
                  </div>
                </button>

                {/* User Accounts Shortcut */}
                <button
                  onClick={() => setActiveAdminTab('users')}
                  className="p-5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-blue-500/50 text-left transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-white">User Accounts</div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {uniqueUsers.length} total registered users
                  </div>
                </button>

                {/* Reports Shortcut */}
                <button
                  onClick={() => setActiveAdminTab('reports')}
                  className="p-5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/50 text-left transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-white">Reports & Flags</div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {reports.length} reports · {pendingReportsCount} pending
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: AUDIO LIBRARY (NEW & REQUESTED FEATURE)                      */}
        {/* =================================================================== */}
        {activeAdminTab === 'audio' && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5">
            {/* Audio Header & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white font-brand">
                    Audio & Soundtracks Library
                  </h2>
                  <span className="text-xs font-mono text-neutral-400 px-2 py-0.5 rounded-md bg-neutral-800">
                    {audioTracks.length} tracks
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Add audio tracks that all users can select and use on their videos when creating content.
                </p>
              </div>

              {/* Add Audio Track Button & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search title, artist..."
                    value={audioSearch}
                    onChange={e => setAudioSearch(e.target.value)}
                    className="w-full bg-neutral-900 text-xs text-white placeholder-neutral-500 pl-9 pr-3.5 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
                  />
                </div>

                <button
                  onClick={() => setShowAddAudioModal(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-[#ff007a]/20 shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add Audio</span>
                </button>
              </div>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setAudioCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                    audioCategoryFilter === 'all'
                      ? 'bg-white text-black font-bold'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  All Genres
                </button>
                {audioCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setAudioCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                      audioCategoryFilter === cat
                        ? 'bg-[#ff007a] text-white font-bold'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Source filter */}
              <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                <button
                  onClick={() => setAudioSourceFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    audioSourceFilter === 'all' ? 'bg-[#ff007a] text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setAudioSourceFilter('curated')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    audioSourceFilter === 'curated' ? 'bg-[#ff007a] text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Curated
                </button>
                <button
                  onClick={() => setAudioSourceFilter('video')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    audioSourceFilter === 'video' ? 'bg-[#ff007a] text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Video Sounds
                </button>
              </div>
            </div>

            {/* Audio Tracks List */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3">Track / Preview</th>
                    <th className="py-3 px-3">Artist</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 font-mono">Duration</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {filteredAudioTracks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-neutral-500">
                        <Music className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                        <div>No audio tracks found. Click "Add Audio" above to publish one.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredAudioTracks.map(track => {
                      const isPlaying = playingTrackId === track.id;
                      const isCurated = audioTracksList.some(t => t.id === track.id);
                      const isVideoSound = Boolean(track.sourceVideoId || track.title.toLowerCase().startsWith('original sound'));

                      // Look up video owner to guarantee the profile picture of the video owner
                      const sourceVid = track.sourceVideoId ? videos.find(v => v.id === track.sourceVideoId) : null;
                      const ownerUser = sourceVid?.creator || users.find(u =>
                        (track.sourceUsername && u.username.toLowerCase() === track.sourceUsername.toLowerCase()) ||
                        (sourceVid?.creatorId && u.id === sourceVid.creatorId)
                      );
                      const ownerAvatar = (ownerUser?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(ownerUser.avatar))
                        ? ownerUser.avatar
                        : (sourceVid?.creator?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(sourceVid.creator.avatar))
                          ? sourceVid.creator.avatar
                          : (track.coverUrl && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(track.coverUrl))
                            ? track.coverUrl
                            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(track.sourceUsername || ownerUser?.username || 'user')}`;

                      const displayCover = isVideoSound ? ownerAvatar : resolveTrackCover(track);

                      return (
                        <tr key={track.id} className="hover:bg-neutral-800/40 transition-colors">
                          {/* Track Title with Cover & Play Button */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-3">
                              <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-[#1e1b2e] shrink-0 border border-neutral-700/80 group shadow-sm">
                                <img
                                  src={displayCover}
                                  alt={track.title}
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                  onError={e => {
                                    if (isVideoSound) {
                                      (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(track.sourceUsername || 'user')}`;
                                    } else {
                                      (e.currentTarget as HTMLImageElement).src = getCuratedCoverForTrack(track.title, track.artist, track.category);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => togglePlayTrack(track)}
                                  className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity cursor-pointer ${
                                    isPlaying ? 'opacity-100 text-[#ff007a]' : 'opacity-0 group-hover:opacity-100 text-white'
                                  }`}
                                  title={isPlaying ? 'Pause' : 'Play Preview'}
                                >
                                  {isPlaying ? (
                                    <Pause className="w-4 h-4 fill-current" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                  )}
                                </button>
                              </div>

                              <div className="min-w-0">
                                <div className="font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{track.title}</span>
                                  {isPlaying && (
                                    <span className="flex items-center gap-0.5">
                                      <span className="w-1 h-3 bg-[#ff007a] rounded-full animate-pulse" />
                                      <span className="w-1 h-4 bg-[#ff007a] rounded-full animate-pulse delay-75" />
                                      <span className="w-1 h-2 bg-[#ff007a] rounded-full animate-pulse delay-150" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-neutral-400 truncate">
                                  {track.useCount ? `Used in ${track.useCount} videos` : 'Available to all users'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Artist */}
                          <td className="py-3 px-3 text-neutral-300 font-medium">{track.artist}</td>

                          {/* Category */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                              {track.category || 'Trending'}
                            </span>
                          </td>

                          {/* Duration */}
                          <td className="py-3 px-3 text-neutral-300 font-mono">{track.duration}</td>

                          {/* Source / Type */}
                          <td className="py-3 px-3">
                            {isCurated ? (
                              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                                Curated Soundtrack
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-neutral-400 bg-neutral-800/60 px-2 py-0.5 rounded">
                                User Video Sound
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isCurated ? (
                                <button
                                  onClick={() => handleDeleteAudio(track)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                                  title="Delete Track"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[11px] text-neutral-600">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: USER ACCOUNTS                                                */}
        {/* =================================================================== */}
        {activeAdminTab === 'users' && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-white font-brand">User Accounts ({filteredUsers.length})</h2>
                <p className="text-xs text-neutral-400">Manage user roles, bans, and profiles</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search username, name, email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full bg-neutral-900 text-xs text-white placeholder-neutral-500 pl-10 pr-3.5 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
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
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 font-mono">Followers</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No user accounts found matching "{userSearch}".
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-neutral-800/40 transition-colors">
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
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold">
                              <Shield className="w-3 h-3 text-[#ff007a]" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700/60 text-xs font-medium">
                              Creator
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {u.isBanned ? (
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold text-[10px] flex items-center gap-1 w-fit">
                                <Ban className="w-2.5 h-2.5" />
                                <span>BANNED</span>
                              </span>
                              {u.appealStatus === 'pending' && (
                                <div className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" /> Appeal Pending
                                </div>
                              )}
                            </div>
                          ) : u.warningActive ? (
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 w-fit border border-amber-500/40">
                                <ShieldAlert className="w-2.5 h-2.5" />
                                <span>NOTICE ACTIVE</span>
                              </span>
                              {u.preBanAppealStatus === 'pending' ? (
                                <button
                                  onClick={() =>
                                    setReviewingProofModal({
                                      userId: u.id,
                                      username: u.username,
                                      displayName: u.displayName,
                                      avatar: u.avatar,
                                      statement: u.preBanAppealReason || 'Submitted counter-proof for review.',
                                      proofUrl: u.preBanAppealProofUrl,
                                      proofName: u.preBanAppealProofName,
                                      submittedAt: u.preBanAppealSubmittedAt,
                                    })
                                  }
                                  className="text-[10px] text-cyan-300 hover:text-cyan-200 font-bold flex items-center gap-1 underline cursor-pointer"
                                >
                                  <Sparkles className="w-2.5 h-2.5" /> Review Proofs
                                </button>
                              ) : (
                                <div className="text-[10px] text-neutral-400 font-mono">
                                  Awaiting Appeal
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>Active</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-neutral-300 font-mono tabular-nums">{u.followersCount}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigateToUserProfile(u.id)}
                              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                              title="View Profile"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {u.isBanned ? (
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    title: 'Unban User Account',
                                    message: `Restore full access for @${u.username}? Their account will be reactivated.`,
                                    confirmText: 'Unban Account',
                                    isDanger: false,
                                    onConfirm: async () => {
                                      await unbanUserAdmin(u.id);
                                      showToast(`User @${u.username} unbanned.`);
                                    },
                                  });
                                }}
                                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 transition-colors cursor-pointer"
                                title="Unban User Account"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            ) : u.warningActive ? (
                              <div className="flex items-center gap-1">
                                {u.preBanAppealStatus === 'pending' ? (
                                  <button
                                    onClick={() =>
                                      setReviewingProofModal({
                                        userId: u.id,
                                        username: u.username,
                                        displayName: u.displayName,
                                        avatar: u.avatar,
                                        statement: u.preBanAppealReason || 'Submitted defense statement.',
                                        proofUrl: u.preBanAppealProofUrl,
                                        proofName: u.preBanAppealProofName,
                                        submittedAt: u.preBanAppealSubmittedAt,
                                      })
                                    }
                                    className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-bold cursor-pointer"
                                    title="Inspect user appeal statement & proofs"
                                  >
                                    Inspect Proofs
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setConfirmModal({
                                        title: 'Confirm Suspension',
                                        message: `Grace period expired or no proofs submitted. Confirm ban for @${u.username}?`,
                                        confirmText: 'Confirm Ban',
                                        isDanger: true,
                                        onConfirm: async () => {
                                          await resolvePreBanAppealAdmin(u.id, 'declined');
                                          showToast(`User @${u.username} banned.`);
                                        },
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 transition-colors cursor-pointer"
                                    title="Proceed to Ban"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setBanningUser({ id: u.id, username: u.username, displayName: u.displayName });
                                  setBanCustomReason('Violation of Community Guidelines');
                                  setBanModeChoice('warning_first');
                                }}
                                disabled={isSameUser(u.id, currentUser?.id)}
                                className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer disabled:opacity-30"
                                title="Take Moderation Action"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setConfirmModal({
                                  title: 'Permanently Delete User',
                                  message: `Permanently delete user @${u.username}? This will remove their profile and all associated data.`,
                                  confirmText: 'Delete User',
                                  isDanger: true,
                                  onConfirm: async () => {
                                    await deleteUserAdmin(u.id);
                                    showToast(`Account @${u.username} deleted.`);
                                  },
                                });
                              }}
                              disabled={isSameUser(u.id, currentUser?.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer disabled:opacity-30"
                              title="Delete User"
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
        {/* TAB 4: VIDEOS MODERATION (Likes and Comments removed)               */}
        {/* =================================================================== */}
        {activeAdminTab === 'videos' && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-white font-brand">
                    Video Moderation Catalog
                  </h2>
                  {pendingAppealsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold">
                      {pendingAppealsCount} appeal{pendingAppealsCount > 1 ? 's' : ''} awaiting review
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Review published videos, manage feed visibility, and resolve appeals.
                </p>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search caption, creator, hashtag..."
                  value={videoSearch}
                  onChange={e => setVideoSearch(e.target.value)}
                  className="w-full bg-neutral-900 text-xs text-white placeholder-neutral-500 pl-10 pr-3.5 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'approved', label: `Live & Approved (${approvedVideosCount})` },
                { id: 'rejected', label: `Declined / Revoked (${rejectedVideosCount})` },
                { id: 'appeals', label: `Creator Appeals (${pendingAppealsCount})`, highlight: pendingAppealsCount > 0 },
                { id: 'all', label: `All Videos (${videos.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setVideoStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    videoStatusFilter === tab.id
                      ? 'bg-[#ff007a] text-white shadow-sm'
                      : tab.highlight
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Video Cards Grid (Likes and Comments completely removed) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.length === 0 ? (
                <div className="col-span-full py-16 text-center text-neutral-400 text-xs bg-neutral-900/40 rounded-xl border border-neutral-800">
                  <Film className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                  <div className="font-semibold text-neutral-300 text-sm">No videos found</div>
                  <p className="text-neutral-500 mt-1">No videos matching filter: {videoStatusFilter}</p>
                </div>
              ) : (
                filteredVideos.map(video => (
                  <div
                    key={video.id}
                    className="bg-neutral-900/90 border border-neutral-800 rounded-xl overflow-hidden flex flex-col justify-between hover:border-neutral-700 transition-all"
                  >
                    <div className="p-3.5 space-y-2.5">
                      {/* Creator Header */}
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

                        {video.appealStatus === 'pending' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                            Appeal Pending
                          </span>
                        ) : video.status === 'approved' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            Live
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                            Revoked
                          </span>
                        )}
                      </div>

                      {/* Video Player */}
                      <div className="aspect-video w-full bg-black rounded-lg overflow-hidden border border-neutral-800">
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

                      {/* Attached Audio Track if any */}
                      {video.audioTrack && (
                        <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 bg-cyan-950/20 px-2 py-1 rounded-md border border-cyan-500/20">
                          <Music className="w-3 h-3 shrink-0" />
                          <span className="truncate">{video.audioTrack.title}</span>
                          <span className="text-neutral-500">·</span>
                          <span className="text-neutral-400 truncate">{video.audioTrack.artist}</span>
                        </div>
                      )}

                      {/* Appeal Note if pending */}
                      {video.appealStatus === 'pending' && video.appealReason && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                          <div className="font-bold flex items-center gap-1 text-amber-300">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Creator Appeal:</span>
                          </div>
                          <p className="text-[11px] text-neutral-200 italic">"{video.appealReason}"</p>
                        </div>
                      )}

                      {/* Revocation Reason if revoked */}
                      {video.status === 'rejected' && video.rejectionReason && (
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
                          <strong>Reason:</strong> {video.rejectionReason}
                        </div>
                      )}
                    </div>

                    {/* Metadata Rail & Action Buttons (Likes and Comments removed) */}
                    <div className="p-3 border-t border-neutral-800 bg-neutral-900/60 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          <Eye className="w-3.5 h-3.5 text-neutral-400" /> {video.viewsCount || 0} views
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {video.createdAt ? String(video.createdAt).slice(0, 10) : ''}
                        </span>
                      </div>

                      {/* Decision Controls */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800">
                        {video.appealStatus === 'pending' ? (
                          <>
                            <button
                              onClick={() => {
                                reviewVideoAppeal(video.id, 'approved');
                                showToast('Appeal approved! Video restored to feed.');
                              }}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Approve Appeal</span>
                            </button>
                            <button
                              onClick={() => {
                                reviewVideoAppeal(video.id, 'declined');
                                showToast('Appeal declined.');
                              }}
                              className="py-1.5 px-3 rounded-lg bg-red-500/20 text-red-300 text-xs font-semibold cursor-pointer"
                            >
                              Decline
                            </button>
                          </>
                        ) : video.status === 'approved' ? (
                          <>
                            <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Live on Feed</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setRejectingVideoId(video.id);
                                  setRejectReason('Guidelines violation');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-300 text-xs cursor-pointer"
                              >
                                Revoke
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    title: 'Delete Video Permanently',
                                    message: 'Are you sure you want to delete this video permanently? This action cannot be undone.',
                                    confirmText: 'Delete Video',
                                    isDanger: true,
                                    onConfirm: async () => {
                                      await deleteVideoAdmin(video.id);
                                      showToast('Video deleted.');
                                    },
                                  });
                                }}
                                className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 text-xs cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Revoked</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  approveVideoAdmin(video.id);
                                  showToast('Video re-approved and live.');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold cursor-pointer"
                              >
                                Re-Approve
                              </button>
                              <button
                                onClick={() => deleteVideoAdmin(video.id)}
                                className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 text-xs cursor-pointer"
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
        {/* TAB 5: MODERATION REPORTS                                           */}
        {/* =================================================================== */}
        {activeAdminTab === 'reports' && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-white font-brand">Community Reports ({filteredReports.length})</h2>
                <p className="text-xs text-neutral-400">Reports filed by community members</p>
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'All Types' },
                  { id: 'video', label: 'Video Reports' },
                  { id: 'user', label: 'User Reports' },
                  { id: 'live_stream', label: 'Live Stream Reports' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setReportFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      reportFilter === f.id ? 'bg-[#ff007a] text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filters */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'all', label: `All (${reports.length})` },
                { id: 'Under Review', label: `Pending (${pendingReportsCount})` },
                { id: 'Warning Issued', label: `Notice Active (${warningReportsCount})`, highlight: warningReportsCount > 0 },
                { id: 'Appeal Submitted', label: `Proofs Ready (${appealsSubmittedCount})`, highlight: appealsSubmittedCount > 0 },
                { id: 'Approved', label: `Action Taken (${approvedReportsCount})` },
                { id: 'Rejected', label: `Dismissed (${rejectedReportsCount})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setReportStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    reportStatusFilter === tab.id
                      ? 'bg-purple-600 text-white'
                      : tab.highlight
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Reports List */}
            <div className="space-y-3">
              {filteredReports.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-xs bg-neutral-900/40 rounded-xl border border-neutral-800">
                  <AlertTriangle className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                  <div>No reports found matching criteria.</div>
                </div>
              ) : (
                filteredReports.map(report => (
                  <div
                    key={report.id}
                    className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 text-xs flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                          {report.type} report
                        </span>
                        <span className="font-bold text-white text-sm">{report.targetName}</span>
                        <span className="text-neutral-500 font-mono text-[11px]">· {report.timestamp}</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-md text-[10px] ${
                            report.status === 'Approved'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : report.status === 'Rejected'
                              ? 'bg-red-500/15 text-red-400'
                              : report.status === 'Warning Issued'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : report.status === 'Appeal Submitted'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                      <div className="text-neutral-300">
                        <strong>Reason:</strong> {report.scenario}
                        {report.description && <span className="text-neutral-400"> — "{report.description}"</span>}
                      </div>

                      {/* Display Proofs / Defense Statement if user submitted */}
                      {report.type === 'user' && (report.status === 'Appeal Submitted' || report.appealReason) && (
                        <div className="mt-2 p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-cyan-300 font-bold">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>User Defense Statement:</span>
                            </span>
                            {report.appealSubmittedAt && (
                              <span className="text-[10px] font-normal text-neutral-400 font-mono">
                                Submitted {report.appealSubmittedAt.slice(0, 10)}
                              </span>
                            )}
                          </div>
                          {report.appealReason && (
                            <p className="text-neutral-200 italic">"{report.appealReason}"</p>
                          )}
                          {report.appealProofUrl && (
                            <div className="flex items-center gap-3 pt-1 border-t border-cyan-500/20">
                              <a
                                href={report.appealProofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="relative group block w-12 h-12 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-900 shrink-0"
                              >
                                <img
                                  src={report.appealProofUrl}
                                  alt="Proof evidence"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                                </div>
                              </a>
                              <div className="text-[11px] text-neutral-300">
                                <span className="font-semibold block">{report.appealProofName || 'Counter-Proof Evidence'}</span>
                                <a
                                  href={report.appealProofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-cyan-400 hover:underline text-[10px]"
                                >
                                  Open full-size attachment ↗
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* USER REPORTS: Due Process Flow */}
                      {report.type === 'user' ? (
                        <>
                          {report.status === 'Under Review' && (
                            <>
                              <button
                                disabled={resolvingReportId === report.id}
                                onClick={() => {
                                  setWarningModalData({
                                    userId: report.targetId,
                                    username: report.targetSubtitle?.replace(/^@/, '') || report.targetName,
                                    displayName: report.targetName,
                                    reportId: report.id,
                                    defaultReason: report.scenario || 'Violation of Community Guidelines',
                                  });
                                  setWarningReasonText(report.scenario || 'Violation of Community Guidelines');
                                  setWarningHours(24);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs cursor-pointer flex items-center gap-1.5 border border-amber-500/30"
                                title="Approves report and issues pre-ban violation notice with 24h grace period for user to submit appeal & proofs"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Approve Report & Issue Notice</span>
                              </button>

                              <button
                                onClick={async () => {
                                  await updateReportStatusAdmin(report.id, report.type, 'Rejected');
                                  showToast(`Report dismissed.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                              >
                                Dismiss Report
                              </button>
                            </>
                          )}

                          {report.status === 'Warning Issued' && (
                            <>
                              {(report.appealReason || report.appealProofUrl) ? (
                                <button
                                  onClick={() =>
                                    setReviewingProofModal({
                                      userId: report.targetId,
                                      username: report.targetSubtitle?.replace(/^@/, '') || report.targetName,
                                      displayName: report.targetName,
                                      statement: report.appealReason || 'User submitted defense statement.',
                                      proofUrl: report.appealProofUrl,
                                      proofName: report.appealProofName,
                                      submittedAt: report.appealSubmittedAt,
                                      reportId: report.id,
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs cursor-pointer flex items-center gap-1.5 border border-cyan-500/40"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Review Proofs</span>
                                </button>
                              ) : null}

                              <button
                                disabled={resolvingReportId === report.id}
                                onClick={() => {
                                  setConfirmModal({
                                    title: 'Proceed with Account Ban',
                                    message: `Grace period expired or user failed to submit appeal proofs. Proceed with ban for ${report.targetName}?`,
                                    confirmText: 'Confirm Ban',
                                    isDanger: true,
                                    onConfirm: async () => {
                                      setResolvingReportId(report.id);
                                      try {
                                        await banUserAdmin(report.targetId, report.scenario);
                                        await updateReportStatusAdmin(report.id, report.type, 'Approved');
                                        showToast(`User account banned.`);
                                      } finally {
                                        setResolvingReportId(null);
                                      }
                                    },
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 font-semibold text-xs cursor-pointer flex items-center gap-1 border border-red-500/30"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Proceed to Ban</span>
                              </button>

                              <button
                                onClick={async () => {
                                  await resolvePreBanAppealAdmin(report.targetId, 'approved', report.id);
                                  showToast(`Warning cleared.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                              >
                                Dismiss Warning
                              </button>
                            </>
                          )}

                          {report.status === 'Appeal Submitted' && (
                            <>
                              <button
                                onClick={() =>
                                  setReviewingProofModal({
                                    userId: report.targetId,
                                    username: report.targetSubtitle?.replace(/^@/, '') || report.targetName,
                                    displayName: report.targetName,
                                    statement: report.appealReason || 'User submitted defense statement.',
                                    proofUrl: report.appealProofUrl,
                                    proofName: report.appealProofName,
                                    submittedAt: report.appealSubmittedAt,
                                    reportId: report.id,
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs cursor-pointer flex items-center gap-1.5 border border-cyan-500/40"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Inspect Proofs & Decide</span>
                              </button>

                              <button
                                disabled={resolvingReportId === report.id}
                                onClick={async () => {
                                  setResolvingReportId(report.id);
                                  try {
                                    await resolvePreBanAppealAdmin(report.targetId, 'approved', report.id);
                                    showToast(`Appeal accepted! Warning cleared for ${report.targetName}.`);
                                  } finally {
                                    setResolvingReportId(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-xs cursor-pointer flex items-center gap-1 border border-emerald-500/40"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Accept</span>
                              </button>

                              <button
                                disabled={resolvingReportId === report.id}
                                onClick={() => {
                                  setConfirmModal({
                                    title: 'Decline Appeal and Ban Account',
                                    message: `Decline defense proofs and proceed to ban ${report.targetName}?`,
                                    confirmText: 'Decline & Ban',
                                    isDanger: true,
                                    onConfirm: async () => {
                                      setResolvingReportId(report.id);
                                      try {
                                        await resolvePreBanAppealAdmin(report.targetId, 'declined', report.id);
                                        showToast(`Appeal declined. Account banned.`);
                                      } finally {
                                        setResolvingReportId(null);
                                      }
                                    },
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 font-bold text-xs cursor-pointer flex items-center gap-1 border border-red-500/40"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Decline & Ban</span>
                              </button>
                            </>
                          )}

                          {report.status !== 'Under Review' && report.status !== 'Warning Issued' && report.status !== 'Appeal Submitted' && (
                            <span className="text-[11px] text-neutral-500 italic">Report resolved</span>
                          )}
                        </>
                      ) : report.type === 'live_stream' ? (
                        /* LIVE STREAM REPORTS: Direct Host Warning & Stream Controls */
                        <>
                          {report.status !== 'Approved' && (
                            <button
                              disabled={resolvingReportId === report.id}
                              onClick={async () => {
                                setResolvingReportId(report.id);
                                try {
                                  const reason = report.scenario || report.description || 'Violation of Community Guidelines';
                                  await warnLiveHostAdmin(report.targetId, reason);
                                  await updateReportStatusAdmin(report.id, report.type, 'Warning Issued');
                                  showToast(`Moderator warning sent directly into host's live chat!`);
                                } finally {
                                  setResolvingReportId(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs cursor-pointer flex items-center gap-1.5 border border-amber-500/30"
                              title="Sends a private warning visible ONLY to the host in their stream comment section"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              <span>Warn Host in Live Chat</span>
                            </button>
                          )}

                          {report.status !== 'Approved' && (
                            <button
                              disabled={resolvingReportId === report.id}
                              onClick={async () => {
                                setResolvingReportId(report.id);
                                try {
                                  await supabaseDb.endLiveStream(report.targetId);
                                  removeActiveLiveStream(report.targetId);
                                  await updateReportStatusAdmin(report.id, report.type, 'Approved');
                                  showToast(`Live stream terminated and taken offline.`);
                                } finally {
                                  setResolvingReportId(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 font-semibold text-xs cursor-pointer flex items-center gap-1 border border-red-500/30"
                              title="Immediately terminates the violating live broadcast"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>End Stream</span>
                            </button>
                          )}

                          {report.status !== 'Rejected' && (
                            <button
                              onClick={async () => {
                                await updateReportStatusAdmin(report.id, report.type, 'Rejected');
                                showToast(`Report dismissed.`);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                            >
                              Dismiss
                            </button>
                          )}
                        </>
                      ) : (
                        /* VIDEO REPORTS: Standard Video Revocation Flow */
                        <>
                          {report.status !== 'Approved' && (
                            <button
                              disabled={resolvingReportId === report.id}
                              onClick={async () => {
                                setResolvingReportId(report.id);
                                try {
                                  await rejectVideoAdmin(report.targetId, report.scenario);
                                  await updateReportStatusAdmin(report.id, report.type, 'Approved');
                                  showToast(`Video revoked from feed.`);
                                } finally {
                                  setResolvingReportId(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-semibold text-xs cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Revoke Video</span>
                            </button>
                          )}

                          {report.status !== 'Rejected' && (
                            <button
                              onClick={async () => {
                                await updateReportStatusAdmin(report.id, report.type, 'Rejected');
                                showToast(`Report dismissed.`);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                            >
                              Dismiss
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: ADMIN TEAM                                                   */}
        {/* =================================================================== */}
        {activeAdminTab === 'admins' && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-white font-brand">Administrator Roles & Access</h2>
                <p className="text-xs text-neutral-400">Security personnel with elevated platform permissions</p>
              </div>
              <button
                onClick={() => setShowAddAdminModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Administrator</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {admins.length === 0 ? (
                <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                  <div className="font-bold text-white text-sm">{currentUser?.displayName || 'Primary Admin'}</div>
                  <div className="text-xs text-neutral-400">{currentUser?.email}</div>
                  <div className="text-[11px] text-purple-300 font-semibold mt-2">Role: Admin</div>
                </div>
              ) : (
                admins.map(adm => (
                  <div
                    key={adm.adminId}
                    className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-white text-sm">{adm.username}</div>
                          <div className="text-xs text-neutral-400 font-mono">{adm.email}</div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                          {adm.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-2">
                        <strong>Permissions:</strong>{' '}
                        {Array.isArray(adm.permissions) ? adm.permissions.join(', ') : 'all'}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Added: {adm.createdAt?.slice(0, 10) || 'Recent'}</span>
                      <button
                        onClick={() => removeAdmin(adm.adminId)}
                        className="text-red-400 hover:text-red-300 cursor-pointer font-semibold"
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
      </div>

      {/* =================================================================== */}
      {/* MODAL: ADD AUDIO TRACK                                              */}
      {/* =================================================================== */}
      {showAddAudioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <audio ref={modalAudioRef} />

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#ff007a]/15 text-[#ff007a]">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white font-brand">Add Audio Track</h3>
                  <p className="text-[11px] text-neutral-400">
                    Add music or sounds that creators can select when uploading videos
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (modalAudioRef.current) modalAudioRef.current.pause();
                  setShowAddAudioModal(false);
                }}
                className="text-neutral-400 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAudio} className="space-y-3.5 text-xs">
              {/* Title & Artist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Track Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Midnight Beats"
                    value={newAudioTitle}
                    onChange={e => setNewAudioTitle(e.target.value)}
                    className="w-full bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                  />
                </div>
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Artist / Creator *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ViralHub Music"
                    value={newAudioArtist}
                    onChange={e => setNewAudioArtist(e.target.value)}
                    className="w-full bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                  />
                </div>
              </div>

              {/* Genre Category & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Genre / Category</label>
                  <select
                    value={newAudioCategory}
                    onChange={e => setNewAudioCategory(e.target.value)}
                    className="w-full bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                  >
                    {audioCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Duration (MM:SS)</label>
                  <input
                    type="text"
                    placeholder="00:30"
                    value={newAudioDuration}
                    onChange={e => setNewAudioDuration(e.target.value)}
                    className="w-full bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a] font-mono"
                  />
                </div>
              </div>

              {/* Audio File Upload */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">
                  Audio File (.mp3, .wav, .ogg, .m4a) *
                </label>

                {selectedAudioFile ? (
                  <div className="p-3.5 rounded-xl border border-neutral-700 bg-neutral-950 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={toggleModalAudioPlayback}
                        className="w-10 h-10 rounded-xl bg-[#ff007a]/20 hover:bg-[#ff007a]/30 text-[#ff007a] flex items-center justify-center shrink-0 transition-colors cursor-pointer border border-[#ff007a]/40"
                        title={isAudioPreviewPlaying ? 'Pause preview' : 'Play preview'}
                      >
                        {isAudioPreviewPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate text-xs">
                          {selectedAudioFile.name}
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                          <span>{(selectedAudioFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span className="text-[#ff007a] font-mono">{newAudioDuration}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="file"
                        id="adminAudioUploadInputReplace"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleAudioFileSelection(file);
                        }}
                      />
                      <label
                        htmlFor="adminAudioUploadInputReplace"
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-semibold cursor-pointer transition-colors"
                      >
                        Change
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (modalAudioRef.current) modalAudioRef.current.pause();
                          setSelectedAudioFile(null);
                          setAudioPreviewUrl('');
                          setIsAudioPreviewPlaying(false);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-semibold cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-center space-y-2">
                    <input
                      type="file"
                      id="adminAudioUploadInput"
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAudioFileSelection(file);
                      }}
                    />
                    <label
                      htmlFor="adminAudioUploadInput"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer font-semibold transition-colors"
                    >
                      <Upload className="w-4 h-4 text-[#ff007a]" />
                      <span>Select Audio File</span>
                    </label>
                    <p className="text-[11px] text-neutral-400">
                      Supports MP3, WAV, AAC, M4A, OGG up to 25MB
                    </p>
                  </div>
                )}
              </div>

              {/* Cover Artwork with Immediate Image Preview */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">
                  Cover Artwork Image (Optional)
                </label>

                {coverPreviewUrl ? (
                  <div className="p-3 rounded-xl border border-neutral-700 bg-neutral-950 flex items-center gap-3">
                    <img
                      src={coverPreviewUrl}
                      alt="Cover Preview"
                      className="w-16 h-16 rounded-lg object-cover border border-[#ff007a]/40 shadow-md shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {selectedCoverFile?.name || 'Cover Artwork'}
                      </div>
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>
                          Image preview ready ({selectedCoverFile ? `${(selectedCoverFile.size / 1024).toFixed(0)} KB` : 'Ready'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="file"
                          id="adminAudioCoverUploadChange"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleCoverFileSelection(file);
                          }}
                        />
                        <label
                          htmlFor="adminAudioCoverUploadChange"
                          className="text-[11px] text-neutral-300 hover:text-white font-medium cursor-pointer underline"
                        >
                          Change Image
                        </label>
                        <span className="text-neutral-600">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCoverFile(null);
                            setCoverPreviewUrl('');
                          }}
                          className="text-[11px] text-red-400 hover:text-red-300 font-medium cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-center space-y-2">
                    <input
                      type="file"
                      id="adminAudioCoverUpload"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleCoverFileSelection(file);
                      }}
                    />
                    <label
                      htmlFor="adminAudioCoverUpload"
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer text-xs font-semibold transition-colors"
                    >
                      <ImageIcon className="w-4 h-4 text-[#ff007a]" />
                      <span>Select Cover Image</span>
                    </label>
                    <p className="text-[11px] text-neutral-400">
                      Supports PNG, JPG, JPEG, WebP cover art thumbnail
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddAudioModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingAudio}
                  className="px-5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUploadingAudio && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Save Audio Track</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video Rejection Modal */}
      {rejectingVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-left space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-brand flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span>Revoke Video</span>
              </h3>
              <button
                onClick={() => setRejectingVideoId(null)}
                className="text-neutral-400 hover:text-white p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300">
              Revoking this video hides it from community feeds and notifies the creator with appeal rights.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Quick Reasons:
              </label>
              {[
                'Inappropriate visual content or guidelines violation',
                'Copyrighted music or intellectual property infringement',
                'Harassment, bullying, or hate speech',
                'Spam, misleading, or low-quality content',
              ].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRejectReason(r)}
                  className={`w-full text-left p-2 rounded-xl text-xs transition-colors cursor-pointer border ${
                    rejectReason === r
                      ? 'bg-red-500/15 border-red-500/40 text-red-300 font-semibold'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setRejectingVideoId(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await rejectVideoAdmin(rejectingVideoId, rejectReason);
                  setRejectingVideoId(null);
                  showToast('Video revoked from feed.');
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow cursor-pointer"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moderation / Ban User Modal with Due Process Appeal Option */}
      {banningUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12121a] border border-amber-500/30 rounded-2xl p-6 w-full max-w-lg space-y-4 text-left shadow-[0_0_40px_rgba(245,158,11,0.15)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white font-brand">
                    Moderation Action: @{banningUser.username}
                  </h3>
                  <p className="text-xs text-neutral-400">{banningUser.displayName}</p>
                </div>
              </div>
              <button
                onClick={() => setBanningUser(null)}
                className="p-1 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900/80 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setBanModeChoice('warning_first')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  banModeChoice === 'warning_first'
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Due Process (Appeal First)</span>
              </button>

              <button
                type="button"
                onClick={() => setBanModeChoice('direct_ban')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  banModeChoice === 'direct_ban'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Immediate Ban</span>
              </button>
            </div>

            {banModeChoice === 'warning_first' ? (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Fair Hearing Policy:</strong> User will <em>not</em> be banned immediately. They will receive an urgent in-app notification with an appeal window to submit an explanation and counter-proof. If they fail to appeal or provide proofs before the deadline, you can then confirm the ban.
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-semibold text-neutral-300 block">Violation Reason:</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      'Violation of Community Guidelines',
                      'Inappropriate content or harassment',
                      'Spam, scam, or deceptive behavior',
                      'Copyright / Intellectual property',
                      'Impersonation of another creator',
                    ].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBanCustomReason(r)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          banCustomReason === r
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={banCustomReason}
                    onChange={e => setBanCustomReason(e.target.value)}
                    rows={2}
                    className="w-full bg-neutral-950 p-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-amber-500 text-xs resize-none"
                    placeholder="Describe violation notice reason..."
                  />
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-semibold text-neutral-300 block">
                    Appeal Window (Grace Period for User to Submit Proofs):
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[12, 24, 48, 72].map(hrs => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => setWarningHours(hrs)}
                        className={`py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors cursor-pointer ${
                          warningHours === hrs
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {hrs} Hours
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setBanningUser(null)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingWarning}
                    onClick={async () => {
                      if (!banningUser) return;
                      setIsSubmittingWarning(true);
                      try {
                        await issueUserWarningAdmin(banningUser.id, banCustomReason, warningHours);
                        showToast(`Due process notice issued to @${banningUser.username}. User has ${warningHours}h to appeal.`);
                        setBanningUser(null);
                      } finally {
                        setIsSubmittingWarning(false);
                      }
                    }}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmittingWarning && <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />}
                    <span>Issue Notice & Require Proofs</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 text-xs text-red-300 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>
                    <strong>Emergency Ban:</strong> This suspends the account immediately without giving an appeal grace period. Use only for severe illegal violations or extreme emergencies.
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-semibold text-neutral-300 block">Ban Reason:</label>
                  <textarea
                    value={banCustomReason}
                    onChange={e => setBanCustomReason(e.target.value)}
                    rows={2}
                    className="w-full bg-neutral-950 p-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-red-500 text-xs resize-none"
                    placeholder="Enter specific ban reason..."
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setBanningUser(null)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!banningUser) return;
                      await banUserAdmin(banningUser.id, banCustomReason);
                      showToast(`User @${banningUser.username} banned immediately.`);
                      setBanningUser(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-lg"
                  >
                    Confirm Immediate Ban
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone Pre-Ban Warning Modal (Triggered by Approving Community Reports) */}
      {warningModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12121a] border border-amber-500/40 rounded-2xl p-6 w-full max-w-lg space-y-4 text-left shadow-[0_0_50px_rgba(245,158,11,0.2)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white font-brand">
                    Approve Report & Issue Violation Notice
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Target: @{warningModalData.username} ({warningModalData.displayName})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWarningModalData(null)}
                className="p-1 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Due Process Enforcement:</strong> Under platform policy, this reported user will <em>not</em> be banned immediately. They will receive an urgent notice requiring them to submit an explanation and counter-proof/evidence before the countdown expires.
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-semibold text-neutral-300 block">Flagged Violation Reason:</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  'Harassment, bullying, or hate speech',
                  'Inappropriate content or community guidelines violation',
                  'Spam, scam, or misleading information',
                  'Copyright infringement / unauthorized content',
                  'Impersonation of another person',
                ].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setWarningReasonText(r)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      warningReasonText === r
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={warningReasonText}
                onChange={e => setWarningReasonText(e.target.value)}
                rows={2}
                className="w-full bg-neutral-950 p-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-amber-500 text-xs resize-none"
                placeholder="Enter specific violation details..."
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-semibold text-neutral-300 block">
                Appeal Window (Grace Period for Proof Submission):
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[12, 24, 48, 72].map(hrs => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setWarningHours(hrs)}
                    className={`py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors cursor-pointer ${
                      warningHours === hrs
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {hrs} Hours
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setWarningModalData(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingWarning}
                onClick={async () => {
                  setIsSubmittingWarning(true);
                  try {
                    await issueUserWarningAdmin(
                      warningModalData.userId,
                      warningReasonText,
                      warningHours,
                      warningModalData.reportId
                    );
                    showToast(`Report approved & notice sent! User @${warningModalData.username} has ${warningHours}h to appeal.`);
                    setWarningModalData(null);
                  } finally {
                    setIsSubmittingWarning(false);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingWarning && <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />}
                <span>Send Notice & Start Grace Period</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Submitted Proofs & Defense Statement Modal */}
      {reviewingProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12121a] border border-cyan-500/40 rounded-2xl p-6 w-full max-w-lg space-y-4 text-left shadow-[0_0_50px_rgba(6,182,212,0.2)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white font-brand">
                    Review User Defense & Counter-Proofs
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Creator: @{reviewingProofModal.username} ({reviewingProofModal.displayName})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewingProofModal(null)}
                className="p-1 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Defense Statement */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-neutral-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>User's Explanation Statement:</span>
              </label>
              <div className="p-3.5 rounded-xl bg-black/50 border border-neutral-800 text-neutral-200 text-xs italic leading-relaxed">
                "{reviewingProofModal.statement}"
              </div>
            </div>

            {/* Submitted Proof / Attachment */}
            {reviewingProofModal.proofUrl ? (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-neutral-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Submitted Counter-Proof Evidence:</span>
                </label>
                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
                  <a
                    href={reviewingProofModal.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="relative group block w-16 h-16 rounded-xl overflow-hidden border border-neutral-700 bg-black shrink-0"
                  >
                    <img
                      src={reviewingProofModal.proofUrl}
                      alt="Proof"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ExternalLink className="w-4 h-4 text-white" />
                    </div>
                  </a>
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="font-semibold text-white block truncate">
                      {reviewingProofModal.proofName || 'Supporting Evidence Document'}
                    </span>
                    <a
                      href={reviewingProofModal.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline text-[11px] inline-flex items-center gap-1 mt-1"
                    >
                      <span>Open full attachment in new window</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-400">
                No external attachment file provided. User submitted defense text only.
              </div>
            )}

            {/* Decisions */}
            <div className="pt-2 border-t border-neutral-800 space-y-2">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                Moderator Verdict:
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    await resolvePreBanAppealAdmin(
                      reviewingProofModal.userId,
                      'approved',
                      reviewingProofModal.reportId
                    );
                    showToast(`Appeal accepted! Warning cleared for @${reviewingProofModal.username}.`);
                    setReviewingProofModal(null);
                  }}
                  className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Accept Appeal & Exonerate</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await resolvePreBanAppealAdmin(
                      reviewingProofModal.userId,
                      'declined',
                      reviewingProofModal.reportId
                    );
                    showToast(`Appeal rejected. Account @${reviewingProofModal.username} banned.`);
                    setReviewingProofModal(null);
                  }}
                  className="p-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Ban className="w-4 h-4" />
                  <span>Reject Proofs & Ban</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Universal In-App Confirmation Modal (Replaces browser window.confirm) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12121a] border border-neutral-700 rounded-2xl p-6 w-full max-w-sm space-y-4 text-left shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  confirmModal.isDanger
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {confirmModal.isDanger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <h3 className="font-bold text-base text-white font-brand">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                disabled={isConfirmingAction}
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirmingAction}
                onClick={async () => {
                  setIsConfirmingAction(true);
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } finally {
                    setIsConfirmingAction(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md ${
                  confirmModal.isDanger
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isConfirmingAction && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{confirmModal.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white font-brand flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#ff007a]" />
                <span>Add Administrator</span>
              </h3>
              <button onClick={() => setShowAddAdminModal(false)} className="text-neutral-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. admin_alex"
                  value={newAdminUser}
                  onChange={e => setNewAdminUser(e.target.value)}
                  className="w-full bg-neutral-950 px-3.5 py-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alex@viralhub.app"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  className="w-full bg-neutral-950 px-3.5 py-2.5 rounded-xl border border-neutral-700 text-white outline-none focus:border-[#ff007a]"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#ff007a] shrink-0" />
                <span>Assigns full platform Administrator role & synchronizes with Supabase.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  disabled={isSubmittingAdmin}
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdmin}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#e0006c] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAdmin ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <span>Save Admin</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
