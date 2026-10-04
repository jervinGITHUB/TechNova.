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
  CommentEntry,
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
  isSameUser,
  isUuid,
  getDirectConversationId,
  recordDeletedUserId,
  isUserIdDeleted,
  checkIsUserBanned,
  recordUserBan,
  recordUserUnban,
} from '../lib/supabase';
import { deduplicateNotifications } from '../utils/notifications';

/**
 * Deduplicates conversations so that only ONE canonical conversation
 * exists per partner user, and merges all messages from duplicate threads together.
 */
export const deduplicateConversations = (
  convList: Conversation[],
  currentUserId?: string
): Conversation[] => {
  const partnerMap = new Map<string, Conversation>();

  for (const c of convList) {
    if (!c) continue;

    // Find the other participant in this conversation
    let partnerId = '';
    if (currentUserId && c.participantIds && c.participantIds.length > 0) {
      partnerId = c.participantIds.find(id => !isSameUser(id, currentUserId)) || '';
    }
    if (!partnerId && c.participant?.id && (!currentUserId || !isSameUser(c.participant.id, currentUserId))) {
      partnerId = c.participant.id;
    }
    if (!partnerId && c.participantIds && c.participantIds.length > 0) {
      partnerId = c.participantIds.find(id => !currentUserId || !isSameUser(id, currentUserId)) || c.participantIds[0];
    }

    // Determine stable canonical partner key
    const canonicalKey = (currentUserId && partnerId)
      ? getDirectConversationId(currentUserId, partnerId)
      : (partnerId ? toUuid(partnerId).toLowerCase() : (isUuid(c.id) ? c.id : toUuid(c.id)));

    if (partnerMap.has(canonicalKey)) {
      const existing = partnerMap.get(canonicalKey)!;

      // Merge messages from both conversations without duplicate message IDs or text/timestamp
      const msgMap = new Map<string, Message>();
      (existing.messages || []).forEach(m => msgMap.set(m.id || `${m.text}_${m.timestamp}`, m));
      (c.messages || []).forEach(m => {
        const key = m.id || `${m.text}_${m.timestamp}`;
        if (!msgMap.has(key)) {
          msgMap.set(key, m);
        }
      });
      const combinedMessages = Array.from(msgMap.values());

      // Canonical conversation ID: prefer valid deterministic UUID
      const canonicalId = (currentUserId && partnerId)
        ? getDirectConversationId(currentUserId, partnerId)
        : (isUuid(existing.id) ? existing.id : (isUuid(c.id) ? c.id : canonicalKey));

      const bestParticipant =
        c.participant?.displayName && c.participant.displayName !== 'User'
          ? c.participant
          : existing.participant;

      const latestMsg = combinedMessages[combinedMessages.length - 1];
      const lastMessage = latestMsg ? latestMsg.text : (c.lastMessage || existing.lastMessage);
      const lastMessageTime = latestMsg ? latestMsg.timestamp : (c.lastMessageTime || existing.lastMessageTime);

      const combinedUnreadCounts = {
        ...(existing.unreadCounts || {}),
        ...(c.unreadCounts || {}),
      };

      const combinedClearedHistoryAt = {
        ...(existing.clearedHistoryAt || {}),
        ...(c.clearedHistoryAt || {}),
      };

      const clearTime = (currentUserId && combinedClearedHistoryAt)
        ? (combinedClearedHistoryAt[currentUserId] || combinedClearedHistoryAt[toUuid(currentUserId)] || 0)
        : 0;
      const hasNewIncoming = combinedMessages.some(
        m => !isSameUser(m.senderId, currentUserId) && (!clearTime || (m.sentAt && new Date(m.sentAt).getTime() > clearTime))
      );

      let mergedDeletedFor = Array.from(new Set([...(existing.deletedForUserIds || []), ...(c.deletedForUserIds || [])]));
      if (hasNewIncoming && currentUserId) {
        mergedDeletedFor = mergedDeletedFor.filter(id => !isSameUser(id, currentUserId));
      }

      partnerMap.set(canonicalKey, {
        ...existing,
        id: canonicalId,
        participant: bestParticipant,
        participantIds: [currentUserId || '', partnerId].filter(Boolean),
        lastMessage,
        lastMessageTime,
        messages: combinedMessages,
        unreadCount: Math.max(existing.unreadCount || 0, c.unreadCount || 0),
        unreadCounts: combinedUnreadCounts,
        deletedForUserIds: mergedDeletedFor,
        clearedHistoryAt: combinedClearedHistoryAt,
      });
    } else {
      const canonicalId = (currentUserId && partnerId)
        ? getDirectConversationId(currentUserId, partnerId)
        : (isUuid(c.id) ? c.id : canonicalKey);

      partnerMap.set(canonicalKey, {
        ...c,
        id: canonicalId,
        participantIds: (c.participantIds && c.participantIds.length > 0)
          ? c.participantIds
          : [currentUserId || '', partnerId].filter(Boolean),
      });
    }
  }

  return Array.from(partnerMap.values());
};

export const getConversationClearedTimestamp = (convId: string, userId?: string | null): number => {
  if (!convId || !userId) return 0;
  const canonicalId = toUuid(convId);
  const uUuid = toUuid(userId);
  const key1 = `cleared_conv_${canonicalId}_${uUuid}`;
  const key2 = `cleared_conv_${convId}_${userId}`;
  return storage.get<number>(key1, 0) || storage.get<number>(key2, 0) || 0;
};

