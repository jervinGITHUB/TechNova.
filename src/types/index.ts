export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar: string;
  bio: string;
  followingCount: number;
  followersCount: number;
  likesCount: string | number;
  isPrivate: boolean;
  isFollowing?: boolean;
  isBlocked?: boolean;
  isReported?: boolean;
  role?: 'creator' | 'admin';
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  appealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  appealReason?: string;
  appealSubmittedAt?: string;
  authProvider?: 'google' | 'email';
  // Pre-ban due-process warning & proof fields:
  warningActive?: boolean;
  warningReason?: string;
  warningIssuedAt?: string;
  warningDeadline?: string;
  preBanAppealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  preBanAppealReason?: string;
  preBanAppealProofUrl?: string;
  preBanAppealProofName?: string;
  preBanAppealSubmittedAt?: string;
}

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string; // e.g. "00:30"
  coverUrl: string;
  audioUrl?: string;
  sourceVideoId?: string;
  sourceUsername?: string;
  category?: string;
  useCount?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface CommentReplyEntry {
  id: string;
  name: string;
  avatar: string;
  text: string;
  timestamp?: string;
  userId?: string;
  likesCount?: number;
  isLiked?: boolean;
  likedBy?: string[];
}

export interface CommentEntry {
  id: string;
  name: string;
  avatar: string;
  text: string;
  timestamp?: string;
  likesCount?: number;
  isLiked?: boolean;
  likedBy?: string[];
  replyTo?: string;
  userId?: string;
  replies?: CommentReplyEntry[];
}

export interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  text: string;
  createdAt: string;
  likesCount?: number;
  replyToId?: string;
  replies?: VideoComment[];
}

export interface Video {
  id: string;
  creatorId: string;
  creator: User;
  caption: string;
  hashtags: string[];
  audioTrack?: AudioTrack;
  mediaUrl: string;
  thumbnailUrl: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount?: string;
  isLiked?: boolean;
  createdAt: string;
  reportsCount?: number;
  status?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  appealReason?: string;
  appealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  appealTimestamp?: string;
  audioVolume?: number;
  originalAudioMuted?: boolean;
  originalAudioVolume?: number;
  audioStartTime?: number;
  audioEndTime?: number;
  audience?: 'public' | 'friends' | 'only_me';
  privacy?: 'public' | 'friends' | 'private';
}

export interface MessageReplyInfo {
  id: string;
  senderName: string;
  text: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  sentAt?: string;
  isMine: boolean;
  status: 'sent' | 'delivered' | 'read';
  replyTo?: MessageReplyInfo;
  deletedForUserIds?: string[];
  sharedVideo?: Video;
  sharedVideoId?: string;
}

export interface Conversation {
  id: string;
  participantIds?: string[];
  participant: User;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  unreadCounts?: { [userId: string]: number };
  messages: Message[];
  isOnline?: boolean;
  lastSeen?: string;
  deletedForUserIds?: string[];
  clearedHistoryAt?: { [userId: string]: number };
}

export interface FollowRelation {
  followerId: string;
  followingId: string;
}

export interface FollowRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  timestamp: string;
}

export type FollowStatus = 'none' | 'requested' | 'following' | 'friends';

export type ThemeMode = 'auto' | 'dark' | 'light';

export interface NotificationItem {
  id: string;
  recipientId?: string;
  recipientEmail?: string;
  type:
    | 'like'
    | 'follow'
    | 'follow_request'
    | 'comment'
    | 'mention'
    | 'tag'
    | 'share'
    | 'video_revoked'
    | 'account_banned'
    | 'appeal_status'
    | 'message'
    | 'account_warning'
    | 'pre_ban_appeal_update';
  actor: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  targetText?: string;
  timestamp: string;
  createdAt?: string;
  isUnread: boolean;
  videoId?: string;
  requestId?: string;
  status?: 'pending' | 'accepted' | 'declined' | 'confirmed';
  appealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  rejectionReason?: string;
  appealReason?: string;
  banReason?: string;
  warningReason?: string;
  warningDeadline?: string;
  proofUrl?: string;
}

export interface ReportItem {
  id: string;
  reporterId?: string;
  type: 'video' | 'user';
  targetId: string;
  targetName: string;
  targetSubtitle?: string;
  targetThumbnail?: string;
  scenario: string;
  description?: string;
  status: 'Under Review' | 'Approved' | 'Rejected' | 'Warning Issued' | 'Appeal Submitted';
  timestamp: string;
  createdAt?: string;
  // Pre-ban due-process warning & proof tracking:
  warningReason?: string;
  warningIssuedAt?: string;
  warningDeadline?: string;
  appealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  appealReason?: string;
  appealProofUrl?: string;
  appealProofName?: string;
  appealSubmittedAt?: string;
}

export interface LiveViewer {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  joinedAt: string;
}

export interface AdminRecord {
  adminId: string;
  userId?: string;
  username: string;
  email: string;
  role: 'Admin';
  permissions: string[];
  createdAt: string;
  lastLogin?: string;
}

export interface SystemStats {
  totalUsers: number;
  totalVideos: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReports: number;
  activeLivestreams: number;
  totalAdmins: number;
  totalAudioTracks?: number;
}

export interface LiveStreamMessage {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  text: string;
  timestamp: string;
  isSystemEvent?: boolean;
  isJoinEvent?: boolean;
  isLikeEvent?: boolean;
}

export interface CanvasSourceTransform {
  id: 'camera' | 'screen' | 'chat_overlay' | 'goal_bar' | 'music_banner' | 'watermark';
  name: string;
  type: 'camera' | 'screen' | 'overlay';
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  locked?: boolean;
  mirrored?: boolean;
  borderRadius?: number;
  borderStyle?: 'none' | 'pink' | 'cyan' | 'hairline';
  opacity?: number;
}

export interface LiveStream {
  id: string;
  host: User;
  title: string;
  topic: string;
  aboutMe: string;
  viewersCount: number;
  viewers: LiveViewer[];
  isLive: boolean;
  timerSeconds: number;
  followerGoal: {
    current: number;
    target: number;
  };
  messages: LiveStreamMessage[];
  videoSource?: 'camera' | 'screen' | 'avatar' | 'demo';
  cameraEnabled: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
  aspectRatio?: '9:16' | '16:9';
  isMobileStream?: boolean;
}
