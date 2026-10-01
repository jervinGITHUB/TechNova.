import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Video, Conversation, NotificationItem, ReportItem, LiveStream } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  source: 'env' | 'custom' | 'none';
}

// Retrieve configured credentials from environment or localStorage
export const getSupabaseConfig = (): SupabaseConfig => {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  const customUrl = localStorage.getItem('viralhub_supabase_url') || '';
  const customKey = localStorage.getItem('viralhub_supabase_anon_key') || '';

  const activeUrl = customUrl || envUrl;
  const activeKey = customKey || envAnonKey;

  const isConnected = Boolean(activeUrl && activeKey);
  const source = customUrl ? 'custom' : envUrl ? 'env' : 'none';

  return {
    url: activeUrl,
    anonKey: activeKey,
    isConnected,
    source,
  };
};

export const saveSupabaseCredentials = (url: string, anonKey: string) => {
  if (url.trim()) {
    localStorage.setItem('viralhub_supabase_url', url.trim());
  } else {
    localStorage.removeItem('viralhub_supabase_url');
  }

  if (anonKey.trim()) {
    localStorage.setItem('viralhub_supabase_anon_key', anonKey.trim());
  } else {
    localStorage.removeItem('viralhub_supabase_anon_key');
  }

  // Invalidate cached client
  cachedClient = null;
};

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (cachedClient) return cachedClient;

  const config = getSupabaseConfig();
  if (!config.isConnected) return null;

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
};

// =========================================================================
// Real Supabase Authentication (OAuth Google & Email/Password)
// =========================================================================
export const signInWithGoogle = async (redirectTo?: string): Promise<{ data: any; error: any }> => {
  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      error: new Error('Supabase is not connected. Please verify your Supabase URL and Anon Key in Vercel environment variables or the connection settings.'),
    };
  }
  const targetRedirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
  try {
    const res = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: targetRedirect,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return res;
  } catch (err: any) {
    return { data: null, error: err };
  }
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<{ user: any; session: any; error: any }> => {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      session: null,
      error: new Error('Supabase is not connected.'),
    };
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    return { user: data?.user || null, session: data?.session || null, error };
  } catch (err: any) {
    return { user: null, session: null, error: err };
  }
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  username: string,
  displayName?: string
): Promise<{ user: any; session: any; error: any }> => {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      session: null,
      error: new Error('Supabase is not connected.'),
    };
  }
  const cleanUsername = username.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase();
  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          full_name: displayName || username,
        },
      },
    });
    return { user: data?.user || null, session: data?.session || null, error };
  } catch (err: any) {
    return { user: null, session: null, error: err };
  }
};

export const signOutSupabase = async (): Promise<{ error: any }> => {
  const client = getSupabaseClient();
  if (!client) return { error: null };
  try {
    return await client.auth.signOut();
  } catch (err: any) {
    return { error: err };
  }
};

export const getSupabaseAuthSession = async () => {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session || null;
  } catch {
    return null;
  }
};

// Ping / test database connection
export const testSupabaseConnection = async (
  url?: string,
  anonKey?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const testUrl = url || getSupabaseConfig().url;
    const testKey = anonKey || getSupabaseConfig().anonKey;

    if (!testUrl || !testKey) {
      return { success: false, message: 'URL and Anon Key are required.' };
    }

    const testClient = createClient(testUrl, testKey);
    // Simple query to verify connection
    const { error } = await testClient.from('users').select('id').limit(1);

    if (error) {
      // If table doesn't exist yet, connection is still valid
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase! (Tables not yet initialized — run the provided SQL schema in SQL Editor).',
        };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Successfully connected to Supabase database!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection failed' };
  }
};

