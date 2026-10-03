import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  User,
  Video,
  AudioTrack,
  Conversation,
  Message,
  MessageReplyInfo,
  NotificationItem,
  ReportItem,
  LiveStream,
  LiveStreamMessage,
  FollowRelation,
  FollowRequest,
  FollowStatus,
  AdminRecord,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_VIDEOS,
  INITIAL_AUDIO_TRACKS,
  INITIAL_CONVERSATIONS,
  INITIAL_FOLLOWS,
  INITIAL_FOLLOW_REQUESTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_REPORTS,
  INITIAL_LIVESTREAM,
  DEFAULT_USER,
  storage,
} from '../services/storage';
import {
  supabaseDb,
  getSupabaseConfig,
  getSupabaseClient,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOutSupabase,
  toUuid,
} from '../lib/supabase';

// Persistent set of notification IDs that were marked as read by user
export const getReadNotificationIds = (): Set<string> => {
  const ids = storage.get<string[]>('read_notification_ids_v1', []);
  return new Set(ids);
};

export const markNotificationIdsReadInStorage = (ids: string[]) => {
  const current = storage.get<string[]>('read_notification_ids_v1', []);
  const combined = Array.from(new Set([...current, ...ids]));
  storage.set('read_notification_ids_v1', combined);
};

// Ensure any legacy cached sample data in browser localStorage is wiped on boot
const EMPTY_RESET_KEY = 'viralhub_empty_reset_v9';
if (!storage.get<boolean>(EMPTY_RESET_KEY, false)) {
  [
    'currentUser',
    'users',
    'videos',
    'audioTracks',
    'conversations',
    'follow_relations_v2',
    'follow_requests_v2',
    'notifications',
    'reports',
    'livestream',
    'video_comments_v2',
  ].forEach(k => storage.remove(k));
  storage.set(EMPTY_RESET_KEY, true);
}

export type AppTab =
  | 'home'
  | 'explore'
  | 'live'
  | 'messages'
  | 'upload'
  | 'notifications'
  | 'report_history'
  | 'profile'
  | 'edit_profile'
  | 'live_host_setup'
  | 'live_host_active'
  | 'live_viewer'
  | 'admin';

interface ReportModalConfig {
  isOpen: boolean;
  type: 'video' | 'user';
  targetId: string;
  targetName: string;
  targetSubtitle?: string;
  targetThumbnail?: string;
}

interface AppContextType {
  // Auth state
  currentUser: User | null;
  authView: 'login' | 'register';
  setAuthView: (view: 'login' | 'register') => void;
  login: (usernameOrEmail: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  register: (
    username: string,
    email: string,
    password?: string
  ) => Promise<{ success: boolean; message?: string; needsEmailConfirmation?: boolean; email?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  quickLoginAs: (userId: string) => void;

  // Navigation
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  selectedUserId: string | null;
  navigateToUserProfile: (userId: string) => void;

  // Data
  users: User[];
  videos: Video[];
  audioTracks: AudioTrack[];
  conversations: Conversation[];
  activeConversationId: string | null;
  notifications: NotificationItem[];
  reports: ReportItem[];
  currentLiveStream: LiveStream;

  // Follow & Relationship System
  followRelations: FollowRelation[];
  followRequests: FollowRequest[];
  getFollowStatus: (targetUserId: string) => FollowStatus;
  isTargetFollowingMe: (targetUserId: string) => boolean;
  acceptFollowRequest: (requestId: string, andFollowBack?: boolean) => void;
  declineFollowRequest: (requestId: string) => void;
  getUserFollowers: (userId: string) => User[];
  getUserFollowing: (userId: string) => User[];
  canMessageUser: (userId: string) => boolean;
  canViewUserFollows: (userId: string) => boolean;

  // Unread counts
  totalUnreadMessages: number;
  totalUnreadNotifications: number;

  // Actions
  updateUserProfile: (updates: Partial<User>) => void;
  toggleFollowUser: (userId: string) => void;
  toggleLikeVideo: (videoId: string) => void;
  addCommentToVideo: (videoId: string, text: string) => void;
  shareVideo: (videoId: string) => void;
  shareVideoToUser: (video: Video, targetUserId: string, note?: string) => boolean;
  recordVideoView: (videoId: string) => void;
  uploadVideo: (newVideo: {
    caption: string;
    hashtags: string[];
    audioTrack?: AudioTrack;
    mediaUrl: string;
    thumbnailUrl?: string;
    audioVolume?: number;
    originalAudioMuted?: boolean;
    originalAudioVolume?: number;
  }) => Promise<boolean>;
  submitReport: (report: Omit<ReportItem, 'id' | 'timestamp' | 'status'>) => void;
  
  // Messaging
  messagesMobileView: 'list' | 'chat';
  setMessagesMobileView: (view: 'list' | 'chat') => void;
  openConversation: (convId: string) => void;
  openConversationWithUser: (userId: string) => void;
  sendMessage: (
    convId: string,
    text: string,
    replyTo?: MessageReplyInfo,
    sharedVideo?: Video
  ) => void;
  deleteConversation: (convId: string) => void;
  deleteMessage: (convId: string, messageId: string) => void;
  
  // Notifications
  markAllNotificationsAsRead: () => void;
  markNotificationAsRead: (id: string) => void;

  // Live Stream
  openLiveStreamAsViewer: (streamId: string) => void;
  sendLiveComment: (text: string) => void;
  startHostLiveStream: (title: string, topic: string, aboutMe: string) => void;
  endHostLiveStream: () => void;
  toggleLiveSource: (source: 'camera' | 'mic' | 'screen') => void;

  // Modals & Drawers
  commentsVideoId: string | null;
  setCommentsVideoId: (videoId: string | null) => void;
  reportModal: ReportModalConfig | null;
  openReportModal: (config: Omit<ReportModalConfig, 'isOpen'>) => void;
  closeReportModal: () => void;
  audioLibraryOpen: boolean;
  setAudioLibraryOpen: (open: boolean) => void;
  onSelectAudioCallback: ((track: AudioTrack) => void) | null;
  openAudioLibrary: (callback: (track: AudioTrack) => void) => void;

  // Search & Global state
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Supabase Database Connection & Admin Operations
  supabaseModalOpen: boolean;
  setSupabaseModalOpen: (open: boolean) => void;
  isSupabaseConnected: boolean;
  syncWithSupabase: () => Promise<void>;
  admins: AdminRecord[];
  isAdmin: boolean;
  addAdmin: (admin: Partial<AdminRecord>) => Promise<boolean>;
  removeAdmin: (adminId: string) => Promise<boolean>;
  deleteUserAdmin: (userId: string) => Promise<boolean>;
  deleteVideoAdmin: (videoId: string) => Promise<boolean>;
  approveVideoAdmin: (videoId: string) => Promise<boolean>;
  rejectVideoAdmin: (videoId: string, reason?: string) => Promise<boolean>;
  submitVideoAppeal: (videoId: string, reason: string) => Promise<boolean>;
  reviewVideoAppeal: (videoId: string, decision: 'approved' | 'declined') => Promise<boolean>;
  updateReportStatusAdmin: (
    reportId: string,
    type: 'video' | 'user',
    status: 'Approved' | 'Rejected' | 'Under Review'
  ) => Promise<boolean>;
  syncAllToSupabase: () => Promise<{ success: boolean; message: string }>;

  // Per-User Interactions & Account Switch
  switchAccountModalOpen: boolean;
  setSwitchAccountModalOpen: (open: boolean) => void;
  savedAccounts: User[];
  removeSavedAccount: (userId: string) => void;
  userLikes: Record<string, string[]>;
  getUserLikedVideos: (userId: string) => Video[];

  // Feed refresh & shuffle trigger
  feedRefreshKey: number;
  refreshFeed: () => void;
}

export const deduplicateVideos = (videoList: Video[]): Video[] => {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const result: Video[] = [];

  for (const v of videoList) {
    if (!v || !v.id) continue;
    if (seenIds.has(v.id)) continue;

    const creatorKey = v.creatorId || v.creator?.id || '';
    const captionKey = (v.caption || '').trim().toLowerCase();
    const mediaKey = (v.mediaUrl || '').trim();

    if (mediaKey && creatorKey) {
      const contentKey = `${creatorKey}___${captionKey}___${mediaKey}`;
      if (seenContent.has(contentKey)) continue;
      seenContent.add(contentKey);
    }

    seenIds.add(v.id);
    result.push(v);
  }
  return result;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth state - initialized strictly to null if no authenticated user exists
  // Guarantees visitors see the login/register page first
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = storage.get<User | null>('currentUser', null);
    if (saved && saved.id && (saved.username || saved.displayName) && saved.id !== 'user_main') {
      return saved;
    }
    return null;
  });
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // Navigation tab
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Core Data
  const [users, setUsers] = useState<User[]>(() => {
    return storage.get<User[]>('users', INITIAL_USERS);
  });

  const [videos, setVideos] = useState<Video[]>(() => {
    const stored = storage.get<Video[]>('videos', INITIAL_VIDEOS);
    return deduplicateVideos(stored);
  });

  const [audioTracksList, setAudioTracksList] = useState<AudioTrack[]>(() =>
    storage.get('audioTracks', INITIAL_AUDIO_TRACKS)
  );

  // Combine curated audio tracks + sounds from all uploaded community videos
  const audioTracks = useMemo<AudioTrack[]>(() => {
    const map = new Map<string, AudioTrack>();
    // 1. Curated / stored tracks
    (audioTracksList || []).forEach(t => {
      if (t && t.id) map.set(t.id, t);
    });
    // 2. Original sounds from videos (other users' videos audio)
    (videos || []).forEach(v => {
      if (!v || !v.mediaUrl || v.status === 'rejected') return;
      if (v.audioTrack && v.audioTrack.id) {
        map.set(v.audioTrack.id, v.audioTrack);
      }
      const soundId = `sound_vid_${v.id}`;
      if (!map.has(soundId)) {
        const creatorName = v.creator?.displayName || v.creator?.username || 'Creator';
        const cleanCaption = (v.caption || '').replace(/#\w+/g, '').trim();
        map.set(soundId, {
          id: soundId,
          title: v.audioTrack?.title || `Original Sound - @${v.creator?.username || 'creator'}`,
          artist: `${creatorName}${cleanCaption ? ` · "${cleanCaption.slice(0, 24)}"` : ''}`,
          duration: v.audioTrack?.duration || '00:30',
          coverUrl: v.thumbnailUrl || v.creator?.avatar || '',
          audioUrl: v.audioTrack?.audioUrl || v.mediaUrl,
          sourceVideoId: v.id,
          sourceUsername: v.creator?.username || '',
        });
      }
    });
    return Array.from(map.values());
  }, [audioTracksList, videos]);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const resetDone = storage.get<boolean>('conversations_reset_zero_v6', false);
    if (!resetDone) {
      storage.set('conversations_reset_zero_v6', true);
      storage.set('conversations', []);
      return [];
    }
    return storage.get<Conversation[]>('conversations', []);
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesMobileView, setMessagesMobileView] = useState<'list' | 'chat'>('list');
  
