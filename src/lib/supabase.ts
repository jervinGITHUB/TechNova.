import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Video, NotificationItem, ReportItem, LiveStream, AdminRecord, SystemStats } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  source: 'env' | 'custom' | 'none';
}

// =========================================================================
// UUID Helper: Guarantees Valid UUID v4 Syntax for Postgres UUID Columns
// =========================================================================
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (val?: string | null): boolean => {
  if (!val) return false;
  return UUID_REGEX.test(String(val).trim());
};

/**
 * Returns a valid UUID string.
 * If input is already a UUID, returns it in lowercase.
 * If input is not a UUID (e.g. 'user_main', 'v_123'), deterministically hashes
 * the string into a valid UUID v4 format so relationships remain 100% consistent!
 */
export const toUuid = (input?: string | null): string => {
  if (!input) return crypto.randomUUID();
  const trimmed = String(input).trim();
  if (isUuid(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Deterministic 32-hex mapping
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;
  let h3 = 0x5b35c029;
  let h4 = 0x3c6ef372;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code + i), 0x01000193);
    h3 = Math.imul(h3 ^ (code * 31), 0x01000193);
    h4 = Math.imul(h4 ^ (code * 17), 0x01000193);
  }

  const toHex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const rawHex = `${toHex8(h1)}${toHex8(h2)}${toHex8(h3)}${toHex8(h4)}`.slice(0, 32);

  const p1 = rawHex.slice(0, 8);
  const p2 = rawHex.slice(8, 12);
  const p3 = '4' + rawHex.slice(13, 16);
  const p4 = (8 + (parseInt(rawHex.charAt(16), 16) % 4)).toString(16) + rawHex.slice(17, 20);
  const p5 = rawHex.slice(20, 32);

  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
};