// =========================================================================
// Real database operations service with safe graceful offline fallbacks
// =========================================================================
export const supabaseDb = {
  // 1. Users
  async fetchUsers(): Promise<User[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email || '',
        avatar: row.avatar_url || '',
        bio: row.bio || '',
        followingCount: row.following_count || 0,
        followersCount: row.followers_count || 0,
        likesCount: row.likes_count || '0',
        isPrivate: Boolean(row.is_private),
        role: 'creator',
      }));
    } catch (e) {
      console.warn('Supabase fetchUsers fallback:', e);
      return null;
    }
  },

  async upsertUser(user: User): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('users').upsert({
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        avatar_url: user.avatar,
        bio: user.bio,
        following_count: user.followingCount,
        followers_count: user.followersCount,
        likes_count: user.likesCount,
        is_private: user.isPrivate,
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase upsertUser fallback:', e);
      return false;
    }
  },

  // 2. Videos
  async fetchVideos(): Promise<Video[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('videos')
        .select(`
          *,
          users:creator_id (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(row => {
        const creatorData = row.users || {};
        return {
          id: row.id,
          creatorId: row.creator_id,
          creator: {
            id: creatorData.id || row.creator_id,
            username: creatorData.username || 'creator',
            displayName: creatorData.display_name || 'Creator',
            avatar: creatorData.avatar_url || '',
            email: creatorData.email || '',
            bio: creatorData.bio || '',
            followingCount: creatorData.following_count || 0,
            followersCount: creatorData.followers_count || 0,
            likesCount: creatorData.likes_count || '0',
            isPrivate: Boolean(creatorData.is_private),
            role: 'creator',
          },
          caption: row.caption || '',
          hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
          mediaUrl: row.media_url,
          thumbnailUrl: row.thumbnail_url || row.media_url,
          likesCount: row.likes_count || 0,
          commentsCount: row.comments_count || 0,
          sharesCount: row.shares_count || 0,
          viewsCount: row.views_count || '0',
          isLiked: false,
          createdAt: row.created_at || new Date().toISOString(),
        };
      });
    } catch (e) {
      console.warn('Supabase fetchVideos fallback:', e);
      return null;
    }
  },

  async insertVideo(video: Video): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Ensure creator exists in users table first
      if (video.creator) {
        await this.upsertUser(video.creator);
      }

      const { error } = await client.from('videos').insert({
        id: video.id,
        creator_id: video.creatorId || video.creator.id,
        caption: video.caption,
        hashtags: video.hashtags,
        media_url: video.mediaUrl,
        thumbnail_url: video.thumbnailUrl || video.mediaUrl,
        likes_count: video.likesCount,
        comments_count: video.commentsCount,
        shares_count: video.sharesCount,
        views_count: video.viewsCount,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertVideo fallback:', e);
      return false;
    }
  },

  async toggleVideoLike(videoId: string, userId: string, isLiked: boolean): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      if (isLiked) {
        await client.from('likes').upsert({ video_id: videoId, user_id: userId });
      } else {
        await client.from('likes').delete().match({ video_id: videoId, user_id: userId });
      }

      // Update likes count counter in videos table
      const { count } = await client
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('video_id', videoId);

      if (typeof count === 'number') {
        await client.from('videos').update({ likes_count: count }).eq('id', videoId);
      }
    } catch (e) {
      console.warn('Supabase toggleVideoLike fallback:', e);
    }
  },

  async incrementVideoView(videoId: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data } = await client.from('videos').select('views_count').eq('id', videoId).single();
      const current = parseInt(data?.views_count || '0', 10);
      await client.from('videos').update({ views_count: String(current + 1) }).eq('id', videoId);
    } catch (e) {
      // ignore
    }
  },

  // 3. Comments
  async insertComment(
    commentId: string,
    videoId: string,
    user: User,
    text: string,
    replyToId?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('comments').insert({
        id: commentId,
        video_id: videoId,
        user_id: user.id,
        user_name: user.displayName,
        user_avatar: user.avatar,
        text,
        reply_to_id: replyToId || null,
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertComment fallback:', e);
      return false;
    }
  },

  // 4. Follows
  async toggleFollow(followerId: string, followingId: string, shouldFollow: boolean): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      if (shouldFollow) {
        await client.from('follows').upsert({ follower_id: followerId, following_id: followingId });
      } else {
        await client.from('follows').delete().match({ follower_id: followerId, following_id: followingId });
      }
    } catch (e) {
      console.warn('Supabase toggleFollow fallback:', e);
    }
  },

  // 5. Messages
  async insertMessage(
    conversationId: string,
    senderId: string,
    recipientId: string,
    text: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Ensure conversation record
      await client.from('conversations').upsert({
        id: conversationId,
        participant_one: senderId,
        participant_two: recipientId,
        last_message: text,
        last_message_time: new Date().toISOString(),
      });

      const { error } = await client.from('messages').insert({
        id: `m_${Date.now()}`,
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        text,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertMessage fallback:', e);
      return false;
    }
  },

  // 6. Reports
  async insertReport(report: ReportItem): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('reports').insert({
        id: report.id,
        reporter_id: null,
        report_type: report.type,
        target_id: report.targetId,
        target_name: report.targetName,
        scenario: report.scenario,
        description: report.description || '',
        status: report.status,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertReport fallback:', e);
      return false;
    }
  },

  // 7. Notifications
  async insertNotification(item: NotificationItem, recipientId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('notifications').insert({
        id: item.id,
        recipient_id: recipientId,
        actor_id: item.actor.id,
        actor_name: item.actor.displayName,
        actor_avatar: item.actor.avatar,
        notification_type: item.type,
        target_text: item.targetText,
        is_unread: item.isUnread,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertNotification fallback:', e);
      return false;
    }
  },

  // 8. Live Streams & Live Chat
  async upsertLiveStream(stream: LiveStream): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('livestreams').upsert({
        id: stream.id,
        host_id: stream.host.id,
        host_name: stream.host.displayName,
        host_avatar: stream.host.avatar,
        title: stream.title,
        topic: stream.topic,
        about_me: stream.aboutMe,
        viewers_count: stream.viewersCount,
        is_live: stream.isLive,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase upsertLiveStream fallback:', e);
      return false;
    }
  },

  async endLiveStream(streamId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from('livestreams')
        .update({ is_live: false })
        .eq('id', streamId);

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase endLiveStream fallback:', e);
      return false;
    }
  },

  async insertLiveComment(streamId: string, user: User, text: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client.from('live_comments').insert({
        id: `lc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        livestream_id: streamId,
        user_id: user.id,
        display_name: user.displayName,
        avatar: user.avatar,
        text,
      });

      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Supabase insertLiveComment fallback:', e);
      return false;
    }
  },
};

