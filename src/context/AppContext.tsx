import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  LiveViewer,
  ThemeMode,
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
import { isDeprecatedDefaultTrack } from '../utils/audio';
import {
  supabaseDb,
  getSupabaseConfig,
  getSupabaseClient,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOutSupabase,
  toUuid,
  generateUuid,
  isSameUser,
  isUuid,
  getDirectConversationId,
  recordDeletedUserId,
  isUserIdDeleted,
  checkIsUserBanned,
  recordUserBan,
  recordUserUnban,
  recordUserWarning,
  clearUserWarning,
  checkUserWarning,
  injectUserIntoCache,
  isGoogleAccount,
  recordGoogleAccount,
  GoogleAuthOptions,
  isAccountLoggedInOnDevice,
  markAccountLoggedInOnDevice,
  markAccountLoggedOutOnDevice,
} from '../lib/supabase';
import { deduplicateNotifications } from '../utils/notifications';
import { toTimestampMillis, getConversationLastActivityTime, formatConversationTime, formatMessageTime } from '../utils/time';
import { liveBroadcastService } from '../services/liveBroadcastService';

/**
 * Deduplicates an array of messages so identical messages sent by the same user
 * (e.g. optimistic local message vs. confirmed Supabase message) are unified
 * without duplicating chat bubbles!
 */
export const deduplicateMessages = (messages: Message[]): Message[] => {
  if (!messages || messages.length <= 1) return messages || [];

  const result: Message[] = [];

  for (const m of messages) {
    if (!m) continue;
    const cleanText = (m.text || '').trim();
    const mTime = toTimestampMillis(m.sentAt);
    const mVidId = m.sharedVideoId || m.sharedVideo?.id;

    const isDup = result.some(existing => {
      // 1. Direct ID match
      if (existing.id && m.id && (existing.id === m.id || toUuid(existing.id) === toUuid(m.id))) {
        return true;
      }

      // 2. Shared video match (same sender + same shared video ID)
      const exVidId = existing.sharedVideoId || existing.sharedVideo?.id;
      if (
        mVidId &&
        exVidId &&
        (mVidId === exVidId || toUuid(mVidId) === toUuid(exVidId)) &&
        isSameUser(existing.senderId, m.senderId)
      ) {
        const exTime = toTimestampMillis(existing.sentAt);
        if (mTime > 0 && exTime > 0) {
          if (Math.abs(mTime - exTime) < 5 * 60 * 1000) {
            return true;
          }
        } else {
          return true;
        }
      }

      // 3. Exact same sender + exact same text
      if (
        cleanText &&
        cleanText === (existing.text || '').trim() &&
        isSameUser(existing.senderId, m.senderId)
      ) {
        const isOneLocal =
          (m.id && (m.id.startsWith('m_') || m.id.startsWith('msg_'))) ||
          (existing.id && (existing.id.startsWith('m_') || existing.id.startsWith('msg_')));

        const exTime = toTimestampMillis(existing.sentAt);
        if (mTime > 0 && exTime > 0) {
          if (Math.abs(mTime - exTime) < 5 * 60 * 1000) {
            return true;
          }
        } else if (isOneLocal) {
          return true;
        }
      }

      return false;
    });

    if (!isDup) {
      result.push(m);
    } else {
      // If the incoming message is confirmed from Supabase, prefer it over a temporary local optimistic message
      const idx = result.findIndex(existing => {
        if (existing.id && m.id && (existing.id === m.id || toUuid(existing.id) === toUuid(m.id))) return true;
        const exVidId = existing.sharedVideoId || existing.sharedVideo?.id;
        if (mVidId && exVidId && (mVidId === exVidId || toUuid(mVidId) === toUuid(exVidId)) && isSameUser(existing.senderId, m.senderId)) return true;
        if (cleanText && cleanText === (existing.text || '').trim() && isSameUser(existing.senderId, m.senderId)) return true;
        return false;
      });
      if (idx !== -1) {
        const existing = result[idx];
        const isMRemote = m.sentAt && isUuid(m.id);
        const isExistingLocal = existing.id && (existing.id.startsWith('m_') || existing.id.startsWith('msg_'));
        // Merge so we preserve the richer sharedVideo and metadata
        result[idx] = {
          ...existing,
          ...(isMRemote && isExistingLocal ? m : {}),
          sharedVideo: m.sharedVideo || existing.sharedVideo,
          sharedVideoId: m.sharedVideoId || existing.sharedVideoId || mVidId,
          deletedForUserIds: Array.from(new Set([...(existing.deletedForUserIds || []), ...(m.deletedForUserIds || [])])),
        };
      }
    }
  }

  return result;
};

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
      const combinedMessages = deduplicateMessages([...(existing.messages || []), ...(c.messages || [])]);

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

  const list = Array.from(partnerMap.values());
  return list.sort((a, b) => getConversationLastActivityTime(b) - getConversationLastActivityTime(a));
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
  | 'following'
  | 'friends'
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

export const VALID_APP_TABS: AppTab[] = [
  'home',
  'explore',
  'following',
  'friends',
  'live',
  'messages',
  'upload',
  'notifications',
  'report_history',
  'profile',
  'edit_profile',
  'live_host_setup',
  'live_host_active',
  'live_viewer',
  'admin',
];