// =========================================================================
// Configuration & Client Initialization
// =========================================================================
export const getSupabaseConfig = (): SupabaseConfig => {
  const metaEnv = ((import.meta as any).env) || {};
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

  const envUrl = (
    metaEnv.VITE_SUPABASE_URL ||
    metaEnv.SUPABASE_URL ||
    procEnv.VITE_SUPABASE_URL ||
    procEnv.SUPABASE_URL ||
    metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
    procEnv.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();

  const envAnonKey = (
    metaEnv.VITE_SUPABASE_ANON_KEY ||
    metaEnv.SUPABASE_ANON_KEY ||
    procEnv.VITE_SUPABASE_ANON_KEY ||
    procEnv.SUPABASE_ANON_KEY ||
    metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    procEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const customUrl = (localStorage.getItem('viralhub_supabase_url') || '').trim();
  const customKey = (localStorage.getItem('viralhub_supabase_anon_key') || '').trim();

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
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

  if (cleanUrl) {
    localStorage.setItem('viralhub_supabase_url', cleanUrl);
  } else {
    localStorage.removeItem('viralhub_supabase_url');
  }

  if (cleanKey) {
    localStorage.setItem('viralhub_supabase_anon_key', cleanKey);
  } else {
    localStorage.removeItem('viralhub_supabase_anon_key');
  }

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
  const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
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

export const resendConfirmationEmail = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Supabase client is not connected' };
  try {
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: `New confirmation email sent to ${email}!` };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to resend confirmation email.' };
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

// Ping / test database connection against real tables
export const testSupabaseConnection = async (
  url?: string,
  anonKey?: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> => {
  const startTime = Date.now();
  try {
    const testUrl = (url || getSupabaseConfig().url).trim();
    const testKey = (anonKey || getSupabaseConfig().anonKey).trim();

    if (!testUrl || !testKey) {
      return { success: false, message: 'Supabase URL and Anon Key are required.' };
    }

    const testClient = createClient(testUrl, testKey);

    // Test query on the User table (PascalCase in user's Supabase)
    const { error: userErr } = await testClient.from('User').select('UserID').limit(1);
    const latencyMs = Date.now() - startTime;

    if (!userErr) {
      return {
        success: true,
        message: `Connected to Supabase! (Found "User" table · ${latencyMs}ms response)`,
        latencyMs,
      };
    }

    // If User table gave error, check if it's table not created yet (42P01) or RLS
    if (userErr.code === '42P01') {
      // Table doesn't exist yet - connection credential itself is valid
      return {
        success: true,
        message: `Connected to Supabase! ("User" table not found yet — please run the provided SQL Schema in Supabase SQL Editor).`,
        latencyMs,
      };
    }

    // Check Video table as alternate test
    const { error: videoErr } = await testClient.from('Video').select('VideoID').limit(1);
    if (!videoErr) {
      return {
        success: true,
        message: `Connected to Supabase! (Found "Video" table · ${latencyMs}ms response)`,
        latencyMs,
      };
    }

    return {
      success: false,
      message: `Connection failed: ${userErr.message || 'Check your URL & Anon Key'}`,
      latencyMs,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Connection failed: could not reach Supabase endpoint',
    };
  }
};

// =========================================================================
// Real Database Operations Service Matching User's Supabase Schema
// =========================================================================
export const supabaseDb = {
  // -----------------------------------------------------------------------
  // 1. User Table (UserID, Username, Email, Password, RegistrationDate, DisplayName, Bio, ProfilePictureURL)
  // -----------------------------------------------------------------------
  async fetchUsers(): Promise<User[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      let data: any[] | null = null;
      let error: any = null;

      const res1 = await client
        .from('User')
        .select('*')
        .order('RegistrationDate', { ascending: false });

      if (!res1.error && res1.data) {
        data = res1.data;
      } else {
        const res2 = await client
          .from('users')
          .select('*');
        if (!res2.error && res2.data) {
          data = res2.data;
        } else {
          error = res1.error || res2.error;
        }
      }

      if (error && !data) {
        console.warn('Supabase fetchUsers warning:', error.message);
        return null;
      }

      return (data || []).map((row: any) => ({
        id: row.UserID || row.id || row.user_id,
        username: row.Username || row.username || `user_${(row.UserID || row.id || '').slice(0, 6)}`,
        displayName: row.DisplayName || row.display_name || row.full_name || row.Username || row.username || 'User',
        email: row.Email || row.email || '',
        avatar: row.ProfilePictureURL || row.avatar_url || row.avatar || '',
        bio: row.Bio || row.bio || '',
        followingCount: 0,
        followersCount: 0,
        likesCount: '0',
        isPrivate: row.IsPublic !== undefined ? !row.IsPublic : (row.is_public !== undefined ? !row.is_public : Boolean(row.isPrivate || row.is_private)),
        role: (row.Role || row.role || 'creator') as any,
      }));
    } catch (e) {
      console.warn('Supabase fetchUsers fallback:', e);
      return null;
    }
  },

  async upsertUser(user: User, password?: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase client not initialized' };

    try {
      const userId = toUuid(user.id);
      const cleanUsername = (user.username || `user_${userId.slice(0, 6)}`)
        .replace(/[^a-zA-Z0-9._]/g, '')
        .toLowerCase();
      const isPublic = user.isPrivate !== undefined ? !user.isPrivate : true;

      // 1. Try PascalCase table 'User' with IsPublic column (satisfies not-null constraint)
      const payloadPascal: Record<string, any> = {
        UserID: userId,
        Username: cleanUsername,
        Email: user.email || `${cleanUsername}@viralhub.app`,
        Password: password || 'user_encrypted_secret',
        RegistrationDate: new Date().toISOString(),
        DisplayName: user.displayName || user.username || 'User',
        Bio: user.bio || '',
        ProfilePictureURL: user.avatar || '',
        IsPublic: isPublic,
      };

      let { error } = await client.from('User').upsert(payloadPascal, { onConflict: 'UserID' });

      // If 'IsPublic' column does not exist (code 42703), retry without IsPublic
      if (error && (error.code === '42703' || error.message?.includes('IsPublic') || error.message?.includes('column'))) {
        const { IsPublic: _, ...withoutIsPublic } = payloadPascal;
        const retryPascal = await client.from('User').upsert(withoutIsPublic, { onConflict: 'UserID' });
        error = retryPascal.error;
      }

      // If 'User' table doesn't exist, try 'users' table (snake_case)
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const payloadSnake: Record<string, any> = {
          id: userId,
          username: cleanUsername,
          email: user.email || `${cleanUsername}@viralhub.app`,
          display_name: user.displayName || user.username || 'User',
          bio: user.bio || '',
          avatar_url: user.avatar || '',
          is_public: isPublic,
          created_at: new Date().toISOString(),
        };
        let resSnake = await client.from('users').upsert(payloadSnake, { onConflict: 'id' });
        if (resSnake.error && (resSnake.error.code === '42703' || resSnake.error.message?.includes('is_public') || resSnake.error.message?.includes('column'))) {
          const { is_public: _, ...payloadSnakeWithoutPublic } = payloadSnake;
          resSnake = await client.from('users').upsert(payloadSnakeWithoutPublic, { onConflict: 'id' });
        }
        error = resSnake.error;
      }

      if (error) {
        console.error('Supabase upsertUser error:', error.message || error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.error('Supabase upsertUser exception:', e);
      return { success: false, error: e?.message || 'Database write failed' };
    }
  },

  async deleteUser(userId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const targetUuid = toUuid(userId);
      const { error } = await client.from('User').delete().eq('UserID', targetUuid);
      return !error;
    } catch (e) {
      console.warn('Supabase deleteUser error:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 2. Video Table (VideoID, UserID, AudioTrackID, VideoURL, Caption, PublishedAt, ViewCount)
  //    + VideoHashtag (VideoID, HashtagName)
  //    + VideoStats (VideoID, LikeCount, CommentCount, ShareCount, ViewCount)
  // -----------------------------------------------------------------------
  async fetchVideos(): Promise<Video[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      // Fetch videos with User join
      const { data: videoRows, error } = await client
        .from('Video')
        .select(`
          VideoID,
          UserID,
          AudioTrackID,
          VideoURL,
          Caption,
          PublishedAt,
          ViewCount,
          Status,
          RejectionReason
        `)
        .order('PublishedAt', { ascending: false });

      if (error) {
        console.warn('Supabase fetchVideos error:', error.message);
        return null;
      }

      if (!videoRows || videoRows.length === 0) {
        return [];
      }

      // Fetch users to populate creator info
      const usersList = await this.fetchUsers();
      const usersMap = new Map((usersList || []).map(u => [u.id, u]));

      // Fetch hashtags
      let hashtagsMap = new Map<string, string[]>();
      try {
        const { data: tags } = await client.from('VideoHashtag').select('*');
        if (tags) {
          tags.forEach((t: any) => {
            const list = hashtagsMap.get(t.VideoID) || [];
            list.push(t.HashtagName);
            hashtagsMap.set(t.VideoID, list);
          });
        }
      } catch {
        // ignore
      }

      // Fetch like counts per video
      let likesCountMap = new Map<string, number>();
      try {
        const { data: likes } = await client.from('Like').select('VideoID');
        if (likes) {
          likes.forEach((l: any) => {
            likesCountMap.set(l.VideoID, (likesCountMap.get(l.VideoID) || 0) + 1);
          });
        }
      } catch {
        // ignore
      }

      // Fetch comment counts per video
      let commentsCountMap = new Map<string, number>();
      try {
        const { data: comments } = await client.from('Comment').select('VideoID');
        if (comments) {
          comments.forEach((c: any) => {
            commentsCountMap.set(c.VideoID, (commentsCountMap.get(c.VideoID) || 0) + 1);
          });
        }
      } catch {
        // ignore
      }

      return videoRows.map((row: any) => {
        const creator = usersMap.get(row.UserID) || {
          id: row.UserID,
          username: 'creator',
          displayName: 'Creator',
          avatar: '',
          email: '',
          bio: '',
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: false,
          role: 'creator' as const,
        };

        const hashtags = hashtagsMap.get(row.VideoID) || ['#viral', '#fyp'];
        const likesCount = likesCountMap.get(row.VideoID) || 0;
        const commentsCount = commentsCountMap.get(row.VideoID) || 0;

        return {
          id: row.VideoID,
          creatorId: row.UserID,
          creator,
          caption: row.Caption || '',
          hashtags,
          mediaUrl: row.VideoURL,
          thumbnailUrl: row.VideoURL,
          likesCount,
          commentsCount,
          sharesCount: 0,
          viewsCount: String(row.ViewCount || 0),
          isLiked: false,
          createdAt: row.PublishedAt || new Date().toISOString(),
          status: (row.Status as any) || 'approved',
          rejectionReason: row.RejectionReason || undefined,
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
      const videoUuid = toUuid(video.id);
      const userUuid = toUuid(video.creatorId || video.creator?.id);

      // 1. Ensure creator exists in User table
      if (video.creator) {
        await this.upsertUser(video.creator);
      }

      // 2. Insert into Video table (with Status & RejectionReason support)
      let { error } = await client.from('Video').upsert(
        {
          VideoID: videoUuid,
          UserID: userUuid,
          AudioTrackID: video.audioTrack?.id ? toUuid(video.audioTrack.id) : null,
          VideoURL: video.mediaUrl,
          Caption: video.caption || '',
          PublishedAt: new Date().toISOString(),
          ViewCount: parseInt(video.viewsCount || '0', 10) || 0,
          Status: video.status || 'pending',
          RejectionReason: video.rejectionReason || null,
        },
        { onConflict: 'VideoID' }
      );

      // Fallback if Status column doesn't exist yet in user's Supabase
      if (error && (error.code === '42703' || error.message?.includes('Status') || error.message?.includes('column'))) {
        const retryRes = await client.from('Video').upsert(
          {
            VideoID: videoUuid,
            UserID: userUuid,
            AudioTrackID: video.audioTrack?.id ? toUuid(video.audioTrack.id) : null,
            VideoURL: video.mediaUrl,
            Caption: video.caption || '',
            PublishedAt: new Date().toISOString(),
            ViewCount: parseInt(video.viewsCount || '0', 10) || 0,
          },
          { onConflict: 'VideoID' }
        );
        error = retryRes.error;
      }

      if (error) {
        console.warn('Supabase insertVideo error:', error.message);
        return false;
      }

      // 3. Insert hashtags into VideoHashtag table
      if (Array.isArray(video.hashtags) && video.hashtags.length > 0) {
        const tagRows = video.hashtags.map(tag => ({
          VideoID: videoUuid,
          HashtagName: tag.startsWith('#') ? tag : `#${tag}`,
        }));
        try {
          await client.from('VideoHashtag').insert(tagRows);
        } catch {
          // ignore
        }
      }

      // 4. Upsert VideoStats if present
      try {
        await client
          .from('VideoStats')
          .upsert(
            {
              VideoID: videoUuid,
              LikeCount: video.likesCount || 0,
              CommentCount: video.commentsCount || 0,
              ShareCount: video.sharesCount || 0,
              ViewCount: parseInt(video.viewsCount || '0', 10) || 0,
            },
            { onConflict: 'VideoID' }
          );
      } catch {
        // ignore
      }

      return true;
    } catch (e) {
      console.warn('Supabase insertVideo fallback:', e);
      return false;
    }
  },

  async uploadVideoFile(file: File): Promise<{ url: string | null; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const cleanFileName = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const filePath = `uploads/${cleanFileName}`;

      // Try primary bucket 'videos'
      let targetBucket = 'videos';
      let uploadRes = await client.storage.from(targetBucket).upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

      // Fallback bucket options if 'videos' bucket does not exist yet
      if (uploadRes.error && (uploadRes.error.message?.includes('not found') || uploadRes.error.message?.includes('Bucket') || (uploadRes.error as any).statusCode === '404')) {
        targetBucket = 'media';
        const retry1 = await client.storage.from(targetBucket).upload(filePath, file, { cacheControl: '3600', upsert: true });
        if (!retry1.error) {
          uploadRes = retry1;
        } else {
          targetBucket = 'public';
          const retry2 = await client.storage.from(targetBucket).upload(filePath, file, { cacheControl: '3600', upsert: true });
          if (!retry2.error) {
            uploadRes = retry2;
          }
        }
      }

      if (uploadRes.error) {
        console.warn('Supabase storage upload error:', uploadRes.error.message);
        return { url: null, error: uploadRes.error.message };
      }

      const { data } = client.storage.from(targetBucket).getPublicUrl(filePath);
      return { url: data?.publicUrl || null };
    } catch (e: any) {
      console.warn('Supabase uploadVideoFile exception:', e);
      return { url: null, error: e?.message || 'Storage upload failed' };
    }
  },

  async deleteVideo(videoId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const vUuid = toUuid(videoId);
      try { await client.from('VideoHashtag').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('Like').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('Comment').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('Share').delete().eq('VideoID', vUuid); } catch {}
      const { error } = await client.from('Video').delete().eq('VideoID', vUuid);
      return !error;
    } catch (e) {
      console.warn('Supabase deleteVideo error:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 3. Like Table (VideoID, UserID, LikedAt)
  // -----------------------------------------------------------------------
  async toggleVideoLike(videoId: string, userId: string, isLiked: boolean): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const vUuid = toUuid(videoId);
      const uUuid = toUuid(userId);

      if (isLiked) {
        await client.from('Like').upsert(
          {
            VideoID: vUuid,
            UserID: uUuid,
            LikedAt: new Date().toISOString(),
          },
          { onConflict: 'VideoID,UserID' }
        );
      } else {
        await client.from('Like').delete().match({ VideoID: vUuid, UserID: uUuid });
      }

      // Update VideoStats counter if table exists
      try {
        const { count } = await client
          .from('Like')
          .select('*', { count: 'exact', head: true })
          .eq('VideoID', vUuid);

        if (typeof count === 'number') {
          await client.from('VideoStats').upsert({ VideoID: vUuid, LikeCount: count });
        }
      } catch {
        // ignore
      }
    } catch (e) {
      console.warn('Supabase toggleVideoLike fallback:', e);
    }
  },

  async fetchUserLikes(userId: string): Promise<string[]> {
    const client = getSupabaseClient();
    if (!client || !userId) return [];

    try {
      const uUuid = toUuid(userId);
      // Try PascalCase table 'Like'
      const { data, error } = await client.from('Like').select('VideoID').eq('UserID', uUuid);
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const retry = await client.from('likes').select('video_id').eq('user_id', uUuid);
        if (retry.data) {
          return retry.data.map((r: any) => r.video_id).filter(Boolean);
        }
      }
      if (data) {
        return data.map((r: any) => r.VideoID || r.video_id).filter(Boolean);
      }
      return [];
    } catch (e) {
      console.warn('Supabase fetchUserLikes fallback:', e);
      return [];
    }
  },

  async incrementVideoView(videoId: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const vUuid = toUuid(videoId);
      const { data } = await client.from('Video').select('ViewCount').eq('VideoID', vUuid).single();
      const current = Number(data?.ViewCount || 0);
      await client.from('Video').update({ ViewCount: current + 1 }).eq('VideoID', vUuid);
    } catch {
      // ignore
    }
  },

  // -----------------------------------------------------------------------
  // 4. Comment Table (CommentID, UserID, VideoID, ParentCommentID, CommentText)
  // -----------------------------------------------------------------------
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
      // Ensure user exists
      await this.upsertUser(user);

      const cUuid = toUuid(commentId);
      const vUuid = toUuid(videoId);
      const uUuid = toUuid(user.id);
      const parentUuid = replyToId ? toUuid(replyToId) : null;

      const { error } = await client.from('Comment').insert({
        CommentID: cUuid,
        UserID: uUuid,
        VideoID: vUuid,
        ParentCommentID: parentUuid,
        CommentText: text,
      });

      if (error) {
        console.warn('Supabase insertComment error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Supabase insertComment fallback:', e);
      return false;
    }
  },

  async deleteComment(commentId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const cUuid = toUuid(commentId);
      const { error } = await client.from('Comment').delete().eq('CommentID', cUuid);
      return !error;
    } catch (e) {
      console.warn('Supabase deleteComment error:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 5. Share Table (VideoID, UserID, SharedAt)
  // -----------------------------------------------------------------------
  async insertShare(videoId: string, userId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const vUuid = toUuid(videoId);
      const uUuid = toUuid(userId);

      const { error } = await client.from('Share').insert({
        VideoID: vUuid,
        UserID: uUuid,
        SharedAt: new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('Supabase insertShare fallback:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 6. Follower & Following Tables
  //    Follower: (UserID, FollowerUserID)
  //    Following: (UserID, FollowingUserID)
  // -----------------------------------------------------------------------
  async toggleFollow(followerId: string, followingId: string, shouldFollow: boolean): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const followerUuid = toUuid(followerId);
      const followingUuid = toUuid(followingId);

      if (shouldFollow) {
        await Promise.all([
          client.from('Following').upsert({ UserID: followerUuid, FollowingUserID: followingUuid }),
          client.from('Follower').upsert({ UserID: followingUuid, FollowerUserID: followerUuid }),
        ]);
      } else {
        await Promise.all([
          client.from('Following').delete().match({ UserID: followerUuid, FollowingUserID: followingUuid }),
          client.from('Follower').delete().match({ UserID: followingUuid, FollowerUserID: followerUuid }),
        ]);
      }
    } catch (e) {
      console.warn('Supabase toggleFollow fallback:', e);
    }
  },

  // -----------------------------------------------------------------------
  // 7. Conversation & Message Tables
  //    Conversation: (ConversationID, UserIDA, UserIDB, CreatedAt)
  //    Message: (MessageID, ConversationID, SenderUserID, MessageContent, SentAt)
  // -----------------------------------------------------------------------
  async insertMessage(
    conversationId: string,
    senderId: string,
    recipientId: string,
    text: string,
    messageId?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const convUuid = toUuid(conversationId);
      const senderUuid = toUuid(senderId);
      const recipientUuid = toUuid(recipientId);
      const msgUuid = toUuid(messageId || `msg_${Date.now()}`);

      // Ensure conversation record in Conversation table
      await client.from('Conversation').upsert(
        {
          ConversationID: convUuid,
          UserIDA: senderUuid,
          UserIDB: recipientUuid,
          CreatedAt: new Date().toISOString(),
        },
        { onConflict: 'ConversationID' }
      );

      // Insert message into Message table
      const { error } = await client.from('Message').insert({
        MessageID: msgUuid,
        ConversationID: convUuid,
        SenderUserID: senderUuid,
        MessageContent: text,
        SentAt: new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('Supabase insertMessage fallback:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 8. Notification Table (NotificationID, UserID, NotificationType, NotificationMessage, IsRead, NotificationDate)
  // -----------------------------------------------------------------------
  async insertNotification(item: NotificationItem, recipientId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const notifUuid = toUuid(item.id);
      const userUuid = toUuid(recipientId);

      const { error } = await client.from('Notification').insert({
        NotificationID: notifUuid,
        UserID: userUuid,
        NotificationType: item.type,
        NotificationMessage: `${item.actor.displayName || 'Someone'} ${item.targetText || ''}`,
        IsRead: !item.isUnread,
        NotificationDate: new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('Supabase insertNotification fallback:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 9. ReportVideo & ReportUser Tables
  //    ReportVideo: (ReportID, ReporterUserID, VideoID, Reason, Status, ReportedDate)
  //    ReportUser: (ReportID, ReportUserID, ReportedUserID, Reason, Status, ReportedDate)
  // -----------------------------------------------------------------------
  async fetchReports(): Promise<ReportItem[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const [vidRes, userRes] = await Promise.all([
        client.from('ReportVideo').select('*').order('ReportedDate', { ascending: false }),
        client.from('ReportUser').select('*').order('ReportedDate', { ascending: false }),
      ]);

      const items: ReportItem[] = [];

      if (vidRes.data) {
        vidRes.data.forEach((r: any) => {
          items.push({
            id: r.ReportID,
            type: 'video',
            targetId: r.VideoID,
            targetName: `Video #${r.VideoID ? String(r.VideoID).slice(0, 8) : 'Unknown'}`,
            targetSubtitle: r.Reason || '',
            scenario: r.Reason ? r.Reason.split(':')[0] : 'Inappropriate Content',
            description: r.Reason || '',
            status: (r.Status as any) || 'Under Review',
            timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
          });
        });
      }

      if (userRes.data) {
        userRes.data.forEach((r: any) => {
          items.push({
            id: r.ReportID,
            type: 'user',
            targetId: r.ReportedUserID,
            targetName: `User #${r.ReportedUserID ? String(r.ReportedUserID).slice(0, 8) : 'Account'}`,
            targetSubtitle: r.Reason || '',
            scenario: r.Reason ? r.Reason.split(':')[0] : 'Community Violation',
            description: r.Reason || '',
            status: (r.Status as any) || 'Under Review',
            timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
          });
        });
      }

      return items;
    } catch (e) {
      console.warn('Supabase fetchReports fallback:', e);
      return null;
    }
  },

  async insertReport(report: ReportItem, reporterUserId?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const reportUuid = toUuid(report.id);
      const reporterUuid = reporterUserId ? toUuid(reporterUserId) : null;
      const targetUuid = toUuid(report.targetId);
      const reasonText = `${report.scenario || 'Report'}: ${report.description || ''}`;

      if (report.type === 'video') {
        const { error } = await client.from('ReportVideo').insert({
          ReportID: reportUuid,
          ReporterUserID: reporterUuid,
          VideoID: targetUuid,
          Reason: reasonText,
          Status: report.status || 'Under Review',
          ReportedDate: new Date().toISOString(),
        });
        return !error;
      } else {
        const { error } = await client.from('ReportUser').insert({
          ReportID: reportUuid,
          ReportUserID: reporterUuid,
          ReportedUserID: targetUuid,
          Reason: reasonText,
          Status: report.status || 'Under Review',
          ReportedDate: new Date().toISOString(),
        });
        return !error;
      }
    } catch (e) {
      console.warn('Supabase insertReport fallback:', e);
      return false;
    }
  },

  async updateReportStatus(
    reportId: string,
    type: 'video' | 'user',
    status: 'Approved' | 'Rejected' | 'Under Review'
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const rUuid = toUuid(reportId);
      const table = type === 'video' ? 'ReportVideo' : 'ReportUser';
      const { error } = await client.from(table).update({ Status: status }).eq('ReportID', rUuid);
      return !error;
    } catch (e) {
      console.warn('Supabase updateReportStatus error:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 10. Livestream & LiveComment & LivestreamViewer Tables
  //     Livestream: (LivestreamID, HostUserID, Title, StartedAt, EndedAt)
  //     LiveComment: (LiveStreamID, UserID, LiveText, LiveCommentAt)
  //     LivestreamViewer: (LiveStreamID, ViewerID, JoinedAt)
  // -----------------------------------------------------------------------
  async upsertLiveStream(stream: LiveStream): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const streamUuid = toUuid(stream.id);
      const hostUuid = toUuid(stream.host.id);

      const { error } = await client.from('Livestream').upsert(
        {
          LivestreamID: streamUuid,
          HostUserID: hostUuid,
          Title: stream.title || 'Live Stream',
          StartedAt: new Date().toISOString(),
          EndedAt: stream.isLive ? null : new Date().toISOString(),
        },
        { onConflict: 'LivestreamID' }
      );

      return !error;
    } catch (e) {
      console.warn('Supabase upsertLiveStream fallback:', e);
      return false;
    }
  },

  async endLiveStream(streamId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const streamUuid = toUuid(streamId);
      const { error } = await client
        .from('Livestream')
        .update({ EndedAt: new Date().toISOString() })
        .eq('LivestreamID', streamUuid);

      return !error;
    } catch (e) {
      console.warn('Supabase endLiveStream fallback:', e);
      return false;
    }
  },

  async insertLiveComment(streamId: string, user: User, text: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const streamUuid = toUuid(streamId);
      const userUuid = toUuid(user.id);

      const { error } = await client.from('LiveComment').insert({
        LiveStreamID: streamUuid,
        UserID: userUuid,
        LiveText: text,
        LiveCommentAt: new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('Supabase insertLiveComment fallback:', e);
      return false;
    }
  },

  async recordLivestreamViewer(streamId: string, viewerId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const streamUuid = toUuid(streamId);
      const viewerUuid = toUuid(viewerId);

      const { error } = await client.from('LivestreamViewer').insert({
        LiveStreamID: streamUuid,
        ViewerID: viewerUuid,
        JoinedAt: new Date().toISOString(),
      });

      return !error;
    } catch {
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // 11. Admin Table (New feature requested by user!)
  //     Admin: (AdminID, UserID, Username, Email, Role, Permissions, CreatedAt, LastLogin)
  // -----------------------------------------------------------------------
  async fetchAdmins(): Promise<AdminRecord[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('Admin')
        .select('*')
        .order('CreatedAt', { ascending: false });

      if (error) {
        console.warn('Supabase fetchAdmins error:', error.message);
        return null;
      }

      return (data || []).map((row: any) => ({
        adminId: row.AdminID,
        userId: row.UserID,
        username: row.Username,
        email: row.Email,
        role: row.Role || 'Admin',
        permissions: Array.isArray(row.Permissions) ? row.Permissions : ['all'],
        createdAt: row.CreatedAt,
        lastLogin: row.LastLogin,
      }));
    } catch (e) {
      console.warn('Supabase fetchAdmins fallback:', e);
      return null;
    }
  },

  async upsertAdmin(admin: Partial<AdminRecord>): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const adminUuid = toUuid(admin.adminId || crypto.randomUUID());
      const userUuid = admin.userId ? toUuid(admin.userId) : null;

      const { error } = await client.from('Admin').upsert(
        {
          AdminID: adminUuid,
          UserID: userUuid,
          Username: admin.username || 'admin',
          Email: admin.email || 'admin@viralhub.app',
          Role: admin.role || 'Admin',
          Permissions: admin.permissions || ['manage_users', 'manage_videos', 'manage_reports'],
          CreatedAt: admin.createdAt || new Date().toISOString(),
          LastLogin: new Date().toISOString(),
        },
        { onConflict: 'AdminID' }
      );

      return !error;
    } catch (e) {
      console.warn('Supabase upsertAdmin error:', e);
      return false;
    }
  },

  async deleteAdmin(adminId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const adminUuid = toUuid(adminId);
      const { error } = await client.from('Admin').delete().eq('AdminID', adminUuid);
      return !error;
    } catch (e) {
      console.warn('Supabase deleteAdmin error:', e);
      return false;
    }
  },

  async checkIsAdmin(user?: User | null): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const userUuid = toUuid(user.id);
      // Query Admin table
      const { data, error } = await client
        .from('Admin')
        .select('*')
        .or(`UserID.eq.${userUuid},Email.ilike.${user.email || 'none'},Username.ilike.${user.username || 'none'}`)
        .limit(1);

      if (!error && data && data.length > 0) {
        return true;
      }

      // Also try lowercase table 'admins'
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const retry = await client
          .from('admins')
          .select('*')
          .or(`user_id.eq.${userUuid},email.ilike.${user.email || 'none'},username.ilike.${user.username || 'none'}`)
          .limit(1);
        if (retry.data && retry.data.length > 0) {
          return true;
        }
      }

      // Also check if User table has Role = 'admin'
      const { data: userRow } = await client
        .from('User')
        .select('Role, role')
        .eq('UserID', userUuid)
        .maybeSingle();

      if (userRow && (userRow.Role?.toLowerCase() === 'admin' || userRow.role?.toLowerCase() === 'admin')) {
        return true;
      }
    } catch (e) {
      console.warn('Check admin query fallback:', e);
    }
    return false;
  },

  // -----------------------------------------------------------------------
  // 12. System Stats & Direct Table Inspector (Live counts from Supabase)
  // -----------------------------------------------------------------------
  async fetchSystemStats(): Promise<SystemStats> {
    const client = getSupabaseClient();
    const fallbackStats: SystemStats = {
      totalUsers: 0,
      totalVideos: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalReports: 0,
      activeLivestreams: 0,
      totalAdmins: 0,
    };

    if (!client) return fallbackStats;

    try {
      const [
        usersRes,
        videosRes,
        likesRes,
        commentsRes,
        sharesRes,
        reportVidRes,
        reportUserRes,
        livestreamsRes,
        adminsRes,
      ] = await Promise.all([
        client.from('User').select('*', { count: 'exact', head: true }),
        client.from('Video').select('*', { count: 'exact', head: true }),
        client.from('Like').select('*', { count: 'exact', head: true }),
        client.from('Comment').select('*', { count: 'exact', head: true }),
        client.from('Share').select('*', { count: 'exact', head: true }),
        client.from('ReportVideo').select('*', { count: 'exact', head: true }),
        client.from('ReportUser').select('*', { count: 'exact', head: true }),
        client.from('Livestream').select('*', { count: 'exact', head: true }).is('EndedAt', null),
        client.from('Admin').select('*', { count: 'exact', head: true }),
      ]);

      const totalReports = (reportVidRes.count || 0) + (reportUserRes.count || 0);

      return {
        totalUsers: usersRes.count ?? 0,
        totalVideos: videosRes.count ?? 0,
        totalLikes: likesRes.count ?? 0,
        totalComments: commentsRes.count ?? 0,
        totalShares: sharesRes.count ?? 0,
        totalReports,
        activeLivestreams: livestreamsRes.count ?? 0,
        totalAdmins: (adminsRes as any)?.count ?? 0,
      };
    } catch (e) {
      console.warn('Supabase fetchSystemStats fallback:', e);
      return fallbackStats;
    }
  },

  async fetchAllTableCounts(): Promise<Record<string, number>> {
    const client = getSupabaseClient();
    if (!client) return {};

    const tableNames = [
      'User',
      'Video',
      'VideoHashtag',
      'VideoStats',
      'Like',
      'Comment',
      'Share',
      'Follower',
      'Following',
      'Conversation',
      'Message',
      'Notification',
      'ReportVideo',
      'ReportUser',
      'Livestream',
      'LiveComment',
      'LivestreamViewer',
      'AudioLibrary',
      'Admin',
    ];

    const results: Record<string, number> = {};

    await Promise.all(
      tableNames.map(async name => {
        try {
          const { count, error } = await client.from(name).select('*', { count: 'exact', head: true });
          results[name] = error ? 0 : (count || 0);
        } catch {
          results[name] = 0;
        }
      })
    );

    return results;
  },
};

// =========================================================================
// Production SQL Script for Supabase SQL Editor:
// Creates Admin Table, VideoStats, and enables Row Level Security (RLS)
// with Permissive Public Policies on all user tables so writes succeed!
// =========================================================================
export const SUPABASE_SQL_SCHEMA = `-- =====================================================================
-- VIRALHUB PRODUCTION SUPABASE SQL SETUP
-- Run this script in your Supabase Project -> SQL Editor -> Run
-- This creates the Admin table and grants public access policies
-- so account registration, likes, comments, videos, shares & reports SYNC!
-- =====================================================================

-- 1. ADMIN TABLE (For the Admin Dashboard)
CREATE TABLE IF NOT EXISTS public."Admin" (
  "AdminID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "UserID" UUID REFERENCES public."User"("UserID") ON DELETE SET NULL,
  "Username" TEXT NOT NULL,
  "Email" TEXT NOT NULL,
  "Role" TEXT DEFAULT 'Admin',
  "Permissions" TEXT[] DEFAULT ARRAY['manage_users', 'manage_videos', 'manage_reports', 'manage_stats'],
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "LastLogin" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. USER & VIDEO SCHEMA COMPATIBILITY (Ensures Role, IsPublic on User and Status on Video)
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "Role" TEXT DEFAULT 'creator';
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "IsPublic" BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS public."User" ALTER COLUMN "IsPublic" SET DEFAULT true;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "Status" TEXT DEFAULT 'approved';
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "RejectionReason" TEXT;

-- 3. ENABLE ROW LEVEL SECURITY (RLS) SAFELY ON BASE TABLES (Views like VideoStats are excluded)
ALTER TABLE IF EXISTS public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Video" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."VideoHashtag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Like" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Follower" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Following" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ReportVideo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ReportUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Livestream" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LiveComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LivestreamViewer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AudioLibrary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Admin" ENABLE ROW LEVEL SECURITY;

-- 4. PERMISSIVE PUBLIC RLS POLICIES (Allows client-side inserts & reads with Anon Key)
DO $$
BEGIN
  -- User
  DROP POLICY IF EXISTS "Public all access on User" ON public."User";
  CREATE POLICY "Public all access on User" ON public."User" FOR ALL USING (true) WITH CHECK (true);

  -- Video
  DROP POLICY IF EXISTS "Public all access on Video" ON public."Video";
  CREATE POLICY "Public all access on Video" ON public."Video" FOR ALL USING (true) WITH CHECK (true);

  -- VideoHashtag
  DROP POLICY IF EXISTS "Public all access on VideoHashtag" ON public."VideoHashtag";
  CREATE POLICY "Public all access on VideoHashtag" ON public."VideoHashtag" FOR ALL USING (true) WITH CHECK (true);

  -- Like
  DROP POLICY IF EXISTS "Public all access on Like" ON public."Like";
  CREATE POLICY "Public all access on Like" ON public."Like" FOR ALL USING (true) WITH CHECK (true);

  -- Comment
  DROP POLICY IF EXISTS "Public all access on Comment" ON public."Comment";
  CREATE POLICY "Public all access on Comment" ON public."Comment" FOR ALL USING (true) WITH CHECK (true);

  -- Share
  DROP POLICY IF EXISTS "Public all access on Share" ON public."Share";
  CREATE POLICY "Public all access on Share" ON public."Share" FOR ALL USING (true) WITH CHECK (true);

  -- Follower & Following
  DROP POLICY IF EXISTS "Public all access on Follower" ON public."Follower";
  CREATE POLICY "Public all access on Follower" ON public."Follower" FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public all access on Following" ON public."Following";
  CREATE POLICY "Public all access on Following" ON public."Following" FOR ALL USING (true) WITH CHECK (true);

  -- Conversation & Message
  DROP POLICY IF EXISTS "Public all access on Conversation" ON public."Conversation";
  CREATE POLICY "Public all access on Conversation" ON public."Conversation" FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public all access on Message" ON public."Message";
  CREATE POLICY "Public all access on Message" ON public."Message" FOR ALL USING (true) WITH CHECK (true);

  -- Notification
  DROP POLICY IF EXISTS "Public all access on Notification" ON public."Notification";
  CREATE POLICY "Public all access on Notification" ON public."Notification" FOR ALL USING (true) WITH CHECK (true);

  -- ReportVideo & ReportUser
  DROP POLICY IF EXISTS "Public all access on ReportVideo" ON public."ReportVideo";
  CREATE POLICY "Public all access on ReportVideo" ON public."ReportVideo" FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public all access on ReportUser" ON public."ReportUser";
  CREATE POLICY "Public all access on ReportUser" ON public."ReportUser" FOR ALL USING (true) WITH CHECK (true);

  -- Livestream, LiveComment, LivestreamViewer
  DROP POLICY IF EXISTS "Public all access on Livestream" ON public."Livestream";
  CREATE POLICY "Public all access on Livestream" ON public."Livestream" FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public all access on LiveComment" ON public."LiveComment";
  CREATE POLICY "Public all access on LiveComment" ON public."LiveComment" FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public all access on LivestreamViewer" ON public."LivestreamViewer";
  CREATE POLICY "Public all access on LivestreamViewer" ON public."LivestreamViewer" FOR ALL USING (true) WITH CHECK (true);

  -- AudioLibrary
  DROP POLICY IF EXISTS "Public all access on AudioLibrary" ON public."AudioLibrary";
  CREATE POLICY "Public all access on AudioLibrary" ON public."AudioLibrary" FOR ALL USING (true) WITH CHECK (true);

  -- Admin
  DROP POLICY IF EXISTS "Public all access on Admin" ON public."Admin";
  CREATE POLICY "Public all access on Admin" ON public."Admin" FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 5. STORAGE BUCKET FOR VIDEOS (Public access so videos stream on any device)
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "Public Videos Access" ON storage.objects;
    CREATE POLICY "Public Videos Access" ON storage.objects FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');
  END IF;
END $$;
`;