// =========================================================================
// Complete Production SQL Schema for Supabase SQL Editor
// =========================================================================
export const SUPABASE_SQL_SCHEMA = `-- =====================================================
-- VIRALHUB FULL DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Run this script in your Supabase Project -> SQL Editor
-- =====================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  following_count INTEGER DEFAULT 0,
  followers_count INTEGER DEFAULT 0,
  likes_count TEXT DEFAULT '0',
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. VIDEOS TABLE
CREATE TABLE IF NOT EXISTS public.videos (
  id TEXT PRIMARY KEY,
  creator_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  views_count TEXT DEFAULT '0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. LIKES TABLE
CREATE TABLE IF NOT EXISTS public.likes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  video_id TEXT REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(video_id, user_id)
);

-- 4. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
  id TEXT PRIMARY KEY,
  video_id TEXT REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT,
  user_avatar TEXT,
  text TEXT NOT NULL,
  reply_to_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. FOLLOWS TABLE
CREATE TABLE IF NOT EXISTS public.follows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  follower_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  following_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(follower_id, following_id)
);

-- 6. CONVERSATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  participant_one TEXT,
  participant_two TEXT,
  last_message TEXT,
  last_message_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id TEXT,
  recipient_id TEXT,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_avatar TEXT,
  notification_type TEXT NOT NULL,
  target_text TEXT,
  is_unread BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT,
  report_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  scenario TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Under Review',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. LIVESTREAMS & LIVE COMMENTS
CREATE TABLE IF NOT EXISTS public.livestreams (
  id TEXT PRIMARY KEY,
  host_id TEXT,
  host_name TEXT,
  host_avatar TEXT,
  title TEXT NOT NULL,
  topic TEXT,
  about_me TEXT,
  viewers_count INTEGER DEFAULT 0,
  is_live BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.live_comments (
  id TEXT PRIMARY KEY,
  livestream_id TEXT REFERENCES public.livestreams(id) ON DELETE CASCADE,
  user_id TEXT,
  display_name TEXT,
  avatar TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ENABLE ROW LEVEL SECURITY (RLS) FOR ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;

-- POLICIES ALLOWING READ/WRITE WITH ANON PUBLIC KEY
CREATE POLICY "Public users access" ON public.users FOR ALL USING (true);
CREATE POLICY "Public videos access" ON public.videos FOR ALL USING (true);
CREATE POLICY "Public likes access" ON public.likes FOR ALL USING (true);
CREATE POLICY "Public comments access" ON public.comments FOR ALL USING (true);
CREATE POLICY "Public follows access" ON public.follows FOR ALL USING (true);
CREATE POLICY "Public conversations access" ON public.conversations FOR ALL USING (true);
CREATE POLICY "Public messages access" ON public.messages FOR ALL USING (true);
CREATE POLICY "Public notifications access" ON public.notifications FOR ALL USING (true);
CREATE POLICY "Public reports access" ON public.reports FOR ALL USING (true);
CREATE POLICY "Public livestreams access" ON public.livestreams FOR ALL USING (true);
CREATE POLICY "Public live_comments access" ON public.live_comments FOR ALL USING (true);
`;
