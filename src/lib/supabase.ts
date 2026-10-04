import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Video, AudioTrack, NotificationItem, ReportItem, LiveStream, AdminRecord, SystemStats, CommentEntry, CommentReplyEntry } from '../types';

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

/**
 * Robust User ID comparator that safely matches IDs regardless of whether
 * one is a PostgreSQL UUID string, standard ID, or case differences.
 */
export const isSameUser = (id1?: string | null, id2?: string | null): boolean => {
  if (!id1 || !id2) return false;
  const s1 = String(id1).trim();
  const s2 = String(id2).trim();
  if (s1.toLowerCase() === s2.toLowerCase()) return true;
  return toUuid(s1) === toUuid(s2);
};

/**
 * Deterministically generates a stable, canonical conversation UUID
 * between two users regardless of who initiated the message.
 */
export const getDirectConversationId = (userId1?: string | null, userId2?: string | null): string => {
  if (!userId1 || !userId2) return crypto.randomUUID();
  const u1 = toUuid(userId1).toLowerCase();
  const u2 = toUuid(userId2).toLowerCase();
  const [first, second] = [u1, u2].sort();
  return toUuid(`dm_${first}_${second}`);
};

/**
 * Checks if a URL points to a video stream/file rather than an image
 */
export const isVideoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return (
    clean.startsWith('blob:') ||
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.includes('.mp4?') ||
    clean.includes('.webm?') ||
    clean.includes('.mov?')
  );
};

// =========================================================================
// Deleted Users Registry (ensures immediate logout across all devices)
// =========================================================================
export const recordDeletedUserId = (userId: string, email?: string | null) => {
  try {
    const raw = localStorage.getItem('viralhub_deleted_user_ids') || '[]';
    const list: string[] = JSON.parse(raw);
    const set = new Set(list);
    if (userId) {
      set.add(userId);
      set.add(toUuid(userId));
    }
    if (email) {
      set.add(email.trim().toLowerCase());
    }
    localStorage.setItem('viralhub_deleted_user_ids', JSON.stringify(Array.from(set)));
  } catch {}
};