  // Follow System Relations and Requests
  const [followRelations, setFollowRelations] = useState<FollowRelation[]>(() =>
    storage.get<FollowRelation[]>('follow_relations_v2', INITIAL_FOLLOWS)
  );
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>(() =>
    storage.get<FollowRequest[]>('follow_requests_v2', INITIAL_FOLLOW_REQUESTS)
  );

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const raw = storage.get<NotificationItem[]>('notifications', INITIAL_NOTIFICATIONS);
    const readIds = getReadNotificationIds();
    // Sanitize any previous simulated reciprocal notifications or old entries where actor is user_andrea
    return raw
      .filter(n => !n.targetText?.includes('back!') && n.actor?.id !== 'user_andrea')
      .map(n => {
        const isReadLocally = readIds.has(n.id) || (n.id ? readIds.has(toUuid(n.id)) : false);
        const nowIso = new Date().toISOString();
        return {
          ...n,
          timestamp: n.createdAt || n.timestamp || nowIso,
          createdAt: n.createdAt || n.timestamp || nowIso,
          isUnread: isReadLocally ? false : n.isUnread,
        };
      });
  });
  const [reports, setReports] = useState<ReportItem[]>(() => storage.get('reports', INITIAL_REPORTS));
  const [admins, setAdmins] = useState<AdminRecord[]>(() => storage.get('admins', []));
  const [currentLiveStream, setCurrentLiveStream] = useState<LiveStream>(() => storage.get('livestream', INITIAL_LIVESTREAM));

  // Per-User Likes storage map: { [userId: string]: string[] (videoIds) }
  const [userLikes, setUserLikes] = useState<Record<string, string[]>>(() =>
    storage.get<Record<string, string[]>>('user_likes_map', {})
  );

  // Account switcher modal
  const [switchAccountModalOpen, setSwitchAccountModalOpen] = useState<boolean>(false);

  // Saved accounts list for switching accounts on this device
  const [savedAccounts, setSavedAccounts] = useState<User[]>(() => {
    const saved = storage.get<User[]>('saved_accounts_v2', []);
    const current = storage.get<User | null>('currentUser', null);
    if (current && current.id && (current.username || current.displayName)) {
      const exists = saved.some(
        s => s.id === current.id || (s.email && current.email && s.email.toLowerCase() === current.email.toLowerCase())
      );
      if (!exists) {
        const init = [current, ...saved];
        storage.set('saved_accounts_v2', init);
        return init;
      }
    }
    return saved;
  });

  const recordSavedAccount = (acc: User) => {
    setSavedAccounts(prev => {
      const filtered = prev.filter(
        a => a.id !== acc.id && (!acc.email || !a.email || a.email.toLowerCase() !== acc.email.toLowerCase())
      );
      const next = [acc, ...filtered].slice(0, 5); // Device limit of 5 logged-in accounts
      storage.set('saved_accounts_v2', next);
      return next;
    });
  };

  const removeSavedAccount = (userId: string) => {
    setSavedAccounts(prev => {
      const next = prev.filter(a => a.id !== userId);
      storage.set('saved_accounts_v2', next);
      return next;
    });
  };

  // Feed refresh trigger counter: incrementing this forces feed re-shuffle and reload
  const [feedRefreshKey, setFeedRefreshKey] = useState<number>(0);
  const refreshFeed = () => {
    setFeedRefreshKey(k => k + 1);
    syncWithSupabase();
  };

  // Dynamic admin state (queried from Supabase Admin table or role)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    const saved = storage.get<User | null>('currentUser', null);
    if (!saved) return false;
    const r = String(saved.role || '').toLowerCase();
    return r === 'admin' || r === 'super admin' || r === 'administrator';
  });

  // Modals
  const [commentsVideoId, setCommentsVideoId] = useState<string | null>(null);
  const [reportModal, setReportModal] = useState<ReportModalConfig | null>(null);
  const [audioLibraryOpen, setAudioLibraryOpen] = useState<boolean>(false);
  const [onSelectAudioCallback, setOnSelectAudioCallback] = useState<((track: AudioTrack) => void) | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supabaseModalOpen, setSupabaseModalOpen] = useState<boolean>(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(() => getSupabaseConfig().isConnected);

  // Verify whether the logged in user is an Administrator directly from Supabase / role
  useEffect(() => {
    let isCancelled = false;
    const verifyAdminStatus = async () => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }
      const rawRole = String(currentUser.role || '').toLowerCase();
      if (rawRole === 'admin' || rawRole === 'super admin' || rawRole === 'administrator') {
        setIsAdmin(true);
        return;
      }
      // Check cached admins list
      const matchedLocal = admins.some(
        a =>
          (a.userId && (a.userId === currentUser.id)) ||
          (a.email && currentUser.email && a.email.toLowerCase() === currentUser.email.toLowerCase()) ||
          (a.username && currentUser.username && a.username.toLowerCase() === currentUser.username.toLowerCase())
      );
      if (matchedLocal) {
        setIsAdmin(true);
        return;
      }
      // Query Supabase directly
      try {
        const remoteIsAdmin = await supabaseDb.checkIsAdmin(currentUser);
        if (!isCancelled) {
          setIsAdmin(remoteIsAdmin);
          if (remoteIsAdmin) {
            setCurrentUser(prev => (prev ? { ...prev, role: 'admin' } : prev));
          }
        }
      } catch {
        if (!isCancelled) setIsAdmin(false);
      }
    };
    verifyAdminStatus();
    return () => {
      isCancelled = true;
    };
  }, [currentUser, admins]);

  // Load current user's liked videos from Supabase on login / account switch
  useEffect(() => {
    if (!currentUser) return;
    supabaseDb.fetchUserLikes(currentUser.id).then(likes => {
      if (likes && likes.length > 0) {
        setUserLikes(prev => {
          const currentList = prev[currentUser.id] || [];
          const combined = Array.from(new Set([...currentList, ...likes]));
          const next = { ...prev, [currentUser.id]: combined };
          storage.set('user_likes_map', next);
          return next;
        });
      }
    });
  }, [currentUser]);

  // Dynamically compute `isLiked` per video strictly for the active currentUser!
  const currentUserLikes = (currentUser && userLikes[currentUser.id]) || [];
  const currentUserLikedSet = React.useMemo(() => new Set(currentUserLikes), [currentUserLikes]);

  const activeVideos = React.useMemo(() => {
    return deduplicateVideos(videos).map(v => ({
      ...v,
      isLiked: currentUserLikedSet.has(v.id),
    }));
  }, [videos, currentUserLikedSet]);

  const getUserLikedVideos = (userId: string): Video[] => {
    const targetLikes = new Set(userLikes[userId] || []);
    return activeVideos.filter(v => targetLikes.has(v.id));
  };

  // Sync state with cloud Supabase database when connected
  const syncWithSupabase = async () => {
    const config = getSupabaseConfig();
    setIsSupabaseConnected(config.isConnected);
    if (!config.isConnected) return;

    try {
      const [remoteUsers, remoteVideos, remoteAdmins, remoteReports, remoteNotifications] = await Promise.all([
        supabaseDb.fetchUsers(),
        supabaseDb.fetchVideos(),
        supabaseDb.fetchAdmins(),
        supabaseDb.fetchReports(),
        supabaseDb.fetchNotifications(),
      ]);

      if (remoteUsers && remoteUsers.length > 0) {
        setUsers(prev => {
          const userMap = new Map<string, User>();
          const emailMap = new Map<string, string>(); // email -> id

          for (const u of remoteUsers) {
            const emailKey = u.email ? u.email.trim().toLowerCase() : null;
            if (emailKey && emailMap.has(emailKey)) {
              const existingId = emailMap.get(emailKey)!;
              const existing = userMap.get(existingId);
              if (existing && (u.role === 'admin' || existing.role !== 'admin')) {
                existing.role = u.role === 'admin' ? 'admin' : existing.role;
              }
              continue; // Deduplicate
            }
            userMap.set(u.id, u);
            if (emailKey) emailMap.set(emailKey, u.id);
          }

          for (const u of prev) {
            const emailKey = u.email ? u.email.trim().toLowerCase() : null;
            if (emailKey && emailMap.has(emailKey)) continue;
            if (!userMap.has(u.id)) {
              userMap.set(u.id, u);
              if (emailKey) emailMap.set(emailKey, u.id);
            }
          }

          return Array.from(userMap.values());
        });
      }

      if (remoteVideos !== null) {
        const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
        const patchedRemote = remoteVideos.map(v => {
          const appeal = storedAppeals[v.id] || storedAppeals[toUuid(v.id)];
          if (appeal) {
            return {
              ...v,
              appealStatus: appeal.status || v.appealStatus,
              appealReason: appeal.reason || v.appealReason,
              status: appeal.status === 'approved' ? 'approved' : v.status,
            };
          }
          return v;
        });

        setVideos(prev => {
          const localAppealMap = new Map<string, typeof prev[0]>();
          prev.forEach(p => {
            if (p.appealStatus && p.appealStatus !== 'none') {
              localAppealMap.set(p.id, p);
              localAppealMap.set(toUuid(p.id), p);
            }
          });

          const enhanced = patchedRemote.map(r => {
            const local = localAppealMap.get(r.id) || localAppealMap.get(toUuid(r.id));
            if (local && (!r.appealStatus || r.appealStatus === 'none')) {
              return {
                ...r,
                appealStatus: local.appealStatus,
                appealReason: local.appealReason,
              };
            }
            return r;
          });

          const merged = deduplicateVideos([...enhanced, ...prev]);
          storage.set('videos', merged);
          return merged;
        });
      }

      try {
        const remoteAudio = await supabaseDb.fetchAudioTracks();
        if (remoteAudio && remoteAudio.length > 0) {
          setAudioTracksList(prev => {
            const map = new Map<string, AudioTrack>();
            prev.forEach(t => map.set(t.id, t));
            remoteAudio.forEach(t => map.set(t.id, t));
            const merged = Array.from(map.values());
            storage.set('audioTracks', merged);
            return merged;
          });
        }
      } catch (e) {
        // audio sync fallback
      }

      if (remoteAdmins && remoteAdmins.length > 0) {
        setAdmins(remoteAdmins);
      }

      if (remoteReports && remoteReports.length > 0) {
        setReports(prev => {
          const map = new Map<string, ReportItem>();
          prev.forEach(r => map.set(r.id, r));
          remoteReports.forEach(r => {
            const existingKey = Array.from(map.keys()).find(
              k => k === r.id || toUuid(k) === toUuid(r.id)
            );
            if (existingKey) {
              const existing = map.get(existingKey)!;
              map.set(existingKey, {
                ...existing,
                status: r.status,
                targetName: existing.targetName || r.targetName,
                targetThumbnail: existing.targetThumbnail || r.targetThumbnail,
                targetSubtitle: existing.targetSubtitle || r.targetSubtitle,
              });
            } else {
              map.set(r.id, r);
            }
          });
          const merged = Array.from(map.values());
          storage.set('reports', merged);
          return merged;
        });
      }

      if (remoteNotifications && remoteNotifications.length > 0) {
        const readIds = getReadNotificationIds();
        setNotifications(prev => {
          const map = new Map<string, NotificationItem>();
          prev.forEach(n => map.set(n.id, n));
          remoteNotifications.forEach(n => {
            const existingKey = Array.from(map.keys()).find(
              k => k === n.id || toUuid(k) === toUuid(n.id)
            );
            const isReadLocally =
              readIds.has(n.id) ||
              (n.id ? readIds.has(toUuid(n.id)) : false) ||
              (existingKey && map.get(existingKey)?.isUnread === false);

            if (existingKey) {
              const existing = map.get(existingKey)!;
              map.set(existingKey, {
                ...n,
                ...existing,
                isUnread: isReadLocally ? false : n.isUnread,
              });
            } else {
              map.set(n.id, {
                ...n,
                isUnread: isReadLocally ? false : n.isUnread,
              });
            }
          });
          const merged = Array.from(map.values());
          storage.set('notifications', merged);
          return merged;
        });
      }
    } catch (err) {
      console.warn('Initial Supabase sync fallback:', err);
    }
  };

  // Sync Supabase user session (Google OAuth or email session) into user profile
  const handleSupabaseUserSession = async (sbUser: any) => {
    if (!sbUser) return;
    const meta = sbUser.user_metadata || {};
    const email = (sbUser.email || '').trim().toLowerCase();
    const displayName = meta.full_name || meta.name || (email ? email.split('@')[0] : 'User');
    const rawUsername = meta.user_name || meta.preferred_username || (email ? email.split('@')[0] : `user_${sbUser.id.slice(0, 8)}`);
    const username = rawUsername.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase() || `user_${sbUser.id.slice(0, 6)}`;
    const avatar = meta.avatar_url || meta.picture || '';

    // Check if user already exists in database or state to NEVER create duplicate accounts
    let existingUser: User | null = null;
    try {
      const remoteUsers = await supabaseDb.fetchUsers();
      if (remoteUsers) {
        existingUser = remoteUsers.find(
          u => u.id === sbUser.id || (email && u.email?.trim().toLowerCase() === email)
        ) || null;
      }
    } catch {
      // fallback
    }

    if (!existingUser && email) {
      existingUser = users.find(
        u => u.id === sbUser.id || (u.email && u.email.trim().toLowerCase() === email)
      ) || null;
    }

    // Check admin privilege
    let isAdminRole = existingUser?.role === 'admin';
    if (!isAdminRole && email) {
      isAdminRole = admins.some(a => a.email && a.email.trim().toLowerCase() === email);
    }
    if (!isAdminRole) {
      try {
        isAdminRole = await supabaseDb.checkIsAdmin({ id: existingUser?.id || sbUser.id, email });
      } catch {}
    }

    // Always re-use existing UserID if this email already has an account!
    const finalUserId = existingUser?.id || sbUser.id;

    const finalUser: User = {
      id: finalUserId,
      username: existingUser?.username || username,
      displayName: existingUser?.displayName || displayName,
      email: sbUser.email || email,
      avatar: existingUser?.avatar || avatar,
      bio: existingUser?.bio || '',
      followingCount: existingUser?.followingCount || 0,
      followersCount: existingUser?.followersCount || 0,
      likesCount: existingUser?.likesCount || '0',
      isPrivate: existingUser?.isPrivate || false,
      role: isAdminRole ? 'admin' : (existingUser?.role || 'creator'),
    };

    setCurrentUser(finalUser);
    storage.set('currentUser', finalUser);
    recordSavedAccount(finalUser);

    setUsers(prev => {
      // Filter out any duplicates with same id or email
      const filtered = prev.filter(
        u => u.id !== finalUserId && (!email || u.email?.trim().toLowerCase() !== email)
      );
      return [finalUser, ...filtered];
    });

    // Record user profile in Supabase database
    await supabaseDb.upsertUser(finalUser);
  };

  // Listen to real Supabase Auth events (Google OAuth redirects, session tokens, sign out)
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    // Check existing session on load only if no account is currently active in storage
    client.auth.getSession().then(({ data: { session } }) => {
      const activeStored = storage.get<User | null>('currentUser', null);
      if (!activeStored && session?.user) {
        handleSupabaseUserSession(session.user);
      }
    });

    // Listen to live auth state changes
    const { data: authSubscription } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        if (session?.user) {
          const activeStored = storage.get<User | null>('currentUser', null);
          const isExplicitOAuthRedirect =
            typeof window !== 'undefined' &&
            (window.location.hash.includes('access_token') || window.location.search.includes('code='));

          // If there is an active user currently in storage, check if this event belongs to them
          if (activeStored) {
            const isSameUser =
              activeStored.id === session.user.id ||
              toUuid(activeStored.id) === toUuid(session.user.id) ||
              (activeStored.email &&
                session.user.email &&
                activeStored.email.trim().toLowerCase() === session.user.email.trim().toLowerCase());

            // If the user deliberately switched to a different account (e.g. Account 2),
            // a background tab-focus / token refresh from Account 1 MUST NOT switch them back!
            if (!isSameUser && !isExplicitOAuthRedirect) {
              return;
            }
          }

          await handleSupabaseUserSession(session.user);
        }
      } else if (event === 'INITIAL_SESSION') {
        const activeStored = storage.get<User | null>('currentUser', null);
        if (!activeStored && session?.user) {
          await handleSupabaseUserSession(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        // Do not force wipe if user is just switching local accounts
      }
    });

    return () => {
      authSubscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (getSupabaseConfig().isConnected) {
      syncWithSupabase();
    }
  }, []);

  // Sync to storage
  useEffect(() => {
    storage.set('currentUser', currentUser);
  }, [currentUser]);

  useEffect(() => {
    storage.set('users', users);
  }, [users]);

  useEffect(() => {
    storage.set('videos', videos);
  }, [videos]);

  useEffect(() => {
    storage.set('conversations', conversations);
  }, [conversations]);

  useEffect(() => {
    storage.set('follow_relations_v2', followRelations);
  }, [followRelations]);

  useEffect(() => {
    storage.set('follow_requests_v2', followRequests);
  }, [followRequests]);

  useEffect(() => {
    storage.set('notifications', notifications);
  }, [notifications]);

  useEffect(() => {
    storage.set('reports', reports);
  }, [reports]);

  useEffect(() => {
    storage.set('livestream', currentLiveStream);
  }, [currentLiveStream]);

  // Account-specific conversation filtering: only conversations current user is part of, and NOT deleted by currentUser!
  const userConversations = conversations.filter(c => {
    if (!currentUser) return false;
    const isParticipant = (c.participantIds && c.participantIds.length > 0)
      ? c.participantIds.includes(currentUser.id)
      : c.participant.id !== currentUser.id;
    if (!isParticipant) return false;

    // If currentUser deleted this conversation, hide it from currentUser
    if (c.deletedForUserIds && c.deletedForUserIds.includes(currentUser.id)) {
      return false;
    }
    return true;
  });

  // Total unread messages across conversations for currentUser
  const totalUnreadMessages = userConversations.reduce((acc, conv) => {
    if (!currentUser) return acc;
    if (conv.unreadCounts && typeof conv.unreadCounts[currentUser.id] === 'number') {
      return acc + conv.unreadCounts[currentUser.id];
    }
    return acc + (conv.unreadCount || 0);
  }, 0);

  // User's own notifications inbox: interactions addressed to currentUser
  const userNotifications = notifications.filter(n => {
    if (!currentUser) return false;

    // Check if notification is addressed to currentUser (by direct ID, email, or UUID equivalence)
    const isRecipient =
      !n.recipientId ||
      n.recipientId === currentUser.id ||
      (currentUser.email && n.recipientId.toLowerCase() === currentUser.email.toLowerCase()) ||
      (n.recipientEmail && currentUser.email && n.recipientEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
      toUuid(n.recipientId) === toUuid(currentUser.id);

    if (!isRecipient) return false;

    // NEVER drop moderation/system notifications (video_revoked, appeal_status, report updates)
    if (n.type === 'video_revoked' || n.type === 'appeal_status') {
      return true;
    }

    // For social notifications (likes, comments, follows), don't notify user of their own actions
    if (n.actor?.id && n.actor.id === currentUser.id) {
      return false;
    }

    // Filter out any simulated reciprocal artifacts
    if (n.targetText?.includes('back!')) return false;

    return true;
  });

  const totalUnreadNotifications = userNotifications.filter(n => n.isUnread).length;

  // Auth functions with Supabase & Google OAuth integration
  const login = async (
    usernameOrEmail: string,
    password?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const trimmed = usernameOrEmail.trim();
    if (!trimmed) {
      return { success: false, message: 'Please enter your username or email' };
    }
    if (!password || !password.trim()) {
      return { success: false, message: 'Please enter your password' };
    }

    const isEmail = trimmed.includes('@');
    const config = getSupabaseConfig();

    // 1. If Supabase is connected, authenticate against Supabase (Supabase Auth & User table)
    if (config.isConnected) {
      let targetEmail = isEmail ? trimmed.toLowerCase() : '';

      // If user provided a username, find their email from Supabase
      if (!targetEmail) {
        const found = users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
        if (found?.email) {
          targetEmail = found.email.toLowerCase();
        } else {
          const client = getSupabaseClient();
          if (client) {
            try {
              const { data: dbUser } = await client
                .from('User')
                .select('Email')
                .ilike('Username', trimmed)
                .limit(1)
                .maybeSingle();
              if (dbUser?.Email) {
                targetEmail = dbUser.Email.toLowerCase();
              }
            } catch {}
          }
        }
      }

      // A. Try Supabase Auth email + password sign in
      if (targetEmail) {
        const { user, error } = await signInWithEmail(targetEmail, password);
        if (error) {
          if (error.message?.toLowerCase().includes('email not confirmed')) {
            return {
              success: false,
              message: 'Your email has not been confirmed yet. Please check your inbox (and spam folder) for the confirmation link to activate your account.',
            };
          }
        }
        if (user && !error) {
          await handleSupabaseUserSession(user);
          return { success: true };
        }
      }

      // B. Check Supabase User table records
      const client = getSupabaseClient();
      if (client) {
        try {
          const { data: matchedRows } = await client
            .from('User')
            .select('*')
            .or(`Email.ilike.${trimmed},Username.ilike.${trimmed}`)
            .limit(1);

          if (matchedRows && matchedRows.length > 0) {
            const dbUser = matchedRows[0];
            // Check password if stored in User table
            if (dbUser.Password && dbUser.Password !== password) {
              return { success: false, message: 'Incorrect password. Please try again.' };
            }

            const rawRole = String(dbUser.Role || dbUser.role || '').toLowerCase();
            const isAdminRecord = rawRole === 'admin' || rawRole === 'super admin' || rawRole === 'administrator' || rawRole === 'content moderator';
            const loggedInUser: User = {
              id: dbUser.UserID || dbUser.id,
              username: dbUser.Username || dbUser.username,
              displayName: dbUser.DisplayName || dbUser.display_name || dbUser.Username,
              email: dbUser.Email || dbUser.email || '',
              avatar: dbUser.ProfilePictureURL || dbUser.avatar_url || '',
              bio: dbUser.Bio || dbUser.bio || '',
              followingCount: 0,
              followersCount: 0,
              likesCount: '0',
              isPrivate: dbUser.IsPublic !== undefined ? !dbUser.IsPublic : false,
              role: isAdminRecord ? 'admin' : ((dbUser.Role || 'creator') as any),
            };

            setCurrentUser(loggedInUser);
            storage.set('currentUser', loggedInUser);
            if (isAdminRecord) setIsAdmin(true);
            recordSavedAccount(loggedInUser);
            setActiveConversationId(null);
            setMessagesMobileView('list');
            setSelectedUserId(null);
            return { success: true };
          }
        } catch (e) {
          console.warn('Supabase User table login check fallback:', e);
        }
      }

      // Unrecognized credentials in Supabase
      return {
        success: false,
        message: 'Account not found. Please register first or verify your credentials in Supabase.',
      };
    }

    // 2. Local fallback when Supabase is not connected
    const clean = trimmed.toLowerCase().replace('@', '');
    const found = users.find(
      u => u.username.toLowerCase() === clean || u.email.toLowerCase() === trimmed.toLowerCase()
    );

    if (found) {
      setCurrentUser(found);
      storage.set('currentUser', found);
      recordSavedAccount(found);
      if (found.role === 'admin') setIsAdmin(true);
      setActiveConversationId(null);
      setMessagesMobileView('list');
      setSelectedUserId(null);
      return { success: true };
    }

    // STRICT: Do NOT auto-create a user on invalid login credentials!
    return {
      success: false,
      message: 'Account not found. Please register for an account first.',
    };
  };

  const register = async (
    username: string,
    email: string,
    password?: string
  ): Promise<{
    success: boolean;
    message?: string;
    needsEmailConfirmation?: boolean;
    email?: string;
  }> => {
    const clean = username.replace('@', '').trim().toLowerCase();
    const cleanEmail = email.trim();

    const config = getSupabaseConfig();
    if (config.isConnected && password) {
      const { user, session, error } = await signUpWithEmail(cleanEmail, password, clean, username.trim());
      if (error) {
        return { success: false, message: error.message };
      }
      if (user) {
        const newUser: User = {
          id: user.id,
          username: clean,
          displayName: username.trim(),
          email: cleanEmail,
          avatar: '',
          bio: '',
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: false,
          role: 'creator',
        };
        const upsertRes = await supabaseDb.upsertUser(newUser, password);
        if (!upsertRes.success && upsertRes.error) {
          console.warn('Supabase upsertUser during register warning:', upsertRes.error);
        }
        setUsers(prev => {
          const map = new Map(prev.map(u => [u.id, u]));
          map.set(newUser.id, newUser);
          return Array.from(map.values());
        });
        // If email is already registered in Supabase Auth, identities array is empty
        if (user.identities && user.identities.length === 0) {
          return {
            success: false,
            message: 'This email is already registered. Please click "Go to Login" to sign in with your password.',
          };
        }

        // Check if email confirmation is required by Supabase Auth
        const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || session);
        if (!isConfirmed) {
          // Do NOT log them in yet! Return email confirmation prompt
          return {
            success: true,
            needsEmailConfirmation: true,
            email: cleanEmail,
            message: `Confirmation email sent to ${cleanEmail}! Please check your inbox and click the verification link to activate your account.`,
          };
        }

        // If email confirmation is disabled or session was provided immediately:
        setCurrentUser(newUser);
        storage.set('currentUser', newUser);
        recordSavedAccount(newUser);
        setActiveConversationId(null);
        setMessagesMobileView('list');
        setSelectedUserId(null);
        await handleSupabaseUserSession(user);
        return { success: true };
      }
    }

    // Local / fallback registration
    const newUser: User = {
      id: `user_${Date.now()}`,
      username: clean,
      displayName: username.trim(),
      email: cleanEmail,
      avatar: '',
      bio: '',
      followingCount: 0,
      followersCount: 0,
      likesCount: '0',
      isPrivate: false,
      role: 'creator',
    };
    setUsers(prev => [newUser, ...prev]);
    setCurrentUser(newUser);
    storage.set('currentUser', newUser);
    recordSavedAccount(newUser);
    setActiveConversationId(null);
    setMessagesMobileView('list');
    setSelectedUserId(null);
    await supabaseDb.upsertUser(newUser, password);
    return { success: true };
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; message?: string }> => {
    const config = getSupabaseConfig();
    if (!config.isConnected) {
      return {
        success: false,
        message: 'Supabase credentials are not connected. Please verify your Supabase URL and Anon Key in environment variables or configuration.',
      };
    }

    const { error } = await signInWithGoogle();
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
  };

  const logout = async () => {
    // Ensure current active account is saved in the device's logged-in accounts list
    if (currentUser) {
      recordSavedAccount(currentUser);
    }

    try {
      await signOutSupabase();
    } catch {
      // ignore
    }

    // Retain logged-in accounts on device so the user can easily select an account on the login page!
    setCurrentUser(null);
    storage.remove('currentUser');
    setActiveConversationId(null);
    setMessagesMobileView('list');
    setSelectedUserId(null);
    setAuthView('login');
    setIsAdmin(false);
  };

  const quickLoginAs = (userId: string) => {
    let target =
      users.find(u => u.id === userId) ||
      savedAccounts.find(u => u.id === userId);

    if (!target) {
      const matchedAdmin = admins.find(
        a => a.adminId === userId || a.userId === userId || (a.email && a.email.toLowerCase() === userId.toLowerCase())
      );
      if (matchedAdmin) {
        target = {
          id: matchedAdmin.userId || matchedAdmin.adminId,
          username: matchedAdmin.username || 'admin',
          displayName: matchedAdmin.username || 'Administrator',
          email: matchedAdmin.email || '',
          avatar: '',
          bio: `Platform ${matchedAdmin.role || 'Admin'}`,
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: false,
          role: 'admin',
        };
      }
    }

    if (!target) {
      target = DEFAULT_USER;
    }

    const rawRole = String(target.role || '').toLowerCase();
    const isTargetAdmin =
      rawRole === 'admin' ||
      rawRole === 'super admin' ||
      rawRole === 'administrator' ||
      rawRole === 'content moderator' ||
      admins.some(a =>
        (a.userId && a.userId === target.id) ||
        (a.adminId && a.adminId === target.id) ||
        (a.email && target.email && a.email.toLowerCase() === target.email.toLowerCase()) ||
        (a.username && target.username && a.username.toLowerCase() === target.username.toLowerCase())
      );

    const updatedTarget: User = {
      ...target,
      role: isTargetAdmin ? 'admin' : (target.role || 'creator'),
    };

    setCurrentUser(updatedTarget);
    storage.set('currentUser', updatedTarget);
    setIsAdmin(isTargetAdmin);
    recordSavedAccount(updatedTarget);

    setActiveConversationId(null);
    setMessagesMobileView('list');
    setSelectedUserId(null);

    // Refresh feed and shuffle
    refreshFeed();

    // Also verify remote admin asynchronously in case not cached
    if (!isTargetAdmin && updatedTarget.email) {
      supabaseDb.checkIsAdmin(updatedTarget).then(remoteAdmin => {
        if (remoteAdmin) {
          setIsAdmin(true);
          setCurrentUser(prev => (prev?.id === updatedTarget.id ? { ...prev, role: 'admin' } : prev));
        }
      }).catch(() => {});
    }
  };

  const navigateToUserProfile = (userId: string) => {
    if (currentUser && userId === currentUser.id) {
      setSelectedUserId(null);
      setActiveTab('profile');
    } else {
      setSelectedUserId(userId);
      setActiveTab('profile');
    }
  };

  // Profile update (BR-002)
  const updateUserProfile = (updates: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUsers(prev => prev.map(u => (u.id === currentUser.id ? updated : u)));
    supabaseDb.upsertUser(updated);
  };

  // Follow & Relationship System (BR-011, BR-012, Friends mutual follow, Private requests)
  const isTargetFollowingMe = (targetUserId: string): boolean => {
    if (!currentUser) return false;
    return followRelations.some(
      f => f.followerId === targetUserId && f.followingId === currentUser.id
    );
  };

  const getFollowStatus = (targetUserId: string): FollowStatus => {
    if (!currentUser || currentUser.id === targetUserId) return 'none';
    const currFollowsTarget = followRelations.some(
      f => f.followerId === currentUser.id && f.followingId === targetUserId
    );
    const targetFollowsCurr = followRelations.some(
      f => f.followerId === targetUserId && f.followingId === currentUser.id
    );

    if (currFollowsTarget && targetFollowsCurr) {
      return 'friends';
    }
    if (currFollowsTarget) {
      return 'following';
    }
    const hasPendingRequest = followRequests.some(
      r => r.fromUserId === currentUser.id && r.toUserId === targetUserId
    );
    if (hasPendingRequest) {
      return 'requested';
    }
    return 'none';
  };

  const toggleFollowUser = (userId: string) => {
    if (!currentUser || currentUser.id === userId) return;
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    const currentStatus = getFollowStatus(userId);

    // Case 1: Already Friends or Following -> Unfollow
    if (currentStatus === 'friends' || currentStatus === 'following') {
      setFollowRelations(prev =>
        prev.filter(f => !(f.followerId === currentUser.id && f.followingId === userId))
      );

      setUsers(prev =>
        prev.map(u => {
          if (u.id === userId) {
            return { ...u, followersCount: Math.max(0, u.followersCount - 1) };
          }
          if (u.id === currentUser.id) {
            return { ...u, followingCount: Math.max(0, u.followingCount - 1) };
          }
          return u;
        })
      );

      setCurrentUser(prev =>
        prev ? { ...prev, followingCount: Math.max(0, prev.followingCount - 1) } : prev
      );
      supabaseDb.toggleFollow(currentUser.id, userId, false);
      return;
    }

    // Case 2: Request is pending -> Cancel request
    if (currentStatus === 'requested') {
      setFollowRequests(prev =>
        prev.filter(r => !(r.fromUserId === currentUser.id && r.toUserId === userId))
      );
      setNotifications(prev =>
        prev.filter(
          n => !(n.recipientId === userId && n.actor.id === currentUser.id && n.type === 'follow_request')
        )
      );
      return;
    }

    // Case 3: Not following -> Follow or Send Request
    if (targetUser.isPrivate) {
      // Private account: send request
      const reqId = `req_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const newReq: FollowRequest = {
        id: reqId,
        fromUserId: currentUser.id,
        toUserId: targetUser.id,
        timestamp: nowIso,
      };
      setFollowRequests(prev => [...prev, newReq]);

      const reqNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: targetUser.id,
        type: 'follow_request',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: 'sent you a follow request.',
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        requestId: reqId,
      };
      setNotifications(prev => {
        const next = [reqNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
    } else {
      // Public account: Follow immediately
      setFollowRelations(prev => [
        ...prev,
        { followerId: currentUser.id, followingId: targetUser.id },
      ]);

      const targetFollowsMe = isTargetFollowingMe(targetUser.id);

      setUsers(prev =>
        prev.map(u => {
          if (u.id === targetUser.id) {
            return { ...u, followersCount: u.followersCount + 1 };
          }
          if (u.id === currentUser.id) {
            return { ...u, followingCount: u.followingCount + 1 };
          }
          return u;
        })
      );

      setCurrentUser(prev =>
        prev ? { ...prev, followingCount: prev.followingCount + 1 } : prev
      );

      const notifText = targetFollowsMe
        ? 'followed you back. You are now friends!'
        : 'started following you.';

      const nowIso = new Date().toISOString();
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: targetUser.id,
        type: 'follow',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: notifText,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
      };
      setNotifications(prev => {
        const next = [newNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.toggleFollow(currentUser.id, targetUser.id, true);
      supabaseDb.insertNotification(newNotif, targetUser.id);
    }
  };

  // Sync counts whenever followRelations change
  useEffect(() => {
    setUsers(prev =>
      prev.map(u => ({
        ...u,
        followersCount: followRelations.filter(f => f.followingId === u.id).length,
        followingCount: followRelations.filter(f => f.followerId === u.id).length,
      }))
    );
    if (currentUser) {
      setCurrentUser(prev =>
        prev
          ? {
              ...prev,
              followersCount: followRelations.filter(f => f.followingId === prev.id).length,
              followingCount: followRelations.filter(f => f.followerId === prev.id).length,
            }
          : prev
      );
    }
  }, [followRelations]);

  const acceptFollowRequest = (requestId: string, andFollowBack = true) => {
    if (!currentUser) return;
    const req = followRequests.find(r => r.id === requestId);
    const requesterId = req?.fromUserId;

    if (requesterId) {
      if (andFollowBack) {
        // Mutual follows (Friends): Requester follows currentUser AND currentUser follows requester back
        setFollowRelations(prev => {
          const next = [...prev];
          if (!next.some(f => f.followerId === requesterId && f.followingId === currentUser.id)) {
            next.push({ followerId: requesterId, followingId: currentUser.id });
          }
          if (!next.some(f => f.followerId === currentUser.id && f.followingId === requesterId)) {
            next.push({ followerId: currentUser.id, followingId: requesterId });
          }
          return next;
        });

        const nowIso = new Date().toISOString();
        // Send confirmation notification to requester
        const replyNotif: NotificationItem = {
          id: `notif_${Date.now()}`,
          recipientId: requesterId,
          type: 'follow',
          actor: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatar: currentUser.avatar,
          },
          targetText: 'accepted your follow request. You are now friends!',
          timestamp: nowIso,
          createdAt: nowIso,
          isUnread: true,
          status: 'accepted',
        };
        setNotifications(prev => {
          const next = [replyNotif, ...prev];
          storage.set('notifications', next);
          return next;
        });

        supabaseDb.toggleFollow(requesterId, currentUser.id, true);
        supabaseDb.toggleFollow(currentUser.id, requesterId, true);
        supabaseDb.insertNotification(replyNotif, requesterId);
      } else {
        // Confirm only: Requester follows currentUser, but currentUser does NOT follow them back!
        setFollowRelations(prev => {
          const next = [...prev];
          if (!next.some(f => f.followerId === requesterId && f.followingId === currentUser.id)) {
            next.push({ followerId: requesterId, followingId: currentUser.id });
          }
          return next;
        });

        const nowIso = new Date().toISOString();
        const replyNotif: NotificationItem = {
          id: `notif_${Date.now()}`,
          recipientId: requesterId,
          type: 'follow',
          actor: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatar: currentUser.avatar,
          },
          targetText: 'accepted your follow request.',
          timestamp: nowIso,
          createdAt: nowIso,
          isUnread: true,
          status: 'accepted',
        };
        setNotifications(prev => {
          const next = [replyNotif, ...prev];
          storage.set('notifications', next);
          return next;
        });

        supabaseDb.toggleFollow(requesterId, currentUser.id, true);
        supabaseDb.insertNotification(replyNotif, requesterId);
      }
    }

    // Remove request from pending follow requests
    setFollowRequests(prev => prev.filter(r => r.id !== requestId));

    // Update currentUser notification in inbox
    setNotifications(prev =>
      prev.map(n => {
        if (
          n.requestId === requestId ||
          (requesterId && n.recipientId === currentUser.id && n.actor.id === requesterId && n.type === 'follow_request')
        ) {
          return {
            ...n,
            isUnread: false,
            status: andFollowBack ? 'accepted' : 'confirmed',
            targetText: andFollowBack ? 'You are now friends!' : 'is now following you.',
          };
        }
        return n;
      })
    );
  };

  const declineFollowRequest = (requestId: string) => {
    setFollowRequests(prev => prev.filter(r => r.id !== requestId));
    setNotifications(prev =>
      prev.map(n =>
        n.requestId === requestId
          ? {
              ...n,
              isUnread: false,
              status: 'declined',
              targetText: 'Follow request declined',
            }
          : n
      )
    );
  };

  const getUserFollowers = (userId: string): User[] => {
    const followerIds = followRelations
      .filter(f => f.followingId === userId)
      .map(f => f.followerId);
    return users.filter(u => followerIds.includes(u.id));
  };

  const getUserFollowing = (userId: string): User[] => {
    const followingIds = followRelations
      .filter(f => f.followerId === userId)
      .map(f => f.followingId);
    return users.filter(u => followingIds.includes(u.id));
  };

  const canMessageUser = (targetUserId: string): boolean => {
    if (!currentUser || currentUser.id === targetUserId) return false;
    const target = users.find(u => u.id === targetUserId);
    if (!target) return false;
    if (!target.isPrivate) return true;
    return getFollowStatus(targetUserId) === 'friends';
  };

  const canViewUserFollows = (targetUserId: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.id === targetUserId) return true;
    const target = users.find(u => u.id === targetUserId);
    if (!target) return false;
    if (!target.isPrivate) return true;
    return getFollowStatus(targetUserId) === 'friends';
  };

  // Like video (BR-014, BR-022, BR-024) - Strictly scoped per user!
  const toggleLikeVideo = (videoId: string) => {
    if (!currentUser) return;
    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    const currentlyLiked = currentUserLikedSet.has(videoId);
    const willLike = !currentlyLiked;

    // 1. Update user's personal likes map (stores only this user's liked video IDs)
    setUserLikes(prev => {
      const list = prev[currentUser.id] || [];
      const updatedList = willLike
        ? Array.from(new Set([...list, videoId]))
        : list.filter(id => id !== videoId);
      const next = { ...prev, [currentUser.id]: updatedList };
      storage.set('user_likes_map', next);
      return next;
    });

    // 2. Update aggregate video likesCount without mutating isLiked on the base video record
    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId) {
          const newLikes = willLike ? v.likesCount + 1 : Math.max(0, v.likesCount - 1);
          return { ...v, likesCount: newLikes };
        }
        return v;
      })
    );

    // 3. Connect directly to creator's profile total likesCount!
    setUsers(prev =>
      prev.map(u => {
        if (u.id === video.creatorId) {
          const currentTotal = parseInt(String(u.likesCount || '0'), 10) || 0;
          const newTotal = willLike ? currentTotal + 1 : Math.max(0, currentTotal - 1);
          return { ...u, likesCount: String(newTotal) };
        }
        return u;
      })
    );

    // If video belongs to currentUser, also update currentUser state
    if (video.creatorId === currentUser.id) {
      setCurrentUser(prev => {
        if (!prev) return prev;
        const currentTotal = parseInt(String(prev.likesCount || '0'), 10) || 0;
        const newTotal = willLike ? currentTotal + 1 : Math.max(0, currentTotal - 1);
        return { ...prev, likesCount: String(newTotal) };
      });
    }

    // 4. Send notification ONLY to the VIDEO CREATOR (if not currentUser)
    if (willLike && video.creatorId !== currentUser.id) {
      const nowIso = new Date().toISOString();
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: video.creatorId, // Targeted to video creator!
        type: 'like',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: `liked your video: "${video.caption.slice(0, 30)}..."`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
      };
      setNotifications(prev => {
        const next = [newNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(newNotif, video.creatorId);
    }

    supabaseDb.toggleVideoLike(videoId, currentUser.id, willLike);
  };

  // Add Comment (BR-018, BR-021)
  const addCommentToVideo = (videoId: string, text: string) => {
    if (!currentUser || !text.trim()) return;
    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId) {
          return { ...v, commentsCount: v.commentsCount + 1 };
        }
        return v;
      })
    );

    const commentId = `c_${Date.now()}`;
    supabaseDb.insertComment(commentId, videoId, currentUser, text.trim());

    // Trigger notification to the VIDEO CREATOR (NOT currentUser)
    const video = videos.find(v => v.id === videoId);
    if (video && video.creatorId !== currentUser.id) {
      const nowIso = new Date().toISOString();
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: video.creatorId, // Recipient is the VIDEO CREATOR!
        type: 'comment',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: `commented to your video: "${text.slice(0, 35)}"`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
      };
      setNotifications(prev => {
        const next = [newNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(newNotif, video.creatorId);
    }
  };

  // Share Video (BR-019, BR-020, BR-023)
  const shareVideo = (videoId: string) => {
    if (currentUser) {
      supabaseDb.insertShare(videoId, currentUser.id);
    }

    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId) {
          return { ...v, sharesCount: v.sharesCount + 1 };
        }
        return v;
      })
    );

    // Trigger notification to the VIDEO CREATOR (NOT currentUser)
    const video = videos.find(v => v.id === videoId);
    if (video && currentUser && video.creatorId !== currentUser.id) {
      const nowIso = new Date().toISOString();
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: video.creatorId, // Recipient is the VIDEO CREATOR!
        type: 'share',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: `shared your video: "${video.caption.slice(0, 30)}..."`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
      };
      setNotifications(prev => {
        const next = [newNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(newNotif, video.creatorId);
    }
  };

  // Record Video View (increments view count on video and profile)
  const recordVideoView = (videoId: string) => {
    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId) {
          const raw = String(v.viewsCount || '0').replace(/[^0-9]/g, '');
          const currentViews = parseInt(raw, 10) || 0;
          const newViews = currentViews + 1;
          const formatted =
            newViews >= 1000000
              ? `${(newViews / 1000000).toFixed(1)}M`
              : newViews >= 1000
              ? `${(newViews / 1000).toFixed(1)}K`
              : String(newViews);
          return { ...v, viewsCount: formatted };
        }
        return v;
      })
    );
    supabaseDb.incrementVideoView(videoId);
  };

  // Share video directly to a user in messages
  const shareVideoToUser = (video: Video, targetUserId: string, note?: string): boolean => {
    if (!currentUser) return false;
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return false;

    // Guard: private profile requires friendship
    if (targetUser.isPrivate && getFollowStatus(targetUserId) !== 'friends') {
      return false;
    }

    shareVideo(video.id);

    // Find or create conversation
    let targetConvId = '';
    const existing = conversations.find(
      c => c.participantIds?.includes(currentUser.id) && c.participantIds?.includes(targetUserId)
    );
    if (existing) {
      targetConvId = existing.id;
    } else {
      const newConvId = `conv_${Date.now()}`;
      targetConvId = newConvId;
      const newConv: Conversation = {
        id: newConvId,
        participantIds: [currentUser.id, targetUserId],
        participant: targetUser,
        lastMessage: `🎥 Shared a video: "${video.caption.slice(0, 25)}"`,
        lastMessageTime: 'Just now',
        unreadCount: 0,
        unreadCounts: { [currentUser.id]: 0, [targetUserId]: 1 },
        messages: [],
        deletedForUserIds: [],
        clearedHistoryAt: {},
      };
      setConversations(prev => [newConv, ...prev]);
    }

    const noteText = note?.trim() || '';
    sendMessage(targetConvId, noteText, undefined, video);
    return true;
  };

  // Upload Video (BR-013, BR-015, BR-016)
  const uploadVideo = async (newVideo: {
    caption: string;
    hashtags: string[];
    audioTrack?: AudioTrack;
    mediaUrl: string;
    thumbnailUrl?: string;
    audioVolume?: number;
    originalAudioMuted?: boolean;
    originalAudioVolume?: number;
  }): Promise<boolean> => {
    if (!currentUser) return false;
    const videoId = crypto.randomUUID();
    const created: Video = {
      id: videoId,
      creatorId: currentUser.id,
      creator: currentUser,
      caption: newVideo.caption || 'New viral moment! 🔥',
      hashtags: newVideo.hashtags.length > 0 ? newVideo.hashtags : ['#viral', '#fyp'],
      audioTrack: newVideo.audioTrack,
      mediaUrl: newVideo.mediaUrl,
      thumbnailUrl: newVideo.thumbnailUrl || newVideo.mediaUrl,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      viewsCount: '1',
      isLiked: false,
      createdAt: new Date().toISOString(),
      reportsCount: 0,
      status: 'approved',
      appealStatus: 'none',
      audioVolume: newVideo.audioVolume ?? 100,
      originalAudioMuted: Boolean(newVideo.originalAudioMuted),
      originalAudioVolume: newVideo.originalAudioVolume ?? 100,
    };

    setVideos(prev => {
      const next = deduplicateVideos([created, ...prev]);
      storage.set('videos', next);
      return next;
    });

    // If an audio track was attached, ensure it's saved in Supabase AudioTrack/AudioLibrary
    if (newVideo.audioTrack) {
      supabaseDb.insertAudioTrack(newVideo.audioTrack);
    }

    // Also register this video's original sound as an audio track in Supabase
    const originalSoundTrack: AudioTrack = {
      id: `sound_vid_${videoId}`,
      title: newVideo.audioTrack?.title || `Original Sound - @${currentUser.username}`,
      artist: currentUser.displayName || currentUser.username,
      duration: '00:30',
      coverUrl: created.thumbnailUrl || currentUser.avatar || '',
      audioUrl: newVideo.audioTrack?.audioUrl || created.mediaUrl,
      sourceVideoId: videoId,
      sourceUsername: currentUser.username,
    };
    supabaseDb.insertAudioTrack(originalSoundTrack);

    const ok = await supabaseDb.insertVideo(created);
    return ok;
  };

  // Submit report (BR-006, BR-007, BR-017, BR-025)
  const submitReport = (report: Omit<ReportItem, 'id' | 'timestamp' | 'status'>) => {
    const reportId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const newReport: ReportItem = {
      ...report,
      id: reportId,
      reporterId: currentUser?.id,
      status: 'Under Review',
      timestamp: new Date().toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      }),
      createdAt: nowIso,
    };
    setReports(prev => {
      const next = [newReport, ...prev];
      storage.set('reports', next);
      return next;
    });
    supabaseDb.insertReport(newReport, currentUser?.id);

    // If reporting a video, increment reportsCount
    if (report.type === 'video') {
      setVideos(prev =>
        prev.map(v => (v.id === report.targetId ? { ...v, reportsCount: (v.reportsCount || 0) + 1 } : v))
      );
    }

    // If reporting a user
    if (report.type === 'user') {
      setUsers(prev =>
        prev.map(u => (u.id === report.targetId ? { ...u, isReported: true } : u))
      );
    }
  };

  // Messages handling
  // "the 'red with number on it' will be removed after viewing the inside conversation of it."
  const openConversation = (convId: string) => {
    setActiveConversationId(convId);
    setMessagesMobileView('chat');
    if (!currentUser) return;
    setConversations(prev =>
      prev.map(c => {
        if (c.id === convId) {
          return {
            ...c,
            unreadCount: 0, // Clears badge
            unreadCounts: {
              ...(c.unreadCounts || {}),
              [currentUser.id]: 0,
            },
            messages: c.messages.map(m =>
              m.senderId !== currentUser.id ? { ...m, status: 'read' as const } : m
            ),
          };
        }
        return c;
      })
    );
  };

  const openConversationWithUser = (targetUserId: string) => {
    if (!currentUser) return;
    const target = users.find(u => u.id === targetUserId);

    // Private profile check: cannot send message unless they are friends!
    if (target?.isPrivate && getFollowStatus(target.id) !== 'friends') {
      return;
    }

    // 1. Check if conversation with this participant already exists
    const existing = conversations.find(c => {
      if (c.participantIds && c.participantIds.includes(currentUser.id) && c.participantIds.includes(targetUserId)) {
        return true;
      }
      return c.participant.id === targetUserId;
    });

    if (existing) {
      if (existing.deletedForUserIds?.includes(currentUser.id)) {
        setConversations(prev =>
          prev.map(c =>
            c.id === existing.id
              ? {
                  ...c,
                  deletedForUserIds: (c.deletedForUserIds || []).filter(id => id !== currentUser.id),
                }
              : c
          )
        );
      }
      openConversation(existing.id);
      setMessagesMobileView('chat');
      setActiveTab('messages');
      return;
    }

    // 2. If not, create new conversation
    if (target) {
      const newConv: Conversation = {
        id: `conv_${currentUser.id}_${target.id}_${Date.now()}`,
        participantIds: [currentUser.id, target.id],
        participant: target,
        lastMessage: 'Started a conversation',
        lastMessageTime: 'Just now',
        unreadCount: 0,
        unreadCounts: { [currentUser.id]: 0, [target.id]: 0 },
        isOnline: true,
        lastSeen: 'online',
        messages: [],
        deletedForUserIds: [],
        clearedHistoryAt: {},
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessagesMobileView('chat');
      setActiveTab('messages');
      return;
    }

    // Fallback if targetUserId is already a convId
    openConversation(targetUserId);
    setMessagesMobileView('chat');
    setActiveTab('messages');
  };

  const sendMessage = (
    convId: string,
    text: string,
    replyTo?: MessageReplyInfo,
    sharedVideo?: Video
  ) => {
    if (!currentUser && !sharedVideo) return;
    if (!text.trim() && !sharedVideo) return;

    const conv = conversations.find(c => c.id === convId);
    const recipientId =
      conv?.participantIds?.find(id => id !== currentUser?.id) ||
      (conv?.participant && conv.participant.id !== currentUser?.id ? conv.participant.id : '') ||
      '';

    // Guard: If recipient is private, cannot message unless friends!
    const recipientUser = users.find(u => u.id === recipientId);
    if (recipientUser?.isPrivate && getFollowStatus(recipientId) !== 'friends') {
      return;
    }

    const displayText = text.trim() || (sharedVideo ? `Shared a video: "${sharedVideo.caption}"` : '');
    const newMsg: Message = {
      id: `m_${Date.now()}`,
      conversationId: convId,
      senderId: currentUser ? currentUser.id : 'unknown',
      text: displayText,
      timestamp: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMine: true,
      status: 'sent',
      replyTo,
      deletedForUserIds: [],
      sharedVideo: sharedVideo,
      sharedVideoId: sharedVideo?.id,
    };

    setConversations(prev =>
      prev.map(c => {
        if (c.id === convId) {
          const currentRecipientUnread = c.unreadCounts?.[recipientId] || 0;
          return {
            ...c,
            lastMessage: sharedVideo ? `🎥 Shared a video: "${sharedVideo.caption.slice(0, 25)}"` : text.trim(),
            lastMessageTime: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            messages: [...c.messages, newMsg],
            deletedForUserIds: (c.deletedForUserIds || []).filter(
              id => id !== currentUser?.id && id !== recipientId
            ),
            unreadCounts: {
              ...(c.unreadCounts || {}),
              [currentUser ? currentUser.id : 'me']: 0,
              [recipientId]: currentRecipientUnread + 1,
            },
          };
        }
        return c;
      })
    );

    const remotePayload = sharedVideo
      ? `[VIDEO_SHARE:${sharedVideo.id}] ${text.trim()}`
      : text.trim();

    if (currentUser) {
      supabaseDb.insertMessage(convId, currentUser.id, recipientId, remotePayload);
    }
  };

  // Delete whole conversation: ONLY deletes for currentUser's POV!
  // The other user still sees the conversation and its full history!
  const deleteConversation = (convId: string) => {
    if (!currentUser) return;
    setConversations(prev =>
      prev.map(c => {
        if (c.id === convId) {
          const currentDeleted = c.deletedForUserIds || [];
          return {
            ...c,
            deletedForUserIds: currentDeleted.includes(currentUser.id)
              ? currentDeleted
              : [...currentDeleted, currentUser.id],
            clearedHistoryAt: {
              ...(c.clearedHistoryAt || {}),
              [currentUser.id]: Date.now(),
            },
          };
        }
        return c;
      })
    );
    if (activeConversationId === convId) {
      setActiveConversationId(null);
      setMessagesMobileView('list');
    }
  };

  // Delete message: Deleted for BOTH users' POVs (deleted / unsent for everyone)
  const deleteMessage = (convId: string, messageId: string) => {
    if (!currentUser) return;
    setConversations(prev =>
      prev.map(c => {
        if (c.id === convId) {
          const remainingMessages = c.messages.filter(m => m.id !== messageId);
          const last = remainingMessages[remainingMessages.length - 1];

          return {
            ...c,
            messages: remainingMessages,
            lastMessage: last ? last.text : 'No messages yet',
            lastMessageTime: last ? last.timestamp : c.lastMessageTime,
          };
        }
        return c;
      })
    );
  };

  const markAllNotificationsAsRead = () => {
    if (!currentUser) return;
    const isRecipient = (n: NotificationItem) =>
      !n.recipientId ||
      n.recipientId === currentUser.id ||
      toUuid(n.recipientId) === toUuid(currentUser.id) ||
      (currentUser.email && n.recipientId.toLowerCase() === currentUser.email.toLowerCase()) ||
      (n.recipientEmail && currentUser.email && n.recipientEmail.toLowerCase() === currentUser.email.toLowerCase());

    const readIdsToRecord: string[] = [];
    setNotifications(prev => {
      const next = prev.map(n => {
        if (isRecipient(n)) {
          readIdsToRecord.push(n.id);
          if (n.id) readIdsToRecord.push(toUuid(n.id));
          return { ...n, isUnread: false };
        }
        return n;
      });
      storage.set('notifications', next);
      return next;
    });

    if (readIdsToRecord.length > 0) {
      markNotificationIdsReadInStorage(readIdsToRecord);
    }
    supabaseDb.markAllNotificationsAsRead(currentUser.id);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => {
      const next = prev.map(n =>
        n.id === id || toUuid(n.id) === toUuid(id) ? { ...n, isUnread: false } : n
      );
      storage.set('notifications', next);
      return next;
    });
    markNotificationIdsReadInStorage([id, toUuid(id)]);
    supabaseDb.markNotificationAsRead(id);
  };

  // Live Stream handling (BR-003, BR-004, BR-010, BR-026, BR-027)
  const openLiveStreamAsViewer = (_streamId: string) => {
    setActiveTab('live_viewer');
  };

  const sendLiveComment = (text: string) => {
    if (!currentUser || !text.trim()) return;
    const newLiveMsg: LiveStreamMessage = {
      id: `lm_${Date.now()}`,
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      text: text.trim(),
      timestamp: 'Just now',
    };
    setCurrentLiveStream(prev => ({
      ...prev,
      messages: [...prev.messages, newLiveMsg],
    }));
    if (currentLiveStream.id) {
      supabaseDb.insertLiveComment(currentLiveStream.id, currentUser, text.trim());
    }
  };

  const startHostLiveStream = (title: string, topic: string, aboutMe: string) => {
    if (!currentUser) return;
    const streamId = currentLiveStream.id || `stream_${currentUser.id}_${Date.now()}`;
    const newStream: LiveStream = {
      ...currentLiveStream,
      id: streamId,
      host: currentUser,
      title: title || "Let's play",
      topic: topic || 'Gaming',
      aboutMe: aboutMe || 'Welcome to my stream!',
      isLive: true,
      timerSeconds: 0,
      viewersCount: 1,
    };
    setCurrentLiveStream(newStream);
    supabaseDb.upsertLiveStream(newStream);
    setActiveTab('live_host_active');
  };

  const endHostLiveStream = () => {
    if (currentLiveStream.id) {
      supabaseDb.endLiveStream(currentLiveStream.id);
    }
    setCurrentLiveStream(prev => ({
      ...prev,
      isLive: false,
    }));
    setActiveTab('live');
  };

  const toggleLiveSource = (source: 'camera' | 'mic' | 'screen') => {
    setCurrentLiveStream(prev => ({
      ...prev,
      cameraEnabled: source === 'camera' ? !prev.cameraEnabled : prev.cameraEnabled,
      micEnabled: source === 'mic' ? !prev.micEnabled : prev.micEnabled,
      screenShareEnabled: source === 'screen' ? !prev.screenShareEnabled : prev.screenShareEnabled,
    }));
  };

  const openReportModal = (config: Omit<ReportModalConfig, 'isOpen'>) => {
    setReportModal({ ...config, isOpen: true });
  };

  const closeReportModal = () => {
    setReportModal(null);
  };

  const openAudioLibrary = (callback: (track: AudioTrack) => void) => {
    setOnSelectAudioCallback(() => callback);
    setAudioLibraryOpen(true);
  };

  // Admin Operations
  const addAdmin = async (adminData: Partial<AdminRecord>): Promise<boolean> => {
    const newAdmin: AdminRecord = {
      adminId: adminData.adminId || crypto.randomUUID(),
      userId: adminData.userId,
      username: adminData.username || 'admin',
      email: adminData.email || 'admin@viralhub.app',
      role: adminData.role || 'Admin',
      permissions: adminData.permissions || ['manage_users', 'manage_videos', 'manage_reports'],
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    setAdmins(prev => [newAdmin, ...prev]);
    storage.set('admins', [newAdmin, ...admins]);
    await supabaseDb.upsertAdmin(newAdmin);
    return true;
  };

  const approveVideoAdmin = async (videoId: string): Promise<boolean> => {
    setVideos(prev =>
      prev.map(v => (v.id === videoId ? { ...v, status: 'approved' as const, rejectionReason: undefined } : v))
    );
    const video = videos.find(v => v.id === videoId);
    if (video) {
      await supabaseDb.insertVideo({ ...video, status: 'approved', rejectionReason: undefined });
    }
    return true;
  };

  const rejectVideoAdmin = async (videoId: string, reason?: string): Promise<boolean> => {
    const finalReason = reason || 'Inappropriate visual content or guidelines violation';
    const video = videos.find(v => v.id === videoId);

    setVideos(prev => {
      const next = prev.map(v =>
        v.id === videoId
          ? {
              ...v,
              status: 'rejected' as const,
              rejectionReason: finalReason,
              appealStatus: 'none' as const,
              appealReason: undefined,
            }
          : v
      );
      storage.set('videos', next);
      return next;
    });

    const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
    if (storedAppeals[videoId]) {
      delete storedAppeals[videoId];
      storage.set('video_appeals_v2', storedAppeals);
    }

    if (video) {
      await supabaseDb.updateVideoStatus(videoId, 'rejected', finalReason);
      await supabaseDb.insertVideo({
        ...video,
        status: 'rejected',
        rejectionReason: finalReason,
        appealStatus: 'none',
      });

      const recipientUserId = video.creatorId || video.creator?.id || '';
      const recipientUserEmail = video.creator?.email || '';
      const nowIso = new Date().toISOString();

      // Send notification to the uploader/user with dedicated moderation actor
      const revokeNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: recipientUserId,
        recipientEmail: recipientUserEmail,
        type: 'video_revoked',
        actor: {
          id: 'viralhub_moderation',
          username: 'moderation',
          displayName: 'ViralHub Moderation',
          avatar: '',
        },
        targetText: `revoked your video "${video.caption.slice(0, 30)}". Reason: ${finalReason}. You may submit an appeal.`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
        rejectionReason: finalReason,
        appealStatus: 'none',
      };

      setNotifications(prev => {
        const next = [revokeNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(revokeNotif, recipientUserId);
    }
    return true;
  };

  const submitVideoAppeal = async (videoId: string, reason: string): Promise<boolean> => {
    if (!currentUser) return false;
    const cleanReason = reason.trim();
    const video = videos.find(v => v.id === videoId);
    if (!video) return false;

    const nowIso = new Date().toISOString();

    setVideos(prev => {
      const next = prev.map(v =>
        v.id === videoId
          ? {
              ...v,
              appealReason: cleanReason,
              appealStatus: 'pending' as const,
              appealTimestamp: nowIso,
            }
          : v
      );
      storage.set('videos', next);
      return next;
    });

    // Store in global persistent appeals map so Admin can see it across accounts/refreshes
    const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
    storedAppeals[videoId] = {
      videoId,
      reason: cleanReason,
      status: 'pending',
      timestamp: nowIso,
      creatorId: video.creatorId,
      creatorUsername: video.creator?.username,
    };
    storage.set('video_appeals_v2', storedAppeals);

    // Call Supabase DB submitVideoAppeal
    supabaseDb.submitVideoAppeal(videoId, cleanReason);

    // Notification to creator
    const appealNotif: NotificationItem = {
      id: `notif_${Date.now()}`,
      recipientId: currentUser.id,
      type: 'appeal_status',
      actor: {
        id: 'system_moderation',
        username: 'moderation',
        displayName: 'Moderation System',
        avatar: '',
      },
      targetText: `Appeal submitted for "${video.caption.slice(0, 30)}". Status: Pending Review.`,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
      videoId: video.id,
      appealStatus: 'pending',
      appealReason: cleanReason,
    };

    // Notification to Admin
    const adminAppealNotif: NotificationItem = {
      id: `notif_${Date.now()}_admin`,
      recipientId: 'admin',
      type: 'appeal_status',
      actor: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
      },
      targetText: `submitted an appeal for revoked video: "${video.caption.slice(0, 30)}". Reason: "${cleanReason}".`,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
      videoId: video.id,
      appealStatus: 'pending',
      appealReason: cleanReason,
    };

    setNotifications(prev => {
      const updated = prev.map(n =>
        n.videoId === videoId && (n.type === 'video_revoked' || n.type === 'appeal_status')
          ? { ...n, appealStatus: 'pending' as const, appealReason: cleanReason }
          : n
      );
      const next = [adminAppealNotif, appealNotif, ...updated];
      storage.set('notifications', next);
      return next;
    });

    supabaseDb.insertNotification(appealNotif, currentUser.id);
    supabaseDb.insertNotification(adminAppealNotif, 'admin');
    return true;
  };

  const reviewVideoAppeal = async (
    videoId: string,
    decision: 'approved' | 'declined'
  ): Promise<boolean> => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return false;

    const nowIso = new Date().toISOString();
    const recipientUserId = video.creatorId || video.creator?.id || '';
    const recipientUserEmail = video.creator?.email || '';

    // Update persistent appeals map
    const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
    if (storedAppeals[videoId]) {
      storedAppeals[videoId].status = decision;
      storage.set('video_appeals_v2', storedAppeals);
    }

    if (decision === 'approved') {
      setVideos(prev => {
        const next = prev.map(v =>
          v.id === videoId
            ? {
                ...v,
                status: 'approved' as const,
                appealStatus: 'approved' as const,
                rejectionReason: undefined,
              }
            : v
        );
        storage.set('videos', next);
        return next;
      });

      await supabaseDb.reviewVideoAppeal(videoId, 'approved');
      await supabaseDb.updateVideoStatus(videoId, 'approved');

      const approvedNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: recipientUserId,
        recipientEmail: recipientUserEmail,
        type: 'appeal_status',
        actor: {
          id: 'viralhub_moderation',
          username: 'moderation',
          displayName: 'ViralHub Moderation',
          avatar: '',
        },
        targetText: `Great news! Your appeal for "${video.caption.slice(0, 30)}" was Approved. Your video is now live on the feed!`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
        appealStatus: 'approved',
      };

      setNotifications(prev => {
        const next = [approvedNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(approvedNotif, recipientUserId);
    } else {
      setVideos(prev => {
        const next = prev.map(v =>
          v.id === videoId
            ? {
                ...v,
                status: 'rejected' as const,
                appealStatus: 'declined' as const,
              }
            : v
        );
        storage.set('videos', next);
        return next;
      });

      await supabaseDb.reviewVideoAppeal(videoId, 'declined');

      const declinedNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: recipientUserId,
        recipientEmail: recipientUserEmail,
        type: 'appeal_status',
        actor: {
          id: 'viralhub_moderation',
          username: 'moderation',
          displayName: 'ViralHub Moderation',
          avatar: '',
        },
        targetText: `Your appeal for "${video.caption.slice(0, 30)}" was Declined by moderation after careful review.`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: video.id,
        appealStatus: 'declined',
      };

      setNotifications(prev => {
        const next = [declinedNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(declinedNotif, recipientUserId);
    }
    return true;
  };

  const removeAdmin = async (adminId: string): Promise<boolean> => {
    setAdmins(prev => prev.filter(a => a.adminId !== adminId));
    storage.set('admins', admins.filter(a => a.adminId !== adminId));
    await supabaseDb.deleteAdmin(adminId);
    return true;
  };

  const deleteUserAdmin = async (userId: string): Promise<boolean> => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    await supabaseDb.deleteUser(userId);
    return true;
  };

  const deleteVideoAdmin = async (videoId: string): Promise<boolean> => {
    setVideos(prev => prev.filter(v => v.id !== videoId));
    await supabaseDb.deleteVideo(videoId);
    return true;
  };

  const updateReportStatusAdmin = async (
    reportId: string,
    type: 'video' | 'user',
    status: 'Approved' | 'Rejected' | 'Under Review'
  ): Promise<boolean> => {
    let targetReport: ReportItem | undefined;

    setReports(prev => {
      const next = prev.map(r => {
        const matches =
          r.id === reportId ||
          toUuid(r.id) === toUuid(reportId) ||
          (toUuid(r.targetId) === toUuid(reportId));
        if (matches) {
          targetReport = { ...r, status };
          return { ...r, status };
        }
        return r;
      });
      storage.set('reports', next);
      return next;
    });

    await supabaseDb.updateReportStatus(reportId, type, status);

    // If report has a known reporter, send them a status update notification
    if (targetReport && targetReport.reporterId) {
      const statusTitle =
        status === 'Approved'
          ? 'Approved & Action Taken'
          : status === 'Rejected'
          ? 'Declined / Dismissed'
          : 'Under Review';
      const nowIso = new Date().toISOString();
      const reportNotif: NotificationItem = {
        id: `notif_rep_${Date.now()}`,
        recipientId: targetReport.reporterId,
        type: 'appeal_status',
        actor: {
          id: 'viralhub_moderation',
          username: 'moderation',
          displayName: 'ViralHub Moderation',
          avatar: '',
        },
        targetText: `reviewed your report regarding "${targetReport.targetName}". Status is now: ${statusTitle}.`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
      };
      setNotifications(prev => {
        const next = [reportNotif, ...prev];
        storage.set('notifications', next);
        return next;
      });
      supabaseDb.insertNotification(reportNotif, targetReport.reporterId);
    }

    return true;
  };

  const syncAllToSupabase = async (): Promise<{ success: boolean; message: string }> => {
    const config = getSupabaseConfig();
    if (!config.isConnected) {
      return {
        success: false,
        message: 'Supabase credentials are not connected yet. Click "Configure Supabase" to enter your URL & Key.',
      };
    }

    try {
      // 1. Sync all users
      for (const u of users) {
        await supabaseDb.upsertUser(u);
      }

      // 2. Sync all videos
      for (const v of videos) {
        await supabaseDb.insertVideo(v);
      }

      // 3. Sync all reports
      for (const r of reports) {
        await supabaseDb.insertReport(r, currentUser?.id);
      }

      // 4. Fetch fresh data back
      await syncWithSupabase();

      return {
        success: true,
        message: `Successfully synchronized ${users.length} users and ${videos.length} videos to your Supabase tables!`,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Sync failed. Verify your Supabase RLS policies and table structure.',
      };
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authView,
        setAuthView,
        login,
        register,
        loginWithGoogle,
        logout,
        quickLoginAs,
        activeTab,
        setActiveTab,
        selectedUserId,
        navigateToUserProfile,
        users,
        videos: activeVideos,
        audioTracks,
        conversations,
        activeConversationId,
        messagesMobileView,
        setMessagesMobileView,
        notifications: userNotifications,
        reports,
        currentLiveStream,
        followRelations,
        followRequests,
        getFollowStatus,
        isTargetFollowingMe,
        acceptFollowRequest,
        declineFollowRequest,
        getUserFollowers,
        getUserFollowing,
        canMessageUser,
        canViewUserFollows,
        totalUnreadMessages,
        totalUnreadNotifications,
        updateUserProfile,
        toggleFollowUser,
        toggleLikeVideo,
        addCommentToVideo,
        shareVideo,
        shareVideoToUser,
        recordVideoView,
        uploadVideo,
        submitReport,
        openConversation,
        openConversationWithUser,
        sendMessage,
        deleteConversation,
        deleteMessage,
        markAllNotificationsAsRead,
        markNotificationAsRead,
        openLiveStreamAsViewer,
        sendLiveComment,
        startHostLiveStream,
        endHostLiveStream,
        toggleLiveSource,
        commentsVideoId,
        setCommentsVideoId,
        reportModal,
        openReportModal,
        closeReportModal,
        audioLibraryOpen,
        setAudioLibraryOpen,
        onSelectAudioCallback,
        openAudioLibrary,
        searchQuery,
        setSearchQuery,
        supabaseModalOpen,
        setSupabaseModalOpen,
        isSupabaseConnected,
        syncWithSupabase,
        admins,
        isAdmin,
        addAdmin,
        removeAdmin,
        deleteUserAdmin,
        deleteVideoAdmin,
        approveVideoAdmin,
        rejectVideoAdmin,
        submitVideoAppeal,
        reviewVideoAppeal,
        updateReportStatusAdmin,
        syncAllToSupabase,
        switchAccountModalOpen,
        setSwitchAccountModalOpen,
        savedAccounts,
        removeSavedAccount,
        userLikes,
        getUserLikedVideos,
        feedRefreshKey,
        refreshFeed,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