export const setConversationClearedTimestamp = (convId: string, userId: string, timestamp: number) => {
  if (!convId || !userId) return;
  const canonicalId = toUuid(convId);
  const uUuid = toUuid(userId);
  storage.set(`cleared_conv_${canonicalId}_${uUuid}`, timestamp);
  storage.set(`cleared_conv_${convId}_${userId}`, timestamp);
};

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
const EMPTY_RESET_KEY = 'viralhub_empty_reset_v10';
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
    'saved_accounts_v2',
    'user_likes_map',
    'read_notification_ids_v1',
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
  logout: (saveToDevice?: boolean) => void;
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
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  toggleFollowUser: (userId: string) => void;
  toggleLikeVideo: (videoId: string) => void;
  addCommentToVideo: (videoId: string, text: string, replyToCommentId?: string) => Promise<boolean>;
  deleteCommentFromVideo: (videoId: string, commentId: string) => Promise<boolean>;
  toggleLikeComment: (videoId: string, commentId: string) => void;
  commentsMap: Record<string, CommentEntry[]>;
  fetchCommentsForVideo: (videoId: string, force?: boolean) => Promise<CommentEntry[]>;
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
  banUserAdmin: (userId: string, reason?: string) => Promise<boolean>;
  unbanUserAdmin: (userId: string) => Promise<boolean>;
  submitUserAppeal: (reason: string) => Promise<boolean>;
  reviewUserAppeal: (userId: string, decision: 'approved' | 'declined') => Promise<boolean>;
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

  // User video deletion
  deleteVideo: (videoId: string) => Promise<boolean>;

  // Admin user role assignment
  updateUserRoleAdmin: (userId: string, newRole: 'creator' | 'admin' | 'moderator') => Promise<boolean>;

  // Cross-device realtime notification popup
  activeNotificationPopup: NotificationItem | null;
  dismissNotificationPopup: () => void;

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
      const banInfo = checkIsUserBanned(saved.id, saved.email, saved);
      return {
        ...saved,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
      };
    }
    return null;
  });
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // Navigation tab
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Core Data
  const [users, setUsers] = useState<User[]>(() => {
    const raw = storage.get<User[]>('users', INITIAL_USERS);
    return raw.map(u => {
      const banInfo = checkIsUserBanned(u.id, u.email, u);
      return {
        ...u,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
      };
    });
  });

  const [videos, setVideos] = useState<Video[]>(() => {
    const stored = storage.get<Video[]>('videos', INITIAL_VIDEOS);
    return deduplicateVideos(stored);
  });

  const [audioTracksList, setAudioTracksList] = useState<AudioTrack[]>(() =>
    storage.get('audioTracks', INITIAL_AUDIO_TRACKS)
  );

  // Helper to ensure we never pass a video file (.mp4, .webm, blob:) as an image coverUrl
  const isVideoUrl = (url?: string | null): boolean => {
    if (!url) return false;
    const lower = url.trim().toLowerCase();
    return lower.startsWith('blob:') || /\.(mp4|webm|mov|mkv|ogg|m4v)($|\?)/i.test(lower);
  };

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

      const creatorName = v.creator?.displayName || v.creator?.username || 'Creator';
      const cleanCaption = (v.caption || '').replace(/#\w+/g, '').trim();

      // Resolve valid image cover: never treat video URL (.mp4, .webm, blob:) as an image!
      const validCover =
        v.thumbnailUrl && !isVideoUrl(v.thumbnailUrl) && !v.thumbnailUrl.includes('avatar_')
          ? v.thumbnailUrl
          : '';

      if (v.audioTrack && v.audioTrack.id) {
        const cleanedTrack: AudioTrack = {
          ...v.audioTrack,
          coverUrl:
            v.audioTrack.coverUrl && !isVideoUrl(v.audioTrack.coverUrl)
              ? v.audioTrack.coverUrl
              : validCover,
          sourceVideoId: v.audioTrack.sourceVideoId || v.id,
          sourceUsername: v.audioTrack.sourceUsername || v.creator?.username || '',
        };
        map.set(v.audioTrack.id, cleanedTrack);
      }

      const soundId = `sound_vid_${v.id}`;
      if (!map.has(soundId)) {
        map.set(soundId, {
          id: soundId,
          title: v.audioTrack?.title || `Original Sound - @${v.creator?.username || 'creator'}`,
          artist: `${creatorName}${cleanCaption ? ` · "${cleanCaption.slice(0, 24)}"` : ''}`,
          duration: v.audioTrack?.duration || '00:30',
          coverUrl: validCover,
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
    const raw = storage.get<Conversation[]>('conversations', []);
    const current = storage.get<User | null>('currentUser', null);
    const deduped = deduplicateConversations(raw, current?.id);
    storage.set('conversations', deduped);
    return deduped;
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
    const rawSaved = storage.get<User[]>('saved_accounts_v2', []);
    const saved = rawSaved
      .filter(a => a && a.id && !isUserIdDeleted(a.id, a.email))
      .map(a => {
        const banInfo = checkIsUserBanned(a.id, a.email, a);
        return {
          ...a,
          isBanned: banInfo.isBanned,
          banReason: banInfo.isBanned ? banInfo.banReason : undefined,
          bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
          appealStatus: banInfo.appealStatus,
          appealReason: banInfo.appealReason,
          appealSubmittedAt: banInfo.appealSubmittedAt,
        };
      });
    const current = storage.get<User | null>('currentUser', null);
    if (current && current.id && (current.username || current.displayName) && !isUserIdDeleted(current.id, current.email)) {
      const banInfo = checkIsUserBanned(current.id, current.email, current);
      const patchedCurrent = {
        ...current,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
      };
      const exists = saved.some(
        s => isSameUser(s.id, current.id) || (s.email && current.email && s.email.toLowerCase() === current.email.toLowerCase())
      );
      if (!exists) {
        const init = [patchedCurrent, ...saved];
        storage.set('saved_accounts_v2', init);
        return init;
      }
    }
    return saved;
  });

  const recordSavedAccount = (acc: User) => {
    if (!acc || !acc.id || isUserIdDeleted(acc.id, acc.email)) return;
    const banInfo = checkIsUserBanned(acc.id, acc.email, acc);
    const patchedAcc: User = {
      ...acc,
      isBanned: banInfo.isBanned,
      banReason: banInfo.isBanned ? banInfo.banReason : undefined,
      bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
      appealStatus: banInfo.appealStatus,
      appealReason: banInfo.appealReason,
      appealSubmittedAt: banInfo.appealSubmittedAt,
    };
    setSavedAccounts(prev => {
      const filtered = prev.filter(
        a => !isSameUser(a.id, acc.id) && (!acc.email || !a.email || a.email.toLowerCase() !== acc.email.toLowerCase())
      );
      const next = [patchedAcc, ...filtered].slice(0, 5); // Device limit of 5 logged-in accounts
      storage.set('saved_accounts_v2', next);
      return next;
    });
  };

  const removeSavedAccount = (userId: string) => {
    setSavedAccounts(prev => {
      const next = prev.filter(a => !isSameUser(a.id, userId));
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

  // Modals & Comments
  const [commentsVideoId, setCommentsVideoId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentEntry[]>>(() =>
    storage.get<Record<string, CommentEntry[]>>('video_comments_v2', {})
  );

  const fetchCommentsForVideo = async (videoId: string, force = false): Promise<CommentEntry[]> => {
    if (!videoId) return [];
    if (!force && commentsMap[videoId] && commentsMap[videoId].length > 0) {
      return commentsMap[videoId];
    }
    try {
      const remote = await supabaseDb.fetchComments(videoId);
      if (remote !== null) {
        setCommentsMap(prev => {
          const existing = prev[videoId] || [];
          const likedIds = new Set(existing.filter(c => c.isLiked).map(c => c.id));
          const merged = remote.map(c => {
            const seenReplyIds = new Set<string>();
            const cleanReplies = (c.replies || []).filter(r => {
              const k = (r.id || '').toLowerCase();
              if (k && seenReplyIds.has(k)) return false;
              if (k) seenReplyIds.add(k);
              return true;
            });
            return {
              ...c,
              replies: cleanReplies,
              isLiked: likedIds.has(c.id),
            };
          });
          const next = { ...prev, [videoId]: merged };
          storage.set('video_comments_v2', next);
          return next;
        });

        // Synchronize video comment count directly from database records
        const count = remote.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);
        setVideos(prev =>
          prev.map(v =>
            v.id === videoId || toUuid(v.id) === toUuid(videoId)
              ? { ...v, commentsCount: count }
              : v
          )
        );
        return remote;
      }
    } catch (err) {
      console.warn('fetchCommentsForVideo error:', err);
    }
    return commentsMap[videoId] || [];
  };

  const fetchCommentsForVideoRef = React.useRef(fetchCommentsForVideo);
  fetchCommentsForVideoRef.current = fetchCommentsForVideo;
  const [reportModal, setReportModal] = useState<ReportModalConfig | null>(null);
  const [audioLibraryOpen, setAudioLibraryOpen] = useState<boolean>(false);
  const [onSelectAudioCallback, setOnSelectAudioCallback] = useState<((track: AudioTrack) => void) | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supabaseModalOpen, setSupabaseModalOpen] = useState<boolean>(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(() => getSupabaseConfig().isConnected);

  // Active floating notification popup for real-time interactions across devices
  const [activeNotificationPopup, setActiveNotificationPopup] = useState<NotificationItem | null>(null);
  const dismissNotificationPopup = () => setActiveNotificationPopup(null);
  const knownNotificationIdsRef = React.useRef<Set<string>>(new Set());
  const initialNotifSyncDoneRef = React.useRef<boolean>(false);
  const chatBroadcastChannelRef = React.useRef<any>(null);

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
          if (remoteIsAdmin && currentUser.role !== 'admin') {
            setCurrentUser(prev => (prev && prev.role !== 'admin' ? { ...prev, role: 'admin' } : prev));
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
  }, [currentUser?.id, currentUser?.email, currentUser?.role, admins.length]);

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
  }, [currentUser?.id]);

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
      const convsPromise = currentUser?.id
        ? supabaseDb.fetchConversationsAndMessages(currentUser.id)
        : Promise.resolve(null);

      // Fetch users first, then pass to fetchVideos to eliminate redundant fetchUsers calls
      const usersPromise = supabaseDb.fetchUsers();
      const [
        remoteUsers,
        remoteAdmins,
        remoteReports,
        remoteNotifications,
        remoteFollows,
        remoteConvs,
      ] = await Promise.all([
        usersPromise,
        supabaseDb.fetchAdmins(),
        supabaseDb.fetchReports(),
        supabaseDb.fetchNotifications(),
        supabaseDb.fetchFollows(),
        convsPromise,
      ]);

      const remoteVideos = await supabaseDb.fetchVideos(remoteUsers || undefined);

      // 1. Synchronize Users
      if (remoteUsers !== null) {
        if (remoteUsers.length === 0) {
          // DATABASE WAS EMPTIED! Reset all user-related state on this device
          setUsers([]);
          storage.set('users', []);
          setSavedAccounts([]);
          storage.set('saved_accounts_v2', []);
          setVideos([]);
          storage.set('videos', []);
          setFollowRelations([]);
          storage.set('follow_relations_v2', []);
          setFollowRequests([]);
          storage.set('follow_requests_v2', []);
          setNotifications([]);
          storage.set('notifications', []);
          setConversations([]);
          storage.set('conversations', []);

          if (currentUser) {
            console.warn('Database was cleared. Logging out current session...');
            logout(false);
          }
        } else {
          // Database has users:
          // 1. Check if currentUser still exists in remoteUsers
          if (currentUser && !isAdmin) {
            const isDeleted = isUserIdDeleted(currentUser.id, currentUser.email);
            const stillInDb = remoteUsers.some(
              u =>
                isSameUser(u.id, currentUser.id) ||
                (currentUser.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
            );
            if (isDeleted || !stillInDb) {
              console.warn('Current account was deleted from database. Logging out session...');
              logout(false);
            }
          }

          // 2. Clean up savedAccounts to ONLY retain accounts currently existing in remoteUsers & apply ban checks
          setSavedAccounts(prevAccounts => {
            const filtered = prevAccounts
              .filter(a => {
                if (isUserIdDeleted(a.id, a.email)) return false;
                return remoteUsers.some(
                  ru =>
                    isSameUser(ru.id, a.id) ||
                    (a.email && ru.email && a.email.toLowerCase() === ru.email.toLowerCase())
                );
              })
              .map(a => {
                const banInfo = checkIsUserBanned(a.id, a.email, a);
                return {
                  ...a,
                  isBanned: banInfo.isBanned,
                  banReason: banInfo.isBanned ? banInfo.banReason : undefined,
                  bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
                  appealStatus: banInfo.appealStatus,
                  appealReason: banInfo.appealReason,
                  appealSubmittedAt: banInfo.appealSubmittedAt,
                };
              });
            storage.set('saved_accounts_v2', filtered);
            return filtered;
          });

          // 3. Set users to remoteUsers (authoritative, deduplicated, excluding any deleted users)
          const userMap = new Map<string, User>();
          const emailMap = new Map<string, string>(); // email -> id

          for (const u of remoteUsers) {
            if (isUserIdDeleted(u.id, u.email)) continue;
            const banInfo = checkIsUserBanned(u.id, u.email, u);
            const patchedUser: User = {
              ...u,
              isBanned: banInfo.isBanned,
              banReason: banInfo.isBanned ? banInfo.banReason : undefined,
              bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
              appealStatus: banInfo.appealStatus,
              appealReason: banInfo.appealReason,
              appealSubmittedAt: banInfo.appealSubmittedAt,
            };

            const emailKey = patchedUser.email ? patchedUser.email.trim().toLowerCase() : null;
            if (emailKey && emailMap.has(emailKey)) {
              const existingId = emailMap.get(emailKey)!;
              const existing = userMap.get(existingId);
              if (existing) {
                if (patchedUser.role === 'admin' || existing.role !== 'admin') {
                  existing.role = patchedUser.role === 'admin' ? 'admin' : existing.role;
                }
                if (patchedUser.isBanned) {
                  existing.isBanned = true;
                  existing.banReason = patchedUser.banReason || existing.banReason;
                  existing.bannedAt = patchedUser.bannedAt || existing.bannedAt;
                  existing.appealStatus = patchedUser.appealStatus || existing.appealStatus;
                }
              }
              continue; // Deduplicate
            }
            userMap.set(patchedUser.id, patchedUser);
            if (emailKey) emailMap.set(emailKey, patchedUser.id);
          }

          const nextUsers = Array.from(userMap.values());
          setUsers(nextUsers);
          storage.set('users', nextUsers);

          // 4. Synchronize currentUser ban status so user stays locked on BannedAccountView!
          if (currentUser) {
            const freshMe = nextUsers.find(
              u =>
                isSameUser(u.id, currentUser.id) ||
                (currentUser.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                (currentUser.username && u.username && u.username.toLowerCase() === currentUser.username.toLowerCase())
            );
            // Supabase is the single authoritative source of truth for ban and unban status!
            let finalIsBanned = false;
            let finalAppealStatus: 'none' | 'pending' | 'approved' | 'declined' = 'none';
            let finalBanReason: string | undefined = undefined;
            let finalBannedAt: string | undefined = undefined;

            if (freshMe) {
              // User exists in remote database: trust database status directly!
              finalIsBanned = Boolean(freshMe.isBanned) && freshMe.appealStatus !== 'approved';
              finalAppealStatus = (freshMe.appealStatus as any) || (finalIsBanned ? 'none' : 'approved');
              finalBanReason = finalIsBanned ? (freshMe.banReason || 'Violation of Community Guidelines') : undefined;
              finalBannedAt = finalIsBanned ? freshMe.bannedAt : undefined;
            } else {
              const banInfo = checkIsUserBanned(
                currentUser.id,
                currentUser.email,
                currentUser
              );
              finalIsBanned = banInfo.isBanned;
              finalAppealStatus = banInfo.appealStatus;
              finalBanReason = banInfo.isBanned ? banInfo.banReason : undefined;
              finalBannedAt = banInfo.isBanned ? banInfo.bannedAt : undefined;
            }

            if (!finalIsBanned) {
              recordUserUnban(currentUser.id, currentUser.email, currentUser.username);
            }

            if (
              finalIsBanned !== currentUser.isBanned ||
              finalAppealStatus !== currentUser.appealStatus ||
              (freshMe && (freshMe.displayName !== currentUser.displayName || freshMe.avatar !== currentUser.avatar))
            ) {
              const updatedCurr: User = {
                ...currentUser,
                ...(freshMe || {}),
                isBanned: finalIsBanned,
                banReason: finalBanReason,
                bannedAt: finalBannedAt,
                appealStatus: finalAppealStatus,
                appealReason: freshMe?.appealReason || (finalIsBanned ? currentUser.appealReason : undefined),
                appealSubmittedAt: freshMe?.appealSubmittedAt || (finalIsBanned ? currentUser.appealSubmittedAt : undefined),
              };
              setCurrentUser(updatedCurr);
              storage.set('currentUser', updatedCurr);
            }
          }
        }
      }

      // 2. Synchronize Videos (authoritative: Supabase is single source of truth!)
      if (remoteVideos !== null) {
        if (remoteVideos.length === 0) {
          setVideos([]);
          storage.set('videos', []);
        } else {
          // Exclude any videos from deleted creators
          const activeVideos = remoteVideos.filter(v => {
            const cId = v.creatorId || v.creator?.id;
            const cEmail = v.creator?.email;
            return !isUserIdDeleted(cId, cEmail);
          });
          const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
          const patchedRemote = activeVideos.map(v => {
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

          const merged = deduplicateVideos(patchedRemote);
          setVideos(merged);
          storage.set('videos', merged);
        }
      }

      // 3. Sync Follow relationships across devices
      if (remoteFollows !== null) {
        setFollowRelations(remoteFollows);
        storage.set('follow_relations_v2', remoteFollows);
      }

      // 4. Sync Conversations and Messages across devices
      if (remoteConvs !== null) {
        if (remoteConvs.length === 0) {
          setConversations([]);
          storage.set('conversations', []);
        } else if (currentUser) {
          setConversations(prev => {
            const remoteMapped: Conversation[] = remoteConvs.map((rc: any) => {
              const partnerId = isSameUser(rc.userAId, currentUser.id)
                ? rc.userBId
                : rc.userAId;

              const existingConv = prev.find(c => {
                if (c.id === rc.id || toUuid(c.id) === toUuid(rc.id)) return true;
                const pId = c.participantIds?.find(id => !isSameUser(id, currentUser.id)) || c.participant?.id;
                return isSameUser(pId, partnerId);
              });

              const partnerUser =
                users.find(u => isSameUser(u.id, partnerId)) ||
                existingConv?.participant || {
                  id: partnerId,
                  username: 'user',
                  displayName: 'User',
                  email: '',
                  avatar: '',
                  bio: '',
                  followingCount: 0,
                  followersCount: 0,
                  likesCount: '0',
                  isPrivate: false,
                  role: 'creator' as const,
                };

              let remoteClearTime = 0;
              if (rc.clearedHistory) {
                if (typeof rc.clearedHistory === 'object' && rc.clearedHistory !== null) {
                  const val = rc.clearedHistory[currentUser.id] || rc.clearedHistory[toUuid(currentUser.id)];
                  if (val) {
                    remoteClearTime = typeof val === 'number' ? val : new Date(val).getTime();
                  }
                } else if (typeof rc.clearedHistory === 'string') {
                  remoteClearTime = new Date(rc.clearedHistory).getTime();
                }
              }

              const clearTime = Math.max(
                remoteClearTime || 0,
                getConversationClearedTimestamp(rc.id, currentUser.id),
                getConversationClearedTimestamp(toUuid(rc.id), currentUser.id),
                existingConv?.clearedHistoryAt?.[currentUser.id] || 0,
                existingConv?.clearedHistoryAt?.[toUuid(currentUser.id)] || 0
              );

              // Persist cleared timestamp locally on this device so subsequent loads respect it
              if (clearTime > 0) {
                setConversationClearedTimestamp(rc.id, currentUser.id, clearTime);
                const convCanonical = toUuid(rc.id);
                if (convCanonical && convCanonical !== rc.id) {
                  setConversationClearedTimestamp(convCanonical, currentUser.id, clearTime);
                }
              }

              const rawMessages = rc.rawMessages || [];
              const parsedMessages: Message[] = rawMessages.map((m: any) => {
                const isMine = isSameUser(m.SenderUserID, currentUser.id);
                let msgContent = m.MessageContent || '';
                let sharedVideoId: string | undefined = undefined;

                if (msgContent.startsWith('[VIDEO_SHARE:')) {
                  const closeIdx = msgContent.indexOf(']');
                  if (closeIdx > 0) {
                    sharedVideoId = msgContent.substring(13, closeIdx);
                    msgContent = msgContent.substring(closeIdx + 1).trim();
                  }
                }

                const matchedSharedVideo = sharedVideoId ? videos.find(v => v.id === sharedVideoId || toUuid(v.id) === toUuid(sharedVideoId)) : undefined;

                const matchedExistingMsg = existingConv?.messages?.find(
                  em => em.id === m.MessageID || (em.text === msgContent && em.timestamp)
                );
                let deletedFor = [...(matchedExistingMsg?.deletedForUserIds || [])];

                // If conversation was cleared before or at this message's sentAt time, hide it for currentUser
                if (clearTime > 0) {
                  if (m.SentAt) {
                    const sentTime = new Date(m.SentAt).getTime();
                    if (sentTime > 0 && sentTime <= clearTime) {
                      if (!deletedFor.some(id => isSameUser(id, currentUser.id))) {
                        deletedFor.push(currentUser.id);
                      }
                    }
                  } else {
                    if (!deletedFor.some(id => isSameUser(id, currentUser.id))) {
                      deletedFor.push(currentUser.id);
                    }
                  }
                }

                return {
                  id: m.MessageID || `msg_${Date.now()}`,
                  conversationId: rc.id,
                  senderId: m.SenderUserID,
                  text: msgContent,
                  timestamp: m.SentAt ? new Date(m.SentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today',
                  sentAt: m.SentAt,
                  isMine,
                  status: 'read' as const,
                  sharedVideo: matchedSharedVideo,
                  sharedVideoId,
                  deletedForUserIds: deletedFor,
                };
              });

              // Merge local messages that may not have reached remote yet
              const localOnlyMsgs = (existingConv?.messages || []).filter(
                lm => !parsedMessages.some(pm => pm.id === lm.id || (pm.text === lm.text && pm.timestamp === lm.timestamp))
              );
              const allMsgs = [...parsedMessages, ...localOnlyMsgs];

              // Filter out messages that are deleted for this user
              const visibleMsgs = allMsgs.filter(m => {
                if (m.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) return false;
                if (clearTime > 0) {
                  if (m.sentAt && new Date(m.sentAt).getTime() <= clearTime) return false;
                  if (typeof m.id === 'string' && m.id.startsWith('m_')) {
                    const parts = m.id.split('_');
                    const t = parseInt(parts[1], 10);
                    if (t > 0 && t <= clearTime) return false;
                  }
                }
                return true;
              });

              const lastVisible = visibleMsgs[visibleMsgs.length - 1];

              // Check if any incoming message from the partner arrived after clearTime (auto-unhide)
              const hasNewIncomingMsg = visibleMsgs.some(pm =>
                !isSameUser(pm.senderId, currentUser.id) &&
                (!clearTime || (pm.sentAt && new Date(pm.sentAt).getTime() > clearTime))
              );

              let convDeletedForUserIds = [...(existingConv?.deletedForUserIds || [])];
              if (hasNewIncomingMsg) {
                convDeletedForUserIds = convDeletedForUserIds.filter(id => !isSameUser(id, currentUser.id));
              }

              return {
                id: rc.id,
                participantIds: [currentUser.id, partnerId],
                participant: partnerUser,
                lastMessage: lastVisible
                  ? (lastVisible.sharedVideo ? '🎥 Shared a video' : lastVisible.text)
                  : (clearTime > 0 ? 'Started a new conversation' : (existingConv?.lastMessage || 'Started conversation')),
                lastMessageTime: lastVisible ? lastVisible.timestamp : (existingConv?.lastMessageTime || 'Recently'),
                unreadCount: existingConv ? existingConv.unreadCount : 0,
                unreadCounts: existingConv ? existingConv.unreadCounts : {},
                messages: allMsgs,
                isOnline: true,
                deletedForUserIds: convDeletedForUserIds,
                clearedHistoryAt: {
                  ...(existingConv?.clearedHistoryAt || {}),
                  ...(typeof rc.clearedHistory === 'object' && rc.clearedHistory ? rc.clearedHistory : {}),
                  ...(clearTime > 0 ? { [currentUser.id]: clearTime, [toUuid(currentUser.id)]: clearTime } : {}),
                },
              };
            });

            // Retain any purely local conversations that don't match any remote partner
            const remainingLocal = prev.filter(lc => {
              const localPartnerId = lc.participantIds?.find(id => !isSameUser(id, currentUser.id)) || lc.participant?.id;
              return !remoteMapped.some(rc => {
                const remotePartnerId = rc.participantIds?.find(id => !isSameUser(id, currentUser.id)) || rc.participant?.id;
                return isSameUser(localPartnerId, remotePartnerId) || rc.id === lc.id || toUuid(rc.id) === toUuid(lc.id);
              });
            });

            const combined = [...remoteMapped, ...remainingLocal];
            const deduped = deduplicateConversations(combined, currentUser.id);
            storage.set('conversations', deduped);
            return deduped;
          });
        }
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

      if (remoteAdmins !== null) {
        setAdmins(remoteAdmins);
      }

      if (remoteReports !== null) {
        setReports(prev => {
          const map = new Map<string, ReportItem>();
          // Keep existing local reports first
          prev.forEach(r => map.set(r.id, r));
          // Apply authoritative remote reports
          remoteReports.forEach(r => map.set(r.id, r));
          const merged = Array.from(map.values());
          storage.set('reports', merged);
          return merged;
        });
      }

      // 5. Synchronize Notifications
      if (remoteNotifications !== null) {
        if (remoteNotifications.length === 0) {
          setNotifications([]);
          storage.set('notifications', []);
          setFollowRequests([]);
          storage.set('follow_requests_v2', []);
        } else {
          const readIds = getReadNotificationIds();

          // Check for new notifications to trigger in-app popup across devices!
          if (currentUser) {
            const userRecip = remoteNotifications.filter(n => {
              const isForMe =
                n.recipientId === currentUser.id ||
                toUuid(n.recipientId) === toUuid(currentUser.id) ||
                (currentUser.email && n.recipientEmail && currentUser.email.toLowerCase() === n.recipientEmail.toLowerCase());
              const notFromMe = n.actor.id !== currentUser.id && toUuid(n.actor.id) !== toUuid(currentUser.id);
              return isForMe && notFromMe && n.isUnread;
            });

            // If initial sync has been performed, any new unread notification that we haven't seen pops up!
            if (initialNotifSyncDoneRef.current) {
              for (const n of userRecip) {
                if (!knownNotificationIdsRef.current.has(n.id)) {
                  setActiveNotificationPopup(n);
                  break;
                }
              }
            }

            // Update known set
            remoteNotifications.forEach(n => knownNotificationIdsRef.current.add(n.id));
            initialNotifSyncDoneRef.current = true;

            // Also populate followRequests from incoming follow_request notifications
            const incomingFollowReqs = remoteNotifications.filter(
              n =>
                n.type === 'follow_request' &&
                (isSameUser(n.recipientId, currentUser.id) || (currentUser.email && n.recipientEmail && currentUser.email.toLowerCase() === n.recipientEmail.toLowerCase())) &&
                n.requestId &&
                n.status !== 'accepted' &&
                n.status !== 'confirmed' &&
                n.status !== 'declined' &&
                !n.targetText?.includes('friends') &&
                !n.targetText?.includes('is now following you')
            );

            setFollowRequests(incomingFollowReqs.map(n => ({
              id: n.requestId!,
              fromUserId: n.actor.id,
              toUserId: currentUser.id,
              timestamp: n.createdAt || n.timestamp || new Date().toISOString(),
            })));
            storage.set('follow_requests_v2', incomingFollowReqs);
          }

          const mappedNotifs = remoteNotifications.map(n => {
            const isReadLocally = readIds.has(n.id) || (n.id ? readIds.has(toUuid(n.id)) : false);
            return {
              ...n,
              isUnread: isReadLocally ? false : n.isUnread,
            };
          });

          // Ensure notifications are strictly sorted newest on top
          const sortedNotifs = [...mappedNotifs].sort((a, b) => {
            const timeA = new Date(a.createdAt || a.timestamp || 0).getTime() || 0;
            const timeB = new Date(b.createdAt || b.timestamp || 0).getTime() || 0;
            return timeB - timeA;
          });

          setNotifications(sortedNotifs);
          storage.set('notifications', sortedNotifs);
        }
      }
    } catch (err) {
      console.warn('Initial Supabase sync fallback:', err);
    }
  };

  // Helper to detect if browser is returning from an OAuth callback
  const checkIsOAuthRedirect = (): boolean => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const inProgress = sessionStorage.getItem('viralhub_oauth_in_progress') === 'true';
    const hasAuthParams =
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      search.includes('code=') ||
      search.includes('error=');
    if (hasAuthParams) {
      sessionStorage.setItem('viralhub_oauth_in_progress', 'true');
      return true;
    }
    return inProgress;
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

    // Check memory first (instant, 0 DB roundtrip)
    let existingUser: User | null =
      users.find(u => u.id === sbUser.id || (email && u.email && u.email.trim().toLowerCase() === email)) ||
      savedAccounts.find(u => u.id === sbUser.id || (email && u.email && u.email.trim().toLowerCase() === email)) ||
      null;

    if (!existingUser) {
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
    const banInfo = checkIsUserBanned(finalUserId, sbUser.email || email, existingUser);
    // Determine ban status authoritatively from database record (existingUser)
    const isBannedFinal = existingUser
      ? Boolean(existingUser.isBanned) && existingUser.appealStatus !== 'approved'
      : banInfo.isBanned;

    if (!isBannedFinal) {
      recordUserUnban(finalUserId, sbUser.email || email, existingUser?.username || username);
    }

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
      isBanned: isBannedFinal,
      banReason: isBannedFinal ? (existingUser?.banReason || banInfo.banReason || 'Violation of Community Guidelines') : undefined,
      bannedAt: isBannedFinal ? (existingUser?.bannedAt || banInfo.bannedAt || new Date().toISOString()) : undefined,
      appealStatus: isBannedFinal ? (existingUser?.appealStatus || banInfo.appealStatus) : 'approved',
      appealReason: existingUser?.appealReason || banInfo.appealReason,
      appealSubmittedAt: existingUser?.appealSubmittedAt || banInfo.appealSubmittedAt,
    };

    setCurrentUser(finalUser);
    storage.set('currentUser', finalUser);
    recordSavedAccount(finalUser);
    setSwitchAccountModalOpen(false);

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

    const isInitialOAuth = checkIsOAuthRedirect();

    // Check existing session on load
    client.auth.getSession().then(({ data: { session } }) => {
      const activeStored = storage.get<User | null>('currentUser', null);
      if (session?.user) {
        if (isInitialOAuth || !activeStored) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('viralhub_oauth_in_progress');
          }
          handleSupabaseUserSession(session.user);
        }
      }
    });

    // Listen to live auth state changes
    const { data: authSubscription } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        if (session?.user) {
          const activeStored = storage.get<User | null>('currentUser', null);
          const isExplicitOAuth = checkIsOAuthRedirect();

          // If returning from an explicit OAuth action, always finalize login!
          if (isExplicitOAuth) {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('viralhub_oauth_in_progress');
            }
            await handleSupabaseUserSession(session.user);
            return;
          }

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
            if (!isSameUser) {
              return;
            }
          }

          await handleSupabaseUserSession(session.user);
        }
      } else if (event === 'INITIAL_SESSION') {
        const isExplicitOAuth = checkIsOAuthRedirect();
        if (isExplicitOAuth && session?.user) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('viralhub_oauth_in_progress');
          }
          await handleSupabaseUserSession(session.user);
        } else {
          const activeStored = storage.get<User | null>('currentUser', null);
          if (!activeStored && session?.user) {
            await handleSupabaseUserSession(session.user);
          }
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

      // Gentle throttled re-sync on tab/window focus (max once every 30 seconds)
      let lastFocusSync = Date.now();
      const onFocus = () => {
        const now = Date.now();
        if (now - lastFocusSync > 30000) {
          lastFocusSync = now;
          syncWithSupabase();
        }
      };
      window.addEventListener('focus', onFocus);

      // Local cross-tab realtime sync via storage events
      const handleStorageEvent = (e: StorageEvent) => {
        const rawKey = e.key || '';
        const cleanKey = rawKey.startsWith('viralhub_') ? rawKey.replace(/^viralhub_/, '') : rawKey;

        if (cleanKey === 'user_banned_event') {
          try {
            const data = JSON.parse(e.newValue || '{}');
            if (data.userId || data.email || data.username) {
              const reason = data.reason || 'Violation of Community Guidelines';
              // Update currentUser if matching
              setCurrentUser(prev => {
                if (!prev) return prev;
                const matches =
                  isSameUser(prev.id, data.userId) ||
                  (data.email && prev.email && prev.email.toLowerCase() === data.email.toLowerCase()) ||
                  (data.username && prev.username && prev.username.toLowerCase() === data.username.toLowerCase());
                if (matches) {
                  const updated: User = {
                    ...prev,
                    isBanned: true,
                    banReason: reason,
                    bannedAt: new Date().toISOString(),
                    appealStatus: 'none',
                  };
                  storage.set('currentUser', updated);
                  return updated;
                }
                return prev;
              });

              // Update users list
              setUsers(prev =>
                prev.map(u => {
                  const matches =
                    isSameUser(u.id, data.userId) ||
                    (data.email && u.email && u.email.toLowerCase() === data.email.toLowerCase()) ||
                    (data.username && u.username && u.username.toLowerCase() === data.username.toLowerCase());
                  return matches ? { ...u, isBanned: true, banReason: reason } : u;
                })
              );

              // Update savedAccounts
              setSavedAccounts(prev => {
                const next = prev.map(a => {
                  const matches =
                    isSameUser(a.id, data.userId) ||
                    (data.email && a.email && a.email.toLowerCase() === data.email.toLowerCase()) ||
                    (data.username && a.username && a.username.toLowerCase() === data.username.toLowerCase());
                  return matches ? { ...a, isBanned: true, banReason: reason } : a;
                });
                storage.set('saved_accounts_v2', next);
                return next;
              });

              // Hide videos from feed
              setVideos(prev =>
                prev.map(v => {
                  const matches =
                    isSameUser(v.creatorId, data.userId) ||
                    (data.email && v.creator?.email && v.creator.email.toLowerCase() === data.email.toLowerCase());
                  return matches ? { ...v, status: 'rejected', rejectionReason: `Creator account suspended: ${reason}` } : v;
                })
              );
            }
          } catch {}
          return;
        }

        if (cleanKey === 'user_unbanned_event') {
          try {
            const data = JSON.parse(e.newValue || '{}');
            if (data.userId || data.email) {
              setCurrentUser(prev => {
                if (!prev) return prev;
                const matches =
                  isSameUser(prev.id, data.userId) ||
                  (data.email && prev.email && prev.email.toLowerCase() === data.email.toLowerCase());
                if (matches) {
                  const updated: User = {
                    ...prev,
                    isBanned: false,
                    banReason: undefined,
                    appealStatus: 'approved',
                  };
                  storage.set('currentUser', updated);
                  return updated;
                }
                return prev;
              });

              setUsers(prev =>
                prev.map(u => {
                  const matches =
                    isSameUser(u.id, data.userId) ||
                    (data.email && u.email && u.email.toLowerCase() === data.email.toLowerCase());
                  return matches ? { ...u, isBanned: false, banReason: undefined, appealStatus: 'approved' as const } : u;
                })
              );

              setSavedAccounts(prev => {
                const next = prev.map(a => {
                  const matches =
                    isSameUser(a.id, data.userId) ||
                    (data.email && a.email && a.email.toLowerCase() === data.email.toLowerCase());
                  return matches ? { ...a, isBanned: false, banReason: undefined, appealStatus: 'approved' as const } : a;
                });
                storage.set('saved_accounts_v2', next);
                return next;
              });
            }
          } catch {}
          return;
        }

        if (cleanKey === 'currentUser' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && parsed.id) {
              const banInfo = checkIsUserBanned(parsed.id, parsed.email, parsed);
              setCurrentUser({
                ...parsed,
                isBanned: banInfo.isBanned,
                banReason: banInfo.isBanned ? banInfo.banReason : undefined,
                bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
                appealStatus: banInfo.appealStatus,
              });
            }
          } catch {}
          return;
        }

        if (!currentUser) return;
        if ((cleanKey === 'notifications' || e.key === 'notifications') && e.newValue) {
          try {
            const parsedNotifs = JSON.parse(e.newValue) as NotificationItem[];
            if (Array.isArray(parsedNotifs)) {
              setNotifications(parsedNotifs);
              const newForMe = parsedNotifs.find(n => {
                const isForMe =
                  n.recipientId === currentUser.id || toUuid(n.recipientId) === toUuid(currentUser.id);
                const notFromMe = n.actor?.id !== currentUser.id;
                return isForMe && notFromMe && n.isUnread && !knownNotificationIdsRef.current.has(n.id);
              });
              if (newForMe) {
                knownNotificationIdsRef.current.add(newForMe.id);
                setActiveNotificationPopup(newForMe);
              }
            }
          } catch {}
        } else if ((cleanKey === 'conversations' || e.key === 'conversations') && e.newValue) {
          try {
            const parsedConvs = JSON.parse(e.newValue);
            if (Array.isArray(parsedConvs)) setConversations(parsedConvs);
          } catch {}
        } else if ((cleanKey === 'follow_requests_v2' || e.key === 'follow_requests_v2') && e.newValue) {
          try {
            const parsedReqs = JSON.parse(e.newValue);
            if (Array.isArray(parsedReqs)) setFollowRequests(parsedReqs);
          } catch {}
        } else if ((cleanKey === 'follow_relations_v2' || e.key === 'follow_relations_v2') && e.newValue) {
          try {
            const parsedRels = JSON.parse(e.newValue);
            if (Array.isArray(parsedRels)) setFollowRelations(parsedRels);
          } catch {}
        }
      };
      window.addEventListener('storage', handleStorageEvent);

      // Targeted Supabase Realtime channel listeners (avoids downloading all tables on every change)
      let realtimeChannel: any = null;
      let chatBroadcastChannel: any = null;
      try {
        const client = getSupabaseClient();
        if (client) {
          const userChannelId = currentUser?.id ? String(currentUser.id).replace(/[^a-zA-Z0-9_-]/g, '') : 'public';
          realtimeChannel = client
            .channel(`viralhub_rt_${userChannelId}`)
            // 1. Notification updates: only update notifications when relevant to this user
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Notification' }, (payload: any) => {
              const row = payload.new || payload.old;
              if (!row || !currentUser) return;
              const targetUserId = row.UserID;
              if (isSameUser(targetUserId, currentUser.id)) {
                // Ignore redundant generic system triggers like "Someone commented on your video"
                const rawMsg = typeof row.NotificationMessage === 'string' ? row.NotificationMessage.trim() : '';
                if (
                  !rawMsg.startsWith('{') &&
                  (rawMsg.toLowerCase().includes('someone commented') ||
                   rawMsg.toLowerCase().includes('commented on your video') ||
                   rawMsg.toLowerCase().includes('someone liked'))
                ) {
                  return;
                }

                supabaseDb.fetchNotifications().then(notifs => {
                  if (notifs) {
                    setNotifications(notifs);
                    const newForMe = notifs.find(
                      n =>
                        n.isUnread &&
                        isSameUser(n.recipientId, currentUser.id) &&
                        !isSameUser(n.actor?.id, currentUser.id) &&
                        !knownNotificationIdsRef.current.has(n.id)
                    );
                    if (newForMe) {
                      knownNotificationIdsRef.current.add(newForMe.id);
                      setActiveNotificationPopup(newForMe);
                    }
                  }
                });
              }
            })
            // 2. Message updates: only re-fetch messages when someone else sends a message
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Message' }, (payload: any) => {
              const newMsg = payload.new;
              if (!newMsg || !currentUser) return;
              if (isSameUser(newMsg.SenderUserID, currentUser.id)) return;
              syncWithSupabase();
            })
            // 3. Like updates: update video like count directly in memory (ignore own optimistic actions)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Like' }, (payload: any) => {
              const actorId = payload.new?.UserID || payload.old?.UserID;
              if (currentUser && actorId && isSameUser(actorId, currentUser.id)) {
                // Actor's own like/unlike is already optimistically updated locally in UI
                return;
              }
              const videoId = payload.new?.VideoID || payload.old?.VideoID;
              if (!videoId) return;
              const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
              if (delta !== 0) {
                setVideos(prev =>
                  prev.map(v =>
                    v.id === videoId || toUuid(v.id) === toUuid(videoId)
                      ? { ...v, likesCount: Math.max(0, (v.likesCount || 0) + delta) }
                      : v
                  )
                );
              }
            })
            // 4. Comment updates: update video comment count and comments list in real time across devices
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Comment' }, (payload: any) => {
              const videoId = payload.new?.VideoID || payload.old?.VideoID;
              if (videoId) {
                fetchCommentsForVideoRef.current(videoId, true);
              }
            })
            // 5. Video updates: handle uploads, deletions, and view count updates without global sync
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Video' }, (payload: any) => {
              const eventType = payload.eventType;
              if (eventType === 'INSERT') {
                // New video uploaded: fetch video list so other users see it
                supabaseDb.fetchVideos().then(vids => {
                  if (vids) setVideos(vids);
                });
              } else if (eventType === 'DELETE') {
                const delId = payload.old?.VideoID;
                if (delId) {
                  setVideos(prev => prev.filter(v => v.id !== delId && toUuid(v.id) !== toUuid(delId)));
                }
              } else if (eventType === 'UPDATE') {
                const updatedRow = payload.new;
                if (!updatedRow) return;
                // Update video status or viewsCount in place without re-fetching entire table!
                setVideos(prev =>
                  prev.map(v => {
                    if (v.id === updatedRow.VideoID || toUuid(v.id) === toUuid(updatedRow.VideoID)) {
                      return {
                        ...v,
                        viewsCount: updatedRow.ViewCount !== undefined ? String(updatedRow.ViewCount) : v.viewsCount,
                        status: updatedRow.Status || v.status,
                        rejectionReason: updatedRow.RejectionReason !== undefined ? updatedRow.RejectionReason : v.rejectionReason,
                        appealStatus: updatedRow.AppealStatus || v.appealStatus,
                      };
                    }
                    return v;
                  })
                );
              }
            })
            // 6. Follow updates: refresh follow relationships
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Following' }, () => {
              supabaseDb.fetchFollows().then(f => {
                if (f) setFollowRelations(f);
              });
            })
            .subscribe();

          // Shared Realtime Broadcast channel for instant cross-device messaging (0 Disk IO!)
          chatBroadcastChannel = client.channel('viralhub_chat_realtime', {
            config: { broadcast: { self: false } },
          });

          chatBroadcastChannel
            .on('broadcast', { event: 'chat_message' }, ({ payload }: any) => {
              if (!payload || !currentUser) return;
              if (!isSameUser(payload.recipientId, currentUser.id)) return;

              const convId = payload.conversationId;
              const senderId = payload.senderId;
              const nowTimeStr = 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              const incomingMsg: Message = {
                id: payload.messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                conversationId: convId,
                senderId: senderId,
                text: payload.text,
                timestamp: payload.timestamp || nowTimeStr,
                sentAt: payload.sentAt || new Date().toISOString(),
                isMine: false,
                status: 'read',
                sharedVideo: payload.sharedVideo,
                sharedVideoId: payload.sharedVideo?.id,
                deletedForUserIds: [],
              };

              setConversations(prev => {
                let matched = false;
                const updated = prev.map(c => {
                  const isThisConv =
                    c.id === convId ||
                    toUuid(c.id) === toUuid(convId) ||
                    (c.participantIds && c.participantIds.some(id => isSameUser(id, senderId))) ||
                    (c.participant && isSameUser(c.participant.id, senderId));

                  if (isThisConv) {
                    matched = true;
                    const exists = c.messages.some(
                      m => m.id === incomingMsg.id || (m.text === incomingMsg.text && m.timestamp === incomingMsg.timestamp)
                    );
                    const newMessages = exists ? c.messages : [...c.messages, incomingMsg];
                    const curUnread = c.unreadCounts?.[currentUser.id] || 0;

                    return {
                      ...c,
                      lastMessage: payload.text,
                      lastMessageTime: incomingMsg.timestamp,
                      messages: newMessages,
                      // Automatically unhide conversation for recipient!
                      deletedForUserIds: (c.deletedForUserIds || []).filter(id => !isSameUser(id, currentUser.id)),
                      unreadCounts: {
                        ...(c.unreadCounts || {}),
                        [currentUser.id]: curUnread + 1,
                      },
                      unreadCount: curUnread + 1,
                    };
                  }
                  return c;
                });

                if (!matched) {
                  const senderUser = users.find(u => isSameUser(u.id, senderId)) || payload.sender || {
                    id: senderId,
                    username: `user_${String(senderId).slice(0, 6)}`,
                    displayName: 'User',
                    avatar: '',
                    email: '',
                    bio: '',
                    followingCount: 0,
                    followersCount: 0,
                    likesCount: '0',
                    isPrivate: false,
                    role: 'creator',
                  };

                  const newConv: Conversation = {
                    id: convId,
                    participantIds: [currentUser.id, senderId],
                    participant: senderUser,
                    lastMessage: payload.text,
                    lastMessageTime: incomingMsg.timestamp,
                    unreadCount: 1,
                    unreadCounts: { [currentUser.id]: 1, [senderId]: 0 },
                    messages: [incomingMsg],
                    isOnline: true,
                    deletedForUserIds: [],
                  };
                  const next = deduplicateConversations([newConv, ...updated], currentUser.id);
                  storage.set('conversations', next);
                  return next;
                }

                const deduped = deduplicateConversations(updated, currentUser.id);
                storage.set('conversations', deduped);
                return deduped;
              });

              // Trigger in-app notification popup for new message
              const senderUser = users.find(u => isSameUser(u.id, senderId)) || payload.sender || {
                id: senderId,
                username: 'user',
                displayName: 'Someone',
                avatar: '',
              };
              setActiveNotificationPopup({
                id: `chat_notif_${Date.now()}`,
                recipientId: currentUser.id,
                type: 'message',
                actor: {
                  id: senderId,
                  username: senderUser.username || 'user',
                  displayName: senderUser.displayName || 'User',
                  avatar: senderUser.avatar || '',
                },
                targetText: payload.text.length > 50 ? `${payload.text.slice(0, 50)}...` : payload.text,
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isUnread: true,
              });
            })
            .on('broadcast', { event: 'conversation_deleted' }, ({ payload }: any) => {
              if (!payload || !currentUser) return;
              const { conversationId, canonicalId, userId, partnerId, clearedAt } = payload;
              const clearTimestamp = clearedAt || Date.now();

              // Check if currentUser is a participant in this conversation
              const isRelevant =
                isSameUser(userId, currentUser.id) ||
                isSameUser(partnerId, currentUser.id);

              if (!isRelevant) return;

              if (isSameUser(userId, currentUser.id)) {
                setConversationClearedTimestamp(conversationId, currentUser.id, clearTimestamp);
                if (canonicalId) setConversationClearedTimestamp(canonicalId, currentUser.id, clearTimestamp);
              }

              setConversations(prev => {
                const next = prev.map(c => {
                  const match =
                    c.id === conversationId ||
                    toUuid(c.id) === toUuid(conversationId) ||
                    (canonicalId && (c.id === canonicalId || toUuid(c.id) === toUuid(canonicalId))) ||
                    (partnerId && c.participantIds?.some(id => isSameUser(id, partnerId)));

                  if (match) {
                    const isDeletingUser = isSameUser(userId, currentUser.id);
                    const updatedMessages = (c.messages || []).map(m => {
                      if (!isDeletingUser) return m;
                      const mDeleted = m.deletedForUserIds || [];
                      return mDeleted.some(id => isSameUser(id, currentUser.id))
                        ? m
                        : { ...m, deletedForUserIds: [...mDeleted, currentUser.id] };
                    });

                    return {
                      ...c,
                      clearedHistoryAt: {
                        ...(c.clearedHistoryAt || {}),
                        [userId]: clearTimestamp,
                        [toUuid(userId)]: clearTimestamp,
                      },
                      messages: updatedMessages,
                      lastMessage: isDeletingUser ? 'Started a new conversation' : c.lastMessage,
                      lastMessageTime: isDeletingUser ? 'Just now' : c.lastMessageTime,
                      unreadCount: isDeletingUser ? 0 : c.unreadCount,
                      unreadCounts: isDeletingUser
                        ? { ...(c.unreadCounts || {}), [currentUser.id]: 0 }
                        : c.unreadCounts,
                    };
                  }
                  return c;
                });
                storage.set('conversations', next);
                return next;
              });
            })
            .on('broadcast', { event: 'message_deleted' }, ({ payload }: any) => {
              if (!payload) return;
              const { conversationId, messageId } = payload;
              setConversations(prev => {
                const next = prev.map(c => {
                  if (
                    c.id === conversationId ||
                    toUuid(c.id) === toUuid(conversationId) ||
                    c.messages.some(m => m.id === messageId || toUuid(m.id) === toUuid(messageId))
                  ) {
                    const remainingMessages = c.messages.filter(
                      m => m.id !== messageId && toUuid(m.id) !== toUuid(messageId)
                    );
                    const last = remainingMessages[remainingMessages.length - 1];
                    return {
                      ...c,
                      messages: remainingMessages,
                      lastMessage: last ? (last.sharedVideo ? '🎥 Shared a video' : last.text) : 'Started a new conversation',
                      lastMessageTime: last ? last.timestamp : c.lastMessageTime,
                    };
                  }
                  return c;
                });
                storage.set('conversations', next);
                return next;
              });
            })
            .subscribe();

          chatBroadcastChannelRef.current = chatBroadcastChannel;
        }
      } catch (err) {
        // realtime fallback
      }

      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('storage', handleStorageEvent);
        if (realtimeChannel) {
          getSupabaseClient()?.removeChannel(realtimeChannel);
        }
        if (chatBroadcastChannel) {
          getSupabaseClient()?.removeChannel(chatBroadcastChannel);
        }
        chatBroadcastChannelRef.current = null;
      };
    }
  }, [currentUser?.id]);

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
  const userConversations = useMemo(() => {
    if (!currentUser) return [];
    const valid = conversations.filter(c => {
      const isParticipant = (c.participantIds && c.participantIds.length > 0)
        ? c.participantIds.some(id => isSameUser(id, currentUser.id))
        : !isSameUser(c.participant?.id, currentUser.id);
      if (!isParticipant) return false;

      // If currentUser deleted this conversation, check if new messages arrived
      const isMarkedDeleted = c.deletedForUserIds && c.deletedForUserIds.some(id => isSameUser(id, currentUser.id));
      if (isMarkedDeleted) {
        const convClearTime = Math.max(
          getConversationClearedTimestamp(c.id, currentUser.id),
          c.clearedHistoryAt?.[currentUser.id] || 0,
          c.clearedHistoryAt?.[toUuid(currentUser.id)] || 0
        );

        const hasNewVisibleMsg = (c.messages || []).some(m => {
          if (m.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) return false;
          if (convClearTime > 0) {
            const sentTime = m.sentAt ? new Date(m.sentAt).getTime() : 0;
            if (sentTime > 0 && sentTime <= convClearTime) return false;
            if (typeof m.id === 'string' && m.id.startsWith('m_')) {
              const parts = m.id.split('_');
              const t = parseInt(parts[1], 10);
              if (t > 0 && t <= convClearTime) return false;
            }
          }
          return true;
        });

        if (!hasNewVisibleMsg) {
          return false;
        }
      }
      return true;
    });

    return deduplicateConversations(valid, currentUser.id);
  }, [conversations, currentUser]);

  // Total unread messages across conversations for currentUser
  const totalUnreadMessages = userConversations.reduce((acc, conv) => {
    if (!currentUser) return acc;
    if (conv.unreadCounts && typeof conv.unreadCounts[currentUser.id] === 'number') {
      return acc + conv.unreadCounts[currentUser.id];
    }
    return acc + (conv.unreadCount || 0);
  }, 0);

  // User's own notifications inbox: interactions addressed to currentUser (strictly sorted newest first)
  const userNotifications = useMemo(() => {
    return notifications
      .filter(n => {
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
        if (n.actor?.id && (n.actor.id === currentUser.id || toUuid(n.actor.id) === toUuid(currentUser.id))) {
          return false;
        }

        // Filter out any simulated reciprocal artifacts
        if (n.targetText?.includes('back!')) return false;

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0).getTime() || 0;
        const timeB = new Date(b.createdAt || b.timestamp || 0).getTime() || 0;
        return timeB - timeA; // Newest on top!
      });
  }, [notifications, currentUser]);

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
            const isBannedInDb = Boolean(dbUser.IsBanned || dbUser.is_banned);
            const appealStatusInDb = dbUser.AppealStatus || dbUser.appeal_status || 'none';
            const isUserBannedInDb = isBannedInDb && appealStatusInDb !== 'approved';

            if (!isUserBannedInDb) {
              recordUserUnban(
                dbUser.UserID || dbUser.id,
                dbUser.Email || dbUser.email,
                dbUser.Username || dbUser.username
              );
            }

            const banInfo = checkIsUserBanned(dbUser.UserID || dbUser.id, dbUser.Email || dbUser.email, {
              id: dbUser.UserID || dbUser.id,
              username: dbUser.Username || dbUser.username,
              isBanned: isUserBannedInDb,
              banReason: isUserBannedInDb ? (dbUser.BanReason || dbUser.ban_reason) : undefined,
              bannedAt: isUserBannedInDb ? (dbUser.BannedAt || dbUser.banned_at) : undefined,
              appealStatus: (appealStatusInDb || (isUserBannedInDb ? 'none' : 'approved')) as any,
              appealReason: dbUser.AppealReason || dbUser.appeal_reason,
              appealSubmittedAt: dbUser.AppealSubmittedAt || dbUser.appeal_submitted_at,
            });

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
              isBanned: isUserBannedInDb,
              banReason: isUserBannedInDb ? (dbUser.BanReason || dbUser.ban_reason || 'Violation of Community Guidelines') : undefined,
              bannedAt: isUserBannedInDb ? (dbUser.BannedAt || dbUser.banned_at) : undefined,
              appealStatus: (appealStatusInDb || (isUserBannedInDb ? 'none' : 'approved')) as any,
              appealReason: dbUser.AppealReason || dbUser.appeal_reason,
              appealSubmittedAt: dbUser.AppealSubmittedAt || dbUser.appeal_submitted_at,
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
      const banInfo = checkIsUserBanned(found.id, found.email, found);
      const patchedFound: User = {
        ...found,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
      };
      setCurrentUser(patchedFound);
      storage.set('currentUser', patchedFound);
      recordSavedAccount(patchedFound);
      if (patchedFound.role === 'admin') setIsAdmin(true);
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

    // Save current active user to device savedAccounts so they can easily switch back anytime
    if (currentUser) {
      recordSavedAccount(currentUser);
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('viralhub_oauth_in_progress', 'true');
    }

    const { error } = await signInWithGoogle();
    if (error) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('viralhub_oauth_in_progress');
      }
      return { success: false, message: error.message };
    }
    return { success: true };
  };

  const logout = async (saveToDevice = true) => {
    // Only save to device if explicitly requested AND user is not recorded as deleted
    if (saveToDevice && currentUser) {
      if (!isUserIdDeleted(currentUser.id, currentUser.email)) {
        recordSavedAccount(currentUser);
      }
    } else if (!saveToDevice && currentUser) {
      removeSavedAccount(currentUser.id);
      if (currentUser.email) {
        setSavedAccounts(prev => {
          const next = prev.filter(
            a => !isSameUser(a.id, currentUser.id) && (!a.email || a.email.toLowerCase() !== currentUser.email.toLowerCase())
          );
          storage.set('saved_accounts_v2', next);
          return next;
        });
      }
    }

    try {
      await signOutSupabase();
    } catch {
      // ignore
    }

    // Clear active session
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

    const banInfo = checkIsUserBanned(target.id, target.email, target);
    const updatedTarget: User = {
      ...target,
      role: isTargetAdmin ? 'admin' : (target.role || 'creator'),
      isBanned: banInfo.isBanned,
      banReason: banInfo.isBanned ? banInfo.banReason : undefined,
      bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
      appealStatus: banInfo.appealStatus,
      appealReason: banInfo.appealReason,
      appealSubmittedAt: banInfo.appealSubmittedAt,
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
  const updateUserProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    storage.set('currentUser', updated);
    recordSavedAccount(updated);
    setUsers(prev => prev.map(u => (u.id === currentUser.id ? updated : u)));
    await supabaseDb.upsertUser(updated);
  };

  // Follow & Relationship System (BR-011, BR-012, Friends mutual follow, Private requests)
  const isTargetFollowingMe = (targetUserId: string): boolean => {
    if (!currentUser) return false;
    return followRelations.some(
      f => isSameUser(f.followerId, targetUserId) && isSameUser(f.followingId, currentUser.id)
    );
  };

  const getFollowStatus = (targetUserId: string): FollowStatus => {
    if (!currentUser || isSameUser(currentUser.id, targetUserId)) return 'none';
    const currFollowsTarget = followRelations.some(
      f => isSameUser(f.followerId, currentUser.id) && isSameUser(f.followingId, targetUserId)
    );
    const targetFollowsCurr = followRelations.some(
      f => isSameUser(f.followerId, targetUserId) && isSameUser(f.followingId, currentUser.id)
    );

    if (currFollowsTarget && targetFollowsCurr) {
      return 'friends';
    }
    if (currFollowsTarget) {
      return 'following';
    }
    const hasPendingRequest = followRequests.some(
      r => isSameUser(r.fromUserId, currentUser.id) && isSameUser(r.toUserId, targetUserId)
    );
    if (hasPendingRequest) {
      return 'requested';
    }
    return 'none';
  };

  const toggleFollowUser = (userId: string) => {
    if (!currentUser || isSameUser(currentUser.id, userId)) return;
    const targetUser = users.find(u => isSameUser(u.id, userId));
    if (!targetUser) return;

    const currentStatus = getFollowStatus(userId);

    // Case 1: Already Friends or Following -> Unfollow
    if (currentStatus === 'friends' || currentStatus === 'following') {
      setFollowRelations(prev =>
        prev.filter(f => !(isSameUser(f.followerId, currentUser.id) && isSameUser(f.followingId, userId)))
      );

      setUsers(prev =>
        prev.map(u => {
          if (isSameUser(u.id, userId)) {
            return { ...u, followersCount: Math.max(0, u.followersCount - 1) };
          }
          if (isSameUser(u.id, currentUser.id)) {
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
        prev.filter(r => !(isSameUser(r.fromUserId, currentUser.id) && isSameUser(r.toUserId, userId)))
      );
      setNotifications(prev =>
        prev.filter(
          n => !(isSameUser(n.recipientId, userId) && isSameUser(n.actor.id, currentUser.id) && n.type === 'follow_request')
        )
      );
      return;
    }

    // Case 3: Follow Back OR Follow
    // If target already follows currentUser (e.g. currentUser accepted their request or they follow currentUser):
    // Even if targetUser is marked private, because targetUser already follows currentUser,
    // clicking "Follow Back" directly completes the mutual follow and makes them Friends immediately!
    const targetFollowsMe = isTargetFollowingMe(targetUser.id);

    if (targetFollowsMe || !targetUser.isPrivate) {
      // Follow immediately!
      setFollowRelations(prev => {
        const exists = prev.some(f => isSameUser(f.followerId, currentUser.id) && isSameUser(f.followingId, targetUser.id));
        if (exists) return prev;
        return [...prev, { followerId: currentUser.id, followingId: targetUser.id }];
      });

      // Clear any pending follow requests between these users
      setFollowRequests(prev =>
        prev.filter(r => !(isSameUser(r.fromUserId, userId) && isSameUser(r.toUserId, currentUser.id)) && !(isSameUser(r.fromUserId, currentUser.id) && isSameUser(r.toUserId, userId)))
      );

      setUsers(prev =>
        prev.map(u => {
          if (isSameUser(u.id, targetUser.id)) {
            return { ...u, followersCount: u.followersCount + 1 };
          }
          if (isSameUser(u.id, currentUser.id)) {
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
      return;
    }

    // Case 4: Target is private AND does not follow me yet -> Send follow request
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
    supabaseDb.insertNotification(reqNotif, targetUser.id);
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
    const matchingNotif = notifications.find(n => n.requestId === requestId || n.id === requestId);
    const requesterId = req?.fromUserId || matchingNotif?.actor?.id;

    if (requesterId) {
      if (andFollowBack) {
        // Mutual follows (Friends): Requester follows currentUser AND currentUser follows requester back
        setFollowRelations(prev => {
          const next = [...prev];
          if (!next.some(f => isSameUser(f.followerId, requesterId) && isSameUser(f.followingId, currentUser.id))) {
            next.push({ followerId: requesterId, followingId: currentUser.id });
          }
          if (!next.some(f => isSameUser(f.followerId, currentUser.id) && isSameUser(f.followingId, requesterId))) {
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
        supabaseDb.updateNotificationStatus(requestId, 'accepted', 'You are now friends!');
        if (matchingNotif?.id && matchingNotif.id !== requestId) {
          supabaseDb.updateNotificationStatus(matchingNotif.id, 'accepted', 'You are now friends!');
        }
      } else {
        // Confirm only: Requester follows currentUser, but currentUser does NOT follow them back yet!
        // When currentUser visits requester's profile, currentUser will see "Follow Back"!
        setFollowRelations(prev => {
          const next = [...prev];
          if (!next.some(f => isSameUser(f.followerId, requesterId) && isSameUser(f.followingId, currentUser.id))) {
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
          status: 'confirmed',
        };
        setNotifications(prev => {
          const next = [replyNotif, ...prev];
          storage.set('notifications', next);
          return next;
        });

        supabaseDb.toggleFollow(requesterId, currentUser.id, true);
        supabaseDb.insertNotification(replyNotif, requesterId);
        supabaseDb.updateNotificationStatus(requestId, 'confirmed', 'is now following you.');
        if (matchingNotif?.id && matchingNotif.id !== requestId) {
          supabaseDb.updateNotificationStatus(matchingNotif.id, 'confirmed', 'is now following you.');
        }
      }
    }

    // Remove request from pending follow requests thoroughly
    setFollowRequests(prev =>
      prev.filter(r => r.id !== requestId && !(requesterId && isSameUser(r.fromUserId, requesterId) && isSameUser(r.toUserId, currentUser.id)))
    );

    // Update currentUser notification in inbox
    setNotifications(prev =>
      prev.map(n => {
        if (
          n.requestId === requestId ||
          n.id === requestId ||
          (requesterId && isSameUser(n.recipientId, currentUser.id) && isSameUser(n.actor.id, requesterId) && n.type === 'follow_request')
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
    const req = followRequests.find(r => r.id === requestId);
    const matchingNotif = notifications.find(n => n.requestId === requestId || n.id === requestId);
    const requesterId = req?.fromUserId || matchingNotif?.actor?.id;

    setFollowRequests(prev =>
      prev.filter(r => r.id !== requestId && !(requesterId && isSameUser(r.fromUserId, requesterId) && isSameUser(r.toUserId, currentUser?.id)))
    );
    setNotifications(prev =>
      prev.map(n =>
        n.requestId === requestId || n.id === requestId
          ? {
              ...n,
              isUnread: false,
              status: 'declined',
              targetText: 'Follow request declined',
            }
          : n
      )
    );

    supabaseDb.updateNotificationStatus(requestId, 'declined', 'Follow request declined');
    if (matchingNotif?.id && matchingNotif.id !== requestId) {
      supabaseDb.updateNotificationStatus(matchingNotif.id, 'declined', 'Follow request declined');
    }
  };

  const getUserFollowers = (userId: string): User[] => {
    const followerIds = followRelations
      .filter(f => isSameUser(f.followingId, userId))
      .map(f => f.followerId);
    return users.filter(u => followerIds.some(fid => isSameUser(fid, u.id)));
  };

  const getUserFollowing = (userId: string): User[] => {
    const followingIds = followRelations
      .filter(f => isSameUser(f.followerId, userId))
      .map(f => f.followingId);
    return users.filter(u => followingIds.some(fid => isSameUser(fid, u.id)));
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
  const addCommentToVideo = async (
    videoId: string,
    text: string,
    replyToCommentId?: string
  ): Promise<boolean> => {
    if (!currentUser || !text.trim() || !videoId) return false;
    const cleanText = text.trim();
    const commentUuid = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 1. Optimistic UI update in commentsMap
    setCommentsMap(prev => {
      const list = prev[videoId] || [];
      if (replyToCommentId) {
        const updated = list.map(c => {
          if (c.id === replyToCommentId || toUuid(c.id) === toUuid(replyToCommentId)) {
            const existingReplies = c.replies || [];
            if (existingReplies.some(r => r.id === commentUuid)) {
              return c;
            }
            const replies = [
              ...existingReplies,
              {
                id: commentUuid,
                name: currentUser.displayName || currentUser.username || 'User',
                avatar: currentUser.avatar || '',
                text: cleanText,
                timestamp: nowIso,
                userId: currentUser.id,
              },
            ];
            return { ...c, replies };
          }
          return c;
        });
        const next = { ...prev, [videoId]: updated };
        storage.set('video_comments_v2', next);
        return next;
      } else {
        const newEntry: CommentEntry = {
          id: commentUuid,
          name: currentUser.displayName || currentUser.username || 'User',
          avatar: currentUser.avatar || '',
          text: cleanText,
          timestamp: nowIso,
          likesCount: 0,
          isLiked: false,
          userId: currentUser.id,
          replies: [],
        };
        const next = { ...prev, [videoId]: [...list, newEntry] };
        storage.set('video_comments_v2', next);
        return next;
      }
    });

    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId || toUuid(v.id) === toUuid(videoId)) {
          return { ...v, commentsCount: (v.commentsCount || 0) + 1 };
        }
        return v;
      })
    );

    // 2. Persist to Supabase Comment table
    const success = await supabaseDb.insertComment(
      commentUuid,
      videoId,
      currentUser,
      cleanText,
      replyToCommentId
    );

    // 3. Trigger notification to the VIDEO CREATOR (if not currentUser)
    const video = videos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));
    if (video && !isSameUser(video.creatorId, currentUser.id)) {
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: video.creatorId,
        type: 'comment',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: `commented to your video: "${cleanText.slice(0, 35)}"`,
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

    return success;
  };

  const deleteCommentFromVideo = async (videoId: string, commentId: string): Promise<boolean> => {
    if (!videoId || !commentId) return false;

    setCommentsMap(prev => {
      const list = prev[videoId] || [];
      const updated = list
        .filter(c => c.id !== commentId && toUuid(c.id) !== toUuid(commentId))
        .map(c => ({
          ...c,
          replies: (c.replies || []).filter(r => r.id !== commentId && toUuid(r.id) !== toUuid(commentId)),
        }));
      const next = { ...prev, [videoId]: updated };
      storage.set('video_comments_v2', next);
      return next;
    });

    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId || toUuid(v.id) === toUuid(videoId)) {
          return { ...v, commentsCount: Math.max(0, (v.commentsCount || 0) - 1) };
        }
        return v;
      })
    );

    return supabaseDb.deleteComment(commentId, videoId);
  };

  const toggleLikeComment = (videoId: string, commentId: string) => {
    setCommentsMap(prev => {
      const list = prev[videoId] || [];
      const updated = list.map(c => {
        if (c.id === commentId || toUuid(c.id) === toUuid(commentId)) {
          const liked = !c.isLiked;
          const count = Math.max(0, (c.likesCount || 0) + (liked ? 1 : -1));
          return { ...c, isLiked: liked, likesCount: count };
        }
        return c;
      });
      const next = { ...prev, [videoId]: updated };
      storage.set('video_comments_v2', next);
      return next;
    });
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

  // Session guard to ensure a video view is counted once per session and not on re-renders
  const viewedVideosSessionRef = React.useRef<Set<string>>(new Set());

  // Record Video View (increments view count on video and profile)
  const recordVideoView = (videoId: string) => {
    if (!videoId) return;
    if (viewedVideosSessionRef.current.has(videoId)) {
      return;
    }
    viewedVideosSessionRef.current.add(videoId);

    setVideos(prev =>
      prev.map(v => {
        if (v.id === videoId || toUuid(v.id) === toUuid(videoId)) {
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

    // Find or create canonical conversation
    const canonicalConvId = getDirectConversationId(currentUser.id, targetUserId);
    const existing = conversations.find(c => {
      if (c.id === canonicalConvId || toUuid(c.id) === canonicalConvId) return true;
      const pId = c.participantIds?.find(id => !isSameUser(id, currentUser.id)) || c.participant?.id;
      return isSameUser(pId, targetUserId);
    });

    let targetConvId = canonicalConvId;
    if (existing) {
      targetConvId = existing.id;
    } else {
      const newConv: Conversation = {
        id: canonicalConvId,
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
      setConversations(prev => deduplicateConversations([newConv, ...prev], currentUser.id));
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

    const validThumb =
      newVideo.thumbnailUrl && !isVideoUrl(newVideo.thumbnailUrl) && !newVideo.thumbnailUrl.includes('avatar_')
        ? newVideo.thumbnailUrl
        : '';

    const created: Video = {
      id: videoId,
      creatorId: currentUser.id,
      creator: currentUser,
      caption: newVideo.caption || 'New viral moment! 🔥',
      hashtags: newVideo.hashtags.length > 0 ? newVideo.hashtags : ['#viral', '#fyp'],
      audioTrack: newVideo.audioTrack,
      mediaUrl: newVideo.mediaUrl,
      thumbnailUrl: validThumb,
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
      coverUrl: validThumb,
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
        if (c.id === convId || toUuid(c.id) === toUuid(convId)) {
          return {
            ...c,
            unreadCount: 0, // Clears badge
            unreadCounts: {
              ...(c.unreadCounts || {}),
              [currentUser.id]: 0,
            },
            messages: c.messages.map(m =>
              !isSameUser(m.senderId, currentUser.id) ? { ...m, status: 'read' as const } : m
            ),
          };
        }
        return c;
      })
    );
  };

  const openConversationWithUser = (targetUserId: string) => {
    if (!currentUser) return;
    const target = users.find(u => isSameUser(u.id, targetUserId));

    // Private profile check: cannot send message unless they are friends!
    if (target?.isPrivate && getFollowStatus(target.id) !== 'friends') {
      return;
    }

    const canonicalConvId = getDirectConversationId(currentUser.id, targetUserId);

    // 1. Check if conversation with this participant already exists
    const existing = conversations.find(c => {
      if (c.id === canonicalConvId || toUuid(c.id) === canonicalConvId) return true;
      const pId = c.participantIds?.find(id => !isSameUser(id, currentUser.id)) || c.participant?.id;
      return isSameUser(pId, targetUserId);
    });

    if (existing) {
      if (existing.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) {
        setConversations(prev => {
          const next = prev.map(c => {
            if (c.id === existing.id || toUuid(c.id) === toUuid(existing.id)) {
              // Mark all prior messages as deleted for currentUser so past messages never show up
              const updatedMessages = (c.messages || []).map(m => {
                const mDeleted = m.deletedForUserIds || [];
                return mDeleted.some(id => isSameUser(id, currentUser.id))
                  ? m
                  : { ...m, deletedForUserIds: [...mDeleted, currentUser.id] };
              });

              return {
                ...c,
                deletedForUserIds: (c.deletedForUserIds || []).filter(id => !isSameUser(id, currentUser.id)),
                messages: updatedMessages,
                lastMessage: 'Started a new conversation',
                lastMessageTime: 'Just now',
              };
            }
            return c;
          });
          storage.set('conversations', next);
          return next;
        });
      }
      openConversation(existing.id);
      setMessagesMobileView('chat');
      setActiveTab('messages');
      return;
    }

    // 2. If not, create new conversation using deterministic canonical UUID
    if (target) {
      const newConv: Conversation = {
        id: canonicalConvId,
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
      setConversations(prev => deduplicateConversations([newConv, ...prev], currentUser.id));
      setActiveConversationId(canonicalConvId);
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

    const conv = conversations.find(c => c.id === convId || toUuid(c.id) === toUuid(convId));
    const recipientId =
      conv?.participantIds?.find(id => !isSameUser(id, currentUser?.id)) ||
      (conv?.participant && !isSameUser(conv.participant.id, currentUser?.id) ? conv.participant.id : '') ||
      '';

    // Guard: If recipient is private, cannot message unless friends!
    const recipientUser = users.find(u => isSameUser(u.id, recipientId));
    if (recipientUser?.isPrivate && getFollowStatus(recipientId) !== 'friends') {
      return;
    }

    const canonicalConvId = recipientId
      ? getDirectConversationId(currentUser?.id, recipientId)
      : convId;

    const displayText = text.trim() || (sharedVideo ? `Shared a video: "${sharedVideo.caption}"` : '');
    const newMsg: Message = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: canonicalConvId,
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

    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id === convId || toUuid(c.id) === toUuid(convId) || c.id === canonicalConvId) {
          const currentRecipientUnread = c.unreadCounts?.[recipientId] || 0;
          return {
            ...c,
            id: canonicalConvId,
            lastMessage: sharedVideo ? `🎥 Shared a video: "${sharedVideo.caption.slice(0, 25)}"` : text.trim(),
            lastMessageTime: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            messages: [...c.messages, newMsg],
            deletedForUserIds: (c.deletedForUserIds || []).filter(
              id => !isSameUser(id, currentUser?.id) && !isSameUser(id, recipientId)
            ),
            unreadCounts: {
              ...(c.unreadCounts || {}),
              [currentUser ? currentUser.id : 'me']: 0,
              [recipientId]: currentRecipientUnread + 1,
            },
          };
        }
        return c;
      });
      const deduped = deduplicateConversations(updated, currentUser?.id);
      storage.set('conversations', deduped);
      return deduped;
    });

    if (activeConversationId === convId && activeConversationId !== canonicalConvId) {
      setActiveConversationId(canonicalConvId);
    }

    const remotePayload = sharedVideo
      ? `[VIDEO_SHARE:${sharedVideo.id}] ${text.trim()}`
      : text.trim();

    if (currentUser) {
      supabaseDb.insertMessage(canonicalConvId, currentUser.id, recipientId, remotePayload);

      // Instant WebSocket broadcast directly to other device (<50ms, 0 Disk IO)
      try {
        const client = getSupabaseClient();
        const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
        if (broadcastCh) {
          broadcastCh.send({
            type: 'broadcast',
            event: 'chat_message',
            payload: {
              conversationId: canonicalConvId,
              senderId: currentUser.id,
              recipientId,
              messageId: newMsg.id,
              text: displayText,
              timestamp: newMsg.timestamp,
              sentAt: new Date().toISOString(),
              sharedVideo: sharedVideo ? { id: sharedVideo.id, caption: sharedVideo.caption, mediaUrl: sharedVideo.mediaUrl } : undefined,
              sender: {
                id: currentUser.id,
                username: currentUser.username,
                displayName: currentUser.displayName,
                avatar: currentUser.avatar,
              },
            },
          });
        }
      } catch (bcErr) {
        console.warn('Realtime chat broadcast note:', bcErr);
      }

      // Create realtime notification for recipient across devices
      if (recipientId) {
        const nowIso = new Date().toISOString();
        const msgNotif: NotificationItem = {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          recipientId,
          type: 'message' as any,
          actor: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatar: currentUser.avatar,
          },
          targetText: displayText.length > 50 ? `${displayText.slice(0, 50)}...` : displayText,
          timestamp: nowIso,
          createdAt: nowIso,
          isUnread: true,
        };
        setNotifications(prev => {
          const next = [msgNotif, ...prev];
          storage.set('notifications', next);
          return next;
        });
        supabaseDb.insertNotification(msgNotif, recipientId);
      }
    }
  };

  // Delete whole conversation: marks history cleared for user, deletes past messages from Supabase, and syncs across devices
  const deleteConversation = (convId: string) => {
    if (!currentUser) return;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const conv = conversations.find(c => c.id === convId || toUuid(c.id) === toUuid(convId));
    const partnerId =
      conv?.participantIds?.find(id => !isSameUser(id, currentUser.id)) ||
      (conv?.participant && !isSameUser(conv.participant.id, currentUser.id) ? conv.participant.id : undefined);
    const canonicalConvId = partnerId ? getDirectConversationId(currentUser.id, partnerId) : convId;

    setConversationClearedTimestamp(convId, currentUser.id, now);
    if (conv?.id && conv.id !== convId) {
      setConversationClearedTimestamp(conv.id, currentUser.id, now);
    }
    if (canonicalConvId && canonicalConvId !== convId) {
      setConversationClearedTimestamp(canonicalConvId, currentUser.id, now);
    }

    setConversations(prev => {
      const next = prev.map(c => {
        if (
          c.id === convId ||
          toUuid(c.id) === toUuid(convId) ||
          c.id === canonicalConvId ||
          toUuid(c.id) === toUuid(canonicalConvId) ||
          (partnerId && c.participantIds?.some(id => isSameUser(id, partnerId)))
        ) {
          const currentDeleted = c.deletedForUserIds || [];
          const updatedMessages = (c.messages || []).map(m => {
            const mDeleted = m.deletedForUserIds || [];
            return mDeleted.some(id => isSameUser(id, currentUser.id))
              ? m
              : { ...m, deletedForUserIds: [...mDeleted, currentUser.id] };
          });

          return {
            ...c,
            deletedForUserIds: currentDeleted.some(id => isSameUser(id, currentUser.id))
              ? currentDeleted
              : [...currentDeleted, currentUser.id],
            clearedHistoryAt: {
              ...(c.clearedHistoryAt || {}),
              [currentUser.id]: now,
              [toUuid(currentUser.id)]: now,
            },
            messages: updatedMessages,
            lastMessage: 'Started a new conversation',
            lastMessageTime: 'Just now',
            unreadCounts: {
              ...(c.unreadCounts || {}),
              [currentUser.id]: 0,
            },
            unreadCount: 0,
          };
        }
        return c;
      });
      storage.set('conversations', next);
      return next;
    });

    if (
      activeConversationId === convId ||
      toUuid(activeConversationId || '') === toUuid(convId) ||
      (canonicalConvId && activeConversationId === canonicalConvId)
    ) {
      setActiveConversationId(null);
      setMessagesMobileView('list');
    }

    // Persist deletion to Supabase so other devices won't resurrect old deleted messages!
    supabaseDb.deleteConversationMessages(convId, nowIso, currentUser.id, partnerId);

    // Instant WebSocket broadcast directly to other device (<50ms, 0 Disk IO)
    try {
      const client = getSupabaseClient();
      const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
      if (broadcastCh) {
        broadcastCh.send({
          type: 'broadcast',
          event: 'conversation_deleted',
          payload: {
            conversationId: convId,
            canonicalId: canonicalConvId,
            userId: currentUser.id,
            partnerId,
            clearedAt: now,
            clearedIso: nowIso,
          },
        });
      }
    } catch (bcErr) {
      console.warn('Realtime conversation delete broadcast note:', bcErr);
    }
  };

  // Delete message: Deleted for BOTH users' POVs (deleted / unsent for everyone)
  const deleteMessage = (convId: string, messageId: string) => {
    if (!currentUser) return;
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id === convId || toUuid(c.id) === toUuid(convId)) {
          const remainingMessages = c.messages.filter(m => m.id !== messageId && toUuid(m.id) !== toUuid(messageId));
          const last = remainingMessages[remainingMessages.length - 1];

          return {
            ...c,
            messages: remainingMessages,
            lastMessage: last ? last.text : 'No messages yet',
            lastMessageTime: last ? last.timestamp : c.lastMessageTime,
          };
        }
        return c;
      });
      storage.set('conversations', next);
      return next;
    });

    // Delete in Supabase
    supabaseDb.deleteMessage(messageId);

    // Instant WebSocket broadcast directly to other device (<50ms, 0 Disk IO)
    try {
      const client = getSupabaseClient();
      const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
      if (broadcastCh) {
        broadcastCh.send({
          type: 'broadcast',
          event: 'message_deleted',
          payload: {
            conversationId: convId,
            messageId,
          },
        });
      }
    } catch {}
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
    const video = videos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));

    setVideos(prev => {
      const next = prev.map(v =>
        v.id === videoId || toUuid(v.id) === toUuid(videoId)
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
    if (storedAppeals[toUuid(videoId)]) {
      delete storedAppeals[toUuid(videoId)];
      storage.set('video_appeals_v2', storedAppeals);
    }

    if (video) {
      await supabaseDb.updateVideoStatus(video.id, 'rejected', finalReason);
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
        targetText: `revoked your video "${video.caption?.slice(0, 35) || 'video'}". Reason: ${finalReason}. You may submit an appeal.`,
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

      // If active user is this video creator, show toast immediately
      if (currentUser && isSameUser(currentUser.id, recipientUserId)) {
        setActiveNotificationPopup(revokeNotif);
      }
    } else {
      // In case video was not found in local array, still update DB
      await supabaseDb.updateVideoStatus(videoId, 'rejected', finalReason);
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
    const video = videos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));
    if (!video) return false;

    const nowIso = new Date().toISOString();
    const recipientUserId = video.creatorId || video.creator?.id || '';
    const recipientUserEmail = video.creator?.email || '';

    // Update persistent appeals map
    const storedAppeals = storage.get<Record<string, any>>('video_appeals_v2', {});
    storedAppeals[videoId] = { ...storedAppeals[videoId], status: decision };
    storedAppeals[toUuid(videoId)] = { ...storedAppeals[toUuid(videoId)], status: decision };
    storage.set('video_appeals_v2', storedAppeals);

    if (decision === 'approved') {
      setVideos(prev => {
        const next = prev.map(v =>
          v.id === videoId || toUuid(v.id) === toUuid(videoId)
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

      // Also dismiss any open report against this video since the appeal was approved and video restored!
      setReports(prev => {
        const next = prev.map(r =>
          r.targetId === videoId || toUuid(r.targetId) === toUuid(videoId)
            ? { ...r, status: 'Rejected' as const }
            : r
        );
        storage.set('reports', next);
        return next;
      });

      await supabaseDb.reviewVideoAppeal(video.id, 'approved');
      await supabaseDb.updateVideoStatus(video.id, 'approved');

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
        targetText: `Great news! Your appeal for "${video.caption?.slice(0, 30) || 'video'}" was Approved. Your video is now live on the feed!`,
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

      if (currentUser && isSameUser(currentUser.id, recipientUserId)) {
        setActiveNotificationPopup(approvedNotif);
      }
    } else {
      setVideos(prev => {
        const next = prev.map(v =>
          v.id === videoId || toUuid(v.id) === toUuid(videoId)
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

      await supabaseDb.reviewVideoAppeal(video.id, 'declined');

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
        targetText: `Your appeal for "${video.caption?.slice(0, 30) || 'video'}" was Declined by moderation after careful review.`,
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

      if (currentUser && isSameUser(currentUser.id, recipientUserId)) {
        setActiveNotificationPopup(declinedNotif);
      }
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
    const targetUser = users.find(u => isSameUser(u.id, userId));
    const targetEmail = targetUser?.email;

    // 1. Record in deleted accounts registry so all devices / tabs log them out immediately
    recordDeletedUserId(userId, targetEmail);

    // 2. Remove from local users list
    setUsers(prev => {
      const next = prev.filter(u => !isSameUser(u.id, userId));
      storage.set('users', next);
      return next;
    });

    // 3. Remove from saved accounts on this device (even if logged in on this device!)
    removeSavedAccount(userId);
    setSavedAccounts(prev => {
      const next = prev.filter(
        a => !isSameUser(a.id, userId) && (!targetEmail || !a.email || a.email.toLowerCase() !== targetEmail.toLowerCase())
      );
      storage.set('saved_accounts_v2', next);
      return next;
    });

    // 4. If current active user on this device is this deleted user, log out immediately
    if (currentUser && (isSameUser(currentUser.id, userId) || (targetEmail && currentUser.email && currentUser.email.toLowerCase() === targetEmail.toLowerCase()))) {
      logout(false);
    }

    // 5. Remove all videos belonging to this user from local state and storage
    const userVideos = videos.filter(
      v => isSameUser(v.creatorId, userId) || isSameUser(v.creator?.id, userId)
    );
    setVideos(prev => {
      const next = prev.filter(
        v => !isSameUser(v.creatorId, userId) && !isSameUser(v.creator?.id, userId)
      );
      storage.set('videos', next);
      return next;
    });

    // 6. Remove all storage bucket files for user's videos
    for (const v of userVideos) {
      if (v.mediaUrl) {
        supabaseDb.deleteVideoFileFromStorage(v.mediaUrl).catch(() => {});
      }
    }

    // 7. Remove follows, requests, notifications, conversations
    setFollowRelations(prev =>
      prev.filter(f => !isSameUser(f.followerId, userId) && !isSameUser(f.followingId, userId))
    );
    setFollowRequests(prev =>
      prev.filter(r => !isSameUser(r.fromUserId, userId) && !isSameUser(r.toUserId, userId))
    );
    setNotifications(prev =>
      prev.filter(n => !isSameUser(n.recipientId, userId) && !isSameUser(n.actor?.id, userId))
    );
    setConversations(prev =>
      prev.filter(c => !c.participantIds?.some(pid => isSameUser(pid, userId)) && !isSameUser(c.participant?.id, userId))
    );

    // 8. Delete from Supabase Database & cascade child tables & storage bucket
    const res = await supabaseDb.deleteUser(userId, targetEmail);

    // 9. Broadcast account deleted event to other local tabs
    storage.set('viralhub_account_deleted_event', { userId, email: targetEmail, timestamp: Date.now() });

    return res;
  };

  const banUserAdmin = async (userId: string, reason = 'Violation of Community Guidelines'): Promise<boolean> => {
    const finalReason = reason.trim() || 'Violation of Community Guidelines';
    const nowIso = new Date().toISOString();

    // Find the target user by ID, username, email, or reported subtitle
    const relatedReport = reports.find(r => r.targetId === userId || r.id === userId);
    const reportSubtitleUsername = relatedReport?.targetSubtitle
      ? relatedReport.targetSubtitle.replace(/^@/, '').trim().toLowerCase()
      : undefined;

    const targetUser =
      users.find(
        u =>
          isSameUser(u.id, userId) ||
          (u.username && u.username.toLowerCase() === userId.toLowerCase()) ||
          (reportSubtitleUsername && u.username && u.username.toLowerCase() === reportSubtitleUsername) ||
          (u.email && u.email.toLowerCase() === userId.toLowerCase())
      ) ||
      savedAccounts.find(
        u =>
          isSameUser(u.id, userId) ||
          (u.username && u.username.toLowerCase() === userId.toLowerCase()) ||
          (reportSubtitleUsername && u.username && u.username.toLowerCase() === reportSubtitleUsername) ||
          (u.email && u.email.toLowerCase() === userId.toLowerCase())
      );
    const resolvedUserId = targetUser ? targetUser.id : userId;
    const resolvedEmail = targetUser?.email ? targetUser.email.toLowerCase() : null;
    const resolvedUsername = targetUser?.username
      ? targetUser.username.toLowerCase()
      : (reportSubtitleUsername || (userId.startsWith('user_') ? null : userId.toLowerCase().replace(/^@/, '')));

    // 1. Immediately record in persistent ban registry with all identifiers!
    recordUserBan({
      userId: resolvedUserId,
      username: resolvedUsername,
      email: resolvedEmail,
      banReason: finalReason,
      bannedAt: nowIso,
      appealStatus: 'none',
    });

    // 2. Update user in users list
    setUsers(prev => {
      const next = prev.map(u => {
        const matches =
          isSameUser(u.id, resolvedUserId) ||
          isSameUser(u.id, userId) ||
          (resolvedEmail && u.email && u.email.toLowerCase() === resolvedEmail) ||
          (resolvedUsername && u.username && u.username.toLowerCase() === resolvedUsername);
        if (matches) {
          return {
            ...u,
            isBanned: true,
            banReason: finalReason,
            bannedAt: nowIso,
            appealStatus: 'none' as const,
          };
        }
        return u;
      });
      storage.set('users', next);
      return next;
    });

    // 3. Update savedAccounts
    setSavedAccounts(prev => {
      const next = prev.map(a => {
        const matches =
          isSameUser(a.id, resolvedUserId) ||
          isSameUser(a.id, userId) ||
          (resolvedEmail && a.email && a.email.toLowerCase() === resolvedEmail) ||
          (resolvedUsername && a.username && a.username.toLowerCase() === resolvedUsername);
        if (matches) {
          return {
            ...a,
            isBanned: true,
            banReason: finalReason,
            bannedAt: nowIso,
            appealStatus: 'none' as const,
          };
        }
        return a;
      });
      storage.set('saved_accounts_v2', next);
      return next;
    });

    // 4. If banned user is currently logged in, update currentUser immediately!
    if (currentUser) {
      const matches =
        isSameUser(currentUser.id, resolvedUserId) ||
        isSameUser(currentUser.id, userId) ||
        (resolvedEmail && currentUser.email && currentUser.email.toLowerCase() === resolvedEmail) ||
        (resolvedUsername && currentUser.username && currentUser.username.toLowerCase() === resolvedUsername);
      if (matches) {
        const updatedUser: User = {
          ...currentUser,
          isBanned: true,
          banReason: finalReason,
          bannedAt: nowIso,
          appealStatus: 'none',
        };
        setCurrentUser(updatedUser);
        storage.set('currentUser', updatedUser);
      }
    }

    // 5. Revoke their videos from public feed so feed stays clean
    setVideos(prev => {
      const next = prev.map(v => {
        const matches =
          isSameUser(v.creatorId, resolvedUserId) ||
          isSameUser(v.creatorId, userId) ||
          isSameUser(v.creator?.id, resolvedUserId) ||
          isSameUser(v.creator?.id, userId) ||
          (resolvedEmail && v.creator?.email && v.creator.email.toLowerCase() === resolvedEmail);
        if (matches) {
          return {
            ...v,
            status: 'rejected' as const,
            rejectionReason: `Creator account suspended: ${finalReason}`,
          };
        }
        return v;
      });
      storage.set('videos', next);
      return next;
    });

    // 6. Create and send account_banned notification to the banned user
    const banNotif: NotificationItem = {
      id: `notif_ban_${Date.now()}`,
      recipientId: resolvedUserId,
      recipientEmail: resolvedEmail || undefined,
      type: 'account_banned',
      actor: {
        id: 'viralhub_moderation',
        username: 'moderation',
        displayName: 'ViralHub Moderation',
        avatar: '',
      },
      targetText: `Your account was banned due to: ${finalReason}. You may submit an appeal from your screen.`,
      banReason: finalReason,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([banNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(banNotif, resolvedUserId);

    // 7. Update in Supabase
    await supabaseDb.banUser(resolvedUserId, finalReason, resolvedEmail || undefined, resolvedUsername || undefined);

    // 8. Broadcast event so other open tabs update
    storage.set('user_banned_event', {
      userId: resolvedUserId,
      email: resolvedEmail,
      username: resolvedUsername,
      reason: finalReason,
      timestamp: Date.now(),
    });

    return true;
  };

  const unbanUserAdmin = async (userId: string): Promise<boolean> => {
    // Find the target user by ID, username, or email
    const targetUser =
      users.find(
        u =>
          isSameUser(u.id, userId) ||
          (u.username && u.username.toLowerCase() === userId.toLowerCase()) ||
          (u.email && u.email.toLowerCase() === userId.toLowerCase())
      ) ||
      savedAccounts.find(
        u =>
          isSameUser(u.id, userId) ||
          (u.username && u.username.toLowerCase() === userId.toLowerCase()) ||
          (u.email && u.email.toLowerCase() === userId.toLowerCase())
      );
    const resolvedUserId = targetUser ? targetUser.id : userId;
    const resolvedEmail = targetUser?.email ? targetUser.email.toLowerCase() : null;
    const resolvedUsername = targetUser?.username ? targetUser.username.toLowerCase() : null;

    // Immediately record unban in persistent registry
    recordUserUnban(resolvedUserId, resolvedEmail, resolvedUsername);

    // 1. Update user in users list
    setUsers(prev => {
      const next = prev.map(u => {
        const matches =
          isSameUser(u.id, resolvedUserId) ||
          isSameUser(u.id, userId) ||
          (resolvedEmail && u.email && u.email.toLowerCase() === resolvedEmail) ||
          (resolvedUsername && u.username && u.username.toLowerCase() === resolvedUsername);
        if (matches) {
          return {
            ...u,
            isBanned: false,
            banReason: undefined,
            appealStatus: 'approved' as const,
          };
        }
        return u;
      });
      storage.set('users', next);
      return next;
    });

    // 2. Update savedAccounts
    setSavedAccounts(prev => {
      const next = prev.map(a => {
        const matches =
          isSameUser(a.id, resolvedUserId) ||
          isSameUser(a.id, userId) ||
          (resolvedEmail && a.email && a.email.toLowerCase() === resolvedEmail) ||
          (resolvedUsername && a.username && a.username.toLowerCase() === resolvedUsername);
        if (matches) {
          return {
            ...a,
            isBanned: false,
            banReason: undefined,
            appealStatus: 'approved' as const,
          };
        }
        return a;
      });
      storage.set('saved_accounts_v2', next);
      return next;
    });

    // 3. If unbanned user is currently logged in, update currentUser
    if (currentUser) {
      const matches =
        isSameUser(currentUser.id, resolvedUserId) ||
        isSameUser(currentUser.id, userId) ||
        (resolvedEmail && currentUser.email && currentUser.email.toLowerCase() === resolvedEmail) ||
        (resolvedUsername && currentUser.username && currentUser.username.toLowerCase() === resolvedUsername);
      if (matches) {
        const updatedUser: User = {
          ...currentUser,
          isBanned: false,
          banReason: undefined,
          appealStatus: 'approved',
        };
        setCurrentUser(updatedUser);
        storage.set('currentUser', updatedUser);
      }
    }

    // 4. Reinstate user videos
    setVideos(prev => {
      const next = prev.map(v => {
        const matches =
          isSameUser(v.creatorId, resolvedUserId) ||
          isSameUser(v.creatorId, userId) ||
          isSameUser(v.creator?.id, resolvedUserId) ||
          isSameUser(v.creator?.id, userId) ||
          (resolvedEmail && v.creator?.email && v.creator.email.toLowerCase() === resolvedEmail);
        if (matches) {
          return {
            ...v,
            status: 'approved' as const,
            rejectionReason: undefined,
          };
        }
        return v;
      });
      storage.set('videos', next);
      return next;
    });

    // 5. Send appeal_status approved notification
    const nowIso = new Date().toISOString();
    const approvedNotif: NotificationItem = {
      id: `notif_unban_${Date.now()}`,
      recipientId: resolvedUserId,
      type: 'appeal_status',
      actor: {
        id: 'viralhub_moderation',
        username: 'moderation',
        displayName: 'ViralHub Moderation',
        avatar: '',
      },
      targetText: `Your account ban appeal was approved! Full access to ViralHub has been restored.`,
      appealStatus: 'approved',
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([approvedNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(approvedNotif, resolvedUserId);

    // 6. Update in Supabase
    await supabaseDb.unbanUser(resolvedUserId, resolvedEmail || undefined, resolvedUsername || undefined);

    // 7. Broadcast event
    storage.set('user_unbanned_event', {
      userId: resolvedUserId,
      email: resolvedEmail,
      username: resolvedUsername,
      timestamp: Date.now(),
    });

    return true;
  };

  const submitUserAppeal = async (reason: string): Promise<boolean> => {
    if (!currentUser) return false;
    const cleanReason = reason.trim();
    if (!cleanReason) return false;

    const nowIso = new Date().toISOString();

    // 1. Update currentUser
    const updatedUser: User = {
      ...currentUser,
      appealStatus: 'pending',
      appealReason: cleanReason,
      appealSubmittedAt: nowIso,
    };
    setCurrentUser(updatedUser);
    storage.set('currentUser', updatedUser);

    // 2. Update in users array
    setUsers(prev => {
      const next = prev.map(u =>
        isSameUser(u.id, currentUser.id)
          ? { ...u, appealStatus: 'pending' as const, appealReason: cleanReason, appealSubmittedAt: nowIso }
          : u
      );
      storage.set('users', next);
      return next;
    });

    // Update in user bans backup storage map
    const bansMap = storage.get<Record<string, any>>('user_bans_v1', {});
    if (bansMap[currentUser.id]) {
      bansMap[currentUser.id].appealStatus = 'pending';
      bansMap[currentUser.id].appealReason = cleanReason;
      bansMap[currentUser.id].appealSubmittedAt = nowIso;
    }
    if (toUuid(currentUser.id) && bansMap[toUuid(currentUser.id)]) {
      bansMap[toUuid(currentUser.id)].appealStatus = 'pending';
      bansMap[toUuid(currentUser.id)].appealReason = cleanReason;
      bansMap[toUuid(currentUser.id)].appealSubmittedAt = nowIso;
    }
    storage.set('user_bans_v1', bansMap);

    // 3. Update related user reports so admin sees appeal status
    setReports(prev => {
      const next = prev.map(r =>
        r.type === 'user' && isSameUser(r.targetId, currentUser.id)
          ? { ...r, description: `${r.description || ''} [User Appeal: "${cleanReason}"]` }
          : r
      );
      storage.set('reports', next);
      return next;
    });

    // 4. Notify Admin Team
    const adminAppealNotif: NotificationItem = {
      id: `notif_adm_usr_appeal_${Date.now()}`,
      recipientId: 'admin',
      type: 'appeal_status',
      actor: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
      },
      targetText: `@${currentUser.username} submitted an account ban appeal: "${cleanReason.slice(0, 50)}..."`,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
      appealStatus: 'pending',
      appealReason: cleanReason,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([adminAppealNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(adminAppealNotif, 'admin');

    // 5. Update Supabase
    await supabaseDb.submitUserAppeal(currentUser.id, cleanReason, currentUser.email, currentUser.username);

    return true;
  };

  const reviewUserAppeal = async (userId: string, decision: 'approved' | 'declined'): Promise<boolean> => {
    if (decision === 'approved') {
      return unbanUserAdmin(userId);
    }

    const targetUser = users.find(u => isSameUser(u.id, userId)) || savedAccounts.find(u => isSameUser(u.id, userId));
    const nowIso = new Date().toISOString();

    // 1. Update user appealStatus to 'declined'
    setUsers(prev => {
      const next = prev.map(u => {
        if (isSameUser(u.id, userId)) {
          return {
            ...u,
            appealStatus: 'declined' as const,
          };
        }
        return u;
      });
      storage.set('users', next);
      return next;
    });

    const bansMap = storage.get<Record<string, any>>('user_bans_v1', {});
    if (bansMap[userId]) bansMap[userId].appealStatus = 'declined';
    if (toUuid(userId) && bansMap[toUuid(userId)]) bansMap[toUuid(userId)].appealStatus = 'declined';
    if (targetUser?.email && bansMap[targetUser.email.toLowerCase()]) bansMap[targetUser.email.toLowerCase()].appealStatus = 'declined';
    storage.set('user_bans_v1', bansMap);

    if (currentUser && isSameUser(currentUser.id, userId)) {
      const updatedUser: User = {
        ...currentUser,
        appealStatus: 'declined',
      };
      setCurrentUser(updatedUser);
      storage.set('currentUser', updatedUser);
    }

    // 2. Notify user
    const declinedNotif: NotificationItem = {
      id: `notif_dec_ban_${Date.now()}`,
      recipientId: userId,
      recipientEmail: targetUser?.email,
      type: 'appeal_status',
      actor: {
        id: 'viralhub_moderation',
        username: 'moderation',
        displayName: 'ViralHub Moderation',
        avatar: '',
      },
      targetText: `Your account ban appeal was reviewed and declined by administration. Account remains suspended.`,
      appealStatus: 'declined',
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([declinedNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(declinedNotif, userId);

    // 3. Update Supabase
    await supabaseDb.reviewUserAppeal(userId, 'declined', targetUser?.email, targetUser?.username);

    return true;
  };

  const deleteVideo = async (videoId: string): Promise<boolean> => {
    const targetVideo = videos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));
    const mediaUrl = targetVideo?.mediaUrl;

    setVideos(prev => {
      const next = prev.filter(v => v.id !== videoId && toUuid(v.id) !== toUuid(videoId));
      storage.set('videos', next);
      return next;
    });

    // Also remove from personal likes map
    setUserLikes(prev => {
      const next: Record<string, string[]> = {};
      Object.keys(prev).forEach(k => {
        next[k] = (prev[k] || []).filter(id => id !== videoId && toUuid(id) !== toUuid(videoId));
      });
      storage.set('user_likes_map', next);
      return next;
    });

    // Delete both from Supabase DB and Supabase Storage bucket!
    await supabaseDb.deleteVideo(videoId, mediaUrl);
    return true;
  };

  const deleteVideoAdmin = async (videoId: string): Promise<boolean> => {
    return deleteVideo(videoId);
  };

  const updateUserRoleAdmin = async (
    userId: string,
    newRole: 'creator' | 'admin' | 'moderator'
  ): Promise<boolean> => {
    setUsers(prev => {
      const next = prev.map(u => (u.id === userId ? { ...u, role: newRole } : u));
      storage.set('users', next);
      return next;
    });

    if (currentUser && currentUser.id === userId) {
      const updatedCurr = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurr);
      storage.set('currentUser', updatedCurr);
      setIsAdmin(newRole === 'admin');
    }

    if (newRole === 'admin') {
      const targetUser = users.find(u => u.id === userId);
      if (targetUser) {
        const adminRec: AdminRecord = {
          adminId: targetUser.id,
          userId: targetUser.id,
          username: targetUser.username,
          email: targetUser.email || `${targetUser.username}@viralhub.app`,
          role: 'Admin',
          permissions: ['manage_users', 'manage_videos', 'manage_reports'],
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };
        setAdmins(prev => {
          const next = [adminRec, ...prev.filter(a => a.adminId !== targetUser.id && a.userId !== targetUser.id)];
          storage.set('admins', next);
          return next;
        });
      }
    } else {
      setAdmins(prev => {
        const next = prev.filter(a => a.adminId !== userId && a.userId !== userId);
        storage.set('admins', next);
        return next;
      });
    }

    await supabaseDb.updateUserRole(userId, newRole);
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

    // If report is approved for a video, automatically revoke video with appeal option so owner is notified
    if (status === 'Approved' && type === 'video' && targetReport) {
      const violationReason = targetReport.description || targetReport.scenario || 'Reported for community guidelines violation';
      await rejectVideoAdmin(targetReport.targetId, violationReason);
    }

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
        deleteCommentFromVideo,
        toggleLikeComment,
        commentsMap,
        fetchCommentsForVideo,
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
        banUserAdmin,
        unbanUserAdmin,
        submitUserAppeal,
        reviewUserAppeal,
        deleteVideoAdmin,
        deleteVideo,
        updateUserRoleAdmin,
        activeNotificationPopup,
        dismissNotificationPopup,
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