export const parseInitialNavigation = (): { tab: AppTab; selectedUserId: string | null } => {
  if (typeof window === 'undefined') return { tab: 'home', selectedUserId: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as AppTab | null;
    const userParam = params.get('user');

    if (tabParam && VALID_APP_TABS.includes(tabParam)) {
      return { tab: tabParam, selectedUserId: userParam || null };
    }

    const cleanPath = window.location.pathname.replace(/^\//, '').split('/')[0].toLowerCase();
    if (cleanPath && VALID_APP_TABS.includes(cleanPath as AppTab)) {
      return { tab: cleanPath as AppTab, selectedUserId: userParam || null };
    }
  } catch (e) {
    // ignore
  }
  return { tab: 'home', selectedUserId: null };
};

export const buildNavigationUrl = (tab: AppTab, userId?: string | null): string => {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // Clean OAuth tokens if any
  searchParams.delete('code');
  searchParams.delete('state');
  searchParams.delete('error');
  searchParams.delete('error_description');

  if (tab === 'home' && !userId) {
    searchParams.delete('tab');
    searchParams.delete('user');
  } else {
    searchParams.set('tab', tab);
    if (tab === 'profile' && userId) {
      searchParams.set('user', userId);
    } else {
      searchParams.delete('user');
    }
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
};

interface ReportModalConfig {
  isOpen: boolean;
  type: 'video' | 'user' | 'live_stream';
  targetId: string;
  targetName: string;
  targetSubtitle?: string;
  targetThumbnail?: string;
}

interface AppContextType {
  // Auth state
  currentUser: User | null;
  isAuthLoading: boolean;
  authView: 'login' | 'register';
  setAuthView: (view: 'login' | 'register') => void;
  login: (usernameOrEmail: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  register: (
    username: string,
    email: string,
    password?: string
  ) => Promise<{ success: boolean; message?: string; needsEmailConfirmation?: boolean; email?: string }>;
  loginWithGoogle: (options?: GoogleAuthOptions) => Promise<{ success: boolean; message?: string }>;
  logout: (saveToDevice?: boolean) => void;
  quickLoginAs: (userId: string) => void;
  prepareAddNewAccount: () => void;

  // Navigation
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  selectedUserId: string | null;
  navigateToUserProfile: (userId: string) => void;

  // Data
  users: User[];
  videos: Video[];
  audioTracks: AudioTrack[];
  audioTracksList: AudioTrack[];
  addAudioTrack: (track: Omit<AudioTrack, 'id'> | AudioTrack) => Promise<AudioTrack & { dbSuccess?: boolean; dbError?: string; isRlsBlocked?: boolean; isMissingColumns?: boolean }>;
  deleteAudioTrack: (trackId: string) => Promise<boolean>;
  refreshAudioTracks: (force?: boolean) => Promise<void>;
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
  shareLiveStreamToUser: (stream: LiveStream, targetUserId: string, note?: string) => boolean;
  updateVideoAudience: (videoId: string, audience: 'public' | 'friends' | 'only_me') => Promise<boolean>;
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
    audioStartTime?: number;
    audioEndTime?: number;
    audience?: 'public' | 'friends' | 'only_me';
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
    sharedVideo?: Video,
    sharedLiveStream?: LiveStream
  ) => void;
  deleteConversation: (convId: string) => void;
  deleteMessage: (convId: string, messageId: string) => void;
  
  // Notifications
  markAllNotificationsAsRead: () => void;
  markNotificationAsRead: (id: string) => void;

  // Live Stream
  activeLiveStreams: LiveStream[];
  refreshActiveLiveStreams: () => Promise<void>;
  openLiveStreamAsViewer: (streamId: string, fallbackStream?: LiveStream) => void;
  sendLiveComment: (text: string) => void;
  deleteLiveComment: (commentId: string) => Promise<void>;
  sendLiveLike: () => void;
  liveHeartTrigger: number;
  removeActiveLiveStream: (streamId: string) => void;
  startHostLiveStream: (title: string, topic: string, aboutMe: string, customStreamId?: string, options?: { aspectRatio?: '9:16' | '16:9'; isMobileStream?: boolean }) => void;
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
    type: 'video' | 'user' | 'live_stream',
    status: 'Approved' | 'Rejected' | 'Under Review' | 'Warning Issued' | 'Appeal Submitted'
  ) => Promise<boolean>;
  issueUserWarningAdmin: (
    userId: string,
    reason?: string,
    deadlineHours?: number,
    reportId?: string
  ) => Promise<boolean>;
  submitPreBanAppeal: (
    reason: string,
    proofUrl?: string,
    proofName?: string
  ) => Promise<boolean>;
  resolvePreBanAppealAdmin: (
    userId: string,
    decision: 'approved' | 'declined',
    reportId?: string
  ) => Promise<boolean>;
  preBanAppealModalOpen: boolean;
  setPreBanAppealModalOpen: (open: boolean) => void;
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
  updateUserRoleAdmin: (userId: string, newRole: 'creator' | 'admin') => Promise<boolean>;

  // Cross-device realtime notification popup
  activeNotificationPopup: NotificationItem | null;
  dismissNotificationPopup: () => void;

  // Feed refresh & shuffle trigger
  feedRefreshKey: number;
  refreshFeed: () => void;

  // Appearance & Theme Mode (Auto, Dark, Light)
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: 'dark' | 'light';

  // Notifications
  addCustomNotification: (item: Omit<NotificationItem, 'id' | 'timestamp' | 'createdAt' | 'isUnread'>) => void;
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
      const warningInfo = checkUserWarning(saved.id, saved.email, saved);
      return {
        ...saved,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
        warningActive: warningInfo.warningActive,
        warningReason: warningInfo.warningReason,
        warningIssuedAt: warningInfo.warningIssuedAt,
        warningDeadline: warningInfo.warningDeadline,
        preBanAppealStatus: warningInfo.preBanAppealStatus,
        preBanAppealReason: warningInfo.preBanAppealReason,
        preBanAppealProofUrl: warningInfo.preBanAppealProofUrl,
        preBanAppealProofName: warningInfo.preBanAppealProofName,
        preBanAppealSubmittedAt: warningInfo.preBanAppealSubmittedAt,
      };
    }
    return null;
  });

  // Ensure current active user session is marked active on this device
  useEffect(() => {
    if (currentUser && currentUser.id) {
      markAccountLoggedInOnDevice(currentUser.id, currentUser.email);
    }
  }, []);

  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const inProgress =
      sessionStorage.getItem('viralhub_oauth_in_progress') === 'true' ||
      localStorage.getItem('viralhub_oauth_in_progress') === 'true';
    return inProgress || hash.includes('access_token=') || search.includes('code=');
  });
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // Navigation tab with full browser Back / Forward arrow history support
  const initialNav = useMemo(() => parseInitialNavigation(), []);
  const [activeTab, setActiveTabRaw] = useState<AppTab>(initialNav.tab);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialNav.selectedUserId);
  const isPopStateRef = useRef<boolean>(false);

  // Synchronize browser history stack whenever user changes tabs
  const setActiveTab = useCallback((nextTab: AppTab) => {
    if (nextTab !== 'profile') {
      setSelectedUserId(null);
    }
    setActiveTabRaw(prevTab => {
      if (prevTab === nextTab && nextTab !== 'profile') return prevTab;

      if (!isPopStateRef.current && typeof window !== 'undefined') {
        try {
          const url = buildNavigationUrl(nextTab, null);
          window.history.pushState(
            { tab: nextTab, selectedUserId: null },
            '',
            url
          );
        } catch (e) {
          console.warn('Failed to push browser history state:', e);
        }
      }
      return nextTab;
    });
  }, []);

  // Core Data
  const [users, setUsers] = useState<User[]>(() => {
    const raw = storage.get<User[]>('users', INITIAL_USERS);
    return raw.map(u => {
      const banInfo = checkIsUserBanned(u.id, u.email, u);
      const warningInfo = checkUserWarning(u.id, u.email, u);
      return {
        ...u,
        isBanned: banInfo.isBanned,
        banReason: banInfo.isBanned ? banInfo.banReason : undefined,
        bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
        appealStatus: banInfo.appealStatus,
        appealReason: banInfo.appealReason,
        appealSubmittedAt: banInfo.appealSubmittedAt,
        warningActive: warningInfo.warningActive,
        warningReason: warningInfo.warningReason,
        warningIssuedAt: warningInfo.warningIssuedAt,
        warningDeadline: warningInfo.warningDeadline,
        preBanAppealStatus: warningInfo.preBanAppealStatus,
        preBanAppealReason: warningInfo.preBanAppealReason,
        preBanAppealProofUrl: warningInfo.preBanAppealProofUrl,
        preBanAppealProofName: warningInfo.preBanAppealProofName,
        preBanAppealSubmittedAt: warningInfo.preBanAppealSubmittedAt,
      };
    });
  });

  const [videos, setVideos] = useState<Video[]>(() => {
    const stored = storage.get<Video[]>('videos', INITIAL_VIDEOS);
    return deduplicateVideos(stored);
  });

  const [audioTracksList, setAudioTracksList] = useState<AudioTrack[]>(() => {
    const raw = storage.get<AudioTrack[]>('audioTracks', INITIAL_AUDIO_TRACKS);
    const cleaned = (raw || []).filter(t => !isDeprecatedDefaultTrack(t));
    if (cleaned.length !== (raw || []).length) {
      storage.set('audioTracks', cleaned);
    }
    return cleaned;
  });

  // Helper to check if a URL points to a video file (.mp4, .webm, etc.)
  const isVideoUrl = (url?: string | null): boolean => {
    if (!url) return false;
    const lower = url.trim().toLowerCase();
    return /\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(lower);
  };

  // Combine curated audio tracks + sounds from all uploaded community videos
  const audioTracks = useMemo<AudioTrack[]>(() => {
    const map = new Map<string, AudioTrack>();
    // 1. Curated / stored tracks
    (audioTracksList || []).forEach(t => {
      if (t && t.id && !isDeprecatedDefaultTrack(t)) map.set(t.id, t);
    });
    // 2. Original sounds from videos (other users' videos audio)
    (videos || []).forEach(v => {
      if (!v || !v.mediaUrl || v.status === 'rejected') return;

      const creatorName = v.creator?.displayName || v.creator?.username || 'Creator';
      const cleanCaption = (v.caption || '').replace(/#\w+/g, '').trim();

      // Resolve the profile picture (avatar) of the video owner
      const ownerUser = users.find(
        u => (v.creatorId && u.id === v.creatorId) ||
             (v.creator?.id && u.id === v.creator.id) ||
             (v.creator?.username && u.username.toLowerCase() === v.creator.username.toLowerCase())
      );
      const ownerProfilePic =
        (ownerUser?.avatar && !isVideoUrl(ownerUser.avatar))
          ? ownerUser.avatar
          : (v.creator?.avatar && !isVideoUrl(v.creator.avatar))
            ? v.creator.avatar
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(v.creator?.username || v.creatorId || 'creator')}`;

      if (v.audioTrack && v.audioTrack.id) {
        if (isDeprecatedDefaultTrack(v.audioTrack)) return;

        const isOriginalSound =
          v.audioTrack.title.toLowerCase().startsWith('original sound') ||
          v.audioTrack.id.startsWith('sound_vid_') ||
          Boolean(v.audioTrack.sourceVideoId);

        const existingTrack = map.get(v.audioTrack.id);
        const resolvedCover = isOriginalSound
          ? ownerProfilePic
          : (v.audioTrack.coverUrl && !isVideoUrl(v.audioTrack.coverUrl)
              ? v.audioTrack.coverUrl
              : (existingTrack?.coverUrl || ownerProfilePic));

        const cleanedTrack: AudioTrack = {
          ...v.audioTrack,
          coverUrl: resolvedCover,
          sourceVideoId: v.audioTrack.sourceVideoId || v.id,
          sourceUsername: v.audioTrack.sourceUsername || v.creator?.username || '',
        };
        map.set(v.audioTrack.id, cleanedTrack);
      }

      const soundId = `sound_vid_${v.id}`;
      if (!map.has(soundId)) {
        map.set(soundId, {
          id: soundId,
          title: v.audioTrack && !v.audioTrack.title.toLowerCase().startsWith('original sound')
            ? v.audioTrack.title
            : `Original Sound - @${v.creator?.username || 'creator'}`,
          artist: `${creatorName}${cleanCaption ? ` · "${cleanCaption.slice(0, 24)}"` : ''}`,
          duration: v.audioTrack?.duration || '00:30',
          coverUrl: ownerProfilePic, // Thumbnail for original sound is the video owner's profile picture!
          audioUrl: v.audioTrack?.audioUrl || v.mediaUrl,
          sourceVideoId: v.id,
          sourceUsername: v.creator?.username || '',
          category: 'Trending',
        });
      }
    });
    return Array.from(map.values()).filter(t => !isDeprecatedDefaultTrack(t));
  }, [audioTracksList, videos, users]);
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
  const [currentLiveStream, setCurrentLiveStream] = useState<LiveStream>(() => {
    const stored = storage.get<LiveStream>('livestream', INITIAL_LIVESTREAM);
    // Guarantee isLive defaults to false on boot so stale sessions never revive as active ghost streams
    return {
      ...stored,
      isLive: false,
    };
  });
  const [activeLiveStreams, setActiveLiveStreams] = useState<LiveStream[]>([]);
  const liveStreamChannelRef = useRef<any>(null);
  const liveStreamBroadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const globalLiveStreamsChannelRef = useRef<any>(null);
  const globalLiveBroadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const [liveHeartTrigger, setLiveHeartTrigger] = useState<number>(0);
  const streamLikedUsersRef = useRef<Set<string>>(new Set());

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
        s => isSameUser(s.id, current.id)
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
        a => !isSameUser(a.id, acc.id)
      );
      const next = [patchedAcc, ...filtered].slice(0, 5); // Device limit of 5 logged-in accounts
      storage.set('saved_accounts_v2', next);
      return next;
    });
  };

  const removeSavedAccount = (userId: string) => {
    markAccountLoggedOutOnDevice(userId);
    setSavedAccounts(prev => {
      const next = prev.filter(a => !isSameUser(a.id, userId));
      storage.set('saved_accounts_v2', next);
      return next;
    });
  };

  // Feed refresh trigger counter: incrementing this forces feed re-shuffle and reload
  const [feedRefreshKey, setFeedRefreshKey] = useState<number>(0);
  const refreshFeed = (overrideUser?: User) => {
    setFeedRefreshKey(k => k + 1);
    syncWithSupabase(overrideUser);
  };

  // Appearance & Theme Mode (Auto, Dark, Light)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    return storage.get<ThemeMode>('viralhub_theme_mode', 'auto');
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'dark' | 'light' = themeMode === 'auto' ? (systemIsDark ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }, [resolvedTheme]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    storage.set('viralhub_theme_mode', mode);
  };

  const addCustomNotification = useCallback(
    (item: Omit<NotificationItem, 'id' | 'timestamp' | 'createdAt' | 'isUnread'>) => {
      const nowIso = new Date().toISOString();
      const newNotif: NotificationItem = {
        ...item,
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
      };
      setNotifications(prev => deduplicateNotifications([newNotif, ...prev]));
      if (currentUser?.id) {
        supabaseDb.insertNotification(newNotif, currentUser.id);
      }
    },
    [currentUser]
  );

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
      const remote = await supabaseDb.fetchComments(videoId, currentUser?.id);
      if (remote !== null) {
        setCommentsMap(prev => {
          const existing = prev[videoId] || [];
          const existingMap = new Map<string, { isLiked?: boolean; likesCount?: number; likedBy?: string[] }>();
          existing.forEach(c => {
            existingMap.set(c.id, { isLiked: c.isLiked, likesCount: c.likesCount, likedBy: c.likedBy });
            if (toUuid(c.id) !== c.id) existingMap.set(toUuid(c.id), { isLiked: c.isLiked, likesCount: c.likesCount, likedBy: c.likedBy });
            (c.replies || []).forEach(r => {
              existingMap.set(r.id, { isLiked: r.isLiked, likesCount: r.likesCount, likedBy: r.likedBy });
              if (toUuid(r.id) !== r.id) existingMap.set(toUuid(r.id), { isLiked: r.isLiked, likesCount: r.likesCount, likedBy: r.likedBy });
            });
          });

          const mergeLikes = (remoteLikedBy?: string[], localLikedBy?: string[], fallbackCount = 0) => {
            const set = new Set<string>();
            const list: string[] = [];
            for (const id of [...(remoteLikedBy || []), ...(localLikedBy || [])]) {
              if (!id) continue;
              const k = String(id).toLowerCase();
              if (!set.has(k)) {
                set.add(k);
                list.push(id);
              }
            }
            const count = list.length > 0 ? list.length : fallbackCount;
            const liked = Boolean(currentUser && list.some(id => isSameUser(id, currentUser.id)));
            return { likedBy: list, likesCount: count, isLiked: liked };
          };

          const merged = remote.map(c => {
            const seenReplyIds = new Set<string>();
            const cleanReplies = (c.replies || []).filter(r => {
              const k = (r.id || '').toLowerCase();
              if (k && seenReplyIds.has(k)) return false;
              if (k) seenReplyIds.add(k);
              return true;
            }).map(r => {
              const exR = existingMap.get(r.id) || existingMap.get(toUuid(r.id));
              const mInfo = mergeLikes(r.likedBy, exR?.likedBy, Math.max(r.likesCount || 0, exR?.likesCount || 0));
              return {
                ...r,
                likedBy: mInfo.likedBy,
                likesCount: mInfo.likesCount,
                isLiked: mInfo.isLiked || Boolean(exR?.isLiked),
              };
            });

            const exC = existingMap.get(c.id) || existingMap.get(toUuid(c.id));
            const mInfo = mergeLikes(c.likedBy, exC?.likedBy, Math.max(c.likesCount || 0, exC?.likesCount || 0));
            return {
              ...c,
              replies: cleanReplies,
              likedBy: mInfo.likedBy,
              likesCount: mInfo.likesCount,
              isLiked: mInfo.isLiked || Boolean(exC?.isLiked),
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
  const [searchQuery, setSearchQueryRaw] = useState<string>('');
  const setSearchQuery = (query: string) => {
    setSearchQueryRaw(typeof query === 'string' ? query.slice(0, 50) : '');
  };
  const [supabaseModalOpen, setSupabaseModalOpen] = useState<boolean>(false);
  const [preBanAppealModalOpen, setPreBanAppealModalOpen] = useState<boolean>(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(() => getSupabaseConfig().isConnected);

  // Browser History Navigation (Back / Forward arrows on browser address bar)
  // Handles: Home -> Explore -> Live -> Messages, and clicking browser Back ("←") goes Messages -> Live -> Explore -> Home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Establish initial baseline entry in history stack on load
    const isOAuthRedirect =
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token=');

    if (!isOAuthRedirect) {
      try {
        const url = buildNavigationUrl(activeTab, selectedUserId);
        window.history.replaceState(
          { tab: activeTab, selectedUserId },
          '',
          url
        );
      } catch (e) {
        // ignore
      }
    }

    // 2. Listen to browser Back and Forward button clicks (popstate events)
    const handlePopState = (event: PopStateEvent) => {
      isPopStateRef.current = true;

      // Close open modals / drawers when navigating backward
      setCommentsVideoId(null);
      setReportModal(null);
      setAudioLibraryOpen(false);
      setSupabaseModalOpen(false);
      setSwitchAccountModalOpen(false);

      const state = event.state;
      let targetTab: AppTab = 'home';
      let targetUserId: string | null = null;

      if (state && state.tab && VALID_APP_TABS.includes(state.tab)) {
        targetTab = state.tab;
        targetUserId = state.selectedUserId || null;
      } else {
        const parsed = parseInitialNavigation();
        targetTab = parsed.tab;
        targetUserId = parsed.selectedUserId;
      }

      setSelectedUserId(targetUserId);
      setActiveTabRaw(targetTab);

      setTimeout(() => {
        isPopStateRef.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Active floating notification popup for real-time interactions across devices
  const [activeNotificationPopup, setActiveNotificationPopup] = useState<NotificationItem | null>(null);
  const dismissNotificationPopup = useCallback(() => setActiveNotificationPopup(null), []);
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
  const syncWithSupabase = async (overrideUser?: User) => {
    const config = getSupabaseConfig();
    setIsSupabaseConnected(config.isConnected);
    if (!config.isConnected) return;

    const activeUser = overrideUser || currentUserRef.current || storage.get<User | null>('currentUser', null);

    try {
      const convsPromise = activeUser?.id
        ? supabaseDb.fetchConversationsAndMessages(activeUser.id)
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
        // Only log out if activeUser was explicitly deleted by an administrator
        if (activeUser && !isAdmin) {
          const isDeleted = isUserIdDeleted(activeUser.id, activeUser.email);
          if (isDeleted) {
            console.warn('Current account was deleted by administrator. Logging out session...');
            logout(false);
            return;
          }
        }

        // Ensure activeUser is always preserved in remoteUsers list if not deleted!
        if (activeUser && !isUserIdDeleted(activeUser.id, activeUser.email)) {
          const inRemote = remoteUsers.some(
            u =>
              isSameUser(u.id, activeUser.id) ||
              (activeUser.email && u.email && u.email.toLowerCase() === activeUser.email.toLowerCase())
          );
          if (!inRemote) {
            remoteUsers.unshift(activeUser);
            // Gently ensure they are recorded in database in the background without blocking
            supabaseDb.upsertUser(activeUser).catch(() => {});
          }
        }

        // 2. Synchronize savedAccounts: NEVER discard an account unless explicitly deleted!
        setSavedAccounts(prevAccounts => {
          const nonDeleted = prevAccounts.filter(a => !isUserIdDeleted(a.id, a.email));
          const updated = nonDeleted.map(a => {
            const matchingRemote = remoteUsers.find(
              ru =>
                isSameUser(ru.id, a.id) ||
                (a.email && ru.email && a.email.toLowerCase() === ru.email.toLowerCase())
            );
            const banInfo = checkIsUserBanned(a.id, a.email, matchingRemote || a);
            return {
              ...(matchingRemote ? { ...a, ...matchingRemote } : a),
              isBanned: banInfo.isBanned,
              banReason: banInfo.isBanned ? banInfo.banReason : undefined,
              bannedAt: banInfo.isBanned ? banInfo.bannedAt : undefined,
              appealStatus: banInfo.appealStatus,
              appealReason: banInfo.appealReason,
              appealSubmittedAt: banInfo.appealSubmittedAt,
            };
          });

          // Ensure activeUser is always preserved in saved accounts on this device
          if (activeUser && !isUserIdDeleted(activeUser.id, activeUser.email)) {
            const hasCurrent = updated.some(
              a =>
                isSameUser(a.id, activeUser.id) ||
                (activeUser.email && a.email && activeUser.email.toLowerCase() === a.email.toLowerCase())
            );
            if (!hasCurrent) {
              const curBanInfo = checkIsUserBanned(activeUser.id, activeUser.email, activeUser);
              updated.unshift({
                ...activeUser,
                isBanned: curBanInfo.isBanned,
                banReason: curBanInfo.isBanned ? curBanInfo.banReason : undefined,
                bannedAt: curBanInfo.isBanned ? curBanInfo.bannedAt : undefined,
                appealStatus: curBanInfo.appealStatus,
                appealReason: curBanInfo.appealReason,
                appealSubmittedAt: curBanInfo.appealSubmittedAt,
              });
            }
          }

          const finalSaved = updated.slice(0, 5);
          storage.set('saved_accounts_v2', finalSaved);
          return finalSaved;
        });

        // 3. Set users to remoteUsers (authoritative, deduplicated by ID, excluding any deleted users)
          const userMap = new Map<string, User>();

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

            const existing = userMap.get(patchedUser.id) || (toUuid(patchedUser.id) !== patchedUser.id ? userMap.get(toUuid(patchedUser.id)) : undefined);
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
              continue;
            }
            userMap.set(patchedUser.id, patchedUser);
          }

          const nextUsers = Array.from(userMap.values());
          setUsers(nextUsers);
          storage.set('users', nextUsers);

          // 4. Synchronize activeUser ban and profile status
          // CRITICAL: Verify that the user did not switch accounts during this in-flight fetch!
          const currentActiveOnDevice = currentUserRef.current || storage.get<User | null>('currentUser', null);
          if (activeUser && currentActiveOnDevice && isSameUser(currentActiveOnDevice.id, activeUser.id)) {
            const freshMe = nextUsers.find(
              u => isSameUser(u.id, activeUser.id)
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
                activeUser.id,
                activeUser.email,
                activeUser
              );
              finalIsBanned = banInfo.isBanned;
              finalAppealStatus = banInfo.appealStatus;
              finalBanReason = banInfo.isBanned ? banInfo.banReason : undefined;
              finalBannedAt = banInfo.isBanned ? banInfo.bannedAt : undefined;
            }

            if (!finalIsBanned) {
              recordUserUnban(activeUser.id, activeUser.email, activeUser.username);
            }

            const targetRole = (freshMe?.role === 'admin' || currentActiveOnDevice.role === 'admin') ? 'admin' : (freshMe?.role || currentActiveOnDevice.role || 'creator');

            if (
              finalIsBanned !== currentActiveOnDevice.isBanned ||
              finalAppealStatus !== currentActiveOnDevice.appealStatus ||
              targetRole !== currentActiveOnDevice.role ||
              (freshMe && (freshMe.displayName !== currentActiveOnDevice.displayName || freshMe.avatar !== currentActiveOnDevice.avatar))
            ) {
              const updatedCurr: User = {
                ...currentActiveOnDevice,
                ...(freshMe || {}),
                id: currentActiveOnDevice.id, // Strictly preserve active account ID
                email: currentActiveOnDevice.email || freshMe?.email || '',
                role: targetRole,
                isBanned: finalIsBanned,
                banReason: finalBanReason,
                bannedAt: finalBannedAt,
                appealStatus: finalAppealStatus,
                appealReason: freshMe?.appealReason || (finalIsBanned ? currentActiveOnDevice.appealReason : undefined),
                appealSubmittedAt: freshMe?.appealSubmittedAt || (finalIsBanned ? currentActiveOnDevice.appealSubmittedAt : undefined),
              };
              currentUserRef.current = updatedCurr;
              setCurrentUser(updatedCurr);
              storage.set('currentUser', updatedCurr);
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
          const storedShares = storage.get<Record<string, number>>('video_shares_v1', {});
          const existingVideosMap = new Map((storage.get<Video[]>('videos', []) || []).map(v => [v.id, v]));

          const patchedRemote = activeVideos.map(v => {
            const appeal = storedAppeals[v.id] || storedAppeals[toUuid(v.id)];
            const preservedShares = Math.max(
              v.sharesCount || 0,
              existingVideosMap.get(v.id)?.sharesCount || 0,
              existingVideosMap.get(toUuid(v.id))?.sharesCount || 0,
              storedShares[v.id] || 0,
              storedShares[toUuid(v.id)] || 0
            );

            const baseVideo = {
              ...v,
              sharesCount: preservedShares,
            };

            if (appeal) {
              return {
                ...baseVideo,
                appealStatus: appeal.status || v.appealStatus,
                appealReason: appeal.reason || v.appealReason,
                status: appeal.status === 'approved' ? 'approved' : v.status,
              };
            }
            return baseVideo;
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
        } else if (activeUser) {
          setConversations(prev => {
            const remoteMapped: Conversation[] = remoteConvs.map((rc: any) => {
              const partnerId = isSameUser(rc.userAId, activeUser.id)
                ? rc.userBId
                : rc.userAId;

              const existingConv = prev.find(c => {
                if (c.id === rc.id || toUuid(c.id) === toUuid(rc.id)) return true;
                const pId = c.participantIds?.find(id => !isSameUser(id, activeUser.id)) || c.participant?.id;
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
              if (rc.clearedHistory && typeof rc.clearedHistory === 'object') {
                for (const [k, v] of Object.entries(rc.clearedHistory)) {
                  if (isSameUser(k, activeUser.id)) {
                    const ms = toTimestampMillis(v as any);
                    if (ms > remoteClearTime) remoteClearTime = ms;
                  }
                }
              }

              const clearTime = Math.max(
                remoteClearTime,
                getConversationClearedTimestamp(rc.id, activeUser.id),
                getConversationClearedTimestamp(toUuid(rc.id), activeUser.id),
                toTimestampMillis(existingConv?.clearedHistoryAt?.[activeUser.id]),
                toTimestampMillis(existingConv?.clearedHistoryAt?.[toUuid(activeUser.id)]),
                0
              );

              // Persist cleared timestamp locally on this device so subsequent loads respect it
              if (clearTime > 0) {
                setConversationClearedTimestamp(rc.id, activeUser.id, clearTime);
                const convCanonical = toUuid(rc.id);
                if (convCanonical && convCanonical !== rc.id) {
                  setConversationClearedTimestamp(convCanonical, activeUser.id, clearTime);
                }
              }

              const rawMessages = rc.rawMessages || [];
              const parsedMessages: Message[] = rawMessages.map((m: any) => {
                const isMine = isSameUser(m.SenderUserID, activeUser.id);
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

                // If conversation was cleared before or at this message's sentAt time, hide it for activeUser
                if (clearTime > 0) {
                  const sentTime = toTimestampMillis(m.SentAt);
                  if (sentTime > 0 && sentTime <= clearTime) {
                    if (!deletedFor.some(id => isSameUser(id, activeUser.id))) {
                      deletedFor.push(activeUser.id);
                    }
                  } else if (!m.SentAt) {
                    if (!deletedFor.some(id => isSameUser(id, activeUser.id))) {
                      deletedFor.push(activeUser.id);
                    }
                  }
                }

                const sentMs = toTimestampMillis(m.SentAt);
                const displayTime = sentMs > 0
                  ? new Date(sentMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Today';

                return {
                  id: m.MessageID || `msg_${Date.now()}`,
                  conversationId: rc.id,
                  senderId: m.SenderUserID,
                  text: msgContent,
                  timestamp: displayTime,
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
                lm => !parsedMessages.some(pm =>
                  pm.id === lm.id ||
                  toUuid(pm.id) === toUuid(lm.id) ||
                  ((pm.sharedVideoId || pm.sharedVideo?.id) && (pm.sharedVideoId || pm.sharedVideo?.id) === (lm.sharedVideoId || lm.sharedVideo?.id) && isSameUser(pm.senderId, lm.senderId)) ||
                  (pm.text.trim() === lm.text.trim() && isSameUser(pm.senderId, lm.senderId))
                )
              );
              const allMsgs = deduplicateMessages([...parsedMessages, ...localOnlyMsgs]);

              // Filter out messages that are deleted for this user
              const visibleMsgs = allMsgs.filter(m => {
                if (m.deletedForUserIds?.some(id => isSameUser(id, activeUser.id))) return false;
                if (clearTime > 0) {
                  const sentTime = toTimestampMillis(m.sentAt);
                  if (sentTime > 0 && sentTime <= clearTime) return false;
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
                !isSameUser(pm.senderId, activeUser.id) &&
                (!clearTime || (toTimestampMillis(pm.sentAt) > clearTime))
              );

              let convDeletedForUserIds = [...(existingConv?.deletedForUserIds || [])];
              if (hasNewIncomingMsg) {
                convDeletedForUserIds = convDeletedForUserIds.filter(id => !isSameUser(id, activeUser.id));
              }

              // Normalize clearedHistoryAt to purely numbers so Math.max never evaluates to NaN!
              const normalizedClearedHistory: Record<string, number> = {};
              if (existingConv?.clearedHistoryAt && typeof existingConv.clearedHistoryAt === 'object') {
                Object.entries(existingConv.clearedHistoryAt).forEach(([k, v]) => {
                  const ms = toTimestampMillis(v as any);
                  if (ms > 0) normalizedClearedHistory[k] = ms;
                });
              }
              if (rc.clearedHistory && typeof rc.clearedHistory === 'object') {
                Object.entries(rc.clearedHistory).forEach(([k, v]) => {
                  const ms = toTimestampMillis(v as any);
                  if (ms > 0) {
                    normalizedClearedHistory[k] = ms;
                    normalizedClearedHistory[toUuid(k)] = ms;
                  }
                });
              }
              if (clearTime > 0) {
                normalizedClearedHistory[activeUser.id] = clearTime;
                normalizedClearedHistory[toUuid(activeUser.id)] = clearTime;
              }

              return {
                id: rc.id,
                participantIds: [activeUser.id, partnerId],
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
                clearedHistoryAt: normalizedClearedHistory,
              };
            });

            // Retain any purely local conversations that don't match any remote partner
            const remainingLocal = prev.filter(lc => {
              const localPartnerId = lc.participantIds?.find(id => !isSameUser(id, activeUser.id)) || lc.participant?.id;
              return !remoteMapped.some(rc => {
                const remotePartnerId = rc.participantIds?.find(id => !isSameUser(id, activeUser.id)) || rc.participant?.id;
                return isSameUser(localPartnerId, remotePartnerId) || rc.id === lc.id || toUuid(rc.id) === toUuid(lc.id);
              });
            });

            const combined = [...remoteMapped, ...remainingLocal];
            const deduped = deduplicateConversations(combined, activeUser.id);
            storage.set('conversations', deduped);
            return deduped;
          });
        }
      }

      try {
        const remoteAudio = await supabaseDb.fetchAudioTracks();
        if (remoteAudio && remoteAudio.length > 0) {
          const validRemote = remoteAudio.filter(t => !isDeprecatedDefaultTrack(t));
          setAudioTracksList(prev => {
            const map = new Map<string, AudioTrack>();
            prev.filter(t => !isDeprecatedDefaultTrack(t)).forEach(t => map.set(t.id, t));
            validRemote.forEach(t => map.set(t.id, t));
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

          if (activeUser) {
            // Always register all remote notifications in known set so they never trigger toasts
            remoteNotifications.forEach(n => {
              if (n.id) {
                knownNotificationIdsRef.current.add(n.id);
                knownNotificationIdsRef.current.add(toUuid(n.id));
              }
            });
            initialNotifSyncDoneRef.current = true;

            // Also populate followRequests from incoming follow_request notifications
            const incomingFollowReqs = remoteNotifications.filter(
              n =>
                n.type === 'follow_request' &&
                isSameUser(n.recipientId, activeUser.id) &&
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
              toUserId: activeUser.id,
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
    const inProgress =
      sessionStorage.getItem('viralhub_oauth_in_progress') === 'true' ||
      localStorage.getItem('viralhub_oauth_in_progress') === 'true';
    const hasAuthParams =
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      search.includes('code=') ||
      search.includes('error=');
    if (hasAuthParams) {
      sessionStorage.setItem('viralhub_oauth_in_progress', 'true');
      localStorage.setItem('viralhub_oauth_in_progress', 'true');
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

    const isGoogleAuth = Boolean(
      sbUser.app_metadata?.provider === 'google' ||
      sbUser.identities?.some((i: any) => i.provider === 'google') ||
      (sbUser.email && sbUser.email.endsWith('@gmail.com')) ||
      (avatar && avatar.includes('googleusercontent.com')) ||
      isGoogleAccount(existingUser)
    );

    if (isGoogleAuth) {
      recordGoogleAccount(finalUserId, sbUser.email || email);
    }

    markAccountLoggedInOnDevice(finalUserId, sbUser.email || email);

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
      authProvider: isGoogleAuth ? 'google' : (existingUser?.authProvider || 'email'),
      isBanned: isBannedFinal,
      banReason: isBannedFinal ? (existingUser?.banReason || banInfo.banReason || 'Violation of Community Guidelines') : undefined,
      bannedAt: isBannedFinal ? (existingUser?.bannedAt || banInfo.bannedAt || new Date().toISOString()) : undefined,
      appealStatus: isBannedFinal ? (existingUser?.appealStatus || banInfo.appealStatus) : 'approved',
      appealReason: existingUser?.appealReason || banInfo.appealReason,
      appealSubmittedAt: existingUser?.appealSubmittedAt || banInfo.appealSubmittedAt,
    };

    // Invalidate and inject directly into memory cache immediately (0 disk IO)
    injectUserIntoCache(finalUser);

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

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('viralhub_user_logged_out');
      sessionStorage.removeItem('viralhub_oauth_in_progress');
      localStorage.removeItem('viralhub_oauth_in_progress');
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
    setIsAuthLoading(false);

    // Record user profile in Supabase database
    await supabaseDb.upsertUser(finalUser);
  };

  // Listen to real Supabase Auth events (Google OAuth redirects, session tokens, sign out)
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setIsAuthLoading(false);
      return;
    }

    const isInitialOAuth = checkIsOAuthRedirect();

    // Safety timer: Never leave user stuck on authentication screen for more than 4 seconds
    const safetyTimer = setTimeout(() => {
      setIsAuthLoading(false);
    }, 4000);

    // Direct PKCE callback exchange for Google OAuth
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        client.auth.exchangeCodeForSession(code).then(({ data, error }) => {
          if (data?.session?.user) {
            handleSupabaseUserSession(data.session.user).finally(() => {
              setIsAuthLoading(false);
              clearTimeout(safetyTimer);
            });
          } else {
            setIsAuthLoading(false);
          }
        }).catch(() => {
          setIsAuthLoading(false);
        });
      }
    }

    // Check existing session on load
    client.auth.getSession().then(({ data: { session } }) => {
      const isExplicitOAuth = checkIsOAuthRedirect();
      const isLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('viralhub_user_logged_out') === 'true';
      const activeStored = storage.get<User | null>('currentUser', null);
      if (session?.user && (!isLoggedOut || isExplicitOAuth)) {
        if (isInitialOAuth || !activeStored) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('viralhub_user_logged_out');
            sessionStorage.removeItem('viralhub_oauth_in_progress');
            localStorage.removeItem('viralhub_oauth_in_progress');
          }
          handleSupabaseUserSession(session.user).finally(() => {
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
          });
          return;
        } else if (activeStored && (activeStored.id === session.user.id || toUuid(activeStored.id) === toUuid(session.user.id))) {
          handleSupabaseUserSession(session.user).finally(() => {
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
          });
          return;
        }
      }
      setIsAuthLoading(false);
    });

    // Listen to live auth state changes
    const { data: authSubscription } = client.auth.onAuthStateChange(async (event, session) => {
      const isLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('viralhub_user_logged_out') === 'true';
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          const activeStored = storage.get<User | null>('currentUser', null);
          const isExplicitOAuth = checkIsOAuthRedirect();

          // If returning from an explicit OAuth action, ALWAYS finalize login!
          if (isExplicitOAuth) {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('viralhub_user_logged_out');
              sessionStorage.removeItem('viralhub_oauth_in_progress');
              localStorage.removeItem('viralhub_oauth_in_progress');
            }
            await handleSupabaseUserSession(session.user);
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
            return;
          }

          // If user explicitly logged out, do not restore in background without user interaction!
          if (isLoggedOut) {
            setIsAuthLoading(false);
            return;
          }

          // If user is not yet logged in on screen (on AuthPage), log in with session
          if (!activeStored) {
            await handleSupabaseUserSession(session.user);
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
            return;
          }

          // Strictly match by user ID so account switches to secondary accounts are never overwritten
          const isSame =
            activeStored.id === session.user.id ||
            toUuid(activeStored.id) === toUuid(session.user.id);

          if (isSame) {
            await handleSupabaseUserSession(session.user);
          }
          setIsAuthLoading(false);
          clearTimeout(safetyTimer);
        }
      } else if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          const isExplicitOAuth = checkIsOAuthRedirect();
          const activeStored = storage.get<User | null>('currentUser', null);
          if (isExplicitOAuth || !activeStored) {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('viralhub_oauth_in_progress');
              localStorage.removeItem('viralhub_oauth_in_progress');
            }
            await handleSupabaseUserSession(session.user);
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
          } else if (activeStored && (activeStored.id === session.user.id || toUuid(activeStored.id) === toUuid(session.user.id))) {
            await handleSupabaseUserSession(session.user);
            setIsAuthLoading(false);
            clearTimeout(safetyTimer);
          }
        } else {
          setIsAuthLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
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
              const now = Date.now();
              const newForMe = parsedNotifs.find(n => {
                const isForMe = isSameUser(n.recipientId, currentUser.id);
                const notFromMe = !isSameUser(n.actor?.id, currentUser.id);
                const t = toTimestampMillis(n.timestamp || n.createdAt);
                const notifAgeMs = now - t;
                return isForMe && notFromMe && n.isUnread && t > 0 && notifAgeMs >= 0 && notifAgeMs < 60000 && !knownNotificationIdsRef.current.has(n.id) && !knownNotificationIdsRef.current.has(toUuid(n.id));
              });
              if (newForMe) {
                knownNotificationIdsRef.current.add(newForMe.id);
                if (newForMe.id) knownNotificationIdsRef.current.add(toUuid(newForMe.id));
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
                    const now = Date.now();
                    const newForMe = notifs.find(n => {
                      const t = toTimestampMillis(n.timestamp || n.createdAt);
                      const notifAgeMs = now - t;
                      return (
                        n.isUnread &&
                        isSameUser(n.recipientId, currentUser.id) &&
                        !isSameUser(n.actor?.id, currentUser.id) &&
                        t > 0 &&
                        notifAgeMs >= 0 &&
                        notifAgeMs < 60000 &&
                        !knownNotificationIdsRef.current.has(n.id) &&
                        !knownNotificationIdsRef.current.has(toUuid(n.id))
                      );
                    });
                    if (newForMe) {
                      knownNotificationIdsRef.current.add(newForMe.id);
                      if (newForMe.id) knownNotificationIdsRef.current.add(toUuid(newForMe.id));
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
              if (isSameUser(payload.senderId, currentUser.id)) return;

              const convId = payload.conversationId;
              const senderId = payload.senderId;
              const incomingMsg: Message = {
                id: payload.messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                conversationId: convId,
                senderId: senderId,
                text: payload.text,
                timestamp: 'Just now',
                sentAt: payload.sentAt || new Date().toISOString(),
                isMine: false,
                status: 'read',
                sharedVideo: payload.sharedVideo,
                sharedVideoId: payload.sharedVideo?.id,
                deletedForUserIds: [],
              };

              setConversations(prev => {
                const matchedConv = prev.find(c =>
                  c.id === convId ||
                  toUuid(c.id) === toUuid(convId) ||
                  (c.participantIds && c.participantIds.some(id => isSameUser(id, senderId))) ||
                  (c.participant && isSameUser(c.participant.id, senderId))
                );
                const others = prev.filter(c => c !== matchedConv);

                if (matchedConv) {
                  const inVidId = incomingMsg.sharedVideoId || incomingMsg.sharedVideo?.id;
                  const exists = matchedConv.messages.some(
                    (m: Message) =>
                      m.id === incomingMsg.id ||
                      toUuid(m.id) === toUuid(incomingMsg.id) ||
                      (inVidId && (m.sharedVideoId || m.sharedVideo?.id) === inVidId && isSameUser(m.senderId, incomingMsg.senderId)) ||
                      (m.text.trim() === incomingMsg.text.trim() && isSameUser(m.senderId, incomingMsg.senderId))
                  );
                  const newMessages = exists ? matchedConv.messages : deduplicateMessages([...matchedConv.messages, incomingMsg]);
                  const curUnread = matchedConv.unreadCounts?.[currentUser.id] || 0;

                  const updatedConv: Conversation = {
                    ...matchedConv,
                    lastMessage: payload.text,
                    lastMessageTime: 'Just now',
                    messages: newMessages,
                    // Automatically unhide conversation for recipient!
                    deletedForUserIds: (matchedConv.deletedForUserIds || []).filter((id: string) => !isSameUser(id, currentUser.id)),
                    unreadCounts: {
                      ...(matchedConv.unreadCounts || {}),
                      [currentUser.id]: curUnread + 1,
                    },
                    unreadCount: curUnread + 1,
                  };

                  const next = deduplicateConversations([updatedConv, ...others], currentUser.id);
                  storage.set('conversations', next);
                  return next;
                }

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
                  lastMessageTime: 'Just now',
                  unreadCount: 1,
                  unreadCounts: { [currentUser.id]: 1, [senderId]: 0 },
                  messages: [incomingMsg],
                  isOnline: true,
                  deletedForUserIds: [],
                };
                const next = deduplicateConversations([newConv, ...others], currentUser.id);
                storage.set('conversations', next);
                return next;
              });

              // Trigger in-app notification popup for new message only if user is not currently viewing this conversation
              const isLookingAtThisChat = activeTab === 'messages' && (
                activeConversationId === convId ||
                toUuid(activeConversationId || '') === toUuid(convId)
              );
              const msgAge = Date.now() - toTimestampMillis(incomingMsg.sentAt);
              if (!isLookingAtThisChat && !isSameUser(senderId, currentUser.id) && msgAge >= 0 && msgAge < 60000) {
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
              }
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
            .on('broadcast', { event: 'comment_liked' }, ({ payload }: any) => {
              if (!payload) return;
              const { videoId, commentId, isLiked, userId, likedBy } = payload;
              setCommentsMap(prev => {
                const list = prev[videoId] || [];
                const updated = list.map(c => {
                  const isTarget = c.id === commentId || toUuid(c.id) === toUuid(commentId);
                  if (isTarget) {
                    let nextLikedBy: string[];
                    if (Array.isArray(likedBy) && likedBy.length > 0) {
                      nextLikedBy = Array.from(new Set(likedBy));
                    } else {
                      const cur = c.likedBy || [];
                      if (isLiked) {
                        nextLikedBy = cur.some(id => isSameUser(id, userId)) ? cur : [...cur, userId];
                      } else {
                        nextLikedBy = cur.filter(id => !isSameUser(id, userId));
                      }
                    }
                    const count = nextLikedBy.length;
                    const liked = Boolean(currentUser && nextLikedBy.some(id => isSameUser(id, currentUser.id)));
                    return {
                      ...c,
                      likedBy: nextLikedBy,
                      likesCount: count,
                      isLiked: liked,
                    };
                  }
                  if (c.replies && c.replies.length > 0) {
                    return {
                      ...c,
                      replies: c.replies.map(r => {
                        if (r.id === commentId || toUuid(r.id) === toUuid(commentId)) {
                          let nextLikedBy: string[];
                          if (Array.isArray(likedBy) && likedBy.length > 0) {
                            nextLikedBy = Array.from(new Set(likedBy));
                          } else {
                            const cur = r.likedBy || [];
                            if (isLiked) {
                              nextLikedBy = cur.some(id => isSameUser(id, userId)) ? cur : [...cur, userId];
                            } else {
                              nextLikedBy = cur.filter(id => !isSameUser(id, userId));
                            }
                          }
                          const count = nextLikedBy.length;
                          const liked = Boolean(currentUser && nextLikedBy.some(id => isSameUser(id, currentUser.id)));
                          return {
                            ...r,
                            likedBy: nextLikedBy,
                            likesCount: count,
                            isLiked: liked,
                          };
                        }
                        return r;
                      }),
                    };
                  }
                  return c;
                });
                const next = { ...prev, [videoId]: updated };
                storage.set('video_comments_v2', next);
                return next;
              });
            })
            .on('broadcast', { event: 'comment_added' }, ({ payload }: any) => {
              if (!payload) return;
              const { videoId, replyToCommentId, comment } = payload;
              if (!videoId || !comment) return;
              setCommentsMap(prev => {
                const list = prev[videoId] || [];
                if (replyToCommentId) {
                  const updated = list.map(c => {
                    if (c.id === replyToCommentId || toUuid(c.id) === toUuid(replyToCommentId)) {
                      const curReplies = c.replies || [];
                      if (curReplies.some(r => r.id === comment.id || toUuid(r.id) === toUuid(comment.id))) {
                        return c;
                      }
                      return { ...c, replies: [...curReplies, comment] };
                    }
                    return c;
                  });
                  const next = { ...prev, [videoId]: updated };
                  storage.set('video_comments_v2', next);
                  return next;
                } else {
                  if (list.some(c => c.id === comment.id || toUuid(c.id) === toUuid(comment.id))) {
                    return prev;
                  }
                  const next = { ...prev, [videoId]: [...list, comment] };
                  storage.set('video_comments_v2', next);
                  return next;
                }
              });
              setVideos(prev =>
                prev.map(v =>
                  v.id === videoId || toUuid(v.id) === toUuid(videoId)
                    ? { ...v, commentsCount: (v.commentsCount || 0) + 1 }
                    : v
                )
              );
            })
            .on('broadcast', { event: 'in_app_notification' }, ({ payload }: any) => {
              if (!payload || !currentUser) return;
              if (isSameUser(payload.recipientId, currentUser.id)) {
                setNotifications(prev => deduplicateNotifications([payload, ...prev]));
                setActiveNotificationPopup(payload);
              }
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
    storage.set('livestream', { ...currentLiveStream, isLive: false });
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
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('viralhub_user_logged_out');
    }
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
            markAccountLoggedInOnDevice(loggedInUser.id, loggedInUser.email);
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
      markAccountLoggedInOnDevice(patchedFound.id, patchedFound.email);
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
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('viralhub_user_logged_out');
    }
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
        markAccountLoggedInOnDevice(newUser.id, newUser.email);
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
    markAccountLoggedInOnDevice(newUser.id, newUser.email);
    setActiveConversationId(null);
    setMessagesMobileView('list');
    setSelectedUserId(null);
    await supabaseDb.upsertUser(newUser, password);
    return { success: true };
  };

  const loginWithGoogle = async (options?: GoogleAuthOptions): Promise<{ success: boolean; message?: string }> => {
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
      sessionStorage.removeItem('viralhub_user_logged_out');
      sessionStorage.setItem('viralhub_oauth_in_progress', 'true');
      localStorage.setItem('viralhub_oauth_in_progress', 'true');
    }

    const { error } = await signInWithGoogle(options || { prompt: 'select_account' });
    if (error) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('viralhub_oauth_in_progress');
        localStorage.removeItem('viralhub_oauth_in_progress');
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

    if (currentUser) {
      markAccountLoggedOutOnDevice(currentUser.id, currentUser.email);
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('viralhub_user_logged_out', 'true');
      sessionStorage.removeItem('viralhub_oauth_in_progress');
      localStorage.removeItem('viralhub_oauth_in_progress');
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    try {
      await signOutSupabase();
    } catch {
      // ignore
    }

    // Clear active session
    currentUserRef.current = null;
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
      users.find(u => isSameUser(u.id, userId)) ||
      savedAccounts.find(u => isSameUser(u.id, userId));

    if (!target) {
      const matchedAdmin = admins.find(
        a => isSameUser(a.adminId, userId) || isSameUser(a.userId, userId) || (a.email && a.email.toLowerCase() === userId.toLowerCase())
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
        isSameUser(a.userId, target.id) ||
        isSameUser(a.adminId, target.id) ||
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

    currentUserRef.current = updatedTarget;
    setCurrentUser(updatedTarget);
    storage.set('currentUser', updatedTarget);
    setIsAdmin(isTargetAdmin);
    recordSavedAccount(updatedTarget);
    markAccountLoggedInOnDevice(updatedTarget.id, updatedTarget.email);

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('viralhub_active_user_id', updatedTarget.id);
      localStorage.setItem('viralhub_active_user_id', updatedTarget.id);
      sessionStorage.removeItem('viralhub_user_logged_out');
      sessionStorage.removeItem('viralhub_oauth_in_progress');
      localStorage.removeItem('viralhub_oauth_in_progress');
    }

    // Seed existing notifications as known so switching accounts never pops up old toasts
    notifications.forEach(n => {
      if (n.id) {
        knownNotificationIdsRef.current.add(n.id);
        knownNotificationIdsRef.current.add(toUuid(n.id));
      }
    });

    setActiveTab('home');
    setSelectedUserId(null);
    setActiveConversationId(null);
    setMessagesMobileView('list');
    setCommentsVideoId(null);
    setSwitchAccountModalOpen(false);

    // Refresh feed directly with updatedTarget so syncWithSupabase uses new user!
    refreshFeed(updatedTarget);

    // Also verify remote admin asynchronously in case not cached
    if (!isTargetAdmin && updatedTarget.email) {
      supabaseDb.checkIsAdmin(updatedTarget).then(remoteAdmin => {
        if (remoteAdmin) {
          setIsAdmin(true);
          setCurrentUser(prev => (prev && isSameUser(prev.id, updatedTarget.id) ? { ...prev, role: 'admin' } : prev));
        }
      }).catch(() => {});
    }
  };

  const prepareAddNewAccount = () => {
    if (currentUser) {
      markAccountLoggedInOnDevice(currentUser.id, currentUser.email);
      recordSavedAccount(currentUser);
    }
    currentUserRef.current = null;
    setCurrentUser(null);
    storage.remove('currentUser');
    setAuthView('login');
  };

  const navigateToUserProfile = (userId: string) => {
    const targetUserId = currentUser && userId === currentUser.id ? null : userId;
    setSelectedUserId(targetUserId);
    setActiveTabRaw('profile');

    if (!isPopStateRef.current && typeof window !== 'undefined') {
      try {
        const url = buildNavigationUrl('profile', targetUserId);
        window.history.pushState(
          { tab: 'profile', selectedUserId: targetUserId },
          '',
          url
        );
      } catch (e) {
        console.warn('Failed to push browser history state for profile:', e);
      }
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

  const getFollowStatus = useCallback((targetUserId: string): FollowStatus => {
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
  }, [currentUser?.id, followRelations, followRequests]);

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
    setUsers(prev => {
      let changed = false;
      const updated = prev.map(u => {
        const newFollowers = followRelations.filter(f => f.followingId === u.id).length;
        const newFollowing = followRelations.filter(f => f.followerId === u.id).length;
        if (u.followersCount === newFollowers && u.followingCount === newFollowing) {
          return u;
        }
        changed = true;
        return {
          ...u,
          followersCount: newFollowers,
          followingCount: newFollowing,
        };
      });
      return changed ? updated : prev;
    });

    if (currentUser) {
      setCurrentUser(prev => {
        if (!prev) return prev;
        const newFollowers = followRelations.filter(f => f.followingId === prev.id).length;
        const newFollowing = followRelations.filter(f => f.followerId === prev.id).length;
        if (prev.followersCount === newFollowers && prev.followingCount === newFollowing) {
          return prev;
        }
        return {
          ...prev,
          followersCount: newFollowers,
          followingCount: newFollowing,
        };
      });
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

    // Broadcast new comment / reply to all active devices instantly (<50ms)
    try {
      const client = getSupabaseClient();
      const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
      if (broadcastCh) {
        const broadcastCommentEntry = replyToCommentId
          ? {
              id: commentUuid,
              name: currentUser.displayName || currentUser.username || 'User',
              avatar: currentUser.avatar || '',
              text: cleanText,
              timestamp: nowIso,
              userId: currentUser.id,
              likesCount: 0,
              isLiked: false,
              likedBy: [],
            }
          : {
              id: commentUuid,
              name: currentUser.displayName || currentUser.username || 'User',
              avatar: currentUser.avatar || '',
              text: cleanText,
              timestamp: nowIso,
              likesCount: 0,
              isLiked: false,
              likedBy: [],
              userId: currentUser.id,
              replies: [],
            };

        broadcastCh.send({
          type: 'broadcast',
          event: 'comment_added',
          payload: {
            videoId,
            replyToCommentId,
            comment: broadcastCommentEntry,
          },
        });
      }
    } catch {}

    // 3. Trigger notification to the PARENT COMMENT AUTHOR if this is a reply
    if (replyToCommentId) {
      const videoComments = commentsMap[videoId] || [];
      const parentComment = videoComments.find(
        c => c.id === replyToCommentId || toUuid(c.id) === toUuid(replyToCommentId)
      );
      if (parentComment && parentComment.userId && !isSameUser(parentComment.userId, currentUser.id)) {
        const replyNotif: NotificationItem = {
          id: `notif_${Date.now()}_rep_${Math.random().toString(36).slice(2, 6)}`,
          recipientId: parentComment.userId,
          type: 'comment',
          actor: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatar: currentUser.avatar,
          },
          targetText: `replied to your comment: "${cleanText.slice(0, 35)}"`,
          timestamp: nowIso,
          createdAt: nowIso,
          isUnread: true,
          videoId: videoId,
        };
        setNotifications(prev => deduplicateNotifications([replyNotif, ...prev]));
        supabaseDb.insertNotification(replyNotif, parentComment.userId);

        try {
          const client = getSupabaseClient();
          const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
          if (broadcastCh) {
            broadcastCh.send({
              type: 'broadcast',
              event: 'in_app_notification',
              payload: replyNotif,
            });
          }
        } catch {}
      }
    }

    // 4. Trigger notification to the VIDEO CREATOR (if not currentUser and not parent author already notified)
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

      try {
        const client = getSupabaseClient();
        const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
        if (broadcastCh) {
          broadcastCh.send({
            type: 'broadcast',
            event: 'in_app_notification',
            payload: newNotif,
          });
        }
      } catch {}
    }

    // 5. Trigger MENTION notifications if text contains @username
    const mentionMatches = cleanText.match(/@([a-zA-Z0-9_]+)/g);
    if (mentionMatches && mentionMatches.length > 0) {
      const mentionedUsernames = new Set(mentionMatches.map(m => m.slice(1).toLowerCase()));
      users.forEach(u => {
        if (
          u.username &&
          mentionedUsernames.has(u.username.toLowerCase()) &&
          !isSameUser(u.id, currentUser.id)
        ) {
          const mentionNotif: NotificationItem = {
            id: `notif_${Date.now()}_men_${u.id.slice(0, 4)}`,
            recipientId: u.id,
            type: 'mention',
            actor: {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName,
              avatar: currentUser.avatar,
            },
            targetText: `mentioned you in a comment: "${cleanText.slice(0, 35)}"`,
            timestamp: nowIso,
            createdAt: nowIso,
            isUnread: true,
            videoId: videoId,
          };
          setNotifications(prev => deduplicateNotifications([mentionNotif, ...prev]));
          supabaseDb.insertNotification(mentionNotif, u.id);
        }
      });
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

  const toggleLikeComment = async (videoId: string, commentId: string) => {
    if (!currentUser) return;

    let targetIsLiked = false;
    let targetLikesCount = 0;
    let targetLikedBy: string[] = [];
    let targetAuthorId = '';
    let targetCommentText = '';
    let targetIsReply = false;

    setCommentsMap(prev => {
      const list = prev[videoId] || [];
      const updated = list.map(c => {
        const isTargetComment = c.id === commentId || toUuid(c.id) === toUuid(commentId);
        if (isTargetComment) {
          const liked = !c.isLiked;
          const curLikedBy = c.likedBy || [];
          const nextLikedBy = liked
            ? (curLikedBy.some(id => isSameUser(id, currentUser.id)) ? curLikedBy : [...curLikedBy, currentUser.id])
            : curLikedBy.filter(id => !isSameUser(id, currentUser.id));
          const count = nextLikedBy.length;
          targetIsLiked = liked;
          targetLikesCount = count;
          targetLikedBy = nextLikedBy;
          targetAuthorId = c.userId || '';
          targetCommentText = c.text || '';
          targetIsReply = false;
          return { ...c, isLiked: liked, likesCount: count, likedBy: nextLikedBy };
        }

        if (c.replies && c.replies.length > 0) {
          let replyChanged = false;
          const updatedReplies = c.replies.map(r => {
            if (r.id === commentId || toUuid(r.id) === toUuid(commentId)) {
              replyChanged = true;
              const liked = !r.isLiked;
              const curLikedBy = r.likedBy || [];
              const nextLikedBy = liked
                ? (curLikedBy.some(id => isSameUser(id, currentUser.id)) ? curLikedBy : [...curLikedBy, currentUser.id])
                : curLikedBy.filter(id => !isSameUser(id, currentUser.id));
              const count = nextLikedBy.length;
              targetIsLiked = liked;
              targetLikesCount = count;
              targetLikedBy = nextLikedBy;
              targetAuthorId = r.userId || '';
              targetCommentText = r.text || '';
              targetIsReply = true;
              return { ...r, isLiked: liked, likesCount: count, likedBy: nextLikedBy };
            }
            return r;
          });
          if (replyChanged) {
            return { ...c, replies: updatedReplies };
          }
        }

        return c;
      });
      const next = { ...prev, [videoId]: updated };
      storage.set('video_comments_v2', next);
      return next;
    });

    // 1. Instant WebSocket broadcast (<50ms, 0 disk IO)
    try {
      const client = getSupabaseClient();
      const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
      if (broadcastCh) {
        broadcastCh.send({
          type: 'broadcast',
          event: 'comment_liked',
          payload: {
            videoId,
            commentId,
            userId: currentUser.id,
            isLiked: targetIsLiked,
            likesCount: targetLikesCount,
            likedBy: targetLikedBy,
          },
        });
      }
    } catch {}

    // 2. Notification to comment / reply author if liked (NOT currentUser)
    if (targetIsLiked && targetAuthorId && !isSameUser(targetAuthorId, currentUser.id)) {
      const nowIso = new Date().toISOString();
      const notifItem: NotificationItem = {
        id: `notif_${Date.now()}_clike_${Math.random().toString(36).slice(2, 6)}`,
        recipientId: targetAuthorId,
        type: 'like',
        actor: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        targetText: `liked your ${targetIsReply ? 'reply' : 'comment'}: "${targetCommentText.slice(0, 35)}"`,
        timestamp: nowIso,
        createdAt: nowIso,
        isUnread: true,
        videoId: videoId,
      };
      setNotifications(prev => deduplicateNotifications([notifItem, ...prev]));
      supabaseDb.insertNotification(notifItem, targetAuthorId);

      try {
        const client = getSupabaseClient();
        const broadcastCh = chatBroadcastChannelRef.current || (client ? client.channel('viralhub_chat_realtime') : null);
        if (broadcastCh) {
          broadcastCh.send({
            type: 'broadcast',
            event: 'in_app_notification',
            payload: notifItem,
          });
        }
      } catch {}
    }

    // 3. Persist to Supabase Comment table
    const result = await supabaseDb.toggleCommentLike(commentId, videoId, currentUser.id, targetIsLiked);
    if (result.success && result.likedBy && result.likedBy.length > 0) {
      setCommentsMap(prev => {
        const list = prev[videoId] || [];
        const updated = list.map(c => {
          if (c.id === commentId || toUuid(c.id) === toUuid(commentId)) {
            const liked = Boolean(currentUser && result.likedBy.some(id => isSameUser(id, currentUser.id)));
            return { ...c, likedBy: result.likedBy, likesCount: result.likedBy.length, isLiked: liked };
          }
          if (c.replies && c.replies.length > 0) {
            return {
              ...c,
              replies: c.replies.map(r => {
                if (r.id === commentId || toUuid(r.id) === toUuid(commentId)) {
                  const liked = Boolean(currentUser && result.likedBy.some(id => isSameUser(id, currentUser.id)));
                  return { ...r, likedBy: result.likedBy, likesCount: result.likedBy.length, isLiked: liked };
                }
                return r;
              }),
            };
          }
          return c;
        });
        const next = { ...prev, [videoId]: updated };
        storage.set('video_comments_v2', next);
        return next;
      });
    }
  };

  // Share Video (BR-019, BR-020, BR-023)
  const shareVideo = (videoId: string) => {
    const actorId = currentUser ? currentUser.id : 'guest';
    supabaseDb.insertShare(videoId, actorId);

    setVideos(prev => {
      const next = prev.map(v => {
        if (v.id === videoId || toUuid(v.id) === toUuid(videoId)) {
          const nextShares = (v.sharesCount || 0) + 1;
          const storedShares = storage.get<Record<string, number>>('video_shares_v1', {});
          storedShares[v.id] = nextShares;
          storedShares[toUuid(v.id)] = nextShares;
          storage.set('video_shares_v1', storedShares);
          return { ...v, sharesCount: nextShares };
        }
        return v;
      });
      storage.set('videos', next);
      return next;
    });

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
  const recordVideoView = useCallback((videoId: string) => {
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
  }, []);

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

  // Share live stream directly to another user via message
  const shareLiveStreamToUser = (stream: LiveStream, targetUserId: string, note?: string): boolean => {
    if (!currentUser) return false;
    const targetUser = users.find(u => u.id === targetUserId || toUuid(u.id) === toUuid(targetUserId));
    if (!targetUser) return false;

    // Guard: private profile requires friendship
    if (targetUser.isPrivate && getFollowStatus(targetUserId) !== 'friends') {
      return false;
    }

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
        lastMessage: `🔴 Shared a live stream: "${stream.title.slice(0, 25)}"`,
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
    sendMessage(targetConvId, noteText, undefined, undefined, stream);
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
    audioStartTime?: number;
    audioEndTime?: number;
    audience?: 'public' | 'friends' | 'only_me';
  }): Promise<boolean> => {
    if (!currentUser) return false;
    const videoId = crypto.randomUUID();

    const validThumb =
      newVideo.thumbnailUrl && !isVideoUrl(newVideo.thumbnailUrl) && !newVideo.thumbnailUrl.includes('avatar_')
        ? newVideo.thumbnailUrl
        : '';

    let attachedAudio = newVideo.audioTrack;
    if (attachedAudio) {
      const isOriginalSound =
        attachedAudio.title.toLowerCase().startsWith('original sound') ||
        attachedAudio.id.startsWith('sound_vid_') ||
        Boolean(attachedAudio.sourceVideoId);
      if (isOriginalSound) {
        attachedAudio = {
          ...attachedAudio,
          coverUrl: currentUser.avatar || attachedAudio.coverUrl,
          sourceUsername: attachedAudio.sourceUsername || currentUser.username,
        };
      }
    }

    const createdAudience = newVideo.audience || 'public';

    const created: Video = {
      id: videoId,
      creatorId: currentUser.id,
      creator: currentUser,
      caption: newVideo.caption || 'New viral moment! 🔥',
      hashtags: newVideo.hashtags.length > 0 ? newVideo.hashtags : ['#viral', '#fyp'],
      audioTrack: attachedAudio,
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
      audioStartTime: newVideo.audioStartTime,
      audioEndTime: newVideo.audioEndTime,
      audience: createdAudience,
      privacy: createdAudience === 'only_me' ? 'private' : createdAudience === 'friends' ? 'friends' : 'public',
    };

    setVideos(prev => {
      const next = deduplicateVideos([created, ...prev]);
      storage.set('videos', next);
      return next;
    });

    // Trigger tag/mention notifications if video caption contains @username
    const captionTagMatches = (newVideo.caption || '').match(/@([a-zA-Z0-9_]+)/g);
    if (captionTagMatches && captionTagMatches.length > 0) {
      const taggedUsernames = new Set(captionTagMatches.map(m => m.slice(1).toLowerCase()));
      const nowIso = new Date().toISOString();
      users.forEach(u => {
        if (
          u.username &&
          taggedUsernames.has(u.username.toLowerCase()) &&
          !isSameUser(u.id, currentUser.id)
        ) {
          const tagNotif: NotificationItem = {
            id: `notif_${Date.now()}_tag_${u.id.slice(0, 4)}`,
            recipientId: u.id,
            type: 'tag',
            actor: {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName,
              avatar: currentUser.avatar,
            },
            targetText: `tagged you in a video: "${created.caption.slice(0, 35)}"`,
            timestamp: nowIso,
            createdAt: nowIso,
            isUnread: true,
            videoId: created.id,
          };
          setNotifications(prev => deduplicateNotifications([tagNotif, ...prev]));
          supabaseDb.insertNotification(tagNotif, u.id);
        }
      });
    }

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
          const others = prev.filter(c => !(c.id === existing.id || toUuid(c.id) === toUuid(existing.id)));
          const updatedMessages = (existing.messages || []).map(m => {
            const mDeleted = m.deletedForUserIds || [];
            return mDeleted.some(id => isSameUser(id, currentUser.id))
              ? m
              : { ...m, deletedForUserIds: [...mDeleted, currentUser.id] };
          });

          const unhiddenConv: Conversation = {
            ...existing,
            deletedForUserIds: (existing.deletedForUserIds || []).filter(id => !isSameUser(id, currentUser.id)),
            messages: updatedMessages,
            lastMessage: 'Started a new conversation',
            lastMessageTime: 'Just now',
          };
          const next = deduplicateConversations([unhiddenConv, ...others], currentUser.id);
          storage.set('conversations', next);
          return next;
        });
      } else {
        // Move this existing conversation to the top when selected/opened
        setConversations(prev => {
          const others = prev.filter(c => !(c.id === existing.id || toUuid(c.id) === toUuid(existing.id)));
          const next = deduplicateConversations([existing, ...others], currentUser.id);
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
    sharedVideo?: Video,
    sharedLiveStream?: LiveStream
  ) => {
    if (!currentUser && !sharedVideo && !sharedLiveStream) return;
    const cleanText = text.trim().slice(0, 200);
    if (!cleanText && !sharedVideo && !sharedLiveStream) return;

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

    const nowIso = new Date().toISOString();
    const displayText = cleanText || (sharedVideo ? `Shared a video: "${sharedVideo.caption}"` : sharedLiveStream ? `Shared a live stream: "${sharedLiveStream.title}"` : '');
    const newMsg: Message = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: canonicalConvId,
      senderId: currentUser ? currentUser.id : 'unknown',
      text: displayText,
      timestamp: 'Just now',
      sentAt: nowIso,
      isMine: true,
      status: 'sent',
      replyTo,
      deletedForUserIds: [],
      sharedVideo: sharedVideo,
      sharedVideoId: sharedVideo?.id,
      sharedLiveStream: sharedLiveStream,
      sharedLiveStreamId: sharedLiveStream?.id,
    };

    setConversations(prev => {
      const targetConv = prev.find(c =>
        c.id === convId || toUuid(c.id) === toUuid(convId) || c.id === canonicalConvId
      );
      const others = prev.filter(c => c !== targetConv);

      const currentRecipientUnread = targetConv?.unreadCounts?.[recipientId] || 0;
      const updatedConv: Conversation = {
        ...(targetConv || {
          id: canonicalConvId,
          participantIds: [currentUser ? currentUser.id : '', recipientId],
          participant: recipientUser || {
            id: recipientId,
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
          },
          unreadCount: 0,
          messages: [],
        }),
        id: canonicalConvId,
        lastMessage: sharedVideo ? `🎥 Shared a video: "${sharedVideo.caption.slice(0, 25)}"` : sharedLiveStream ? `🔴 Shared live stream: "${sharedLiveStream.title.slice(0, 25)}"` : cleanText,
        lastMessageTime: 'Just now',
        messages: deduplicateMessages([...(targetConv ? targetConv.messages : []), newMsg]),
        deletedForUserIds: ((targetConv && targetConv.deletedForUserIds) ? targetConv.deletedForUserIds : []).filter(
          (id: string) => !isSameUser(id, currentUser?.id) && !isSameUser(id, recipientId)
        ),
        unreadCounts: {
          ...(targetConv ? targetConv.unreadCounts : {}),
          [currentUser ? currentUser.id : 'me']: 0,
          [recipientId]: currentRecipientUnread + 1,
        },
      };

      // Put the updated conversation at the top, and sort
      const combined = [updatedConv, ...others];
      const deduped = deduplicateConversations(combined, currentUser?.id);
      storage.set('conversations', deduped);
      return deduped;
    });

    if (activeConversationId === convId && activeConversationId !== canonicalConvId) {
      setActiveConversationId(canonicalConvId);
    }

    const remotePayload = sharedVideo
      ? `[VIDEO_SHARE:${sharedVideo.id}] ${cleanText}`
      : cleanText;

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
              sharedVideo: sharedVideo
                ? {
                    ...sharedVideo,
                    creator: sharedVideo.creator || currentUser,
                  }
                : undefined,
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
        knownNotificationIdsRef.current.add(msgNotif.id);
        if (msgNotif.id) knownNotificationIdsRef.current.add(toUuid(msgNotif.id));
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
  const refreshActiveLiveStreams = async () => {
    try {
      const isLocallyBroadcasting = liveBroadcastService.getState().isBroadcasting;
      const streams = await supabaseDb.fetchActiveLiveStreams(currentUser?.id);
      setActiveLiveStreams(prev => {
        const streamMap = new Map<string, LiveStream>();
        // Only include currentLiveStream if this client is ACTUALLY broadcasting via live studio!
        if (isLocallyBroadcasting && currentLiveStream.isLive && currentLiveStream.id) {
          streamMap.set(currentLiveStream.id, currentLiveStream);
        }
        streams.forEach(s => {
          streamMap.set(s.id, s);
        });
        return Array.from(streamMap.values());
      });
    } catch (err) {
      console.warn('refreshActiveLiveStreams error', err);
    }
  };

  // Global Realtime Live Stream Discovery: broadcasts new streams to all connected devices instantly (<50ms, 0 Disk IO!)
  useEffect(() => {
    // 1. Same-device cross-tab BroadcastChannel
    try {
      const bChan = new BroadcastChannel('viralhub_live_streams_global');
      bChan.onmessage = (e) => {
        const data = e.data;
        if (!data) return;
        if (data.type === 'stream_started' && data.payload) {
          setActiveLiveStreams(prev => {
            if (prev.some(s => s.id === data.payload.id || toUuid(s.id) === toUuid(data.payload.id))) {
              return prev;
            }
            return [data.payload, ...prev];
          });
        } else if (data.type === 'stream_ended' && data.payload?.streamId) {
          setActiveLiveStreams(prev =>
            prev.filter(s => s.id !== data.payload.streamId && toUuid(s.id) !== toUuid(data.payload.streamId))
          );
        }
      };
      globalLiveBroadcastChannelRef.current = bChan;
    } catch {}

    // 2. Supabase Realtime channel across all devices (0 Disk IO!)
    const client = getSupabaseClient();
    if (client) {
      try {
        const chan = client.channel('viralhub_live_streams_global', {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: currentUser?.id || `user_${Date.now()}` },
          },
        });

        chan
          .on('broadcast', { event: 'stream_started' }, ({ payload }: { payload: LiveStream }) => {
            if (!payload || !payload.id) return;
            setActiveLiveStreams(prev => {
              if (prev.some(s => s.id === payload.id || toUuid(s.id) === toUuid(payload.id))) {
                return prev;
              }
              return [payload, ...prev];
            });
          })
          .on('broadcast', { event: 'stream_ended' }, ({ payload }: { payload: { streamId: string } }) => {
            if (!payload || !payload.streamId) return;
            setActiveLiveStreams(prev =>
              prev.filter(s => s.id !== payload.streamId && toUuid(s.id) !== toUuid(payload.streamId))
            );
          })
          .on('presence', { event: 'sync' }, () => {
            try {
              const state = chan.presenceState();
              const presenceStreams: LiveStream[] = [];
              Object.values(state).forEach((items: any) => {
                items.forEach((p: any) => {
                  if (p.isHost && p.stream && p.stream.id) {
                    presenceStreams.push(p.stream);
                  }
                });
              });
              if (presenceStreams.length > 0) {
                setActiveLiveStreams(prev => {
                  const map = new Map<string, LiveStream>();
                  presenceStreams.forEach(s => map.set(toUuid(s.id), s));
                  prev.forEach(s => {
                    if (!map.has(toUuid(s.id))) {
                      map.set(toUuid(s.id), s);
                    }
                  });
                  return Array.from(map.values());
                });
              }
            } catch {}
          })
          .subscribe();

        globalLiveStreamsChannelRef.current = chan;
      } catch (err) {
        console.warn('global live streams realtime channel error:', err);
      }
    }

    return () => {
      if (globalLiveStreamsChannelRef.current) {
        try { globalLiveStreamsChannelRef.current.unsubscribe(); } catch {}
        globalLiveStreamsChannelRef.current = null;
      }
      if (globalLiveBroadcastChannelRef.current) {
        try { globalLiveBroadcastChannelRef.current.close(); } catch {}
        globalLiveBroadcastChannelRef.current = null;
      }
    };
  }, [isSupabaseConnected]);

  useEffect(() => {
    if (activeTab === 'live' || activeTab === 'live_viewer') {
      refreshActiveLiveStreams();
    }
  }, [activeTab]);

  // Real-Time Live Chat & Event WebSocket Subscription (<50ms delivery, 0 Disk IO!)
  useEffect(() => {
    const streamId = currentLiveStream.id;
    const isLiveActive = activeTab === 'live_viewer' || activeTab === 'live_host_active';

    if (!streamId || !isLiveActive) {
      if (liveStreamChannelRef.current) {
        try { liveStreamChannelRef.current.unsubscribe(); } catch {}
        liveStreamChannelRef.current = null;
      }
      if (liveStreamBroadcastChannelRef.current) {
        try { liveStreamBroadcastChannelRef.current.close(); } catch {}
        liveStreamBroadcastChannelRef.current = null;
      }
      return;
    }

    // 1. Fetch initial past comments once from database (single read, zero polling!)
    supabaseDb.fetchLiveComments(streamId).then(pastComments => {
      if (pastComments && pastComments.length > 0) {
        setCurrentLiveStream(prev => {
          if (prev.id !== streamId) return prev;
          const existingIds = new Set(prev.messages.map(m => m.id));
          const enriched = pastComments.map(c => {
            const author = users.find(u => isSameUser(u.id, c.userId));
            if (author) {
              return {
                ...c,
                displayName: (c.displayName && c.displayName !== 'Viewer') ? c.displayName : (author.displayName || author.username || 'User'),
                username: (c.username && c.username !== 'viewer') ? c.username : author.username,
                avatar: c.avatar || author.avatar || '',
              };
            }
            return c;
          });
          const toAdd = enriched.filter(c => !existingIds.has(c.id));
          if (toAdd.length === 0) return prev;
          return {
            ...prev,
            messages: [...prev.messages, ...toAdd],
          };
        });
      }
    });

    const handleIncomingComment = (msg: LiveStreamMessage) => {
      if (!msg || !msg.text) return;
      const author = users.find(u => isSameUser(u.id, msg.userId));
      const enrichedMsg: LiveStreamMessage = author
        ? {
            ...msg,
            displayName: (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author.displayName || author.username || 'User'),
            username: (msg.username && msg.username !== 'viewer') ? msg.username : author.username,
            avatar: msg.avatar || author.avatar || '',
          }
        : msg;

      setCurrentLiveStream(prev => {
        if (prev.messages.some(m => m.id === enrichedMsg.id)) return prev;
        return {
          ...prev,
          messages: [...prev.messages, enrichedMsg],
        };
      });
    };

    const handleViewerJoined = (viewer: LiveViewer) => {
      if (!viewer || !viewer.id) return;
      const isHostUser = Boolean(
        (currentUser && isSameUser(currentUser.id, currentLiveStream.host?.id)) ||
        activeTab === 'live_host_active'
      );

      setCurrentLiveStream(prev => {
        const alreadyExists = prev.viewers?.some(v => isSameUser(v.id, viewer.id));
        const nextViewers = alreadyExists
          ? (prev.viewers || [])
          : [...(prev.viewers || []), viewer];
        const nextCount = Math.max(nextViewers.length, prev.viewersCount, 1);

        // Automatic Notifier: (@user joined) in comment section on HOST VIEW ONLY!
        if (isHostUser && !alreadyExists && !isSameUser(viewer.id, prev.host?.id)) {
          const cleanUser = (viewer.username || `user_${String(viewer.id).slice(0, 5)}`).replace(/^@/, '');
          const joinMsg: LiveStreamMessage = {
            id: `sys_join_${viewer.id}_${Date.now()}`,
            userId: viewer.id,
            username: cleanUser,
            displayName: viewer.displayName || cleanUser,
            avatar: viewer.avatar || '',
            text: 'joined',
            timestamp: 'Just now',
            isSystemEvent: true,
            isJoinEvent: true,
          };
          return {
            ...prev,
            viewers: nextViewers,
            viewersCount: nextCount,
            messages: [...prev.messages, joinMsg],
          };
        }

        return {
          ...prev,
          viewers: nextViewers,
          viewersCount: nextCount,
        };
      });
    };

    const handleViewerLeft = (viewerId: string) => {
      if (!viewerId) return;
      setCurrentLiveStream(prev => {
        const nextViewers = (prev.viewers || []).filter(v => !isSameUser(v.id, viewerId));
        return {
          ...prev,
          viewers: nextViewers,
          viewersCount: nextViewers.length,
        };
      });
    };

    const handleFirstLike = (msg: LiveStreamMessage) => {
      if (!msg || !msg.userId) return;
      const likeKey = `${currentLiveStream.id}_${msg.userId}`;
      if (streamLikedUsersRef.current.has(likeKey)) return;
      streamLikedUsersRef.current.add(likeKey);

      setCurrentLiveStream(prev => {
        if (prev.messages.some(m => m.id === msg.id || (m.isLikeEvent && isSameUser(m.userId, msg.userId)))) {
          return prev;
        }
        return {
          ...prev,
          messages: [...prev.messages, msg],
        };
      });
    };

    // 2. Setup local BroadcastChannel for same-device cross-tab testing
    try {
      const bc = new BroadcastChannel(`live_chat_${streamId}`);
      bc.onmessage = (e) => {
        const data = e.data;
        if (!data) return;
        if (data.type === 'comment' && data.payload) {
          handleIncomingComment(data.payload);
        } else if (data.type === 'delete_comment' && data.payload?.commentId) {
          setCurrentLiveStream(prev => ({
            ...prev,
            messages: prev.messages.filter(m => m.id !== data.payload.commentId),
          }));
        } else if (data.type === 'like') {
          setLiveHeartTrigger(Date.now());
          if (data.payload && typeof data.payload.likesCount === 'number') {
            setCurrentLiveStream(prev => ({
              ...prev,
              likesCount: Math.max(prev.likesCount || 0, data.payload.likesCount),
            }));
          } else {
            setCurrentLiveStream(prev => ({
              ...prev,
              likesCount: (prev.likesCount || 0) + 1,
            }));
          }
        } else if (data.type === 'first_like' && data.payload) {
          handleFirstLike(data.payload);
        } else if (data.type === 'viewer_joined' && data.payload) {
          handleViewerJoined(data.payload);
        } else if (data.type === 'viewer_left' && data.payload) {
          handleViewerLeft(data.payload.userId || data.payload);
        } else if (data.type === 'stream_ended') {
          setCurrentLiveStream(prev => ({ ...prev, isLive: false }));
        }
      };
      liveStreamBroadcastChannelRef.current = bc;
    } catch {}

    // 3. Setup Supabase Realtime Channel (in-memory WebSocket broadcast, 0 Disk IO!)
    const client = getSupabaseClient();
    if (client) {
      try {
        const chan = client.channel(`live_chat_${streamId}`, {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: currentUser?.id || `viewer_${Date.now()}` },
          },
        });

        (chan as any)
          .on('broadcast', { event: 'comment' }, ({ payload }: { payload: LiveStreamMessage }) => {
            if (payload) {
              handleIncomingComment(payload);
            }
          })
          .on('broadcast', { event: 'delete_comment' }, ({ payload }: { payload?: { commentId: string } }) => {
            if (payload?.commentId) {
              setCurrentLiveStream(prev => ({
                ...prev,
                messages: prev.messages.filter(m => m.id !== payload.commentId),
              }));
            }
          })
          .on('broadcast', { event: 'like' }, ({ payload }: { payload?: any }) => {
            setLiveHeartTrigger(Date.now());
            if (payload && typeof payload.likesCount === 'number') {
              setCurrentLiveStream(prev => ({
                ...prev,
                likesCount: Math.max(prev.likesCount || 0, payload.likesCount),
              }));
            } else {
              setCurrentLiveStream(prev => ({
                ...prev,
                likesCount: (prev.likesCount || 0) + 1,
              }));
            }
          })
          .on('broadcast', { event: 'first_like' }, ({ payload }: { payload: LiveStreamMessage }) => {
            if (payload) {
              handleFirstLike(payload);
            }
          })
          .on('broadcast', { event: 'viewer_joined' }, ({ payload }: { payload: LiveViewer }) => {
            if (payload) {
              handleViewerJoined(payload);
            }
          })
          .on('broadcast', { event: 'viewer_left' }, ({ payload }: { payload: any }) => {
            if (payload) {
              handleViewerLeft(payload.userId || payload);
            }
          })
          .on('broadcast', { event: 'stream_ended' }, () => {
            setCurrentLiveStream(prev => ({ ...prev, isLive: false }));
          })
          .on('presence', { event: 'sync' }, () => {
            const state = chan.presenceState();
            const rawPresences = Object.values(state).flat() as any[];
            const hostId = currentLiveStream.host?.id;
            const viewerMap = new Map<string, LiveViewer>();

            for (const p of rawPresences) {
              if (p && !p.is_host && p.user_id && (!hostId || !isSameUser(p.user_id, hostId))) {
                if (!viewerMap.has(p.user_id)) {
                  viewerMap.set(p.user_id, {
                    id: p.user_id,
                    username: (p.username || `user_${String(p.user_id).slice(0, 5)}`).replace(/^@/, ''),
                    displayName: p.displayName || p.username || 'Viewer',
                    avatar: p.avatar || '',
                    joinedAt: p.online_at || new Date().toISOString(),
                  });
                }
              }
            }

            const activePresViewers = Array.from(viewerMap.values());
            if (activePresViewers.length > 0) {
              setCurrentLiveStream(prev => {
                const mergedMap = new Map<string, LiveViewer>();
                (prev.viewers || []).forEach(v => mergedMap.set(v.id, v));
                activePresViewers.forEach(v => mergedMap.set(v.id, v));
                const allViewers = Array.from(mergedMap.values());
                return {
                  ...prev,
                  viewers: allViewers,
                  viewersCount: Math.max(allViewers.length, prev.viewersCount, 1),
                };
              });
            }
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              chan.track({
                user_id: currentUser?.id,
                username: currentUser?.username,
                displayName: currentUser?.displayName,
                avatar: currentUser?.avatar || '',
                online_at: new Date().toISOString(),
                is_host: activeTab === 'live_host_active' || isSameUser(currentUser?.id, currentLiveStream.host?.id),
              });

              // If joining as a viewer, announce join over realtime broadcast (<50ms, 0 disk IO!)
              if (!isSameUser(currentUser?.id, currentLiveStream.host?.id) && activeTab !== 'live_host_active') {
                const myViewerObj: LiveViewer = {
                  id: currentUser?.id || `viewer_${Date.now()}`,
                  username: (currentUser?.username || 'viewer').replace(/^@/, ''),
                  displayName: currentUser?.displayName || currentUser?.username || 'Viewer',
                  avatar: currentUser?.avatar || '',
                  joinedAt: new Date().toISOString(),
                };
                chan.send({
                  type: 'broadcast',
                  event: 'viewer_joined',
                  payload: myViewerObj,
                });
              }
            }
          });

        liveStreamChannelRef.current = chan;
      } catch (err) {
        console.warn('Realtime channel error in AppContext:', err);
      }
    }

    // Connect host WebRTC join listener directly to viewer tracking
    liveBroadcastService.setOnViewerJoined((vUser) => {
      if (vUser && vUser.id) {
        handleViewerJoined({
          id: vUser.id,
          username: (vUser.username || `user_${String(vUser.id).slice(0, 5)}`).replace(/^@/, ''),
          displayName: vUser.displayName || vUser.username || 'Viewer',
          avatar: vUser.avatar || '',
          joinedAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      liveBroadcastService.setOnViewerJoined(null);
      if (liveStreamChannelRef.current) {
        try { liveStreamChannelRef.current.unsubscribe(); } catch {}
        liveStreamChannelRef.current = null;
      }
      if (liveStreamBroadcastChannelRef.current) {
        try { liveStreamBroadcastChannelRef.current.close(); } catch {}
        liveStreamBroadcastChannelRef.current = null;
      }
    };
  }, [currentLiveStream.id, activeTab, currentUser?.id]);

  const openLiveStreamAsViewer = (streamId: string, fallbackStream?: LiveStream) => {
    const target = activeLiveStreams.find(s => s.id === streamId || toUuid(s.id) === toUuid(streamId)) || fallbackStream;
    const viewerObj: LiveViewer = {
      id: currentUser?.id || `viewer_${Date.now()}`,
      username: (currentUser?.username || 'viewer').replace(/^@/, ''),
      displayName: currentUser?.displayName || currentUser?.username || 'Viewer',
      avatar: currentUser?.avatar || '',
      joinedAt: new Date().toISOString(),
    };

    if (target) {
      const existingViewers = target.viewers || [];
      const hasMe = existingViewers.some(v => isSameUser(v.id, viewerObj.id));
      const nextViewers = hasMe ? existingViewers : [...existingViewers, viewerObj];
      setCurrentLiveStream({
        ...target,
        id: streamId || target.id,
        viewers: nextViewers,
        viewersCount: Math.max(nextViewers.length, target.viewersCount, 1),
        messages: target.messages || [],
      });
      // Ensure it is in active live streams list
      setActiveLiveStreams(prev => {
        if (!prev.some(s => s.id === target.id || toUuid(s.id) === toUuid(target.id))) {
          return [target, ...prev];
        }
        return prev;
      });
    } else {
      setCurrentLiveStream(prev => ({
        ...prev,
        id: streamId,
        isLive: true,
        viewers: [viewerObj],
        viewersCount: Math.max(1, prev.viewersCount),
        messages: [],
      }));
    }

    // Announce viewer joined to host over Realtime and local BroadcastChannel (<50ms, 0 disk IO!)
    try {
      const quickBc = new BroadcastChannel(`live_chat_${streamId}`);
      quickBc.postMessage({ type: 'viewer_joined', payload: viewerObj });
      setTimeout(() => {
        try { quickBc.postMessage({ type: 'viewer_joined', payload: viewerObj }); } catch {}
        try { quickBc.close(); } catch {}
      }, 600);
    } catch {}

    setTimeout(() => {
      try {
        if (liveStreamChannelRef.current) {
          liveStreamChannelRef.current.send({
            type: 'broadcast',
            event: 'viewer_joined',
            payload: viewerObj,
          });
        }
      } catch {}
      try {
        if (liveStreamBroadcastChannelRef.current) {
          liveStreamBroadcastChannelRef.current.postMessage({
            type: 'viewer_joined',
            payload: viewerObj,
          });
        }
      } catch {}
    }, 250);

    setActiveTab('live_viewer');
  };

  const removeActiveLiveStream = (streamId: string) => {
    setActiveLiveStreams(prev => prev.filter(s => s.id !== streamId && toUuid(s.id) !== toUuid(streamId)));
    if (currentLiveStream.id === streamId || toUuid(currentLiveStream.id) === toUuid(streamId)) {
      setCurrentLiveStream(prev => ({ ...prev, isLive: false }));
    }
  };

  const sendLiveComment = (text: string) => {
    if (!currentUser || !text.trim() || !currentLiveStream.id) return;
    const cleanText = text.trim();
    const msgId = `lm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newLiveMsg: LiveStreamMessage = {
      id: msgId,
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName || currentUser.username || 'User',
      avatar: currentUser.avatar || '',
      text: cleanText,
      timestamp: 'Just now',
    };

    // 1. Optimistic update so sender sees comment with 0 latency
    setCurrentLiveStream(prev => ({
      ...prev,
      messages: [...prev.messages, newLiveMsg],
    }));

    // 2. Realtime WebSocket Broadcast to Host Studio and all Viewers (0 Disk IO!)
    try {
      if (liveStreamChannelRef.current) {
        liveStreamChannelRef.current.send({
          type: 'broadcast',
          event: 'comment',
          payload: newLiveMsg,
        });
      }
    } catch (err) {
      console.warn('Live comment broadcast error', err);
    }

    // 3. Local BroadcastChannel for same-device cross-tab testing
    try {
      if (liveStreamBroadcastChannelRef.current) {
        liveStreamBroadcastChannelRef.current.postMessage({
          type: 'comment',
          payload: newLiveMsg,
        });
      }
    } catch {}

    // 4. Async database persistence (single insert, safe fallback)
    supabaseDb.insertLiveComment(currentLiveStream.id, currentUser, cleanText);
  };

  const deleteLiveComment = async (commentId: string) => {
    if (!commentId) return;

    // 1. Optimistic removal from state immediately
    setCurrentLiveStream(prev => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== commentId),
    }));

    // 2. Realtime broadcast to all viewers and host (0 disk IO!)
    try {
      if (liveStreamChannelRef.current) {
        liveStreamChannelRef.current.send({
          type: 'broadcast',
          event: 'delete_comment',
          payload: { commentId },
        });
      }
    } catch {}

    try {
      if (liveStreamBroadcastChannelRef.current) {
        liveStreamBroadcastChannelRef.current.postMessage({
          type: 'delete_comment',
          payload: { commentId },
        });
      }
    } catch {}

    // 3. Database deletion
    await supabaseDb.deleteLiveComment(commentId);
  };

  const sendLiveLike = () => {
    if (!currentLiveStream.id || !currentUser) return;
    setLiveHeartTrigger(Date.now());

    const nextLikes = (currentLiveStream.likesCount || 0) + 1;
    setCurrentLiveStream(prev => ({
      ...prev,
      likesCount: nextLikes,
    }));

    // Single notifier per user even if they spam like
    const userLikeKey = `${currentLiveStream.id}_${currentUser.id}`;
    const isFirstLike = !streamLikedUsersRef.current.has(userLikeKey);

    if (isFirstLike) {
      streamLikedUsersRef.current.add(userLikeKey);
      const cleanUser = (currentUser.username || 'user').replace(/^@/, '');
      const likeMsg: LiveStreamMessage = {
        id: `sys_like_${currentUser.id}_${Date.now()}`,
        userId: currentUser.id,
        username: cleanUser,
        displayName: currentUser.displayName || cleanUser,
        avatar: currentUser.avatar || '',
        text: 'liked the stream',
        timestamp: 'Just now',
        isSystemEvent: true,
        isLikeEvent: true,
      };

      // Add locally for the sender
      setCurrentLiveStream(prev => ({
        ...prev,
        messages: [...prev.messages, likeMsg],
      }));

      // Broadcast single like comment to both host and other viewers (0 Disk IO!)
      try {
        if (liveStreamChannelRef.current) {
          liveStreamChannelRef.current.send({
            type: 'broadcast',
            event: 'first_like',
            payload: likeMsg,
          });
        }
      } catch {}
      try {
        if (liveStreamBroadcastChannelRef.current) {
          liveStreamBroadcastChannelRef.current.postMessage({
            type: 'first_like',
            payload: likeMsg,
          });
        }
      } catch {}
    }

    // Always broadcast like heart event with synchronized like counter
    try {
      if (liveStreamChannelRef.current) {
        liveStreamChannelRef.current.send({
          type: 'broadcast',
          event: 'like',
          payload: { userId: currentUser?.id, timestamp: Date.now(), likesCount: nextLikes },
        });
      }
    } catch {}
    try {
      if (liveStreamBroadcastChannelRef.current) {
        liveStreamBroadcastChannelRef.current.postMessage({
          type: 'like',
          payload: { userId: currentUser?.id, timestamp: Date.now(), likesCount: nextLikes },
        });
      }
    } catch {}
  };

  const startHostLiveStream = (
    title: string,
    topic: string,
    aboutMe: string,
    customStreamId?: string,
    options?: { aspectRatio?: '9:16' | '16:9'; isMobileStream?: boolean }
  ) => {
    if (!currentUser) return;
    streamLikedUsersRef.current.clear();
    // Always generate a clean standard UUID v4 for the stream so IDs NEVER diverge!
    const streamId = customStreamId || generateUuid();
    const newStream: LiveStream = {
      ...currentLiveStream,
      id: streamId,
      host: currentUser,
      title: title || 'Live Stream',
      topic: topic || 'Gaming',
      aboutMe: aboutMe || 'Welcome to my stream!',
      isLive: true,
      timerSeconds: 0,
      viewersCount: 0,
      viewers: [],
      messages: [],
      likesCount: 0,
      aspectRatio: options?.aspectRatio || '9:16',
      isMobileStream: options?.isMobileStream || false,
    };
    setCurrentLiveStream(newStream);
    setActiveLiveStreams(prev => {
      const filtered = prev.filter(s => s.id !== streamId && toUuid(s.id) !== toUuid(streamId));
      return [newStream, ...filtered];
    });

    // 1. Asynchronously persist to Supabase
    supabaseDb.upsertLiveStream(newStream);

    // 2. Realtime WebSocket Broadcast and Presence to ALL other devices (<50ms, 0 Disk IO!)
    try {
      if (globalLiveStreamsChannelRef.current) {
        globalLiveStreamsChannelRef.current.send({
          type: 'broadcast',
          event: 'stream_started',
          payload: newStream,
        });
        globalLiveStreamsChannelRef.current.track({
          streamId: newStream.id,
          stream: newStream,
          isHost: true,
          startedAt: Date.now(),
        });
      }
    } catch {}

    // 3. Same-device cross-tab BroadcastChannel
    try {
      if (globalLiveBroadcastChannelRef.current) {
        globalLiveBroadcastChannelRef.current.postMessage({
          type: 'stream_started',
          payload: newStream,
        });
      }
    } catch {}

    setActiveTab('live_host_active');
  };

  const endHostLiveStream = () => {
    const streamId = currentLiveStream.id;
    if (streamId) {
      supabaseDb.endLiveStream(streamId);

      // Broadcast stream ended to stream channel
      try {
        if (liveStreamChannelRef.current) {
          liveStreamChannelRef.current.send({
            type: 'broadcast',
            event: 'stream_ended',
            payload: { streamId },
          });
        }
      } catch {}
      try {
        if (liveStreamBroadcastChannelRef.current) {
          liveStreamBroadcastChannelRef.current.postMessage({
            type: 'stream_ended',
            streamId,
          });
        }
      } catch {}

      // Broadcast stream ended to global discovery channel and untrack presence
      try {
        if (globalLiveStreamsChannelRef.current) {
          globalLiveStreamsChannelRef.current.send({
            type: 'broadcast',
            event: 'stream_ended',
            payload: { streamId },
          });
          globalLiveStreamsChannelRef.current.untrack();
        }
      } catch {}
      try {
        if (globalLiveBroadcastChannelRef.current) {
          globalLiveBroadcastChannelRef.current.postMessage({
            type: 'stream_ended',
            payload: { streamId },
          });
        }
      } catch {}
    }
    setCurrentLiveStream(prev => ({
      ...prev,
      isLive: false,
    }));
    setActiveLiveStreams(prev => prev.filter(s => s.id !== streamId));
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

  const addAudioTrack = async (trackData: Omit<AudioTrack, 'id'> | AudioTrack): Promise<AudioTrack & { dbSuccess?: boolean; dbError?: string; isRlsBlocked?: boolean; isMissingColumns?: boolean }> => {
    const id = ('id' in trackData && trackData.id && isUuid(trackData.id))
      ? trackData.id
      : crypto.randomUUID();

    const newTrack: AudioTrack = {
      ...trackData,
      id,
    };

    setAudioTracksList(prev => {
      const filtered = (prev || []).filter(t => t.id !== id);
      const updated = [newTrack, ...filtered];
      storage.set('audioTracks', updated);
      return updated;
    });

    const dbRes = await supabaseDb.insertAudioTrack(newTrack);
    return {
      ...newTrack,
      dbSuccess: dbRes.success,
      dbError: dbRes.error,
      isRlsBlocked: dbRes.isRlsBlocked,
      isMissingColumns: dbRes.isMissingColumns,
    };
  };

  const deleteAudioTrack = async (trackId: string): Promise<boolean> => {
    setAudioTracksList(prev => {
      const updated = (prev || []).filter(t => t.id !== trackId);
      storage.set('audioTracks', updated);
      return updated;
    });

    supabaseDb.deleteAudioTrack(trackId).catch(() => {});
    return true;
  };

  const refreshAudioTracks = useCallback(async (force = false): Promise<void> => {
    try {
      const remote = await supabaseDb.fetchAudioTracks(force);
      if (remote && remote.length > 0) {
        const validRemote = remote.filter(t => !isDeprecatedDefaultTrack(t));
        setAudioTracksList(prev => {
          const map = new Map<string, AudioTrack>();
          prev.filter(t => !isDeprecatedDefaultTrack(t)).forEach(t => map.set(t.id, t));
          validRemote.forEach(t => map.set(t.id, t));
          const merged = Array.from(map.values());
          storage.set('audioTracks', merged);
          return merged;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Admin Operations
  const addAdmin = async (adminData: Partial<AdminRecord>): Promise<boolean> => {
    const cleanUsername = (adminData.username || 'admin').trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = (adminData.email || `${cleanUsername}@viralhub.app`).trim().toLowerCase();

    // Check if user already exists in users list
    const existingUser = users.find(
      u => (u.email && u.email.trim().toLowerCase() === cleanEmail) ||
           (u.username && u.username.trim().toLowerCase().replace(/^@/, '') === cleanUsername)
    );

    const resolvedUserId = adminData.userId || existingUser?.id;

    const newAdmin: AdminRecord = {
      adminId: adminData.adminId || (resolvedUserId ? toUuid(resolvedUserId) : crypto.randomUUID()),
      userId: resolvedUserId,
      username: cleanUsername,
      email: cleanEmail,
      role: 'Admin',
      permissions: adminData.permissions || ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    setAdmins(prev => {
      const filtered = prev.filter(
        a => a.email?.toLowerCase() !== cleanEmail &&
             a.username?.toLowerCase() !== cleanUsername &&
             a.adminId !== newAdmin.adminId
      );
      const updated = [newAdmin, ...filtered];
      storage.set('admins', updated);
      return updated;
    });

    // Also update users state: mark existing user as role: 'admin' or add placeholder
    setUsers(prev => {
      const exists = prev.some(
        u => (u.email && u.email.trim().toLowerCase() === cleanEmail) ||
             (u.username && u.username.trim().toLowerCase().replace(/^@/, '') === cleanUsername)
      );
      let nextUsers: User[];
      if (exists) {
        nextUsers = prev.map(u => {
          if (
            (u.email && u.email.trim().toLowerCase() === cleanEmail) ||
            (u.username && u.username.trim().toLowerCase().replace(/^@/, '') === cleanUsername)
          ) {
            return { ...u, role: 'admin' as const };
          }
          return u;
        });
      } else {
        const placeholderUser: User = {
          id: resolvedUserId || crypto.randomUUID(),
          username: cleanUsername,
          displayName: cleanUsername,
          email: cleanEmail,
          avatar: '',
          bio: 'Platform Administrator',
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: false,
          role: 'admin',
          isBanned: false,
          appealStatus: 'none',
        };
        nextUsers = [placeholderUser, ...prev];
      }
      storage.set('users', nextUsers);
      return nextUsers;
    });

    const success = await supabaseDb.upsertAdmin(newAdmin);
    return success;
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
    const targetAdmin = admins.find(a => a.adminId === adminId || a.userId === adminId);
    const targetEmail = targetAdmin?.email?.toLowerCase();
    const targetUserId = targetAdmin?.userId || adminId;

    setAdmins(prev => {
      const updated = prev.filter(a => a.adminId !== adminId && a.userId !== adminId);
      storage.set('admins', updated);
      return updated;
    });

    // Also demote in users state back to creator
    setUsers(prev => {
      const updated = prev.map(u => {
        if (
          (targetUserId && isSameUser(u.id, targetUserId)) ||
          (targetEmail && u.email && u.email.toLowerCase() === targetEmail)
        ) {
          return { ...u, role: 'creator' as const };
        }
        return u;
      });
      storage.set('users', updated);
      return updated;
    });

    await supabaseDb.deleteAdmin(adminId, targetEmail);
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

  const updateVideoAudience = async (
    videoId: string,
    audience: 'public' | 'friends' | 'only_me'
  ): Promise<boolean> => {
    const privacy: 'friends' | 'private' | 'public' = audience === 'only_me' ? 'private' : audience === 'friends' ? 'friends' : 'public';
    setVideos(prev => {
      const next = prev.map(v => {
        if (v.id === videoId || toUuid(v.id) === toUuid(videoId)) {
          return {
            ...v,
            audience,
            privacy,
          };
        }
        return v;
      });
      storage.set('videos', next);
      return next;
    });

    try {
      await supabaseDb.updateVideoAudience(videoId, audience);
    } catch (e) {
      console.warn('Supabase updateVideoAudience error:', e);
    }
    return true;
  };

  const deleteVideoAdmin = async (videoId: string): Promise<boolean> => {
    return deleteVideo(videoId);
  };

  const updateUserRoleAdmin = async (
    userId: string,
    newRole: 'creator' | 'admin'
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
    type: 'video' | 'user' | 'live_stream',
    status: 'Approved' | 'Rejected' | 'Under Review' | 'Warning Issued' | 'Appeal Submitted'
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

  const issueUserWarningAdmin = async (
    userId: string,
    reason = 'Violation of Community Guidelines',
    deadlineHours = 24,
    reportId?: string
  ): Promise<boolean> => {
    const finalReason = reason.trim() || 'Violation of Community Guidelines';
    const nowIso = new Date().toISOString();
    const deadlineIso = new Date(Date.now() + (deadlineHours || 24) * 3600 * 1000).toISOString();

    const targetUser =
      users.find(u => isSameUser(u.id, userId) || u.username?.toLowerCase() === userId.toLowerCase() || u.email?.toLowerCase() === userId.toLowerCase()) ||
      savedAccounts.find(u => isSameUser(u.id, userId) || u.username?.toLowerCase() === userId.toLowerCase() || u.email?.toLowerCase() === userId.toLowerCase());

    const resolvedUserId = targetUser ? targetUser.id : userId;
    const resolvedEmail = targetUser?.email ? targetUser.email.toLowerCase() : null;
    const resolvedUsername = targetUser?.username ? targetUser.username.toLowerCase() : null;

    // 1. Record warning in registry
    recordUserWarning({
      userId: resolvedUserId,
      username: resolvedUsername,
      email: resolvedEmail,
      warningReason: finalReason,
      warningIssuedAt: nowIso,
      warningDeadline: deadlineIso,
      preBanAppealStatus: 'none',
    });

    // 2. Update users list
    setUsers(prev => {
      const next = prev.map(u => {
        if (isSameUser(u.id, resolvedUserId) || (resolvedEmail && u.email?.toLowerCase() === resolvedEmail)) {
          return {
            ...u,
            warningActive: true,
            warningReason: finalReason,
            warningIssuedAt: nowIso,
            warningDeadline: deadlineIso,
            preBanAppealStatus: 'none' as const,
            preBanAppealReason: undefined,
            preBanAppealProofUrl: undefined,
            preBanAppealProofName: undefined,
            preBanAppealSubmittedAt: undefined,
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
        if (isSameUser(a.id, resolvedUserId) || (resolvedEmail && a.email?.toLowerCase() === resolvedEmail)) {
          return {
            ...a,
            warningActive: true,
            warningReason: finalReason,
            warningIssuedAt: nowIso,
            warningDeadline: deadlineIso,
            preBanAppealStatus: 'none' as const,
          };
        }
        return a;
      });
      storage.set('saved_accounts_v2', next);
      return next;
    });

    // 4. Update currentUser if that user is currently active
    if (currentUser && (isSameUser(currentUser.id, resolvedUserId) || (resolvedEmail && currentUser.email?.toLowerCase() === resolvedEmail))) {
      const updatedUser: User = {
        ...currentUser,
        warningActive: true,
        warningReason: finalReason,
        warningIssuedAt: nowIso,
        warningDeadline: deadlineIso,
        preBanAppealStatus: 'none',
      };
      setCurrentUser(updatedUser);
      storage.set('currentUser', updatedUser);
    }

    // 5. Update related reports
    setReports(prev => {
      const next = prev.map(r => {
        const matchesTarget = isSameUser(r.targetId, resolvedUserId) || (reportId && (r.id === reportId || toUuid(r.id) === toUuid(reportId)));
        if (matchesTarget && r.type === 'user') {
          return {
            ...r,
            status: 'Warning Issued' as const,
            warningReason: finalReason,
            warningIssuedAt: nowIso,
            warningDeadline: deadlineIso,
            appealStatus: 'none' as const,
          };
        }
        return r;
      });
      storage.set('reports', next);
      return next;
    });

    // 6. Send high-priority notification to target user
    const warningNotif: NotificationItem = {
      id: `notif_warn_${Date.now()}`,
      recipientId: resolvedUserId,
      recipientEmail: resolvedEmail || undefined,
      type: 'account_warning',
      actor: {
        id: 'viralhub_moderation',
        username: 'moderation',
        displayName: 'ViralHub Moderation',
        avatar: '',
      },
      targetText: `Urgent: Your account was flagged for "${finalReason}". You have ${deadlineHours}h to submit an appeal and counter-proof before suspension.`,
      warningReason: finalReason,
      warningDeadline: deadlineIso,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([warningNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(warningNotif, resolvedUserId);

    if (reportId) {
      await supabaseDb.updateReportStatus(reportId, 'user', 'Warning Issued');
    }

    // 7. Broadcast event so other open tabs update
    storage.set('viralhub_user_warning_event', {
      userId: resolvedUserId,
      email: resolvedEmail,
      username: resolvedUsername,
      warningReason: finalReason,
      warningDeadline: deadlineIso,
      timestamp: Date.now(),
    });

    return true;
  };

  const submitPreBanAppeal = async (
    reason: string,
    proofUrl?: string,
    proofName?: string
  ): Promise<boolean> => {
    if (!currentUser) return false;
    const cleanReason = reason.trim();
    if (!cleanReason) return false;
    const nowIso = new Date().toISOString();

    // 1. Update currentUser
    const updatedUser: User = {
      ...currentUser,
      preBanAppealStatus: 'pending',
      preBanAppealReason: cleanReason,
      preBanAppealProofUrl: proofUrl,
      preBanAppealProofName: proofName,
      preBanAppealSubmittedAt: nowIso,
    };
    setCurrentUser(updatedUser);
    storage.set('currentUser', updatedUser);

    // 2. Update warnings registry
    recordUserWarning({
      userId: currentUser.id,
      username: currentUser.username,
      email: currentUser.email,
      warningReason: currentUser.warningReason,
      warningIssuedAt: currentUser.warningIssuedAt,
      warningDeadline: currentUser.warningDeadline,
      preBanAppealStatus: 'pending',
      preBanAppealReason: cleanReason,
      preBanAppealProofUrl: proofUrl,
      preBanAppealProofName: proofName,
      preBanAppealSubmittedAt: nowIso,
    });

    // 3. Update users list
    setUsers(prev => {
      const next = prev.map(u => {
        if (isSameUser(u.id, currentUser.id)) {
          return {
            ...u,
            preBanAppealStatus: 'pending' as const,
            preBanAppealReason: cleanReason,
            preBanAppealProofUrl: proofUrl,
            preBanAppealProofName: proofName,
            preBanAppealSubmittedAt: nowIso,
          };
        }
        return u;
      });
      storage.set('users', next);
      return next;
    });

    // 4. Update saved accounts
    setSavedAccounts(prev => {
      const next = prev.map(a => {
        if (isSameUser(a.id, currentUser.id)) {
          return {
            ...a,
            preBanAppealStatus: 'pending' as const,
            preBanAppealReason: cleanReason,
            preBanAppealProofUrl: proofUrl,
            preBanAppealProofName: proofName,
            preBanAppealSubmittedAt: nowIso,
          };
        }
        return a;
      });
      storage.set('saved_accounts_v2', next);
      return next;
    });

    // 5. Update related reports in state
    setReports(prev => {
      const next = prev.map(r => {
        if (isSameUser(r.targetId, currentUser.id) && r.type === 'user') {
          return {
            ...r,
            status: 'Appeal Submitted' as const,
            appealStatus: 'pending' as const,
            appealReason: cleanReason,
            appealProofUrl: proofUrl,
            appealProofName: proofName,
            appealSubmittedAt: nowIso,
          };
        }
        return r;
      });
      storage.set('reports', next);
      return next;
    });

    // 6. Notify admin team
    const adminNotif: NotificationItem = {
      id: `notif_appeal_proof_${Date.now()}`,
      recipientId: 'admin',
      type: 'pre_ban_appeal_update',
      actor: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
      },
      targetText: `User @${currentUser.username} submitted pre-ban appeal with supporting proof: "${cleanReason.slice(0, 70)}..."`,
      appealReason: cleanReason,
      proofUrl: proofUrl,
      timestamp: nowIso,
      createdAt: nowIso,
      isUnread: true,
    };

    setNotifications(prev => {
      const next = deduplicateNotifications([adminNotif, ...prev]);
      storage.set('notifications', next);
      return next;
    });
    supabaseDb.insertNotification(adminNotif, 'admin');

    // 7. Update Supabase reports
    for (const r of reports.filter(rep => isSameUser(rep.targetId, currentUser.id) && rep.type === 'user')) {
      await supabaseDb.updateReportStatus(r.id, 'user', 'Appeal Submitted');
    }

    return true;
  };

  const resolvePreBanAppealAdmin = async (
    userId: string,
    decision: 'approved' | 'declined',
    reportId?: string
  ): Promise<boolean> => {
    const isApproved = decision === 'approved';
    const nowIso = new Date().toISOString();

    const targetUser =
      users.find(u => isSameUser(u.id, userId) || u.username?.toLowerCase() === userId.toLowerCase() || u.email?.toLowerCase() === userId.toLowerCase()) ||
      savedAccounts.find(u => isSameUser(u.id, userId) || u.username?.toLowerCase() === userId.toLowerCase() || u.email?.toLowerCase() === userId.toLowerCase());

    const resolvedUserId = targetUser ? targetUser.id : userId;
    const resolvedEmail = targetUser?.email ? targetUser.email.toLowerCase() : null;
    const resolvedUsername = targetUser?.username ? targetUser.username.toLowerCase() : null;
    const banOrWarningReason = targetUser?.warningReason || 'Violation of Community Guidelines';

    if (isApproved) {
      // 1. User provided valid proof! Clear warning, restore clean standing
      clearUserWarning(resolvedUserId, resolvedEmail, resolvedUsername);

      // Update users list
      setUsers(prev => {
        const next = prev.map(u => {
          if (isSameUser(u.id, resolvedUserId) || (resolvedEmail && u.email?.toLowerCase() === resolvedEmail)) {
            return {
              ...u,
              warningActive: false,
              warningReason: undefined,
              warningDeadline: undefined,
              preBanAppealStatus: 'approved' as const,
            };
          }
          return u;
        });
        storage.set('users', next);
        return next;
      });

      // Update savedAccounts
      setSavedAccounts(prev => {
        const next = prev.map(a => {
          if (isSameUser(a.id, resolvedUserId) || (resolvedEmail && a.email?.toLowerCase() === resolvedEmail)) {
            return {
              ...a,
              warningActive: false,
              warningReason: undefined,
              warningDeadline: undefined,
              preBanAppealStatus: 'approved' as const,
            };
          }
          return a;
        });
        storage.set('saved_accounts_v2', next);
        return next;
      });

      // If currentUser is this user
      if (currentUser && (isSameUser(currentUser.id, resolvedUserId) || (resolvedEmail && currentUser.email?.toLowerCase() === resolvedEmail))) {
        const updated = {
          ...currentUser,
          warningActive: false,
          warningReason: undefined,
          warningDeadline: undefined,
          preBanAppealStatus: 'approved' as const,
        };
        setCurrentUser(updated);
        storage.set('currentUser', updated);
      }

      // Update report status
      setReports(prev => {
        const next = prev.map(r => {
          const matches = isSameUser(r.targetId, resolvedUserId) || (reportId && (r.id === reportId || toUuid(r.id) === toUuid(reportId)));
          if (matches && r.type === 'user') {
            return {
              ...r,
              status: 'Rejected' as const, // Dismissed/exonerated
              appealStatus: 'approved' as const,
            };
          }
          return r;
        });
        storage.set('reports', next);
        return next;
      });

      // Send positive notification to user
      const approvedNotif: NotificationItem = {
        id: `notif_appeal_ok_${Date.now()}`,
        recipientId: resolvedUserId,
        recipientEmail: resolvedEmail || undefined,
        type: 'pre_ban_appeal_update',
        actor: {
          id: 'viralhub_moderation',
          username: 'moderation',
          displayName: 'ViralHub Moderation',
          avatar: '',
        },
        targetText: `Great news: Your pre-ban appeal and evidence were accepted! The warning has been dismissed and your account remains in good standing.`,
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

      if (reportId) {
        await supabaseDb.updateReportStatus(reportId, 'user', 'Rejected');
      }

      return true;
    } else {
      // 2. User's proof was invalid or deadline expired: Decline & Proceed to Ban
      clearUserWarning(resolvedUserId, resolvedEmail, resolvedUsername);

      // Call banUserAdmin to enact the official suspension
      await banUserAdmin(resolvedUserId, `Appeal declined: ${banOrWarningReason}`);

      // Update report status
      setReports(prev => {
        const next = prev.map(r => {
          const matches = isSameUser(r.targetId, resolvedUserId) || (reportId && (r.id === reportId || toUuid(r.id) === toUuid(reportId)));
          if (matches && r.type === 'user') {
            return {
              ...r,
              status: 'Approved' as const, // Action taken
              appealStatus: 'declined' as const,
            };
          }
          return r;
        });
        storage.set('reports', next);
        return next;
      });

      if (reportId) {
        await supabaseDb.updateReportStatus(reportId, 'user', 'Approved');
      }

      return true;
    }
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
        isAuthLoading,
        authView,
        setAuthView,
        login,
        register,
        loginWithGoogle,
        logout,
        quickLoginAs,
        prepareAddNewAccount,
        activeTab,
        setActiveTab,
        selectedUserId,
        navigateToUserProfile,
        users,
        videos: activeVideos,
        audioTracks,
        audioTracksList,
        addAudioTrack,
        deleteAudioTrack,
        refreshAudioTracks,
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
        shareLiveStreamToUser,
        updateVideoAudience,
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
        activeLiveStreams,
        refreshActiveLiveStreams,
        openLiveStreamAsViewer,
        sendLiveComment,
        deleteLiveComment,
        sendLiveLike,
        liveHeartTrigger,
        removeActiveLiveStream,
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
        issueUserWarningAdmin,
        submitPreBanAppeal,
        resolvePreBanAppealAdmin,
        preBanAppealModalOpen,
        setPreBanAppealModalOpen,
        syncAllToSupabase,
        switchAccountModalOpen,
        setSwitchAccountModalOpen,
        savedAccounts,
        removeSavedAccount,
        userLikes,
        getUserLikedVideos,
        feedRefreshKey,
        refreshFeed,
        themeMode,
        setThemeMode,
        resolvedTheme,
        addCustomNotification,
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
