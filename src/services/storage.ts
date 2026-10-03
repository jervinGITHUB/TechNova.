import { User, Video, AudioTrack, Conversation, NotificationItem, ReportItem, LiveStream } from '../types';

// Clean neutral fallback avatar generator using SVG
export const getAvatarFallback = (name: string, bg = '232336') => {
  const initial = (name || '').trim().charAt(0).toUpperCase();
  if (!initial) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23888899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%23${bg}"/><text x="50%" y="54%" font-family="Arial,sans-serif" font-size="42" font-weight="bold" fill="%23aaaaee" dominant-baseline="middle" text-anchor="middle">${initial}</text></svg>`;
};

// Default empty profile for current user
export const DEFAULT_USER: User = {
  id: 'user_main',
  username: '',
  displayName: '',
  email: '',
  avatar: '',
  bio: '',
  followingCount: 0,
  followersCount: 0,
  likesCount: '0',
  isPrivate: false,
  role: 'creator',
};

// All seed datasets emptied as requested:
export const INITIAL_USERS: User[] = [];
export const INITIAL_AUDIO_TRACKS: AudioTrack[] = [
  {
    id: 'track_synthwave_energy',
    title: 'Neon Horizon (Synthwave)',
    artist: 'CyberBeat',
    duration: '00:30',
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&auto=format&fit=crop',
    audioUrl: 'https://actions.google.com/sounds/v1/science_fiction/alien_beacon.ogg',
  },
  {
    id: 'track_lofi_sunset',
    title: 'Lo-Fi Chill Sunset',
    artist: 'LofiVibes',
    duration: '00:25',
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=150&auto=format&fit=crop',
    audioUrl: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
  },
  {
    id: 'track_deep_bass_groove',
    title: 'Deep Bass Groove',
    artist: 'PulseNation',
    duration: '00:20',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&auto=format&fit=crop',
    audioUrl: 'https://actions.google.com/sounds/v1/household/clock_ticking.ogg',
  },
];
export const INITIAL_VIDEOS: Video[] = [];
export const INITIAL_CONVERSATIONS: Conversation[] = [];
export const INITIAL_FOLLOWS: { followerId: string; followingId: string }[] = [];
export const INITIAL_FOLLOW_REQUESTS: { id: string; fromUserId: string; toUserId: string; timestamp: string }[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
export const INITIAL_REPORTS: ReportItem[] = [];

export const INITIAL_LIVESTREAM: LiveStream = {
  id: '',
  host: DEFAULT_USER,
  title: '',
  topic: '',
  aboutMe: '',
  viewersCount: 0,
  viewers: [],
  isLive: false,
  timerSeconds: 0,
  followerGoal: {
    current: 0,
    target: 0,
  },
  cameraEnabled: false,
  micEnabled: false,
  screenShareEnabled: false,
  messages: [],
};

// Safe storage access helpers
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(`viralhub_${key}`);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`viralhub_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage set failed', e);
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(`viralhub_${key}`);
    } catch (e) {
      console.warn('Storage remove failed', e);
    }
  }
};