export const isUserIdDeleted = (userId?: string | null, email?: string | null): boolean => {
  if (!userId && !email) return false;
  try {
    const raw = localStorage.getItem('viralhub_deleted_user_ids') || '[]';
    const list: string[] = JSON.parse(raw);
    const set = new Set(list.map(s => s.toLowerCase()));
    if (userId && (set.has(userId.toLowerCase()) || set.has(toUuid(userId).toLowerCase()))) {
      return true;
    }
    if (email && set.has(email.trim().toLowerCase())) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
let cachedUsersResult: { data: User[]; timestamp: number } | null = null;
let systemStatsCache: { stats: SystemStats; timestamp: number } | null = null;

export const supabaseDb = {
  // -----------------------------------------------------------------------
  // 1. User Table (UserID, Username, Email, Password, RegistrationDate, DisplayName, Bio, ProfilePictureURL)
  // -----------------------------------------------------------------------
  async fetchUsers(force = false): Promise<User[] | null> {
    if (!force && cachedUsersResult && Date.now() - cachedUsersResult.timestamp < 30000) {
      return cachedUsersResult.data;
    }

    const client = getSupabaseClient();
    if (!client) return cachedUsersResult?.data || null;

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
        return cachedUsersResult?.data || null;
      }

      // Deduplicate users by both Email and UserID to prevent duplicated accounts!
      const userMap = new Map<string, User>();
      const emailMap = new Map<string, string>(); // email -> id

      for (const row of (data || [])) {
        const uId = row.UserID || row.id || row.user_id;
        const uEmail = (row.Email || row.email || '').trim();
        const emailKey = uEmail ? uEmail.toLowerCase() : null;
        const rawRole = String(row.Role || row.role || 'creator').toLowerCase();
        const isAdminUser = rawRole === 'admin' || rawRole === 'super admin' || rawRole === 'administrator' || rawRole === 'content moderator';
        const role = isAdminUser ? 'admin' : 'creator';

        // Check if an entry for this email already exists
        if (emailKey && emailMap.has(emailKey)) {
          const existingId = emailMap.get(emailKey)!;
          const existing = userMap.get(existingId);
          if (existing) {
            // Keep admin role if either record was admin
            if (isAdminUser) {
              existing.role = 'admin';
            }
            if (row.ProfilePictureURL && !existing.avatar) {
              existing.avatar = row.ProfilePictureURL;
            }
            if (row.DisplayName && (!existing.displayName || existing.displayName === 'User')) {
              existing.displayName = row.DisplayName;
            }
            continue; // Skip creating duplicate user
          }
        }

        const newUser: User = {
          id: uId,
          username: row.Username || row.username || `user_${String(uId).slice(0, 6)}`,
          displayName: row.DisplayName || row.display_name || row.full_name || row.Username || row.username || 'User',
          email: uEmail,
          avatar: row.ProfilePictureURL || row.avatar_url || row.avatar || '',
          bio: row.Bio || row.bio || '',
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: row.IsPublic !== undefined ? !row.IsPublic : (row.is_public !== undefined ? !row.is_public : Boolean(row.isPrivate || row.is_private)),
          role: isAdminUser ? 'admin' : 'creator',
        };

        userMap.set(uId, newUser);
        if (emailKey) {
          emailMap.set(emailKey, uId);
        }
      }

      const usersList = Array.from(userMap.values());
      cachedUsersResult = { data: usersList, timestamp: Date.now() };
      return usersList;
    } catch (e) {
      console.warn('Supabase fetchUsers fallback:', e);
      return cachedUsersResult?.data || null;
    }
  },

  async upsertUser(user: User, password?: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase client not initialized' };

    try {
      let userId = toUuid(user.id);
      const cleanUsername = (user.username || `user_${userId.slice(0, 6)}`)
        .replace(/[^a-zA-Z0-9._]/g, '')
        .toLowerCase();
      const isPublic = user.isPrivate !== undefined ? !user.isPrivate : true;
      const cleanEmail = (user.email || '').trim().toLowerCase();

      // 1. Check if user already exists in User table by Email or by UserID to NEVER create duplicates!
      let existingUserId: string | null = null;
      let existingRole: string | null = null;
      if (cleanEmail) {
        try {
          const { data: existingByEmail } = await client
            .from('User')
            .select('UserID, Role, RegistrationDate')
            .ilike('Email', cleanEmail)
            .limit(1)
            .maybeSingle();

          if (existingByEmail?.UserID) {
            existingUserId = existingByEmail.UserID;
            existingRole = existingByEmail.Role;
            userId = existingByEmail.UserID; // Re-use the existing UserID!
          }
        } catch {
          // ignore
        }
      }

      const finalRole = (existingRole === 'admin' || user.role === 'admin') ? 'admin' : (user.role || 'creator');

      // If user already exists by email, UPDATE in-place instead of inserting duplicate!
      if (existingUserId) {
        const updatePayload: Record<string, any> = {
          Username: cleanUsername,
          Email: user.email || cleanEmail,
          DisplayName: user.displayName || user.username || 'User',
          Bio: user.bio || '',
          ProfilePictureURL: user.avatar || '',
          Role: finalRole,
          IsPublic: isPublic,
        };
        if (password) updatePayload.Password = password;

        let updateRes = await client.from('User').update(updatePayload).eq('UserID', existingUserId);
        if (updateRes.error && (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))) {
          // Retry without extra columns if not migrated
          const { Role: _, IsPublic: __, ...basicUpdate } = updatePayload;
          updateRes = await client.from('User').update(basicUpdate).eq('UserID', existingUserId);
        }
        return { success: !updateRes.error, error: updateRes.error?.message };
      }

      // Otherwise do upsert on UserID
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
        Role: finalRole,
      };

      let { error } = await client.from('User').upsert(payloadPascal, { onConflict: 'UserID' });

      // If 'Role' or 'IsPublic' column does not exist (code 42703), retry without them
      if (error && (error.code === '42703' || error.message?.includes('Role') || error.message?.includes('IsPublic') || error.message?.includes('column'))) {
        const { Role: _, IsPublic: __, ...withoutExtra } = payloadPascal;
        const retryPascal = await client.from('User').upsert(withoutExtra, { onConflict: 'UserID' });
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
        if (resSnake.error && (resSnake.error.code === '42703' || resSnake.error.message?.includes('column'))) {
          const { is_public: _, ...payloadSnakeWithoutPublic } = payloadSnake;
          resSnake = await client.from('users').upsert(payloadSnakeWithoutPublic, { onConflict: 'id' });
        }
        error = resSnake.error;
      }

      if (error) {
        console.error('Supabase upsertUser error:', error.message || error);
        return { success: false, error: error.message };
      }
      cachedUsersResult = null;
      return { success: true };
    } catch (e: any) {
      console.error('Supabase upsertUser exception:', e);
      return { success: false, error: e?.message || 'Database write failed' };
    }
  },

  async deleteUser(userId: string, email?: string | null): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const targetUuid = toUuid(userId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;

      // Record in local deleted IDs cache immediately
      recordDeletedUserId(userId, cleanEmail);

      // 1. Fetch user videos and delete their media files from Supabase Storage bucket
      try {
        let videoQuery = client
          .from('Video')
          .select('VideoID, VideoURL')
          .or(`UserID.eq.${targetUuid},UserID.eq.${userId}`);

        const { data: userVideos } = await videoQuery;

        if (userVideos && userVideos.length > 0) {
          for (const uv of userVideos) {
            if (uv.VideoURL) {
              await this.deleteVideoFileFromStorage(uv.VideoURL);
            }
            const uvUuid = uv.VideoID;
            try { await client.from('ReportVideo').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
            try { await client.from('VideoHashtag').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
            try { await client.from('VideoStats').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
            try { await client.from('Like').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
            try { await client.from('likes').delete().or(`video_id.eq.${uvUuid},video_id.eq.${uv.VideoID}`); } catch {}
            try { await client.from('Comment').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
            try { await client.from('comments').delete().or(`video_id.eq.${uvUuid},video_id.eq.${uv.VideoID}`); } catch {}
            try { await client.from('Share').delete().or(`VideoID.eq.${uvUuid},VideoID.eq.${uv.VideoID}`); } catch {}
          }
          await client.from('Video').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`);
          await client.from('videos').delete().or(`user_id.eq.${targetUuid},user_id.eq.${userId}`);
        }
      } catch (err) {
        console.warn('Error clearing user videos during user delete:', err);
      }

      // 2. Cascade delete from child database tables to prevent foreign key errors
      try { await client.from('Like').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`); } catch {}
      try { await client.from('likes').delete().or(`user_id.eq.${targetUuid},user_id.eq.${userId}`); } catch {}
      try { await client.from('Comment').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`); } catch {}
      try { await client.from('comments').delete().or(`user_id.eq.${targetUuid},user_id.eq.${userId}`); } catch {}
      try { await client.from('Share').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`); } catch {}
      try {
        await client.from('Following').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId},FollowingUserID.eq.${targetUuid},FollowingUserID.eq.${userId}`);
      } catch {}
      try {
        await client.from('following').delete().or(`user_id.eq.${targetUuid},user_id.eq.${userId},following_user_id.eq.${targetUuid},following_user_id.eq.${userId}`);
      } catch {}
      try {
        await client.from('Follower').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId},FollowerUserID.eq.${targetUuid},FollowerUserID.eq.${userId}`);
      } catch {}
      try {
        await client.from('follower').delete().or(`user_id.eq.${targetUuid},user_id.eq.${userId},follower_user_id.eq.${targetUuid},follower_user_id.eq.${userId}`);
      } catch {}
      try { await client.from('Notification').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`); } catch {}
      try { await client.from('ReportUser').delete().or(`ReportUserID.eq.${targetUuid},ReportedUserID.eq.${targetUuid},ReportUserID.eq.${userId},ReportedUserID.eq.${userId}`); } catch {}
      try { await client.from('ReportVideo').delete().or(`ReporterUserID.eq.${targetUuid},ReporterUserID.eq.${userId}`); } catch {}
      try { await client.from('Message').delete().or(`SenderUserID.eq.${targetUuid},SenderUserID.eq.${userId}`); } catch {}
      try { await client.from('Admin').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`); } catch {}

      // 3. Delete from User table (PascalCase and snake_case) by ID and Email
      await client.from('User').delete().or(`UserID.eq.${targetUuid},UserID.eq.${userId}`);
      await client.from('users').delete().or(`id.eq.${targetUuid},id.eq.${userId}`);
      if (cleanEmail) {
        try { await client.from('User').delete().ilike('Email', cleanEmail); } catch {}
        try { await client.from('users').delete().ilike('email', cleanEmail); } catch {}
        try { await client.from('Admin').delete().ilike('Email', cleanEmail); } catch {}
      }
      cachedUsersResult = null;
      return true;
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
  async fetchVideos(existingUsers?: User[]): Promise<Video[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      let videoRows: any[] | null = null;
      let error: any = null;

      // 1. Fetch from PascalCase 'Video' table with a reasonable limit (e.g. 80 most recent)
      // Note: Use select('*') so it never throws 42703 column missing errors if extended columns aren't created yet
      try {
        const res1 = await client
          .from('Video')
          .select('*')
          .order('PublishedAt', { ascending: false })
          .limit(80);

        if (!res1.error && res1.data) {
          videoRows = res1.data;
        } else {
          error = res1.error;
        }
      } catch (err: any) {
        error = err;
      }

      // 2. If 'Video' table failed or doesn't exist, try lowercase 'videos' table
      if (videoRows === null) {
        try {
          const res2 = await client
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(80);

          if (!res2.error && res2.data) {
            videoRows = res2.data.map((r: any) => ({
              VideoID: r.id || r.video_id,
              UserID: r.user_id || r.userId,
              VideoURL: r.video_url || r.media_url || r.url,
              ThumbnailURL: r.thumbnail_url || null,
              Caption: r.caption || '',
              PublishedAt: r.created_at || r.published_at,
              ViewCount: r.views_count || r.view_count || 0,
              Status: r.status || 'approved',
              RejectionReason: r.rejection_reason || null,
              AppealStatus: r.appeal_status || 'none',
              AppealReason: r.appeal_reason || null,
            }));
            error = null;
          }
        } catch {
          // ignore
        }
      }

      if (error && !videoRows) {
        console.warn('Supabase fetchVideos error:', error.message);
        return null;
      }

      if (!videoRows || videoRows.length === 0) {
        return [];
      }

      const videoIds = videoRows.map((r: any) => r.VideoID || r.id).filter(Boolean);

      // Fetch users to populate creator info: reuse passed existingUsers or fetch once
      const usersList = (existingUsers && existingUsers.length > 0)
        ? existingUsers
        : await this.fetchUsers();
      const usersMap = new Map((usersList || []).map(u => [u.id, u]));

      // Fetch hashtags targeted to these videoIds only!
      let hashtagsMap = new Map<string, string[]>();
      try {
        if (videoIds.length > 0) {
          const { data: tags } = await client
            .from('VideoHashtag')
            .select('VideoID, HashtagName')
            .in('VideoID', videoIds);
          if (tags) {
            tags.forEach((t: any) => {
              const list = hashtagsMap.get(t.VideoID) || [];
              list.push(t.HashtagName);
              hashtagsMap.set(t.VideoID, list);
            });
          }
        }
      } catch {
        // ignore
      }

      // Fetch like counts from VideoStats (targeted by videoIds)
      let likesCountMap = new Map<string, number>();
      try {
        if (videoIds.length > 0) {
          const { data: statsRows } = await client
            .from('VideoStats')
            .select('VideoID, LikeCount')
            .in('VideoID', videoIds);
          if (statsRows && statsRows.length > 0) {
            statsRows.forEach((s: any) => {
              if (s.VideoID) {
                likesCountMap.set(s.VideoID, s.LikeCount || 0);
              }
            });
          }
        }
      } catch {
        // ignore
      }

      // Scoped fallback for any videos missing from VideoStats (NEVER download the whole Like table)
      const missingLikeIds = videoIds.filter(id => !likesCountMap.has(id));
      if (missingLikeIds.length > 0 && missingLikeIds.length <= 40) {
        try {
          const { data: likes } = await client
            .from('Like')
            .select('VideoID')
            .in('VideoID', missingLikeIds);
          if (likes) {
            likes.forEach((l: any) => {
              likesCountMap.set(l.VideoID, (likesCountMap.get(l.VideoID) || 0) + 1);
            });
          }
        } catch {
          // ignore
        }
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
        const commentsCount = 0; // Comments count is fetched on-demand inside the comment drawer

        // If mediaUrl is a local blob (which is invalid across devices or after refresh),
        // provide a high-performance streaming video fallback so it never renders as a black box!
        let safeMediaUrl = row.VideoURL || '';
        if (!safeMediaUrl || safeMediaUrl.startsWith('blob:')) {
          safeMediaUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
        }

        // Thumbnail must strictly be an image, NEVER a video file (.mp4, .webm, blob:)!
        const rawThumb = row.ThumbnailURL || row.thumbnail_url || '';
        const isThumbVid = Boolean(
          rawThumb &&
          (rawThumb.startsWith('blob:') || /\.(mp4|webm|mov|mkv|ogg|m4v)($|\?)/i.test(rawThumb))
        );
        let safeThumbnailUrl = '';
        if (rawThumb && !isThumbVid) {
          // If rawThumb is identical to creator.avatar or contains avatar_, it is an avatar, NOT a video thumbnail!
          if (
            (creator.avatar && rawThumb.trim().toLowerCase() === creator.avatar.trim().toLowerCase()) ||
            rawThumb.includes('avatar_') ||
            rawThumb.includes('profile%20picture') ||
            rawThumb.includes('profile-picture')
          ) {
            safeThumbnailUrl = '';
          } else {
            safeThumbnailUrl = rawThumb;
          }
        } else {
          safeThumbnailUrl = '';
        }

        return {
          id: row.VideoID,
          creatorId: row.UserID,
          creator,
          caption: row.Caption || '',
          hashtags,
          mediaUrl: safeMediaUrl,
          thumbnailUrl: safeThumbnailUrl,
          likesCount,
          commentsCount,
          sharesCount: 0,
          viewsCount: String(row.ViewCount || 0),
          isLiked: false,
          createdAt: row.PublishedAt || new Date().toISOString(),
          status: (row.Status as any) || 'approved',
          rejectionReason: row.RejectionReason || undefined,
          appealStatus: (row.AppealStatus as any) || (row.appeal_status as any) || 'none',
          appealReason: row.AppealReason || row.appeal_reason || undefined,
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
      let userUuid = toUuid(video.creatorId || video.creator?.id);

      // 1. Ensure creator exists in User table and resolve true UserID
      if (video.creator) {
        await this.upsertUser(video.creator);
        if (video.creator.email) {
          try {
            const { data: dbUser } = await client
              .from('User')
              .select('UserID')
              .ilike('Email', video.creator.email.trim())
              .limit(1)
              .maybeSingle();
            if (dbUser?.UserID) {
              userUuid = dbUser.UserID;
            }
          } catch {}
        }
      }

      // 2. Base payload with the core columns guaranteed to exist in Supabase Video table
      const corePayload: Record<string, any> = {
        VideoID: videoUuid,
        UserID: userUuid,
        VideoURL: video.mediaUrl,
        Caption: video.caption || '',
        PublishedAt: new Date().toISOString(),
        ViewCount: parseInt(video.viewsCount || '0', 10) || 0,
      };

      // Only attach AudioTrackID if provided and valid UUID to avoid foreign key errors on unseeded track
      if (video.audioTrack?.id && isUuid(video.audioTrack.id)) {
        corePayload.AudioTrackID = toUuid(video.audioTrack.id);
      }

      // Extended payload with optional moderation and appeal columns if table supports them
      const extendedPayload: Record<string, any> = {
        ...corePayload,
        Status: video.status || 'approved',
      };
      if (video.rejectionReason) {
        extendedPayload.RejectionReason = video.rejectionReason;
      }
      if (video.appealStatus && video.appealStatus !== 'none') {
        extendedPayload.AppealStatus = video.appealStatus;
      }
      if (video.appealReason) {
        extendedPayload.AppealReason = video.appealReason;
      }

      // 3. Attempt upserting with extended columns first
      let { error } = await client.from('Video').upsert(extendedPayload, { onConflict: 'VideoID' });

      // Fallback 1: Column error (code 42703) -> Retry with core columns + Status + RejectionReason
      if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist'))) {
        console.warn('[Supabase] Video table missing extended columns, retrying with core columns + Status + RejectionReason:', error.message);
        const statusPayload: Record<string, any> = {
          ...corePayload,
          Status: video.status || 'approved',
        };
        if (video.rejectionReason !== undefined) {
          statusPayload.RejectionReason = video.rejectionReason;
        }
        const retry1 = await client.from('Video').upsert(statusPayload, { onConflict: 'VideoID' });
        error = retry1.error;

        // If RejectionReason or Status column also does not exist in table, retry with pure corePayload
        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          console.warn('[Supabase] Video table Status/RejectionReason column missing, retrying with pure core columns:', error.message);
          const retry2 = await client.from('Video').upsert(corePayload, { onConflict: 'VideoID' });
          error = retry2.error;
        }
      }

      // Fallback 2: Foreign key violation on AudioTrackID (code 23503) -> Retry without AudioTrackID
      if (error && (error.code === '23503' || error.message?.includes('foreign key'))) {
        console.warn('[Supabase] Foreign key violation on Video, retrying without AudioTrackID:', error.message);
        const { AudioTrackID: _, ...coreWithoutAudio } = corePayload;
        const retryFk = await client.from('Video').upsert(coreWithoutAudio, { onConflict: 'VideoID' });
        error = retryFk.error;
      }

      // Fallback 3: Lowercase 'videos' table if PascalCase doesn't exist (42P01)
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const snakePayload = {
          id: videoUuid,
          user_id: userUuid,
          video_url: video.mediaUrl,
          caption: video.caption || '',
          created_at: new Date().toISOString(),
          views_count: parseInt(video.viewsCount || '0', 10) || 0,
          status: video.status || 'approved',
        };
        const retry3 = await client.from('videos').upsert(snakePayload, { onConflict: 'id' });
        error = retry3.error;
      }

      if (error) {
        console.error(
          '[Supabase] Video insertion failed. Code:',
          error.code,
          '| Message:',
          error.message,
          '| Details:',
          error.details,
          '| Hint:',
          error.hint
        );
        return false;
      }

      // 4. Insert hashtags into VideoHashtag table (guaranteed since Video now exists in DB)
      if (Array.isArray(video.hashtags) && video.hashtags.length > 0) {
        const cleanTags = Array.from(
          new Set(
            video.hashtags
              .map(tag => (tag.startsWith('#') ? tag : `#${tag}`).trim())
              .filter(tag => tag.length > 1)
          )
        );

        if (cleanTags.length > 0) {
          const tagRows = cleanTags.map(tag => ({
            VideoID: videoUuid,
            HashtagName: tag,
          }));
          try {
            // Delete existing tags for this video first, then insert new rows
            await client.from('VideoHashtag').delete().eq('VideoID', videoUuid);
            const { error: tagError } = await client.from('VideoHashtag').insert(tagRows);
            if (tagError) {
              console.warn('[Supabase] VideoHashtag insert note:', tagError.message);
            }
          } catch (tagErr) {
            console.warn('[Supabase] VideoHashtag insert exception:', tagErr);
          }
        }
      }

      return true;
    } catch (e) {
      console.error('[Supabase] insertVideo exception:', e);
      return false;
    }
  },

  async submitVideoAppeal(videoId: string, reason: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const vUuid = toUuid(videoId);
      let res = await client
        .from('Video')
        .update({
          AppealStatus: 'pending',
          AppealReason: reason,
        })
        .or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`);

      if (res.error) {
        // Fallback for snake_case table
        await client
          .from('videos')
          .update({
            appeal_status: 'pending',
            appeal_reason: reason,
          })
          .or(`id.eq.${vUuid},id.eq.${videoId}`);
      }
      return true;
    } catch (e) {
      console.warn('Supabase submitVideoAppeal error:', e);
      return false;
    }
  },

  async reviewVideoAppeal(videoId: string, decision: 'approved' | 'declined'): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const vUuid = toUuid(videoId);
      const isApproved = decision === 'approved';
      let payload: Record<string, any> = {
        AppealStatus: decision,
        Status: isApproved ? 'approved' : 'rejected',
      };
      if (isApproved) {
        payload.RejectionReason = null;
      }

      let res = await client
        .from('Video')
        .update(payload)
        .or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`);

      if (res.error) {
        await client
          .from('videos')
          .update({
            appeal_status: decision,
            status: isApproved ? 'approved' : 'rejected',
          })
          .or(`id.eq.${vUuid},id.eq.${videoId}`);
      }
      return true;
    } catch (e) {
      console.warn('Supabase reviewVideoAppeal error:', e);
      return false;
    }
  },

  async updateVideoStatus(videoId: string, status: 'approved' | 'rejected', reason?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const vUuid = toUuid(videoId);
      const payload: Record<string, any> = {
        Status: status,
      };
      if (reason !== undefined) {
        payload.RejectionReason = reason;
      }
      if (status === 'approved') {
        payload.RejectionReason = null;
        payload.AppealStatus = 'approved';
      }
      let res = await client
        .from('Video')
        .update(payload)
        .or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`);

      if (res.error) {
        await client
          .from('videos')
          .update({
            status,
            rejection_reason: reason || null,
          })
          .or(`id.eq.${vUuid},id.eq.${videoId}`);
      }
      return true;
    } catch (e) {
      console.warn('Supabase updateVideoStatus error:', e);
      return false;
    }
  },

  async fetchAudioTracks(): Promise<AudioTrack[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      let data: any[] | null = null;
      const res1 = await client.from('AudioLibrary').select('*');
      if (!res1.error && res1.data) {
        data = res1.data;
      } else {
        const res2 = await client.from('AudioTrack').select('*');
        if (!res2.error && res2.data) {
          data = res2.data;
        }
      }

      if (!data || data.length === 0) return null;

      return data.map((r: any) => ({
        id: r.AudioTrackID || r.id,
        title: r.Title || r.title || 'Sound',
        artist: r.Artist || r.artist || 'Creator',
        duration: r.Duration || r.duration || '00:15',
        coverUrl: r.CoverURL || r.cover_url || '',
        audioUrl: r.AudioURL || r.audio_url || '',
      }));
    } catch (e) {
      console.warn('Supabase fetchAudioTracks fallback:', e);
      return null;
    }
  },

  async insertAudioTrack(track: AudioTrack): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const trackUuid = toUuid(track.id);
      const payload = {
        AudioTrackID: trackUuid,
        Title: track.title,
        Artist: track.artist,
        Duration: track.duration,
        AudioURL: track.audioUrl || '',
        CoverURL: track.coverUrl || '',
      };
      let res = await client.from('AudioLibrary').upsert(payload, { onConflict: 'AudioTrackID' });
      if (res.error) {
        await client.from('AudioTrack').upsert(payload, { onConflict: 'AudioTrackID' });
      }
      return true;
    } catch {
      return false;
    }
  },

  async uploadVideoFile(file: File): Promise<{ url: string | null; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const cleanFileName = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const mimeType = file.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');

      // 1. Inspect existing buckets or default to common video buckets
      let candidateBuckets: string[] = ['videos', 'video', 'media', 'uploads', 'public', 'files', 'posts', 'storage'];
      try {
        const { data: bucketList, error: bucketError } = await client.storage.listBuckets();
        if (!bucketError && bucketList && bucketList.length > 0) {
          const discovered = bucketList.map(b => b.name || b.id).filter(Boolean);
          // Prioritize buckets that actually exist in the project
          candidateBuckets = Array.from(new Set([...discovered, ...candidateBuckets]));
        } else {
          // Attempt to auto-create 'videos' public bucket if possible
          await client.storage.createBucket('videos', { public: true }).catch(() => {});
        }
      } catch {
        // ignore listBuckets failure
      }

      let lastError: any = null;

      // 2. Try candidate buckets
      for (const bucket of candidateBuckets) {
        // Try root filename first, then uploads/ subdirectory
        const tryPaths = [cleanFileName, `uploads/${cleanFileName}`];

        for (const targetPath of tryPaths) {
          // Try 1: with standard INSERT (upsert: false) - most compatible with Supabase RLS
          try {
            const { data, error } = await client.storage.from(bucket).upload(targetPath, file, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: false,
            });

            if (!error && data?.path) {
              const { data: pubData } = client.storage.from(bucket).getPublicUrl(targetPath);
              if (pubData?.publicUrl) {
                return { url: pubData.publicUrl };
              }
            }
            if (error) {
              lastError = error;
            }
          } catch (err: any) {
            lastError = err;
          }

          // Try 2: with upsert: true in case of object collision
          try {
            const { data, error } = await client.storage.from(bucket).upload(targetPath, file, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: true,
            });

            if (!error && data?.path) {
              const { data: pubData } = client.storage.from(bucket).getPublicUrl(targetPath);
              if (pubData?.publicUrl) {
                return { url: pubData.publicUrl };
              }
            }
            if (error) {
              lastError = error;
            }
          } catch (err: any) {
            lastError = err;
          }
        }
      }

      console.warn('Supabase storage upload note:', lastError?.message || 'Bucket upload failed');
      return { url: null, error: lastError?.message || 'Failed to upload video to Supabase Storage bucket.' };
    } catch (e: any) {
      console.warn('Supabase uploadVideoFile exception:', e);
      return { url: null, error: e?.message || 'Storage upload failed' };
    }
  },

  async uploadProfilePicture(file: File, userId?: string): Promise<{ url: string | null; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeUserId = userId ? toUuid(userId).replace(/-/g, '') : Date.now();
      const cleanFileName = `avatar_${safeUserId}_${Date.now()}.${ext}`;
      const mimeType = file.type || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

      // Candidate buckets - strictly profile picture buckets only, NEVER fallback to videos!
      let candidateBuckets: string[] = [
        'profile picture',
        'Profile Picture',
        'profile-picture',
        'profile_picture',
        'profile-pictures',
        'profile_pictures',
        'avatars',
        'images',
        'public',
      ];

      try {
        const { data: bucketList, error: bucketError } = await client.storage.listBuckets();
        if (!bucketError && bucketList && bucketList.length > 0) {
          const discovered = bucketList.map(b => b.name || b.id).filter(Boolean);
          // Prioritize any bucket with "profile", "avatar", or "picture" in the name
          const profileBuckets = discovered.filter(b => /profile|avatar|picture/i.test(b));
          candidateBuckets = Array.from(new Set([...profileBuckets, ...candidateBuckets]));
        }
      } catch {
        // ignore listBuckets failure
      }

      let lastError: any = null;

      for (const bucket of candidateBuckets) {
        // Try root filename, and also uploads/ subdirectory
        const tryPaths = [cleanFileName, `avatars/${cleanFileName}`];

        for (const targetPath of tryPaths) {
          // Attempt 1: Standard INSERT (upsert: false) - strictly matches Supabase RLS INSERT policy
          try {
            const { data, error } = await client.storage.from(bucket).upload(targetPath, file, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: false,
            });

            if (!error && data?.path) {
              const { data: pubData } = client.storage.from(bucket).getPublicUrl(targetPath);
              if (pubData?.publicUrl) {
                return { url: pubData.publicUrl };
              }
            }
            if (error) {
              lastError = error;
            }
          } catch (err: any) {
            lastError = err;
          }

          // Attempt 2: upsert: true in case file already exists or collision
          try {
            const { data, error } = await client.storage.from(bucket).upload(targetPath, file, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: true,
            });

            if (!error && data?.path) {
              const { data: pubData } = client.storage.from(bucket).getPublicUrl(targetPath);
              if (pubData?.publicUrl) {
                return { url: pubData.publicUrl };
              }
            }
            if (error) {
              lastError = error;
            }
          } catch (err: any) {
            lastError = err;
          }
        }
      }

      return { url: null, error: lastError?.message || 'Failed to upload profile picture to storage bucket' };
    } catch (e: any) {
      console.warn('Supabase uploadProfilePicture exception:', e);
      return { url: null, error: e?.message || 'Profile picture upload failed' };
    }
  },

  async deleteVideoFileFromStorage(mediaUrl?: string | null): Promise<boolean> {
    if (!mediaUrl) return false;
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const rawUrl = mediaUrl.trim();
      // Match Supabase storage URL format:
      // /storage/v1/object/public/<bucket>/<path> or /storage/v1/object/sign/<bucket>/<path>
      const match = rawUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/(.+)$/i);
      if (match) {
        const bucket = decodeURIComponent(match[1]);
        let filePath = decodeURIComponent(match[2]);
        if (filePath.includes('?')) {
          filePath = filePath.split('?')[0];
        }
        const { error } = await client.storage.from(bucket).remove([filePath]);
        if (!error) return true;
      }

      // Fallback: extract the filename (e.g. video_17279...mp4) and try candidate buckets
      const urlParts = rawUrl.split('/');
      const fileName = urlParts[urlParts.length - 1]?.split('?')[0];
      if (fileName && (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mov') || fileName.startsWith('video_'))) {
        const candidateBuckets = ['videos', 'video', 'media', 'uploads', 'public', 'files', 'posts', 'storage'];
        for (const b of candidateBuckets) {
          try {
            await client.storage.from(b).remove([fileName, `uploads/${fileName}`]);
          } catch {
            // ignore
          }
        }
      }
      return true;
    } catch (err) {
      console.warn('Supabase storage file deletion error:', err);
      return false;
    }
  },

  async deleteVideo(videoId: string, mediaUrl?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const vUuid = toUuid(videoId);

      // 1. Delete video file from Supabase Storage bucket
      if (mediaUrl) {
        await this.deleteVideoFileFromStorage(mediaUrl);
      }
      try {
        const { data: dbRow } = await client
          .from('Video')
          .select('VideoURL')
          .or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`)
          .maybeSingle();
        if (dbRow?.VideoURL) {
          await this.deleteVideoFileFromStorage(dbRow.VideoURL);
        }
      } catch {}

      // 2. Cascade delete from child database tables to prevent foreign key errors
      try { await client.from('ReportVideo').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('VideoHashtag').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('VideoStats').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('Like').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('likes').delete().or(`video_id.eq.${vUuid},video_id.eq.${videoId}`); } catch {}
      try { await client.from('Comment').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('comments').delete().or(`video_id.eq.${vUuid},video_id.eq.${videoId}`); } catch {}
      try { await client.from('Share').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}
      try { await client.from('Notification').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`); } catch {}

      // 3. Delete from Video table (PascalCase and snake_case)
      const resPascal = await client.from('Video').delete().or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`);
      if (resPascal.error) {
        await client.from('videos').delete().or(`id.eq.${vUuid},id.eq.${videoId}`);
      }
      return true;
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
  async fetchComments(videoId: string): Promise<CommentEntry[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const vUuid = toUuid(videoId);
      let commentRows: any[] | null = null;
      let error: any = null;

      // 1. Fetch from PascalCase 'Comment' table
      try {
        const videoFilter = vUuid !== videoId ? `VideoID.eq.${vUuid},VideoID.eq.${videoId}` : `VideoID.eq.${vUuid}`;
        const res1 = await client
          .from('Comment')
          .select('*')
          .or(videoFilter);

        if (!res1.error && res1.data) {
          commentRows = res1.data;
        } else {
          error = res1.error;
        }
      } catch (err: any) {
        error = err;
      }

      // 2. Fallback to lowercase 'comments' table if 'Comment' table doesn't exist
      if (commentRows === null) {
        try {
          const snakeFilter = vUuid !== videoId ? `video_id.eq.${vUuid},video_id.eq.${videoId}` : `video_id.eq.${vUuid}`;
          const res2 = await client
            .from('comments')
            .select('*')
            .or(snakeFilter);

          if (!res2.error && res2.data) {
            commentRows = res2.data.map((r: any) => ({
              CommentID: r.id || r.comment_id,
              UserID: r.user_id || r.userId,
              VideoID: r.video_id || r.videoId,
              ParentCommentID: r.parent_comment_id || r.parentCommentId || r.reply_to_id,
              CommentText: r.comment_text || r.text || r.content || '',
              CreatedAt: r.created_at || r.published_at || r.createdAt,
            }));
            error = null;
          }
        } catch {}
      }

      if (error && !commentRows) {
        console.warn('Supabase fetchComments error:', error.message);
        return null;
      }

      if (!commentRows || commentRows.length === 0) {
        return [];
      }

      // 3. Resolve user details for all commenter UserIDs
      const rawUserIds = commentRows.map((r: any) => r.UserID || r.user_id).filter(Boolean);
      const userIds = Array.from(new Set(rawUserIds));

      const userMap = new Map<string, { name: string; avatar: string; username: string }>();

      // Check User table in Supabase
      if (userIds.length > 0) {
        try {
          const { data: dbUsers } = await client
            .from('User')
            .select('UserID, Username, DisplayName, ProfilePictureURL')
            .in('UserID', userIds);

          if (dbUsers && dbUsers.length > 0) {
            dbUsers.forEach((u: any) => {
              const uId = String(u.UserID || u.id || '').toLowerCase();
              const name = u.DisplayName || u.Username || 'User';
              const avatar = u.ProfilePictureURL || '';
              const username = u.Username || '';
              if (uId) {
                userMap.set(uId, { name, avatar, username });
              }
            });
          }
        } catch {
          // fallback
        }
      }

      // Also check cached users from AppContext / supabaseDb cache
      if (cachedUsersResult?.data) {
        cachedUsersResult.data.forEach(u => {
          const key1 = String(u.id).toLowerCase();
          const key2 = toUuid(u.id).toLowerCase();
          const entry = {
            name: u.displayName || u.username || 'User',
            avatar: u.avatar || '',
            username: u.username || '',
          };
          if (!userMap.has(key1)) userMap.set(key1, entry);
          if (!userMap.has(key2)) userMap.set(key2, entry);
        });
      }

      // 4. Map comment rows to CommentEntry objects
      const topLevel: CommentEntry[] = [];
      const repliesMap = new Map<string, CommentReplyEntry[]>();

      for (const row of commentRows) {
        const cId = String(row.CommentID || row.id || row.comment_id || '');
        const uId = String(row.UserID || row.user_id || '');
        const parentId = row.ParentCommentID || row.parent_comment_id || null;
        const text = String(row.CommentText || row.comment_text || row.text || row.content || '');
        const timestamp =
          row.CreatedAt ||
          row.created_at ||
          row.CommentedAt ||
          row.commented_at ||
          new Date().toISOString();

        const userMeta =
          userMap.get(uId.toLowerCase()) ||
          userMap.get(toUuid(uId).toLowerCase()) || {
            name: `User ${uId.slice(0, 5)}`,
            avatar: '',
            username: `user_${uId.slice(0, 5)}`,
          };

        if (parentId) {
          const pId = String(parentId).toLowerCase();
          const list = repliesMap.get(pId) || [];
          list.push({
            id: cId,
            name: userMeta.name,
            avatar: userMeta.avatar,
            text,
            timestamp,
            userId: uId,
          });
          repliesMap.set(pId, list);
        } else {
          topLevel.push({
            id: cId,
            name: userMeta.name,
            avatar: userMeta.avatar,
            text,
            timestamp,
            likesCount: 0,
            isLiked: false,
            userId: uId,
            replies: [],
          });
        }
      }

      // Attach replies to top-level comments
      for (const comment of topLevel) {
        const key1 = comment.id.toLowerCase();
        const key2 = toUuid(comment.id).toLowerCase();
        const list1 = repliesMap.get(key1) || [];
        const list2 = key2 !== key1 ? (repliesMap.get(key2) || []) : [];
        const rawReplies = [...list1, ...list2];

        // Deduplicate replies strictly by ID
        const seenReplyIds = new Set<string>();
        const uniqueReplies: CommentReplyEntry[] = [];
        for (const rep of rawReplies) {
          const rId = (rep.id || '').toLowerCase();
          if (rId && !seenReplyIds.has(rId)) {
            seenReplyIds.add(rId);
            uniqueReplies.push(rep);
          } else if (!rId) {
            uniqueReplies.push(rep);
          }
        }

        if (uniqueReplies.length > 0) {
          comment.replies = uniqueReplies;
          repliesMap.delete(key1);
          repliesMap.delete(key2);
        }
      }

      // Promote any orphaned replies to top-level comments so none are lost
      for (const [_, orphans] of repliesMap.entries()) {
        if (orphans && orphans.length > 0) {
          for (const orphan of orphans) {
            topLevel.push({
              id: orphan.id,
              name: orphan.name,
              avatar: orphan.avatar,
              text: orphan.text,
              timestamp: orphan.timestamp,
              likesCount: 0,
              isLiked: false,
              userId: orphan.userId,
              replies: [],
            });
          }
        }
      }

      return topLevel;
    } catch (e) {
      console.warn('Supabase fetchComments exception:', e);
      return null;
    }
  },

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

  async deleteComment(commentId: string, videoId?: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const cUuid = toUuid(commentId);
      const { error } = await client.from('Comment').delete().or(`CommentID.eq.${cUuid},CommentID.eq.${commentId}`);
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

  async fetchFollows(): Promise<{ followerId: string; followingId: string }[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client.from('Following').select('*');
      if (error || !data) return null;
      return data.map((r: any) => ({
        followerId: r.UserID || r.user_id,
        followingId: r.FollowingUserID || r.following_user_id,
      })).filter(f => f.followerId && f.followingId);
    } catch (e) {
      console.warn('Supabase fetchFollows fallback:', e);
      return null;
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
      const senderUuid = toUuid(senderId);
      const recipientUuid = toUuid(recipientId);
      const msgUuid = toUuid(messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

      // Determine canonical conversation ID
      let actualConvUuid = isUuid(conversationId)
        ? toUuid(conversationId)
        : getDirectConversationId(senderId, recipientId);

      // Check if a conversation record between these two users already exists in Supabase
      try {
        const { data: existingDbConv } = await client
          .from('Conversation')
          .select('ConversationID')
          .or(`and(UserIDA.eq.${senderUuid},UserIDB.eq.${recipientUuid}),and(UserIDA.eq.${recipientUuid},UserIDB.eq.${senderUuid})`)
          .limit(1)
          .maybeSingle();

        if (existingDbConv?.ConversationID) {
          actualConvUuid = existingDbConv.ConversationID;
        } else {
          // If none exists, create the conversation row
          await client.from('Conversation').upsert(
            {
              ConversationID: actualConvUuid,
              UserIDA: senderUuid,
              UserIDB: recipientUuid,
              CreatedAt: new Date().toISOString(),
            },
            { onConflict: 'ConversationID' }
          );
        }
      } catch {
        try {
          await client.from('Conversation').upsert(
            {
              ConversationID: actualConvUuid,
              UserIDA: senderUuid,
              UserIDB: recipientUuid,
              CreatedAt: new Date().toISOString(),
            },
            { onConflict: 'ConversationID' }
          );
        } catch {}
      }

      // Insert message into Message table with actualConvUuid
      const { error } = await client.from('Message').insert({
        MessageID: msgUuid,
        ConversationID: actualConvUuid,
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

  async fetchConversationsAndMessages(currentUserId: string): Promise<any[] | null> {
    const client = getSupabaseClient();
    if (!client || !currentUserId) return null;

    try {
      const currentUuid = toUuid(currentUserId);
      const { data: convData, error: convError } = await client
        .from('Conversation')
        .select('*')
        .or(`UserIDA.eq.${currentUuid},UserIDB.eq.${currentUuid},UserIDA.eq.${currentUserId},UserIDB.eq.${currentUserId}`);

      if (convError || !convData || convData.length === 0) {
        return null;
      }

      const convIds = convData.map((c: any) => c.ConversationID || c.id);
      const { data: msgData } = await client
        .from('Message')
        .select('*')
        .in('ConversationID', convIds)
        .order('SentAt', { ascending: true });

      const messagesByConv = new Map<string, any[]>();
      (msgData || []).forEach((m: any) => {
        const list = messagesByConv.get(m.ConversationID) || [];
        list.push(m);
        messagesByConv.set(m.ConversationID, list);
      });

      return convData.map((c: any) => {
        const cId = c.ConversationID || c.id;
        const rawMsgs = messagesByConv.get(cId) || [];
        return {
          id: cId,
          userAId: c.UserIDA,
          userBId: c.UserIDB,
          createdAt: c.CreatedAt,
          rawMessages: rawMsgs,
        };
      });
    } catch (e) {
      console.warn('Supabase fetchConversationsAndMessages fallback:', e);
      return null;
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

      // Serialize rich notification metadata inside NotificationMessage so actor, video, and request IDs are preserved!
      const payloadString = JSON.stringify({
        text: item.targetText || '',
        actor: item.actor,
        videoId: item.videoId,
        requestId: item.requestId,
        status: item.status,
        appealStatus: item.appealStatus,
      });

      const { error } = await client.from('Notification').insert({
        NotificationID: notifUuid,
        UserID: userUuid,
        NotificationType: item.type,
        NotificationMessage: payloadString,
        IsRead: !item.isUnread,
        NotificationDate: item.createdAt || item.timestamp || new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('Supabase insertNotification fallback:', e);
      return false;
    }
  },

  async fetchNotifications(): Promise<NotificationItem[] | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('Notification')
        .select('*')
        .order('NotificationDate', { ascending: false });

      if (error || !data) return null;

      const items: NotificationItem[] = [];
      for (const r of data) {
        // Discard generic non-JSON duplicate trigger messages (e.g. "Someone commented on your video" or "Someone liked your video")
        const rawMsg = typeof r.NotificationMessage === 'string' ? r.NotificationMessage.trim() : '';
        const isGenericTrigger =
          !rawMsg.startsWith('{') &&
          (rawMsg.toLowerCase().includes('someone commented') ||
           rawMsg.toLowerCase().includes('commented on your video') ||
           rawMsg.toLowerCase().includes('someone liked'));

        if (isGenericTrigger) {
          // Skip redundant generic system notification so it never duplicates rich notifications!
          continue;
        }

        const isRevoked = r.NotificationType === 'video_revoked';
        const isAppeal = r.NotificationType === 'appeal_status';

        let targetText = r.NotificationMessage || '';
        let actor = {
          id: isRevoked || isAppeal ? 'viralhub_moderation' : 'system',
          username: isRevoked || isAppeal ? 'moderation' : 'viralhub',
          displayName: isRevoked || isAppeal ? 'ViralHub Moderation' : 'ViralHub',
          avatar: '',
        };
        let videoId = r.VideoID || undefined;
        let requestId: string | undefined = undefined;
        let status: any = undefined;
        let appealStatus: any = isRevoked ? 'none' : undefined;

        // Attempt to parse rich JSON payload
        if (rawMsg.startsWith('{')) {
          try {
            const parsed = JSON.parse(r.NotificationMessage);
            if (parsed.actor && parsed.actor.id) actor = parsed.actor;
            if (parsed.text) targetText = parsed.text;
            if (parsed.videoId) videoId = parsed.videoId;
            if (parsed.requestId) requestId = parsed.requestId;
            if (parsed.status) status = parsed.status;
            if (parsed.appealStatus) appealStatus = parsed.appealStatus;
          } catch {
            // Keep default fallback
          }
        }

        items.push({
          id: r.NotificationID,
          recipientId: r.UserID,
          type: (r.NotificationType as any) || 'like',
          actor,
          targetText,
          timestamp: r.NotificationDate || new Date().toISOString(),
          createdAt: r.NotificationDate || new Date().toISOString(),
          isUnread: !r.IsRead,
          videoId,
          requestId,
          status,
          appealStatus,
        });
      }
      return items;
    } catch (e) {
      console.warn('Supabase fetchNotifications fallback:', e);
      return null;
    }
  },

  async updateUserRole(userId: string, newRole: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !userId) return false;

    try {
      const uUuid = toUuid(userId);
      const cleanRole = newRole.toLowerCase();
      const isAdminRole = cleanRole === 'admin' || cleanRole === 'super admin' || cleanRole === 'administrator';

      // 1. Update User table
      let updateRes = await client
        .from('User')
        .update({ Role: cleanRole })
        .or(`UserID.eq.${uUuid},UserID.eq.${userId}`);

      if (updateRes.error) {
        // Fallback for snake_case table
        await client
          .from('users')
          .update({ role: cleanRole })
          .or(`id.eq.${uUuid},id.eq.${userId}`);
      }

      // 2. Sync Admin table
      if (isAdminRole) {
        // Get user details to populate Admin record
        const { data: dbUser } = await client
          .from('User')
          .select('Username, Email, DisplayName')
          .or(`UserID.eq.${uUuid},UserID.eq.${userId}`)
          .maybeSingle();

        const username = dbUser?.Username || dbUser?.DisplayName || `admin_${String(userId).slice(0, 6)}`;
        const email = dbUser?.Email || `${username}@viralhub.app`;

        await client.from('Admin').upsert(
          {
            AdminID: uUuid,
            UserID: uUuid,
            Username: username,
            Email: email,
            Role: 'Admin',
            Permissions: ['manage_users', 'manage_videos', 'manage_reports'],
            CreatedAt: new Date().toISOString(),
            LastLogin: new Date().toISOString(),
          },
          { onConflict: 'AdminID' }
        );
      } else {
        // If demoted from admin, remove from Admin table
        await client
          .from('Admin')
          .delete()
          .or(`AdminID.eq.${uUuid},UserID.eq.${uUuid},UserID.eq.${userId}`);
      }

      return true;
    } catch (e) {
      console.warn('Supabase updateUserRole fallback:', e);
      return false;
    }
  },

  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const nUuid = toUuid(notificationId);
      await client
        .from('Notification')
        .update({ IsRead: true })
        .or(`NotificationID.eq.${nUuid},NotificationID.eq.${notificationId}`);
      return true;
    } catch (e) {
      console.warn('Supabase markNotificationAsRead warning:', e);
      return false;
    }
  },

  async markAllNotificationsAsRead(recipientId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const uUuid = toUuid(recipientId);
      await client
        .from('Notification')
        .update({ IsRead: true })
        .or(`UserID.eq.${uUuid},UserID.eq.${recipientId}`);
      return true;
    } catch (e) {
      console.warn('Supabase markAllNotificationsAsRead warning:', e);
      return false;
    }
  },

  async updateNotificationStatus(
    notificationIdOrRequestId: string,
    newStatus: 'accepted' | 'confirmed' | 'declined',
    newText?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const targetUuid = toUuid(notificationIdOrRequestId);
      // Fetch the notification first by ID
      const { data } = await client
        .from('Notification')
        .select('*')
        .or(`NotificationID.eq.${targetUuid},NotificationID.eq.${notificationIdOrRequestId}`)
        .maybeSingle();

      if (data) {
        let parsed: any = {};
        if (data.NotificationMessage && data.NotificationMessage.trim().startsWith('{')) {
          try {
            parsed = JSON.parse(data.NotificationMessage);
          } catch {}
        } else {
          parsed = { text: data.NotificationMessage || '' };
        }

        parsed.status = newStatus;
        if (newText) parsed.text = newText;

        await client
          .from('Notification')
          .update({
            NotificationMessage: JSON.stringify(parsed),
            IsRead: true,
          })
          .or(`NotificationID.eq.${targetUuid},NotificationID.eq.${notificationIdOrRequestId}`);
      } else {
        // Query by requestId serialized inside NotificationMessage
        const { data: allNotifs } = await client
          .from('Notification')
          .select('*')
          .ilike('NotificationMessage', `%"requestId":"${notificationIdOrRequestId}"%`);
        if (allNotifs && allNotifs.length > 0) {
          for (const row of allNotifs) {
            let parsed: any = {};
            try { parsed = JSON.parse(row.NotificationMessage); } catch {}
            parsed.status = newStatus;
            if (newText) parsed.text = newText;
            await client
              .from('Notification')
              .update({
                NotificationMessage: JSON.stringify(parsed),
                IsRead: true,
              })
              .eq('NotificationID', row.NotificationID);
          }
        }
      }
      return true;
    } catch (e) {
      console.warn('Supabase updateNotificationStatus warning:', e);
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
            reporterId: r.ReporterUserID || undefined,
            type: 'video',
            targetId: r.VideoID,
            targetName: `Video #${r.VideoID ? String(r.VideoID).slice(0, 8) : 'Unknown'}`,
            targetSubtitle: r.Reason || '',
            scenario: r.Reason ? r.Reason.split(':')[0] : 'Inappropriate Content',
            description: r.Reason || '',
            status: (r.Status as any) || 'Under Review',
            timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
            createdAt: r.ReportedDate || new Date().toISOString(),
          });
        });
      }

      if (userRes.data) {
        userRes.data.forEach((r: any) => {
          items.push({
            id: r.ReportID,
            reporterId: r.ReportUserID || undefined,
            type: 'user',
            targetId: r.ReportedUserID,
            targetName: `User #${r.ReportedUserID ? String(r.ReportedUserID).slice(0, 8) : 'Account'}`,
            targetSubtitle: r.Reason || '',
            scenario: r.Reason ? r.Reason.split(':')[0] : 'Community Violation',
            description: r.Reason || '',
            status: (r.Status as any) || 'Under Review',
            timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
            createdAt: r.ReportedDate || new Date().toISOString(),
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
          ReportedDate: report.createdAt || new Date().toISOString(),
        });
        return !error;
      } else {
        const { error } = await client.from('ReportUser').insert({
          ReportID: reportUuid,
          ReportUserID: reporterUuid,
          ReportedUserID: targetUuid,
          Reason: reasonText,
          Status: report.status || 'Under Review',
          ReportedDate: report.createdAt || new Date().toISOString(),
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
      if (error) {
        const altTable = type === 'video' ? 'ReportUser' : 'ReportVideo';
        await client.from(altTable).update({ Status: status }).eq('ReportID', rUuid);
      }
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

  async checkIsAdmin(user?: Partial<User> | null): Promise<boolean> {
    if (!user) return false;
    const currentRole = String(user.role || '').toLowerCase();
    if (currentRole === 'admin' || currentRole === 'super admin' || currentRole === 'administrator') return true;

    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const email = (user.email || '').trim().toLowerCase();
      const username = (user.username || '').trim().toLowerCase();
      const userUuid = user.id ? toUuid(user.id) : null;

      // 1. Query PascalCase Admin table
      if (email || username || userUuid) {
        const clauses: string[] = [];
        if (email) clauses.push(`Email.ilike.${email}`);
        if (username) clauses.push(`Username.ilike.${username}`);
        if (userUuid) clauses.push(`UserID.eq.${userUuid}`);

        const { data: adminData, error: adminErr } = await client
          .from('Admin')
          .select('*')
          .or(clauses.join(','))
          .limit(1);

        if (adminData && adminData.length > 0) {
          return true;
        }

        // Only retry lowercase admins table if the PascalCase 'Admin' table does not exist (code 42P01)
        if (adminErr && adminErr.code === '42P01') {
          const { data: lowerAdminData } = await client
            .from('admins')
            .select('*')
            .or(clauses.map(c => c.toLowerCase()).join(','))
            .limit(1);

          if (lowerAdminData && lowerAdminData.length > 0) {
            return true;
          }
        }
      }

      // 2. Also check if User table has Role = 'admin' / 'Super Admin'
      if (email || userUuid) {
        let userQuery = client.from('User').select('*');
        if (email) {
          userQuery = userQuery.ilike('Email', email);
        } else if (userUuid) {
          userQuery = userQuery.eq('UserID', userUuid);
        }
        const { data: userRow } = await userQuery.limit(1).maybeSingle();

        if (userRow) {
          const r = String(userRow.Role || userRow.role || '').toLowerCase();
          if (r === 'admin' || r === 'super admin' || r === 'administrator' || r === 'content moderator') {
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('Check admin query fallback:', e);
    }
    return false;
  },

  // -----------------------------------------------------------------------
  // 12. System Stats & Direct Table Inspector (Live counts from Supabase)
  // -----------------------------------------------------------------------
  async fetchSystemStats(force = false): Promise<SystemStats> {
    if (!force && systemStatsCache && Date.now() - systemStatsCache.timestamp < 60000) {
      return systemStatsCache.stats;
    }

    const client = getSupabaseClient();
    const fallbackStats: SystemStats = systemStatsCache?.stats || {
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

      const computedStats: SystemStats = {
        totalUsers: usersRes.count ?? 0,
        totalVideos: videosRes.count ?? 0,
        totalLikes: likesRes.count ?? 0,
        totalComments: commentsRes.count ?? 0,
        totalShares: sharesRes.count ?? 0,
        totalReports,
        activeLivestreams: livestreamsRes.count ?? 0,
        totalAdmins: (adminsRes as any)?.count ?? 0,
      };

      systemStatsCache = { stats: computedStats, timestamp: Date.now() };
      return computedStats;
    } catch (e) {
      console.warn('Supabase fetchSystemStats fallback:', e);
      return fallbackStats;
    }
  },

  async fetchAllTableCounts(): Promise<Record<string, number>> {
    return {};
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
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "ThumbnailURL" TEXT;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "RejectionReason" TEXT;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "AppealStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "AppealReason" TEXT;

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

-- 6. REALTIME REPLICATION (Safe & non-destructive: pushes INSERT events via WebSockets with 0 Disk IO)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'Message') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Message";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'Conversation') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Conversation";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'Notification') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification";
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
`;
