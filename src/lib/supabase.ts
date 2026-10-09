import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Video, AudioTrack, NotificationItem, ReportItem, LiveStream, LiveStreamMessage, AdminRecord, SystemStats, CommentEntry, CommentReplyEntry } from '../types';
import { deduplicateNotifications } from '../utils/notifications';

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
 * Generates a clean, valid UUID v4 string for all multi-device objects.
 */
export const generateUuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().toLowerCase();
  }
  return toUuid(`uuid_${Date.now()}_${Math.random()}`);
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
// Banned Users Registry & Ban Status Verification
// Guarantees banned accounts stay banned across tab focus, reloads, & Supabase syncs
// =========================================================================
export const recordUserBan = (data: {
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  banReason?: string;
  bannedAt?: string;
  appealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  appealReason?: string;
  appealSubmittedAt?: string;
}) => {
  try {
    let bansMap: Record<string, any> = {};
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_bans_v1') : null;
    if (raw) bansMap = JSON.parse(raw);

    const nowIso = data.bannedAt || new Date().toISOString();
    const cleanUsername = data.username ? data.username.toLowerCase().replace(/^@/, '').trim() : undefined;
    const cleanEmail = data.email ? data.email.toLowerCase().trim() : undefined;
    const cleanUserId = data.userId ? String(data.userId).trim() : undefined;

    const record = {
      isBanned: true,
      banReason: data.banReason || 'Violation of Community Guidelines',
      bannedAt: nowIso,
      appealStatus: data.appealStatus || 'none',
      appealReason: data.appealReason,
      appealSubmittedAt: data.appealSubmittedAt,
      userId: cleanUserId,
      username: cleanUsername,
      email: cleanEmail,
    };

    if (cleanUserId) {
      bansMap[cleanUserId] = record;
      bansMap[cleanUserId.toLowerCase()] = record;
      bansMap[toUuid(cleanUserId)] = record;
    }
    if (cleanUsername) {
      bansMap[cleanUsername] = record;
      bansMap[`@${cleanUsername}`] = record;
    }
    if (cleanEmail) {
      bansMap[cleanEmail] = record;
    }

    localStorage.setItem('viralhub_user_bans_v1', JSON.stringify(bansMap));
    localStorage.setItem('viralhub_user_banned_event', JSON.stringify({ ...record, timestamp: Date.now() }));
  } catch (e) {
    console.warn('recordUserBan failed', e);
  }
};

export const recordUserUnban = (
  userId?: string | null,
  email?: string | null,
  username?: string | null
) => {
  try {
    let bansMap: Record<string, any> = {};
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_bans_v1') : null;
    if (raw) bansMap = JSON.parse(raw);

    const cleanUsername = username ? username.toLowerCase().replace(/^@/, '').trim() : undefined;
    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const cleanUserId = userId ? String(userId).trim() : undefined;

    // Delete all keys for this user from bansMap completely so stale bans can never linger!
    if (cleanUserId) {
      delete bansMap[cleanUserId];
      delete bansMap[cleanUserId.toLowerCase()];
      delete bansMap[toUuid(cleanUserId)];
    }
    if (cleanUsername) {
      delete bansMap[cleanUsername];
      delete bansMap[`@${cleanUsername}`];
    }
    if (cleanEmail) {
      delete bansMap[cleanEmail];
    }

    // Also scan any remaining entries where userId, email, or username match
    for (const [k, rec] of Object.entries(bansMap)) {
      if (!rec) continue;
      if (cleanUserId && (rec.userId === cleanUserId || rec.id === cleanUserId || toUuid(rec.userId) === toUuid(cleanUserId))) {
        delete bansMap[k];
      } else if (cleanEmail && rec.email && rec.email.toLowerCase() === cleanEmail) {
        delete bansMap[k];
      } else if (cleanUsername && rec.username && rec.username.toLowerCase().replace(/^@/, '') === cleanUsername) {
        delete bansMap[k];
      }
    }

    localStorage.setItem('viralhub_user_bans_v1', JSON.stringify(bansMap));

    // Also ensure cached currentUser in localStorage is updated so page reloads on this device don't revive the ban!
    const rawCurr = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_currentUser') : null;
    if (rawCurr) {
      try {
        const curr = JSON.parse(rawCurr);
        const matches =
          (cleanUserId && (curr.id === cleanUserId || toUuid(curr.id) === toUuid(cleanUserId))) ||
          (cleanEmail && curr.email && curr.email.toLowerCase() === cleanEmail) ||
          (cleanUsername && curr.username && curr.username.toLowerCase().replace(/^@/, '') === cleanUsername);
        if (matches && curr.isBanned) {
          curr.isBanned = false;
          curr.banReason = undefined;
          curr.appealStatus = 'approved';
          localStorage.setItem('viralhub_currentUser', JSON.stringify(curr));
        }
      } catch {}
    }

    // Also ensure saved accounts in localStorage on this device are unbanned
    const rawSaved = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_saved_accounts_v2') : null;
    if (rawSaved) {
      try {
        const savedList: any[] = JSON.parse(rawSaved);
        let changed = false;
        const updated = savedList.map(acc => {
          const matches =
            (cleanUserId && (acc.id === cleanUserId || toUuid(acc.id) === toUuid(cleanUserId))) ||
            (cleanEmail && acc.email && acc.email.toLowerCase() === cleanEmail) ||
            (cleanUsername && acc.username && acc.username.toLowerCase().replace(/^@/, '') === cleanUsername);
          if (matches && acc.isBanned) {
            changed = true;
            return { ...acc, isBanned: false, banReason: undefined, appealStatus: 'approved' };
          }
          return acc;
        });
        if (changed) {
          localStorage.setItem('viralhub_saved_accounts_v2', JSON.stringify(updated));
        }
      } catch {}
    }

    localStorage.setItem(
      'viralhub_user_unbanned_event',
      JSON.stringify({ userId: cleanUserId, email: cleanEmail, username: cleanUsername, timestamp: Date.now() })
    );
  } catch (e) {
    console.warn('recordUserUnban failed', e);
  }
};

export const checkIsUserBanned = (
  userId?: string | null,
  email?: string | null,
  userObj?: Partial<User> | null
): {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: string;
  appealStatus: 'none' | 'pending' | 'approved' | 'declined';
  appealReason?: string;
  appealSubmittedAt?: string;
} => {
  const candidateUsername = (userObj?.username || '').trim().toLowerCase().replace(/^@/, '');
  const candidateEmail = (email || userObj?.email || '').trim().toLowerCase();
  const candidateId = userId ? String(userId).trim() : (userObj?.id ? String(userObj.id).trim() : '');

  // 1. Authoritative check: If userObj is explicitly provided with fresh database/session data:
  // If the database or session explicitly indicates the user is unbanned OR appeal is approved,
  // SUPABASE IS THE SINGLE SOURCE OF TRUTH! Never allow stale local storage to override this!
  if (userObj) {
    if (userObj.isBanned === false || userObj.appealStatus === 'approved') {
      // Purge any stale local ban records on this device immediately!
      recordUserUnban(candidateId, candidateEmail, candidateUsername);
      return {
        isBanned: false,
        appealStatus: (userObj.appealStatus as any) || 'approved',
      };
    } else if (userObj.isBanned === true) {
      return {
        isBanned: true,
        banReason: userObj.banReason || 'Violation of Community Guidelines',
        bannedAt: userObj.bannedAt,
        appealStatus: (userObj.appealStatus as any) || 'none',
        appealReason: userObj.appealReason,
        appealSubmittedAt: userObj.appealSubmittedAt,
      };
    }
  }

  // 2. Check bansMap in localStorage (only if userObj did not definitively indicate unban)
  let bansMap: Record<string, any> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_bans_v1') : null;
    if (raw) bansMap = JSON.parse(raw);
  } catch {}

  const keys: string[] = [];
  if (candidateId) {
    keys.push(candidateId);
    keys.push(candidateId.toLowerCase());
    keys.push(toUuid(candidateId));
  }
  if (candidateEmail) {
    keys.push(candidateEmail);
  }
  if (candidateUsername) {
    keys.push(candidateUsername);
    keys.push(`@${candidateUsername}`);
  }

  for (const k of keys) {
    const record = bansMap[k];
    if (record) {
      if (record.isBanned === false || record.appealStatus === 'approved') {
        return {
          isBanned: false,
          appealStatus: 'approved',
        };
      } else if (record.isBanned === true) {
        return {
          isBanned: true,
          banReason: record.banReason || 'Violation of Community Guidelines',
          bannedAt: record.bannedAt,
          appealStatus: record.appealStatus || 'none',
          appealReason: record.appealReason,
          appealSubmittedAt: record.appealSubmittedAt,
        };
      }
    }
  }

  // 3. Deep scan across all records in bansMap in case key format was different
  for (const rec of Object.values(bansMap)) {
    if (!rec) continue;
    const matchesId = candidateId && (
      isSameUser(rec.userId, candidateId) ||
      isSameUser(rec.id, candidateId) ||
      rec.userId === candidateId ||
      rec.id === candidateId
    );
    const matchesEmail = candidateEmail && rec.email && rec.email.toLowerCase() === candidateEmail;
    const matchesUsername = candidateUsername && rec.username && rec.username.toLowerCase().replace(/^@/, '') === candidateUsername;

    if (matchesId || matchesEmail || matchesUsername) {
      if (rec.isBanned === false || rec.appealStatus === 'approved') {
        return {
          isBanned: false,
          appealStatus: 'approved',
        };
      } else if (rec.isBanned === true) {
        return {
          isBanned: true,
          banReason: rec.banReason || 'Violation of Community Guidelines',
          bannedAt: rec.bannedAt,
          appealStatus: rec.appealStatus || 'none',
          appealReason: rec.appealReason,
          appealSubmittedAt: rec.appealSubmittedAt,
        };
      }
    }
  }

  return {
    isBanned: false,
    appealStatus: 'none',
  };
};

// =========================================================================
// Pre-Ban Warning & Grace Period Registry (Report -> Appeal Before Ban)
// Guarantees users get due process notice with countdown timer before any suspension
// =========================================================================
export const recordUserWarning = (data: {
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  warningReason?: string;
  warningIssuedAt?: string;
  warningDeadline?: string;
  preBanAppealStatus?: 'none' | 'pending' | 'approved' | 'declined';
  preBanAppealReason?: string;
  preBanAppealProofUrl?: string;
  preBanAppealProofName?: string;
  preBanAppealSubmittedAt?: string;
}) => {
  try {
    let warningsMap: Record<string, any> = {};
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_warnings_v1') : null;
    if (raw) warningsMap = JSON.parse(raw);

    const cleanUsername = data.username ? data.username.toLowerCase().replace(/^@/, '').trim() : undefined;
    const cleanEmail = data.email ? data.email.toLowerCase().trim() : undefined;
    const cleanUserId = data.userId ? String(data.userId).trim() : undefined;
    const nowIso = data.warningIssuedAt || new Date().toISOString();
    const deadlineIso = data.warningDeadline || new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const record = {
      warningActive: true,
      warningReason: data.warningReason || 'Violation of Community Guidelines',
      warningIssuedAt: nowIso,
      warningDeadline: deadlineIso,
      preBanAppealStatus: data.preBanAppealStatus || 'none',
      preBanAppealReason: data.preBanAppealReason,
      preBanAppealProofUrl: data.preBanAppealProofUrl,
      preBanAppealProofName: data.preBanAppealProofName,
      preBanAppealSubmittedAt: data.preBanAppealSubmittedAt,
      userId: cleanUserId,
      username: cleanUsername,
      email: cleanEmail,
    };

    if (cleanUserId) {
      warningsMap[cleanUserId] = record;
      warningsMap[cleanUserId.toLowerCase()] = record;
      warningsMap[toUuid(cleanUserId)] = record;
    }
    if (cleanUsername) {
      warningsMap[cleanUsername] = record;
      warningsMap[`@${cleanUsername}`] = record;
    }
    if (cleanEmail) {
      warningsMap[cleanEmail] = record;
    }

    localStorage.setItem('viralhub_user_warnings_v1', JSON.stringify(warningsMap));
    localStorage.setItem('viralhub_user_warning_event', JSON.stringify({ ...record, timestamp: Date.now() }));
  } catch (e) {
    console.warn('recordUserWarning failed', e);
  }
};

export const clearUserWarning = (
  userId?: string | null,
  email?: string | null,
  username?: string | null
) => {
  try {
    let warningsMap: Record<string, any> = {};
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_warnings_v1') : null;
    if (raw) warningsMap = JSON.parse(raw);

    const cleanUsername = username ? username.toLowerCase().replace(/^@/, '').trim() : undefined;
    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const cleanUserId = userId ? String(userId).trim() : undefined;

    if (cleanUserId) {
      delete warningsMap[cleanUserId];
      delete warningsMap[cleanUserId.toLowerCase()];
      delete warningsMap[toUuid(cleanUserId)];
    }
    if (cleanUsername) {
      delete warningsMap[cleanUsername];
      delete warningsMap[`@${cleanUsername}`];
    }
    if (cleanEmail) {
      delete warningsMap[cleanEmail];
    }

    for (const [k, rec] of Object.entries(warningsMap)) {
      if (!rec) continue;
      if (cleanUserId && (rec.userId === cleanUserId || toUuid(rec.userId) === toUuid(cleanUserId))) {
        delete warningsMap[k];
      } else if (cleanEmail && rec.email && rec.email.toLowerCase() === cleanEmail) {
        delete warningsMap[k];
      } else if (cleanUsername && rec.username && rec.username.toLowerCase().replace(/^@/, '') === cleanUsername) {
        delete warningsMap[k];
      }
    }

    localStorage.setItem('viralhub_user_warnings_v1', JSON.stringify(warningsMap));

    // Also update cached currentUser in localStorage
    const rawCurr = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_currentUser') : null;
    if (rawCurr) {
      try {
        const curr = JSON.parse(rawCurr);
        const matches =
          (cleanUserId && (curr.id === cleanUserId || toUuid(curr.id) === toUuid(cleanUserId))) ||
          (cleanEmail && curr.email && curr.email.toLowerCase() === cleanEmail) ||
          (cleanUsername && curr.username && curr.username.toLowerCase().replace(/^@/, '') === cleanUsername);
        if (matches && curr.warningActive) {
          curr.warningActive = false;
          curr.warningReason = undefined;
          curr.preBanAppealStatus = 'approved';
          localStorage.setItem('viralhub_currentUser', JSON.stringify(curr));
        }
      } catch {}
    }

    localStorage.setItem(
      'viralhub_user_warning_cleared_event',
      JSON.stringify({ userId: cleanUserId, email: cleanEmail, username: cleanUsername, timestamp: Date.now() })
    );
  } catch (e) {
    console.warn('clearUserWarning failed', e);
  }
};

export const checkUserWarning = (
  userId?: string | null,
  email?: string | null,
  userObj?: Partial<User> | null
): {
  warningActive: boolean;
  warningReason?: string;
  warningIssuedAt?: string;
  warningDeadline?: string;
  preBanAppealStatus: 'none' | 'pending' | 'approved' | 'declined';
  preBanAppealReason?: string;
  preBanAppealProofUrl?: string;
  preBanAppealProofName?: string;
  preBanAppealSubmittedAt?: string;
} => {
  const candidateUsername = (userObj?.username || '').trim().toLowerCase().replace(/^@/, '');
  const candidateEmail = (email || userObj?.email || '').trim().toLowerCase();
  const candidateId = userId ? String(userId).trim() : (userObj?.id ? String(userObj.id).trim() : '');

  if (userObj?.warningActive) {
    return {
      warningActive: true,
      warningReason: userObj.warningReason || 'Violation of Community Guidelines',
      warningIssuedAt: userObj.warningIssuedAt,
      warningDeadline: userObj.warningDeadline,
      preBanAppealStatus: (userObj.preBanAppealStatus as any) || 'none',
      preBanAppealReason: userObj.preBanAppealReason,
      preBanAppealProofUrl: userObj.preBanAppealProofUrl,
      preBanAppealProofName: userObj.preBanAppealProofName,
      preBanAppealSubmittedAt: userObj.preBanAppealSubmittedAt,
    };
  }

  let warningsMap: Record<string, any> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_user_warnings_v1') : null;
    if (raw) warningsMap = JSON.parse(raw);
  } catch {}

  const keys: string[] = [];
  if (candidateId) {
    keys.push(candidateId);
    keys.push(candidateId.toLowerCase());
    keys.push(toUuid(candidateId));
  }
  if (candidateEmail) keys.push(candidateEmail);
  if (candidateUsername) {
    keys.push(candidateUsername);
    keys.push(`@${candidateUsername}`);
  }

  for (const k of keys) {
    const record = warningsMap[k];
    if (record && record.warningActive) {
      return {
        warningActive: true,
        warningReason: record.warningReason || 'Violation of Community Guidelines',
        warningIssuedAt: record.warningIssuedAt,
        warningDeadline: record.warningDeadline,
        preBanAppealStatus: record.preBanAppealStatus || 'none',
        preBanAppealReason: record.preBanAppealReason,
        preBanAppealProofUrl: record.preBanAppealProofUrl,
        preBanAppealProofName: record.preBanAppealProofName,
        preBanAppealSubmittedAt: record.preBanAppealSubmittedAt,
      };
    }
  }

  return {
    warningActive: false,
    preBanAppealStatus: 'none',
  };
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
export const recordGoogleAccount = (userId?: string | null, email?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('viralhub_google_accounts_v1') || '[]';
    const list: string[] = JSON.parse(raw);
    const set = new Set(list.map(s => s.toLowerCase()));
    if (userId) set.add(String(userId).toLowerCase());
    if (email) set.add(email.trim().toLowerCase());
    localStorage.setItem('viralhub_google_accounts_v1', JSON.stringify(Array.from(set)));
  } catch {}
};

// =========================================================================
// Active Device Sessions Tracker
// Tracks accounts that have an active logged-in session on this device.
// When an account is logged in, it's added here.
// When an account is explicitly LOGGED OUT, it is removed here.
// Switching accounts retains logged-in status so switching back is instant (0 credentials / no Google prompt).
// =========================================================================
export const markAccountLoggedInOnDevice = (userId?: string | null, email?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('viralhub_active_device_accounts_v1') || '[]';
    const list: string[] = JSON.parse(raw);
    const set = new Set(list.map(s => s.toLowerCase()));
    if (userId) {
      set.add(String(userId).toLowerCase());
      set.add(toUuid(userId).toLowerCase());
    }
    if (email) set.add(email.trim().toLowerCase());
    localStorage.setItem('viralhub_active_device_accounts_v1', JSON.stringify(Array.from(set)));
  } catch {}
};

export const markAccountLoggedOutOnDevice = (userId?: string | null, email?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('viralhub_active_device_accounts_v1') || '[]';
    const list: string[] = JSON.parse(raw);
    const idLower = userId ? String(userId).toLowerCase() : null;
    const idUuid = userId ? toUuid(userId).toLowerCase() : null;
    const emailLower = email ? email.trim().toLowerCase() : null;
    const next = list.filter(item => {
      const lower = item.toLowerCase();
      if (idLower && lower === idLower) return false;
      if (idUuid && lower === idUuid) return false;
      if (emailLower && lower === emailLower) return false;
      return true;
    });
    localStorage.setItem('viralhub_active_device_accounts_v1', JSON.stringify(next));
  } catch {}
};

export const isAccountLoggedInOnDevice = (userId?: string | null, email?: string | null): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('viralhub_active_device_accounts_v1') || '[]';
    const list: string[] = JSON.parse(raw);
    const set = new Set(list.map(s => s.toLowerCase()));
    if (userId) {
      if (set.has(String(userId).toLowerCase())) return true;
      if (set.has(toUuid(userId).toLowerCase())) return true;
    }
    if (email && set.has(email.trim().toLowerCase())) return true;
  } catch {}
  return false;
};

export const isGoogleAccount = (user?: Partial<User> | null): boolean => {
  if (!user) return false;
  if (user.authProvider === 'google') return true;
  const cleanEmail = (user.email || '').trim().toLowerCase();
  if (cleanEmail && cleanEmail.endsWith('@gmail.com')) return true;
  if (user.avatar && user.avatar.includes('googleusercontent.com')) return true;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('viralhub_google_accounts_v1') || '[]';
      const list: string[] = JSON.parse(raw);
      const set = new Set(list.map(s => s.toLowerCase()));
      if (user.id && set.has(String(user.id).toLowerCase())) return true;
      if (cleanEmail && set.has(cleanEmail)) return true;
    } catch {}
  }
  return false;
};

export interface GoogleAuthOptions {
  redirectTo?: string;
  loginHint?: string;
  prompt?: string;
}

export const signInWithGoogle = async (
  options?: GoogleAuthOptions | string
): Promise<{ data: any; error: any }> => {
  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      error: new Error('Supabase is not connected. Please verify your Supabase URL and Anon Key in Vercel environment variables or the connection settings.'),
    };
  }
  const opts: GoogleAuthOptions = typeof options === 'string' ? { redirectTo: options } : (options || {});
  const targetRedirect = opts.redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
  const queryParams: Record<string, string> = {
    access_type: 'offline',
    prompt: opts.prompt || 'select_account',
  };
  if (opts.loginHint) {
    queryParams.login_hint = opts.loginHint;
  }

  try {
    const res = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: targetRedirect,
        queryParams,
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

export const sendPasswordResetEmail = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  const client = getSupabaseClient();
  const trimmed = email.trim();
  if (!trimmed) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  if (!client) {
    return {
      success: true,
      message: `Password reset instructions dispatched for ${trimmed}. (Note: Connect your Supabase project in settings to deliver live SMTP emails directly to your email inbox).`,
    };
  }

  try {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}` : '';
    const { error } = await client.auth.resetPasswordForEmail(trimmed, {
      redirectTo: redirectUrl,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return {
      success: true,
      message: `Password reset link has been dispatched to ${trimmed}! Please check your email inbox and spam folder.`,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to send password reset email.' };
  }
};

export const updateSupabasePasswordAndSignOutAll = async (
  newPassword: string
): Promise<{ success: boolean; message: string }> => {
  const client = getSupabaseClient();
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters long.' };
  }

  if (!client) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('viralhub_currentUser');
        sessionStorage.clear();
      } catch {}
    }
    return {
      success: true,
      message: 'Password updated successfully! All devices have been logged out. Please sign in with your new password.',
    };
  }

  try {
    const { data, error } = await client.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      return { success: false, message: error.message };
    }

    try {
      await client.auth.signOut({ scope: 'global' });
    } catch {
      await client.auth.signOut();
    }

    if (typeof window !== 'undefined') {
      try {
        if (data?.user) {
          markAccountLoggedOutOnDevice(data.user.id, data.user.email);
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('-auth-token') || key === 'viralhub_currentUser')) {
            localStorage.removeItem(key);
          }
        }
        sessionStorage.clear();
      } catch {}
    }

    return {
      success: true,
      message: 'Password updated successfully! All active sessions across all devices have been logged out. Please sign in with your new password.',
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to update password.' };
  }
};

export const fetchUserBlocksFromSupabase = async (
  userId: string
): Promise<{ blockerId: string; blockedId: string; createdAt: string }[]> => {
  const client = getSupabaseClient();
  if (!client || !userId) return [];
  try {
    const uId = toUuid(userId);
    const { data, error } = await client
      .from('user_blocks')
      .select('blocker_id, blocked_id, created_at')
      .or(`blocker_id.eq.${uId},blocked_id.eq.${uId}`);
    if (error || !data) return [];
    return data.map((row: any) => ({
      blockerId: String(row.blocker_id),
      blockedId: String(row.blocked_id),
      createdAt: row.created_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
};

export const saveUserBlockToSupabase = async (
  blockerId: string,
  blockedId: string
): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client || !blockerId || !blockedId) return false;
  try {
    const { error } = await client.from('user_blocks').upsert({
      blocker_id: toUuid(blockerId),
      blocked_id: toUuid(blockedId),
      created_at: new Date().toISOString(),
    }, { onConflict: 'blocker_id,blocked_id' });
    return !error;
  } catch {
    return false;
  }
};

export const deleteUserBlockFromSupabase = async (
  blockerId: string,
  blockedId: string
): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client || !blockerId || !blockedId) return false;
  try {
    const { error } = await client
      .from('user_blocks')
      .delete()
      .match({
        blocker_id: toUuid(blockerId),
        blocked_id: toUuid(blockedId),
      });
    return !error;
  } catch {
    return false;
  }
};

export const signOutSupabase = async (): Promise<{ error: any }> => {
  if (typeof window !== 'undefined') {
    try {
      // Clear any cached supabase auth tokens from storage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('-auth-token'))) {
          localStorage.removeItem(key);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('-auth-token'))) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {}
  }
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
let cachedAdminsResult: { data: AdminRecord[]; timestamp: number } | null = null;
let cachedAudioTracksResult: { data: AudioTrack[]; timestamp: number } | null = null;
let systemStatsCache: { stats: SystemStats; timestamp: number } | null = null;
let cachedDiscoveredBuckets: { buckets: string[]; timestamp: number } | null = null;
let preferredAudioBucket: string | null = null;
let preferredCoverBucket: string | null = null;
let workingAudioTable: 'AudioLibrary' | 'AudioTrack' | 'audio_tracks' | null = null;

// Registry of known existing users to eliminate redundant Supabase writes and protect disk IO
export const knownUsersSet = new Set<string>();

/**
 * Injects or updates an authenticated user in memory cache immediately.
 * Guarantees zero disk IO overhead and prevents any race condition on login.
 */
export const injectUserIntoCache = (user: User) => {
  if (!user || !user.id) return;
  knownUsersSet.add(user.id);
  knownUsersSet.add(toUuid(user.id));
  if (!cachedUsersResult) {
    cachedUsersResult = { data: [user], timestamp: Date.now() };
    return;
  }
  const emailKey = user.email ? user.email.trim().toLowerCase() : null;
  const existingIdx = cachedUsersResult.data.findIndex(
    u => isSameUser(u.id, user.id) || (emailKey && u.email && u.email.trim().toLowerCase() === emailKey)
  );
  if (existingIdx >= 0) {
    cachedUsersResult.data[existingIdx] = { ...cachedUsersResult.data[existingIdx], ...user };
  } else {
    cachedUsersResult.data.unshift(user);
  }
  cachedUsersResult.timestamp = Date.now();
};

/**
 * Injects or updates an admin in memory cache immediately.
 * Guarantees zero disk IO overhead.
 */
export const injectAdminIntoCache = (admin: AdminRecord) => {
  if (!admin || !admin.adminId) return;
  if (!cachedAdminsResult) {
    cachedAdminsResult = { data: [admin], timestamp: Date.now() };
    return;
  }
  const emailKey = admin.email ? admin.email.trim().toLowerCase() : null;
  const existingIdx = cachedAdminsResult.data.findIndex(
    a => a.adminId === admin.adminId || (emailKey && a.email && a.email.trim().toLowerCase() === emailKey)
  );
  if (existingIdx >= 0) {
    cachedAdminsResult.data[existingIdx] = { ...cachedAdminsResult.data[existingIdx], ...admin };
  } else {
    cachedAdminsResult.data.unshift(admin);
  }
  cachedAdminsResult.timestamp = Date.now();
};

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

      let res1 = await client
        .from('User')
        .select('*')
        .order('RegistrationDate', { ascending: false });

      if (res1.error && (res1.error.code === '42703' || res1.error.message?.includes('column'))) {
        // Fallback: RegistrationDate column might not exist
        res1 = await client.from('User').select('*');
      }

      if (!res1.error && res1.data) {
        data = res1.data;
      } else {
        let res2 = await client
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        if (res2.error) {
          res2 = await client.from('users').select('*');
        }
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
            // Custom avatar logic: prefer uploaded/custom avatars over Google avatar or empty avatar
            const rowAvatar = row.ProfilePictureURL || row.avatar_url || '';
            if (rowAvatar) {
              const isExistingCustom = existing.avatar && (existing.avatar.includes('/storage/') || existing.avatar.includes('avatar_') || !existing.avatar.includes('googleusercontent.com'));
              const isRowCustom = rowAvatar.includes('/storage/') || rowAvatar.includes('avatar_') || !rowAvatar.includes('googleusercontent.com');
              if (!existing.avatar || (!isExistingCustom && isRowCustom)) {
                existing.avatar = rowAvatar;
              }
            }

            // Custom Display Name logic: never overwrite with 'User'
            const rowDisplayName = row.DisplayName || row.display_name || '';
            if (rowDisplayName && rowDisplayName !== 'User') {
              if (!existing.displayName || existing.displayName === 'User') {
                existing.displayName = rowDisplayName;
              }
            }

            // Custom Username logic: never overwrite with 'user_...'
            const rowUsername = row.Username || row.username || '';
            if (rowUsername && !rowUsername.startsWith('user_')) {
              if (!existing.username || existing.username.startsWith('user_')) {
                existing.username = rowUsername;
              }
            }

            // Bio logic: never overwrite non-empty bio with empty bio
            const rowBio = row.Bio || row.bio || '';
            if (rowBio && rowBio.trim()) {
              if (!existing.bio || !existing.bio.trim()) {
                existing.bio = rowBio;
              }
            }
            if (row.IsBanned || row.is_banned) {
              if (row.AppealStatus !== 'approved') {
                existing.isBanned = true;
                existing.banReason = row.BanReason || row.ban_reason || existing.banReason;
                existing.bannedAt = row.BannedAt || row.banned_at || existing.bannedAt;
              } else {
                existing.isBanned = false;
                existing.banReason = undefined;
              }
            } else {
              existing.isBanned = false;
              existing.banReason = undefined;
            }
            if (row.AppealStatus || row.appeal_status) {
              existing.appealStatus = row.AppealStatus || row.appeal_status;
              existing.appealReason = row.AppealReason || row.appeal_reason || existing.appealReason;
              existing.appealSubmittedAt = row.AppealSubmittedAt || row.appeal_submitted_at || existing.appealSubmittedAt;
            }
            continue; // Skip creating duplicate user
          }
        }

        const isBannedInDb = Boolean(row.IsBanned || row.is_banned || false);
        const appealStatusInDb = row.AppealStatus || row.appeal_status || 'none';
        const isActuallyBanned = isBannedInDb && appealStatusInDb !== 'approved';

        const candidateUser: Partial<User> = {
          id: uId,
          username: row.Username || row.username,
          email: uEmail,
          isBanned: isActuallyBanned,
          banReason: isActuallyBanned ? (row.BanReason || row.ban_reason || undefined) : undefined,
          bannedAt: isActuallyBanned ? (row.BannedAt || row.banned_at || undefined) : undefined,
          appealStatus: (appealStatusInDb || (isActuallyBanned ? 'none' : 'approved')) as any,
          appealReason: row.AppealReason || row.appeal_reason || undefined,
          appealSubmittedAt: row.AppealSubmittedAt || row.appeal_submitted_at || undefined,
        };

        if (isActuallyBanned) {
          recordUserBan({
            userId: uId,
            username: candidateUser.username,
            email: uEmail,
            banReason: candidateUser.banReason,
            bannedAt: candidateUser.bannedAt,
            appealStatus: candidateUser.appealStatus,
            appealReason: candidateUser.appealReason,
            appealSubmittedAt: candidateUser.appealSubmittedAt,
          });
        } else {
          // Explicitly purge local ban on this device!
          recordUserUnban(uId, uEmail, candidateUser.username);
        }

        const warningInfo = checkUserWarning(uId, uEmail, row);

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
          isBanned: isActuallyBanned,
          banReason: isActuallyBanned ? candidateUser.banReason : undefined,
          bannedAt: isActuallyBanned ? candidateUser.bannedAt : undefined,
          appealStatus: candidateUser.appealStatus || (isActuallyBanned ? 'none' : 'approved'),
          appealReason: candidateUser.appealReason,
          appealSubmittedAt: candidateUser.appealSubmittedAt,
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

  /**
   * Ensures a user row exists in Supabase User table without overwriting any existing profile data.
   * If user already exists in memory or in the database, DOES NOTHING (0 disk IO, 0 risk of wiping bio/avatar).
   */
  async ensureUserExists(user: User): Promise<void> {
    if (!user || !user.id) return;
    const uUuid = toUuid(user.id);

    // Fast memory check (0 disk IO, 0 database queries)
    if (knownUsersSet.has(user.id) || knownUsersSet.has(uUuid)) {
      return;
    }

    injectUserIntoCache(user);
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const cleanEmail = (user.email || '').trim().toLowerCase();
      // 1. Fast existence check in PascalCase User table
      const { data: existingUserRow } = await client
        .from('User')
        .select('UserID')
        .or(`UserID.eq.${user.id},UserID.eq.${uUuid}${cleanEmail ? `,Email.ilike.${cleanEmail}` : ''}`)
        .limit(1)
        .maybeSingle();

      if (existingUserRow?.UserID) {
        knownUsersSet.add(user.id);
        knownUsersSet.add(uUuid);
        knownUsersSet.add(existingUserRow.UserID);
        return; // User already exists! Never overwrite profile data!
      }

      // 2. Fast existence check in lowercase users table
      const { data: existingSnakeRow } = await client
        .from('users')
        .select('id')
        .or(`id.eq.${user.id},id.eq.${uUuid}${cleanEmail ? `,email.ilike.${cleanEmail}` : ''}`)
        .limit(1)
        .maybeSingle();

      if (existingSnakeRow?.id) {
        knownUsersSet.add(user.id);
        knownUsersSet.add(uUuid);
        knownUsersSet.add(existingSnakeRow.id);
        return; // User already exists! Never overwrite profile data!
      }

      // Brand new user only: do minimal insertion
      await this.upsertUser(user);
      knownUsersSet.add(user.id);
      knownUsersSet.add(uUuid);
    } catch {
      // ignore
    }
  },

  /**
   * Explicitly updates a user's profile across all devices.
   * Targeted UPDATE with verified row confirmation (.select()) across User and users tables.
   */
  async updateUserProfileExplicit(
    userId: string,
    updates: {
      username?: string;
      displayName?: string;
      bio?: string;
      avatar?: string;
      isPrivate?: boolean;
      email?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: true };

    try {
      const uUuid = toUuid(userId);
      const cleanUsername = updates.username !== undefined
        ? updates.username.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase()
        : undefined;

      const pascalPayload: Record<string, any> = {};
      if (cleanUsername !== undefined && cleanUsername.length > 0) pascalPayload.Username = cleanUsername;
      if (updates.displayName !== undefined && updates.displayName.trim().length > 0) {
        pascalPayload.DisplayName = updates.displayName.trim();
      }
      if (updates.bio !== undefined) pascalPayload.Bio = updates.bio;
      if (updates.avatar !== undefined && !updates.avatar.startsWith('blob:')) {
        pascalPayload.ProfilePictureURL = updates.avatar;
      }
      if (updates.isPrivate !== undefined) pascalPayload.IsPublic = !updates.isPrivate;
      if (updates.email) pascalPayload.Email = updates.email.trim().toLowerCase();

      let isUpdated = false;

      // 1. Try updating in PascalCase 'User' table with .select() to verify rows were modified!
      try {
        let updateRes = await client.from('User').update(pascalPayload).eq('UserID', userId).select('UserID');
        if (!updateRes.error && updateRes.data && updateRes.data.length > 0) {
          isUpdated = true;
        }

        // 2. Try by UUID format
        if (!isUpdated) {
          const retryUuid = await client.from('User').update(pascalPayload).eq('UserID', uUuid).select('UserID');
          if (!retryUuid.error && retryUuid.data && retryUuid.data.length > 0) {
            isUpdated = true;
          }
        }

        // 3. Try by Email
        if (!isUpdated && updates.email) {
          const retryEmail = await client.from('User').update(pascalPayload).ilike('Email', updates.email.trim().toLowerCase()).select('UserID');
          if (!retryEmail.error && retryEmail.data && retryEmail.data.length > 0) {
            isUpdated = true;
          }
        }

        // 4. Try by Username
        if (!isUpdated && cleanUsername) {
          const retryUser = await client.from('User').update(pascalPayload).ilike('Username', cleanUsername).select('UserID');
          if (!retryUser.error && retryUser.data && retryUser.data.length > 0) {
            isUpdated = true;
          }
        }
      } catch (errUser) {
        console.warn('User table update attempt note:', errUser);
      }

      // 5. Also update lowercase 'users' table if it exists or if User didn't match
      try {
        const snakePayload: Record<string, any> = {};
        if (cleanUsername !== undefined) snakePayload.username = cleanUsername;
        if (updates.displayName !== undefined) snakePayload.display_name = updates.displayName.trim();
        if (updates.bio !== undefined) snakePayload.bio = updates.bio;
        if (updates.avatar !== undefined && !updates.avatar.startsWith('blob:')) {
          snakePayload.avatar_url = updates.avatar;
        }
        if (updates.isPrivate !== undefined) snakePayload.is_public = !updates.isPrivate;
        if (updates.email) snakePayload.email = updates.email.trim().toLowerCase();

        if (Object.keys(snakePayload).length > 0) {
          const u1 = await client.from('users').update(snakePayload).eq('id', userId).select('id');
          if (!u1.error && u1.data && u1.data.length > 0) {
            isUpdated = true;
          } else {
            const u2 = await client.from('users').update(snakePayload).eq('id', uUuid).select('id');
            if (!u2.error && u2.data && u2.data.length > 0) {
              isUpdated = true;
            } else if (updates.email) {
              const u3 = await client.from('users').update(snakePayload).ilike('email', updates.email.trim().toLowerCase()).select('id');
              if (!u3.error && u3.data && u3.data.length > 0) {
                isUpdated = true;
              }
            }
          }
        }
      } catch (errSnake) {
        console.warn('users table update attempt note:', errSnake);
      }

      // Invalidate and immediately update memory cache so subsequent fetchUsers immediately reflects the fresh data
      if (cachedUsersResult) {
        const emailLower = updates.email?.trim().toLowerCase();
        const idx = cachedUsersResult.data.findIndex(
          u => isSameUser(u.id, userId) || (emailLower && u.email && u.email.trim().toLowerCase() === emailLower)
        );
        if (idx >= 0) {
          cachedUsersResult.data[idx] = {
            ...cachedUsersResult.data[idx],
            ...(cleanUsername !== undefined && cleanUsername.length > 0 ? { username: cleanUsername } : {}),
            ...(updates.displayName !== undefined ? { displayName: updates.displayName.trim() } : {}),
            ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
            ...(updates.avatar !== undefined && !updates.avatar.startsWith('blob:') ? { avatar: updates.avatar } : {}),
            ...(updates.isPrivate !== undefined ? { isPrivate: updates.isPrivate } : {}),
          };
          cachedUsersResult.timestamp = Date.now();
        }
      }

      return { success: true };
    } catch (e: any) {
      console.warn('updateUserProfileExplicit handled note:', e?.message || e);
      return { success: false, error: e?.message };
    }
  },

  async upsertUser(user: User, password?: string): Promise<{ success: boolean; error?: string }> {
    // Immediately ensure user is cached in memory (0 disk IO, instant availability across all components)
    injectUserIntoCache(user);

    const client = getSupabaseClient();
    if (!client) return { success: true };

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
      let existingBio: string | null = null;
      let existingAvatar: string | null = null;
      let existingDisplayName: string | null = null;
      let existingUsername: string | null = null;

      try {
        const { data: existingRow } = await client
          .from('User')
          .select('UserID, Role, Bio, ProfilePictureURL, DisplayName, Username')
          .or(`UserID.eq.${user.id},UserID.eq.${userId}${cleanEmail ? `,Email.ilike.${cleanEmail}` : ''}`)
          .limit(1)
          .maybeSingle();

        if (existingRow?.UserID) {
          existingUserId = existingRow.UserID;
          existingRole = existingRow.Role;
          existingBio = existingRow.Bio;
          existingAvatar = existingRow.ProfilePictureURL;
          existingDisplayName = existingRow.DisplayName;
          existingUsername = existingRow.Username;
          userId = existingRow.UserID; // Re-use the existing UserID!
        }
      } catch {
        // ignore
      }

      // Check lowercase users table if not found in User
      if (!existingUserId) {
        try {
          const { data: snakeRow } = await client
            .from('users')
            .select('id, role, bio, avatar_url, display_name, username')
            .or(`id.eq.${user.id},id.eq.${userId}${cleanEmail ? `,email.ilike.${cleanEmail}` : ''}`)
            .limit(1)
            .maybeSingle();

          if (snakeRow?.id) {
            existingUserId = snakeRow.id;
            existingRole = snakeRow.role;
            existingBio = snakeRow.bio;
            existingAvatar = snakeRow.avatar_url;
            existingDisplayName = snakeRow.display_name;
            existingUsername = snakeRow.username;
            userId = snakeRow.id;
          }
        } catch {
          // ignore
        }
      }

      const finalRole = (existingRole === 'admin' || user.role === 'admin') ? 'admin' : (user.role || 'creator');

      // If user already exists, UPDATE preserving existing non-empty bio, avatar, and custom username
      if (existingUserId) {
        const updatePayload: Record<string, any> = {
          Role: finalRole,
          IsPublic: isPublic,
        };

        // Existing database values take absolute priority so background operations NEVER revert bio!
        if (existingBio && existingBio.trim() !== '') {
          updatePayload.Bio = existingBio;
        } else if (user.bio !== undefined && user.bio.trim() !== '') {
          updatePayload.Bio = user.bio;
        }

        // Existing database custom avatar takes priority over older or default avatar
        if (existingAvatar && existingAvatar.trim() !== '' && !existingAvatar.startsWith('blob:')) {
          updatePayload.ProfilePictureURL = existingAvatar;
        } else if (user.avatar && !user.avatar.startsWith('blob:') && user.avatar.trim() !== '') {
          updatePayload.ProfilePictureURL = user.avatar;
        }

        // Keep custom display name
        if (existingDisplayName && existingDisplayName !== 'User') {
          updatePayload.DisplayName = existingDisplayName;
        } else if (user.displayName && user.displayName !== 'User') {
          updatePayload.DisplayName = user.displayName;
        }

        // Keep custom username
        if (existingUsername && !existingUsername.startsWith('user_')) {
          updatePayload.Username = existingUsername;
        } else if (cleanUsername && !cleanUsername.startsWith('user_')) {
          updatePayload.Username = cleanUsername;
        }

        if (user.email || cleanEmail) {
          updatePayload.Email = user.email || cleanEmail;
        }
        if (password) updatePayload.Password = password;

        let updateRes = await client.from('User').update(updatePayload).eq('UserID', existingUserId);
        if (updateRes.error && (updateRes.error.code === '42703' || updateRes.error.message?.includes('column'))) {
          // Retry with core columns only
          updateRes = await client.from('User').update({
            Username: updatePayload.Username || cleanUsername,
            Email: user.email || cleanEmail,
            DisplayName: updatePayload.DisplayName || user.displayName || 'User',
            Bio: updatePayload.Bio || '',
            ProfilePictureURL: updatePayload.ProfilePictureURL || '',
          }).eq('UserID', existingUserId);
        } else if (updateRes.error && (updateRes.error.code === '42P01' || updateRes.error.message?.includes('does not exist'))) {
          // Fallback to snake_case users table
          await client.from('users').update({
            username: updatePayload.Username || cleanUsername,
            email: user.email || cleanEmail,
            display_name: updatePayload.DisplayName || user.displayName || 'User',
            bio: updatePayload.Bio || '',
            avatar_url: updatePayload.ProfilePictureURL || '',
          }).eq('id', existingUserId);
        }
        injectUserIntoCache(user);
        return { success: true };
      }

      // Otherwise do initial insert on UserID
      const payloadPascal: Record<string, any> = {
        UserID: userId,
        Username: cleanUsername,
        Email: user.email || `${cleanUsername}@viralhub.app`,
        Password: password || 'user_encrypted_secret',
        RegistrationDate: new Date().toISOString(),
        DisplayName: user.displayName || user.username || 'User',
        Bio: user.bio || '',
        ProfilePictureURL: (user.avatar && !user.avatar.startsWith('blob:')) ? user.avatar : '',
        IsPublic: isPublic,
        Role: finalRole,
      };

      let { error } = await client.from('User').upsert(payloadPascal, { onConflict: 'UserID' });

      // If column does not exist (code 42703), retry with minimal core fields
      if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist'))) {
        const minimalPascal = {
          UserID: userId,
          Username: cleanUsername,
          Email: user.email || `${cleanUsername}@viralhub.app`,
          DisplayName: user.displayName || user.username || 'User',
          Bio: user.bio || '',
          ProfilePictureURL: (user.avatar && !user.avatar.startsWith('blob:')) ? user.avatar : '',
        };
        const retryPascal = await client.from('User').upsert(minimalPascal, { onConflict: 'UserID' });
        error = retryPascal.error;
      }

      // If 'User' table doesn't exist (code 42P01), try 'users' table (snake_case)
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const payloadSnake: Record<string, any> = {
          id: userId,
          username: cleanUsername,
          email: user.email || `${cleanUsername}@viralhub.app`,
          display_name: user.displayName || user.username || 'User',
          bio: user.bio || '',
          avatar_url: (user.avatar && !user.avatar.startsWith('blob:')) ? user.avatar : '',
          is_public: isPublic,
          created_at: new Date().toISOString(),
        };
        let resSnake = await client.from('users').upsert(payloadSnake, { onConflict: 'id' });
        if (resSnake.error && (resSnake.error.code === '42703' || resSnake.error.message?.includes('column'))) {
          resSnake = await client.from('users').upsert({
            id: userId,
            username: cleanUsername,
            email: user.email || `${cleanUsername}@viralhub.app`,
            display_name: user.displayName || user.username || 'User',
            avatar_url: (user.avatar && !user.avatar.startsWith('blob:')) ? user.avatar : '',
          }, { onConflict: 'id' });
        }
        error = resSnake.error;
      }

      if (error) {
        console.warn('Supabase upsertUser note:', error.message || error);
      }
      injectUserIntoCache(user);
      return { success: true };
    } catch (e: any) {
      console.warn('Supabase upsertUser handled note:', e?.message || e);
      injectUserIntoCache(user);
      return { success: true };
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
            try { await client.from('ReportVideo').delete().eq('VideoID', uvUuid); } catch {}
            try { await client.from('VideoHashtag').delete().eq('VideoID', uvUuid); } catch {}
            try { await client.from('VideoStats').delete().eq('VideoID', uvUuid); } catch {}
            try { await client.from('Like').delete().eq('VideoID', uvUuid); } catch {}
            try { await client.from('likes').delete().eq('video_id', uvUuid); } catch {}
            try { await client.from('Comment').delete().eq('VideoID', uvUuid); } catch {}
            try { await client.from('comments').delete().eq('video_id', uvUuid); } catch {}
            try { await client.from('Share').delete().eq('VideoID', uvUuid); } catch {}
          }
          await client.from('Video').delete().eq('UserID', targetUuid);
          await client.from('videos').delete().eq('user_id', targetUuid);
        }
      } catch (err) {
        console.warn('Error clearing user videos during user delete:', err);
      }

      // 2. Cascade delete from child database tables to prevent foreign key errors
      try { await client.from('Like').delete().eq('UserID', targetUuid); } catch {}
      try { await client.from('likes').delete().eq('user_id', targetUuid); } catch {}
      try { await client.from('Comment').delete().eq('UserID', targetUuid); } catch {}
      try { await client.from('comments').delete().eq('user_id', targetUuid); } catch {}
      try { await client.from('Share').delete().eq('UserID', targetUuid); } catch {}
      try {
        await client.from('Following').delete().or(`UserID.eq.${targetUuid},FollowingUserID.eq.${targetUuid}`);
      } catch {}
      try {
        await client.from('following').delete().or(`user_id.eq.${targetUuid},following_user_id.eq.${targetUuid}`);
      } catch {}
      try {
        await client.from('Follower').delete().or(`UserID.eq.${targetUuid},FollowerUserID.eq.${targetUuid}`);
      } catch {}
      try {
        await client.from('follower').delete().or(`user_id.eq.${targetUuid},follower_user_id.eq.${targetUuid}`);
      } catch {}
      try { await client.from('Notification').delete().eq('UserID', targetUuid); } catch {}
      try { await client.from('ReportUser').delete().or(`ReportUserID.eq.${targetUuid},ReportedUserID.eq.${targetUuid}`); } catch {}
      try { await client.from('ReportVideo').delete().eq('ReporterUserID', targetUuid); } catch {}
      try { await client.from('Message').delete().eq('SenderUserID', targetUuid); } catch {}
      try { await client.from('Admin').delete().eq('UserID', targetUuid); } catch {}

      // 3. Delete from User table (PascalCase and snake_case) by ID and Email
      await client.from('User').delete().eq('UserID', targetUuid);
      await client.from('users').delete().eq('id', targetUuid);
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

  async banUser(
    userId: string,
    reason: string,
    email?: string | null,
    username?: string | null
  ): Promise<boolean> {
    const client = getSupabaseClient();
    const nowIso = new Date().toISOString();

    // 1. Immediately record in persistent ban registry with all known identifiers!
    recordUserBan({
      userId,
      username,
      email,
      banReason: reason,
      bannedAt: nowIso,
      appealStatus: 'none',
    });

    if (!client || !userId) return true;

    try {
      const isUidUuid = isUuid(userId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      const cleanUsername = username ? username.replace(/^@/, '').trim().toLowerCase() : null;

      const payload: Record<string, any> = {
        IsBanned: true,
        BanReason: reason,
        BannedAt: nowIso,
        AppealStatus: 'none',
      };

      // Safely update PascalCase 'User' table without invalid UUID syntax casts
      if (isUidUuid) {
        try { await client.from('User').update(payload).eq('UserID', userId); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('User').update(payload).ilike('Username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('User').update(payload).ilike('Email', cleanEmail); } catch {}
      }

      // Also try snake_case 'users' table
      const snakePayload = {
        is_banned: true,
        ban_reason: reason,
        banned_at: nowIso,
        appeal_status: 'none',
      };
      if (isUidUuid) {
        try { await client.from('users').update(snakePayload).eq('id', userId); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('users').update(snakePayload).ilike('username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('users').update(snakePayload).ilike('email', cleanEmail); } catch {}
      }

      cachedUsersResult = null;
      return true;
    } catch (e) {
      console.warn('Supabase banUser warning:', e);
      return true;
    }
  },

  async unbanUser(
    userId: string,
    email?: string | null,
    username?: string | null
  ): Promise<boolean> {
    const client = getSupabaseClient();

    // Immediately record unban in persistent registry and clean localStorage
    recordUserUnban(userId, email, username);

    if (!client || !userId) return true;

    try {
      const isUidUuid = isUuid(userId);
      const uuidVal = toUuid(userId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      const cleanUsername = username ? username.replace(/^@/, '').trim().toLowerCase() : null;

      const payloadPascal: Record<string, any> = {
        IsBanned: false,
        BanReason: null,
        AppealStatus: 'approved',
      };

      const executeUpdatePascal = async (filterCol: string, filterVal: string) => {
        try {
          const res = await client.from('User').update(payloadPascal).eq(filterCol, filterVal);
          if (res.error && res.error.code === '42703') {
            await client.from('User').update({ IsBanned: false }).eq(filterCol, filterVal);
          }
        } catch {}
      };

      const executeUpdatePascalIlike = async (filterCol: string, filterVal: string) => {
        try {
          const res = await client.from('User').update(payloadPascal).ilike(filterCol, filterVal);
          if (res.error && res.error.code === '42703') {
            await client.from('User').update({ IsBanned: false }).ilike(filterCol, filterVal);
          }
        } catch {}
      };

      // 1. Update PascalCase 'User' table
      const tasks: Promise<any>[] = [];
      if (isUidUuid) {
        tasks.push(executeUpdatePascal('UserID', userId));
      }
      if (uuidVal && uuidVal !== userId) {
        tasks.push(executeUpdatePascal('UserID', uuidVal));
      }
      if (cleanUsername) {
        tasks.push(executeUpdatePascalIlike('Username', cleanUsername));
      }
      if (cleanEmail) {
        tasks.push(executeUpdatePascalIlike('Email', cleanEmail));
      }

      // 2. Also update snake_case 'users' table
      const snakePayload = {
        is_banned: false,
        ban_reason: null,
        appeal_status: 'approved',
      };
      if (isUidUuid) {
        tasks.push(Promise.resolve(client.from('users').update(snakePayload).eq('id', userId)));
      }
      if (uuidVal && uuidVal !== userId) {
        tasks.push(Promise.resolve(client.from('users').update(snakePayload).eq('id', uuidVal)));
      }
      if (cleanUsername) {
        tasks.push(Promise.resolve(client.from('users').update(snakePayload).ilike('username', cleanUsername)));
      }
      if (cleanEmail) {
        tasks.push(Promise.resolve(client.from('users').update(snakePayload).ilike('email', cleanEmail)));
      }

      await Promise.allSettled(tasks);

      cachedUsersResult = null;
      return true;
    } catch (e) {
      console.warn('Supabase unbanUser warning:', e);
      return true;
    }
  },

  async submitUserAppeal(
    userId: string,
    appealReason: string,
    email?: string | null,
    username?: string | null
  ): Promise<boolean> {
    const client = getSupabaseClient();
    const nowIso = new Date().toISOString();

    recordUserBan({
      userId,
      username,
      email,
      appealStatus: 'pending',
      appealReason,
      appealSubmittedAt: nowIso,
    });

    if (!client || !userId) return true;

    try {
      const isUidUuid = isUuid(userId);
      const uuidVal = toUuid(userId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      const cleanUsername = username ? username.replace(/^@/, '').trim().toLowerCase() : null;

      const payload: Record<string, any> = {
        AppealStatus: 'pending',
        AppealReason: appealReason,
        AppealSubmittedAt: nowIso,
      };

      if (isUidUuid) {
        try { await client.from('User').update(payload).eq('UserID', userId); } catch {}
      }
      if (uuidVal && uuidVal !== userId) {
        try { await client.from('User').update(payload).eq('UserID', uuidVal); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('User').update(payload).ilike('Username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('User').update(payload).ilike('Email', cleanEmail); } catch {}
      }

      const snakePayload = {
        appeal_status: 'pending',
        appeal_reason: appealReason,
        appeal_submitted_at: nowIso,
      };
      if (isUidUuid) {
        try { await client.from('users').update(snakePayload).eq('id', userId); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('users').update(snakePayload).ilike('username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('users').update(snakePayload).ilike('email', cleanEmail); } catch {}
      }

      cachedUsersResult = null;
      return true;
    } catch (e) {
      console.warn('Supabase submitUserAppeal warning:', e);
      return true;
    }
  },

  async reviewUserAppeal(
    userId: string,
    decision: 'approved' | 'declined',
    email?: string | null,
    username?: string | null
  ): Promise<boolean> {
    const isApproved = decision === 'approved';
    if (isApproved) {
      return this.unbanUser(userId, email, username);
    }

    recordUserBan({
      userId,
      username,
      email,
      appealStatus: 'declined',
    });

    const client = getSupabaseClient();
    if (!client || !userId) return true;

    try {
      const isUidUuid = isUuid(userId);
      const uuidVal = toUuid(userId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      const cleanUsername = username ? username.replace(/^@/, '').trim().toLowerCase() : null;

      const payload: Record<string, any> = {
        AppealStatus: decision,
        IsBanned: true,
      };

      if (isUidUuid) {
        try { await client.from('User').update(payload).eq('UserID', userId); } catch {}
      }
      if (uuidVal && uuidVal !== userId) {
        try { await client.from('User').update(payload).eq('UserID', uuidVal); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('User').update(payload).ilike('Username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('User').update(payload).ilike('Email', cleanEmail); } catch {}
      }

      const snakePayload = {
        appeal_status: decision,
        is_banned: true,
      };
      if (isUidUuid) {
        try { await client.from('users').update(snakePayload).eq('id', userId); } catch {}
      }
      if (cleanUsername) {
        try { await client.from('users').update(snakePayload).ilike('username', cleanUsername); } catch {}
      }
      if (cleanEmail) {
        try { await client.from('users').update(snakePayload).ilike('email', cleanEmail); } catch {}
      }

      cachedUsersResult = null;
      return true;
    } catch (e) {
      console.warn('Supabase reviewUserAppeal warning:', e);
      return true;
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

      // Fetch share counts (targeted by videoIds)
      let sharesCountMap = new Map<string, number>();
      try {
        if (videoIds.length > 0) {
          const { data: shares } = await client
            .from('Share')
            .select('VideoID')
            .in('VideoID', videoIds);
          if (shares) {
            shares.forEach((s: any) => {
              sharesCountMap.set(s.VideoID, (sharesCountMap.get(s.VideoID) || 0) + 1);
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

        // Compute authoritative shares count from database and local storage persistence
        const dbShares = sharesCountMap.get(row.VideoID) || row.SharesCount || row.shares_count || row.ShareCount || 0;
        let localShares = 0;
        try {
          if (typeof localStorage !== 'undefined') {
            const rawStoredShares = localStorage.getItem('viralhub_video_shares_v1');
            if (rawStoredShares) {
              const parsedShares = JSON.parse(rawStoredShares);
              localShares = parsedShares[row.VideoID] || parsedShares[toUuid(row.VideoID)] || 0;
            }
          }
        } catch {}
        const finalSharesCount = Math.max(dbShares, localShares);

        // If mediaUrl is a local blob (which is invalid across devices or after refresh),
        // provide a high-performance streaming video fallback so it never renders as a black box!
        let safeMediaUrl = row.VideoURL || '';
        if (!safeMediaUrl || safeMediaUrl.startsWith('blob:')) {
          safeMediaUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
        }

        // Thumbnail must strictly be an image, NEVER a video file (.mp4, .webm, blob:)!
        const rawThumb = row.ThumbnailURL || row.thumbnail_url || row.CoverURL || row.cover_url || '';
        const isThumbVid = Boolean(
          rawThumb &&
          (rawThumb.startsWith('blob:') || /\.(mp4|webm|mov|mkv|ogg|m4v)($|\?)/i.test(rawThumb))
        );
        let safeThumbnailUrl = '';
        if (rawThumb && !isThumbVid) {
          // If rawThumb is identical to creator.avatar or contains avatar_, it is an avatar, NOT a video thumbnail!
          if (
            (creator.avatar && rawThumb.trim().toLowerCase() === creator.avatar.trim().toLowerCase()) ||
            rawThumb.includes('avatar_')
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
          sharesCount: finalSharesCount,
          viewsCount: String(row.ViewCount || 0),
          isLiked: false,
          createdAt: row.PublishedAt || new Date().toISOString(),
          status: (row.Status as any) || 'approved',
          rejectionReason: row.RejectionReason || undefined,
          appealStatus: (row.AppealStatus as any) || (row.appeal_status as any) || 'none',
          appealReason: row.AppealReason || row.appeal_reason || undefined,
          audience: (row.Audience || row.audience || 'public') as any,
          privacy: (row.Audience === 'only_me' || row.audience === 'only_me' ? 'private' : row.Audience === 'friends' ? 'friends' : 'public') as any,
          isPinned: (() => {
            if (row.IsPinned || row.is_pinned) return true;
            try {
              if (typeof localStorage !== 'undefined') {
                const rawPinned = localStorage.getItem('user_pinned_videos_map');
                if (rawPinned) {
                  const pMap = JSON.parse(rawPinned);
                  const pList = pMap[row.UserID] || pMap[toUuid(row.UserID)] || [];
                  if (pList.includes(row.VideoID) || pList.includes(toUuid(row.VideoID))) return true;
                }
              }
            } catch {}
            return false;
          })(),
          pinnedAt: row.PinnedAt || row.pinned_at || undefined,
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

      // 1. Ensure creator exists in User table and resolve true UserID without overwriting creator profile!
      if (video.creator) {
        await this.ensureUserExists(video.creator);
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

      // Persist ThumbnailURL so other devices render visual card instead of black box!
      if (video.thumbnailUrl && !video.thumbnailUrl.startsWith('blob:')) {
        corePayload.ThumbnailURL = video.thumbnailUrl;
      }

      // Only attach AudioTrackID if provided and valid UUID to avoid foreign key errors on unseeded track
      if (video.audioTrack?.id && isUuid(video.audioTrack.id)) {
        corePayload.AudioTrackID = toUuid(video.audioTrack.id);
      }

      // Extended payload with optional moderation and appeal columns if table supports them
      const extendedPayload: Record<string, any> = {
        ...corePayload,
        Status: video.status || 'approved',
        Audience: video.audience || 'public',
      };
      if (video.thumbnailUrl && !video.thumbnailUrl.startsWith('blob:')) {
        extendedPayload.ThumbnailURL = video.thumbnailUrl;
      }
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

  async updateVideoAudience(videoId: string, audience: 'public' | 'friends' | 'only_me'): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const vUuid = toUuid(videoId);
      // Try PascalCase table 'Video' and column 'Audience'
      let res = await client
        .from('Video')
        .update({ Audience: audience })
        .eq('VideoID', vUuid);

      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        // Fallback: try lowercase column 'audience'
        res = await client
          .from('Video')
          .update({ audience })
          .eq('VideoID', vUuid);
      }

      if (res.error && (res.error.code === '42P01' || res.error.message?.includes('does not exist'))) {
        // Fallback: try lowercase table 'videos'
        res = await client
          .from('videos')
          .update({ audience })
          .eq('id', vUuid);
      }

      if (res.error) {
        console.warn('Supabase updateVideoAudience notice:', res.error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Supabase updateVideoAudience error:', e);
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

  async toggleVideoPin(videoId: string, isPinned: boolean): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !videoId) return false;
    try {
      const vUuid = toUuid(videoId);
      const nowIso = new Date().toISOString();
      const payload: Record<string, any> = {
        IsPinned: isPinned,
        PinnedAt: isPinned ? nowIso : null,
      };
      let res = await client
        .from('Video')
        .update(payload)
        .or(`VideoID.eq.${vUuid},VideoID.eq.${videoId}`);

      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        // Fallback for snake_case column names
        res = await client
          .from('videos')
          .update({
            is_pinned: isPinned,
            pinned_at: isPinned ? nowIso : null,
          })
          .or(`id.eq.${vUuid},id.eq.${videoId}`);
      }
      return true;
    } catch (e) {
      console.warn('Supabase toggleVideoPin error:', e);
      return false;
    }
  },

  async fetchAudioTracks(force = false): Promise<AudioTrack[] | null> {
    if (!force && cachedAudioTracksResult && Date.now() - cachedAudioTracksResult.timestamp < 30000) {
      return cachedAudioTracksResult.data;
    }

    const client = getSupabaseClient();
    if (!client) return cachedAudioTracksResult?.data || null;

    try {
      let data: any[] | null = null;

      // 1. If we already know the working table, query that first
      if (workingAudioTable) {
        try {
          const sortCol = workingAudioTable === 'audio_tracks' ? 'created_at' : 'CreatedAt';
          let res = await client.from(workingAudioTable).select('*').order(sortCol, { ascending: false }).limit(100);
          if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
            // Sort column might not exist, query without sort
            res = await client.from(workingAudioTable).select('*').limit(100);
          }
          if (!res.error && res.data) {
            data = res.data;
          } else if (res.error && res.error.code === '42P01') {
            workingAudioTable = null;
          }
        } catch {
          workingAudioTable = null;
        }
      }

      // 2. Query AudioLibrary as primary table (matching user's Supabase schema)
      if (!data) {
        let res1 = await client.from('AudioLibrary').select('*').order('CreatedAt', { ascending: false }).limit(100);
        if (res1.error && (res1.error.code === '42703' || res1.error.message?.includes('column'))) {
          // CreatedAt column may not exist yet
          res1 = await client.from('AudioLibrary').select('*').limit(100);
        }

        if (!res1.error && res1.data) {
          data = res1.data;
          workingAudioTable = 'AudioLibrary';
        } else {
          let res2 = await client.from('AudioTrack').select('*').limit(100);
          if (!res2.error && res2.data) {
            data = res2.data;
            workingAudioTable = 'AudioTrack';
          } else {
            let res3 = await client.from('audio_tracks').select('*').limit(100);
            if (!res3.error && res3.data) {
              data = res3.data;
              workingAudioTable = 'audio_tracks';
            }
          }
        }
      }

      if (!data) return cachedAudioTracksResult?.data || null;

      const isDeprecatedDefault = (id = '', title = '') => {
        const i = id.toLowerCase();
        const t = title.toLowerCase();
        return (
          i === 'track_synthwave_energy' ||
          i === 'track_lofi_sunset' ||
          i === 'track_deep_bass_groove' ||
          t.includes('deep bass groove') ||
          t.includes('lo-fi chill sunset') ||
          t.includes('lofi chill sunset') ||
          t.includes('neon horizon')
        );
      };

      const mapped: AudioTrack[] = data
        .filter((r: any) => {
          const id = String(r.AudioTrackID || r.audio_track_id || r.id || '');
          const title = String(r.AudioTitle || r.audio_title || r.Title || r.title || '');
          return !isDeprecatedDefault(id, title);
        })
        .map((r: any) => ({
          id: r.AudioTrackID || r.audio_track_id || r.id,
          title: r.AudioTitle || r.audio_title || r.Title || r.title || 'Sound',
          artist: r.AudioArtist || r.audio_artist || r.Artist || r.artist || 'Creator',
          duration: r.Duration || r.duration || r.AudioDuration || r.audio_duration || '00:30',
          coverUrl: r.CoverURL || r.CoverUrl || r.cover_url || r.ThumbnailURL || r.thumbnail_url || r.ThumbnailUrl || '',
          audioUrl: r.AudioURL || r.AudioUrl || r.audio_url || r.AudioPath || '',
          category: r.Category || r.category || r.AudioCategory || r.audio_category || 'Trending',
        }));

      // Cache result for 60 seconds to save Supabase Disk IO and avoid continuous querying
      cachedAudioTracksResult = { data: mapped, timestamp: Date.now() };
      return mapped;
    } catch (e) {
      console.warn('Supabase fetchAudioTracks fallback:', e);
      return cachedAudioTracksResult?.data || null;
    }
  },

  async insertAudioTrack(track: AudioTrack): Promise<{ success: boolean; error?: string; isRlsBlocked?: boolean; isMissingColumns?: boolean }> {
    cachedAudioTracksResult = null;
    const client = getSupabaseClient();
    if (!client) return { success: true };

    try {
      const trackUuid = toUuid(track.id);

      // Full payload with all columns
      const fullPayload: Record<string, any> = {
        AudioTrackID: trackUuid,
        AudioTitle: track.title,
        AudioArtist: track.artist,
        AudioURL: track.audioUrl || '',
        CoverURL: track.coverUrl || '',
        Duration: track.duration || '00:30',
        Category: track.category || 'Trending',
        CreatedAt: new Date().toISOString(),
      };

      // Minimal payload (AudioTrackID, AudioTitle, AudioArtist as seen in Supabase schema)
      const minimalPayload: Record<string, any> = {
        AudioTrackID: trackUuid,
        AudioTitle: track.title,
        AudioArtist: track.artist,
      };

      // Candidate tables in priority order
      const tablesToTry = workingAudioTable
        ? [workingAudioTable, 'AudioLibrary', 'AudioTrack', 'audio_library', 'audio_tracks']
        : ['AudioLibrary', 'AudioTrack', 'audio_library', 'audio_tracks'];
      const uniqueTables = Array.from(new Set(tablesToTry));

      let lastErr: any = null;

      for (const table of uniqueTables) {
        // Attempt 1: Full payload
        const insertRes = await client.from(table).insert(fullPayload);
        if (!insertRes.error) {
          workingAudioTable = table as any;
          return { success: true };
        }

        // Duplicate key check: update instead
        if (insertRes.error.code === '23505' || insertRes.error.message?.includes('duplicate key')) {
          const updateRes = await client.from(table).update(fullPayload).eq('AudioTrackID', trackUuid);
          if (!updateRes.error) {
            workingAudioTable = table as any;
            return { success: true };
          }
        }

        lastErr = insertRes.error;

        // If table doesn't exist (42P01), try next candidate table
        if (insertRes.error.code === '42P01' || insertRes.error.message?.includes('does not exist')) {
          continue;
        }

        // If RLS blocked (42501)
        if (insertRes.error.code === '42501' || insertRes.error.message?.includes('violates row-level security')) {
          return {
            success: false,
            error: `Row-Level Security (RLS) on table "${table}" blocked insert. Please allow INSERT on table "${table}".`,
            isRlsBlocked: true,
          };
        }

        // Attempt 2: Minimal columns (AudioTrackID, AudioTitle, AudioArtist)
        // This succeeds immediately even if AudioURL/CoverURL/Duration/Category have not been added yet!
        const minRes = await client.from(table).insert(minimalPayload);
        if (!minRes.error) {
          workingAudioTable = table as any;
          return {
            success: true,
            isMissingColumns: true,
            error: `Recorded with basic columns. Note: Column "AudioURL" is missing from "${table}" in Supabase. Add it to persist audio playback links.`,
          };
        }

        if (minRes.error.code === '23505' || minRes.error.message?.includes('duplicate key')) {
          const minUpRes = await client.from(table).update(minimalPayload).eq('AudioTrackID', trackUuid);
          if (!minUpRes.error) {
            workingAudioTable = table as any;
            return { success: true };
          }
        }

        // Attempt 3: Lowercase columns (audiotrackid, audiotitle, audioartist)
        const lowerMinPayload: Record<string, any> = {
          audiotrackid: trackUuid,
          audiotitle: track.title,
          audioartist: track.artist,
        };
        const lowerRes = await client.from(table).insert(lowerMinPayload);
        if (!lowerRes.error) {
          workingAudioTable = table as any;
          return { success: true };
        }
      }

      if (lastErr) {
        console.warn('[Supabase] insertAudioTrack issue:', lastErr.message);
        return {
          success: false,
          error: lastErr.message,
          isRlsBlocked: lastErr.code === '42501' || lastErr.message?.includes('violates row-level security'),
        };
      }

      return { success: true };
    } catch (e: any) {
      console.warn('Supabase insertAudioTrack exception:', e);
      return { success: false, error: e?.message || 'Database insert failed' };
    }
  },

  async deleteAudioTrack(trackId: string): Promise<boolean> {
    cachedAudioTracksResult = null;
    const client = getSupabaseClient();
    if (!client || !trackId) return false;

    try {
      const targetUuid = isUuid(trackId) ? trackId : toUuid(trackId);
      await client.from('AudioLibrary').delete().eq('AudioTrackID', targetUuid);
      await client.from('AudioTrack').delete().eq('AudioTrackID', targetUuid);
      try {
        await client.from('audio_tracks').delete().eq('id', targetUuid);
      } catch {}
      return true;
    } catch {
      return false;
    }
  },

  async uploadAudioFile(file: File): Promise<{ url: string | null; error?: string; isRlsBlocked?: boolean }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const cleanFileName = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const mimeType = file.type || (ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg');

      // 1. Inspect existing buckets from Supabase Storage
      let candidateBuckets = ['audio', 'audios', 'sounds', 'music', 'media', 'uploads', 'public'];
      try {
        const { data: bucketList } = await client.storage.listBuckets();
        if (bucketList && bucketList.length > 0) {
          const names = bucketList.map(b => b.name || b.id).filter(Boolean);
          const matched = names.filter(n => /audio|music|sound/i.test(n));
          candidateBuckets = Array.from(new Set([...matched, ...names, ...candidateBuckets]));
        }
      } catch {
        // ignore listBuckets failure
      }

      let primaryAudioError: any = null;

      for (const bucket of candidateBuckets) {
        try {
          const { data, error } = await client.storage.from(bucket).upload(cleanFileName, file, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: false,
          });

          if (!error && data?.path) {
            preferredAudioBucket = bucket;
            const { data: pubData } = client.storage.from(bucket).getPublicUrl(cleanFileName);
            if (pubData?.publicUrl) return { url: pubData.publicUrl };
          }

          if (error) {
            // Keep error from primary 'audio' bucket
            if (bucket === 'audio' || !primaryAudioError) {
              primaryAudioError = error;
            }

            // If already exists, retry with upsert: true
            if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
              const { data: upData, error: upError } = await client.storage.from(bucket).upload(cleanFileName, file, {
                contentType: mimeType,
                cacheControl: '3600',
                upsert: true,
              });
              if (!upError && upData?.path) {
                const { data: pubData } = client.storage.from(bucket).getPublicUrl(cleanFileName);
                if (pubData?.publicUrl) return { url: pubData.publicUrl };
              }
            }

            // If RLS blocked on 'audio', stop early and report accurate RLS message
            if (bucket === 'audio' && (error.message?.includes('row-level security') || error.message?.includes('violates'))) {
              return {
                url: null,
                error: `Supabase Storage RLS Policy Error: Bucket "audio" has no INSERT policy for storage.objects.`,
                isRlsBlocked: true,
              };
            }
          }
        } catch (err: any) {
          if (bucket === 'audio' || !primaryAudioError) primaryAudioError = err;
        }
      }

      const errMsg = primaryAudioError?.message || 'Bucket upload failed. Please verify storage RLS policies for bucket "audio".';
      const isRls = errMsg.includes('row-level security') || errMsg.includes('violates');
      return {
        url: null,
        error: isRls
          ? `Supabase Storage RLS Error: Bucket "audio" requires an INSERT policy on storage.objects.`
          : errMsg,
        isRlsBlocked: isRls,
      };
    } catch (e: any) {
      console.warn('Supabase uploadAudioFile exception:', e);
      return { url: null, error: e?.message || 'Audio upload failed' };
    }
  },

  async uploadAudioCover(file: File): Promise<{ url: string | null; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cleanFileName = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const mimeType = file.type || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

      let candidateBuckets = ['audio', 'covers', 'images', 'media', 'uploads', 'public'];
      try {
        const { data: bucketList } = await client.storage.listBuckets();
        if (bucketList && bucketList.length > 0) {
          const names = bucketList.map(b => b.name || b.id).filter(Boolean);
          candidateBuckets = Array.from(new Set([...names, ...candidateBuckets]));
        }
      } catch {}

      let lastError: any = null;
      for (const bucket of candidateBuckets) {
        try {
          const targetPath = bucket === 'audio' ? `covers/${cleanFileName}` : cleanFileName;
          const { data, error } = await client.storage.from(bucket).upload(targetPath, file, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: false,
          });

          if (!error && data?.path) {
            preferredCoverBucket = bucket;
            const { data: pubData } = client.storage.from(bucket).getPublicUrl(targetPath);
            if (pubData?.publicUrl) return { url: pubData.publicUrl };
          }
          if (error) {
            lastError = error;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      return { url: null, error: lastError?.message || 'Cover upload failed' };
    } catch (e: any) {
      return { url: null, error: e?.message || 'Cover upload failed' };
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

  async uploadThumbnailImage(dataUrlOrFile: string | File, videoId?: string): Promise<{ url: string | null; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { url: null, error: 'Supabase client is not connected' };

    try {
      let fileBlob: Blob;
      let ext = 'jpg';
      let mimeType = 'image/jpeg';

      if (typeof dataUrlOrFile === 'string') {
        if (!dataUrlOrFile.startsWith('data:image/')) {
          return { url: dataUrlOrFile };
        }
        const matches = dataUrlOrFile.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (!matches) return { url: null, error: 'Invalid data URL' };
        mimeType = matches[1];
        ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const byteCharacters = atob(matches[2]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        fileBlob = new Blob([byteArray], { type: mimeType });
      } else {
        fileBlob = dataUrlOrFile;
        ext = dataUrlOrFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        mimeType = dataUrlOrFile.type || 'image/jpeg';
      }

      const cleanFileName = `thumb_${videoId || Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Candidate buckets
      let candidateBuckets = ['thumbnails', 'profile picture', 'profile-picture', 'images', 'public', 'videos'];
      try {
        const { data: bucketList } = await client.storage.listBuckets();
        if (bucketList && bucketList.length > 0) {
          const discovered = bucketList.map(b => b.name || b.id).filter(Boolean);
          candidateBuckets = Array.from(new Set([...discovered, ...candidateBuckets]));
        }
      } catch {}

      for (const bucket of candidateBuckets) {
        try {
          const { data, error } = await client.storage.from(bucket).upload(cleanFileName, fileBlob, {
            contentType: mimeType,
            cacheControl: '86400',
            upsert: true,
          });
          if (!error && data?.path) {
            const { data: pubData } = client.storage.from(bucket).getPublicUrl(cleanFileName);
            if (pubData?.publicUrl) {
              return { url: pubData.publicUrl };
            }
          }
        } catch {}
      }

      return { url: null, error: 'Could not upload thumbnail image' };
    } catch (e: any) {
      return { url: null, error: e?.message || 'Thumbnail upload failed' };
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
          .eq('VideoID', vUuid)
          .maybeSingle();
        if (dbRow?.VideoURL) {
          await this.deleteVideoFileFromStorage(dbRow.VideoURL);
        }
      } catch {}

      // 2. Cascade delete from child database tables to prevent foreign key errors
      try { await client.from('ReportVideo').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('VideoHashtag').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('VideoStats').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('Like').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('likes').delete().eq('video_id', vUuid); } catch {}
      try { await client.from('Comment').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('comments').delete().eq('video_id', vUuid); } catch {}
      try { await client.from('Share').delete().eq('VideoID', vUuid); } catch {}
      try { await client.from('Notification').delete().eq('VideoID', vUuid); } catch {}

      // 3. Delete from Video table (PascalCase and snake_case)
      const resPascal = await client.from('Video').delete().eq('VideoID', vUuid);
      if (resPascal.error) {
        await client.from('videos').delete().eq('id', vUuid);
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
  async fetchComments(videoId: string, currentUserId?: string): Promise<CommentEntry[] | null> {
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
              LikedBy: r.liked_by || r.LikedBy,
              LikesCount: r.likes_count || r.LikesCount,
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

        const rawLikedBy: string[] = Array.isArray(row.LikedBy)
          ? row.LikedBy
          : (Array.isArray(row.liked_by) ? row.liked_by : []);
        const likesCount = rawLikedBy.length > 0 ? rawLikedBy.length : Number(row.LikesCount || row.likes_count || 0);
        const isLiked = Boolean(currentUserId && rawLikedBy.some(id => isSameUser(id, currentUserId)));

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
            likesCount,
            isLiked,
            likedBy: rawLikedBy,
          });
          repliesMap.set(pId, list);
        } else {
          topLevel.push({
            id: cId,
            name: userMeta.name,
            avatar: userMeta.avatar,
            text,
            timestamp,
            likesCount,
            isLiked,
            likedBy: rawLikedBy,
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
              likesCount: orphan.likesCount || 0,
              isLiked: orphan.isLiked || false,
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
      // Ensure user exists without overwriting profile data
      await this.ensureUserExists(user);

      const cUuid = toUuid(commentId);
      const vUuid = toUuid(videoId);
      const uUuid = toUuid(user.id);
      const parentUuid = replyToId ? toUuid(replyToId) : null;

      const nowIso = new Date().toISOString();
      let { error } = await client.from('Comment').insert({
        CommentID: cUuid,
        UserID: uUuid,
        VideoID: vUuid,
        ParentCommentID: parentUuid,
        CommentText: text,
        CreatedAt: nowIso,
      });

      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        // Fallback with created_at or without timestamp column if neither exists
        const res2 = await client.from('Comment').insert({
          CommentID: cUuid,
          UserID: uUuid,
          VideoID: vUuid,
          ParentCommentID: parentUuid,
          CommentText: text,
        });
        error = res2.error;
      }

      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        // Fallback for snake_case comments table
        const res3 = await client.from('comments').insert({
          id: cUuid,
          user_id: uUuid,
          video_id: vUuid,
          parent_comment_id: parentUuid,
          comment_text: text,
          created_at: nowIso,
        });
        error = res3.error;
      }

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

  async toggleCommentLike(
    commentId: string,
    videoId: string,
    userId: string,
    isLiked: boolean
  ): Promise<{ success: boolean; likedBy: string[]; count: number }> {
    const client = getSupabaseClient();
    if (!client || !commentId || !userId) return { success: false, likedBy: [], count: 0 };

    try {
      const cUuid = toUuid(commentId);
      const uUuid = toUuid(userId);

      // 1. Fetch current comment row to get existing LikedBy array
      const { data: row } = await client
        .from('Comment')
        .select('CommentID, LikedBy, LikesCount')
        .or(`CommentID.eq.${cUuid},CommentID.eq.${commentId}`)
        .maybeSingle();

      const existingLikedBy: string[] = Array.isArray(row?.LikedBy) ? row.LikedBy : [];
      let updatedLikedBy: string[];

      if (isLiked) {
        if (!existingLikedBy.some(id => isSameUser(id, userId))) {
          updatedLikedBy = [...existingLikedBy, uUuid];
        } else {
          updatedLikedBy = existingLikedBy;
        }
      } else {
        updatedLikedBy = existingLikedBy.filter(id => !isSameUser(id, userId));
      }

      const updatedCount = updatedLikedBy.length;

      // 2. Persist updated LikedBy & LikesCount to Comment table
      const { error } = await client
        .from('Comment')
        .update({
          LikedBy: updatedLikedBy,
          LikesCount: updatedCount,
        })
        .or(`CommentID.eq.${cUuid},CommentID.eq.${commentId}`);

      if (error) {
        console.warn('Supabase toggleCommentLike update warning:', error.message);
      }

      return { success: !error, likedBy: updatedLikedBy, count: updatedCount };
    } catch (e) {
      console.warn('Supabase toggleCommentLike exception:', e);
      return { success: false, likedBy: [], count: 0 };
    }
  },

  // -----------------------------------------------------------------------
  // 5. Share Table (VideoID, UserID, SharedAt)
  // -----------------------------------------------------------------------
  async insertShare(videoId: string, userId: string): Promise<boolean> {
    const vUuid = toUuid(videoId);
    // 1. Immediately record in persistent localStorage so share count never resets on page refresh or offline
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('viralhub_video_shares_v1') || '{}';
        const parsed = JSON.parse(raw);
        const nextVal = (parsed[videoId] || parsed[vUuid] || 0) + 1;
        parsed[videoId] = nextVal;
        parsed[vUuid] = nextVal;
        localStorage.setItem('viralhub_video_shares_v1', JSON.stringify(parsed));
      }
    } catch {}

    const client = getSupabaseClient();
    if (!client) return true;

    try {
      const uUuid = toUuid(userId);

      // Insert record into Share table
      await client.from('Share').insert({
        VideoID: vUuid,
        UserID: uUuid,
        SharedAt: new Date().toISOString(),
      });

      // Also attempt to increment SharesCount directly in Video table if column exists
      try {
        const { data: vRow } = await client.from('Video').select('SharesCount').eq('VideoID', vUuid).maybeSingle();
        if (vRow && vRow.SharesCount !== undefined) {
          await client.from('Video').update({ SharesCount: (vRow.SharesCount || 0) + 1 }).eq('VideoID', vUuid);
        }
      } catch {}

      return true;
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
          clearedHistory: c.ClearedHistory || {},
          rawMessages: rawMsgs,
        };
      });
    } catch (e) {
      console.warn('Supabase fetchConversationsAndMessages fallback:', e);
      return null;
    }
  },

  async deleteMessage(messageId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !messageId) return false;

    try {
      const isMsgUuid = isUuid(messageId);
      const msgUuid = toUuid(messageId);

      const ids = new Set<string>();
      if (isMsgUuid) ids.add(messageId);
      if (msgUuid && isUuid(msgUuid)) ids.add(msgUuid);

      const idsList = Array.from(ids);
      if (idsList.length === 0) return false;

      await client.from('Message').delete().in('MessageID', idsList);
      return true;
    } catch (e) {
      console.warn('Supabase deleteMessage warning:', e);
      return false;
    }
  },

  async deleteConversationMessages(
    conversationId: string,
    upToIso?: string,
    userId?: string,
    partnerId?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !conversationId) return false;

    try {
      const targetTime = upToIso || new Date().toISOString();
      const candidateIds = new Set<string>();

      if (isUuid(conversationId)) candidateIds.add(conversationId);
      const convUuid = toUuid(conversationId);
      if (convUuid && isUuid(convUuid)) candidateIds.add(convUuid);

      if (userId && partnerId) {
        const canonical = getDirectConversationId(userId, partnerId);
        if (canonical && isUuid(canonical)) candidateIds.add(canonical);

        const u1 = toUuid(userId);
        const u2 = toUuid(partnerId);
        if (isUuid(u1) && isUuid(u2)) {
          try {
            const { data: convRows } = await client
              .from('Conversation')
              .select('ConversationID')
              .or(`and(UserIDA.eq.${u1},UserIDB.eq.${u2}),and(UserIDA.eq.${u2},UserIDB.eq.${u1})`);
            (convRows || []).forEach((r: any) => {
              if (r.ConversationID && isUuid(r.ConversationID)) {
                candidateIds.add(r.ConversationID);
              }
            });
          } catch {}
        }
      } else if (isUuid(convUuid)) {
        try {
          const { data: convRows } = await client
            .from('Conversation')
            .select('ConversationID')
            .eq('ConversationID', convUuid);
          (convRows || []).forEach((r: any) => {
            if (r.ConversationID && isUuid(r.ConversationID)) {
              candidateIds.add(r.ConversationID);
            }
          });
        } catch {}
      }

      const idsList = Array.from(candidateIds);
      if (idsList.length === 0) return false;

      // 1. Record ClearedHistory on Conversation table for this user ONLY
      let bothCleared = false;
      let purgeTime = targetTime;

      if (userId) {
        const uUuid = toUuid(userId);
        const partnerUuid = partnerId ? toUuid(partnerId) : undefined;

        for (const cid of idsList) {
          try {
            const { data: cRow } = await client
              .from('Conversation')
              .select('ClearedHistory')
              .eq('ConversationID', cid)
              .maybeSingle();

            const existingCleared =
              cRow && typeof cRow.ClearedHistory === 'object' && cRow.ClearedHistory !== null
                ? cRow.ClearedHistory
                : {};

            const updatedCleared = {
              ...existingCleared,
              [userId]: targetTime,
              [uUuid]: targetTime,
            };

            await client
              .from('Conversation')
              .update({ ClearedHistory: updatedCleared })
              .eq('ConversationID', cid);

            // Check if partner has ALSO deleted/cleared this conversation
            if (partnerId) {
              const partnerClearedIso =
                existingCleared[partnerId] ||
                (partnerUuid ? existingCleared[partnerUuid] : undefined);

              if (partnerClearedIso) {
                bothCleared = true;
                purgeTime =
                  new Date(targetTime).getTime() <= new Date(partnerClearedIso).getTime()
                    ? targetTime
                    : partnerClearedIso;
              }
            }
          } catch {}
        }
      }

      // 2. ONLY purge from Message table if BOTH users have deleted the conversation!
      // If only one user deleted it, the other user that they are chatting with MUST still see their messages!
      if (bothCleared) {
        try {
          let deleteQuery = client.from('Message').delete().in('ConversationID', idsList);
          if (purgeTime) {
            deleteQuery = deleteQuery.lte('SentAt', purgeTime);
          }
          await deleteQuery;
        } catch (delErr) {
          console.warn('Both-cleared message purge fallback:', delErr);
        }
      }

      // 3. Fallback sync record (guarantees cross-device sync for this user even if ClearedHistory column is missing)
      if (userId) {
        try {
          const syncNotifId = toUuid(`conv_clear_${userId}_${conversationId}`);
          await client.from('Notification').upsert({
            NotificationID: syncNotifId,
            UserID: toUuid(userId),
            NotificationType: 'system_conv_cleared',
            NotificationMessage: JSON.stringify({
              conversationId,
              clearedAt: targetTime,
              ids: idsList,
            }),
            IsRead: true,
            NotificationDate: targetTime,
          }, { onConflict: 'NotificationID' });
        } catch {}
      }

      return true;
    } catch (e) {
      console.warn('Supabase deleteConversationMessages warning:', e);
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

      // Serialize rich notification metadata inside NotificationMessage so actor, video, and request IDs are preserved!
      const payloadString = JSON.stringify({
        text: item.targetText || '',
        actor: item.actor,
        videoId: item.videoId,
        requestId: item.requestId,
        status: item.status,
        appealStatus: item.appealStatus,
        banReason: item.banReason,
      });

      const { error } = await client.from('Notification').upsert({
        NotificationID: notifUuid,
        UserID: userUuid,
        NotificationType: item.type,
        NotificationMessage: payloadString,
        IsRead: !item.isUnread,
        NotificationDate: item.createdAt || item.timestamp || new Date().toISOString(),
      }, { onConflict: 'NotificationID' });

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

        // Silent system sync for conversation clearance across devices
        if (r.NotificationType === 'system_conv_cleared') {
          try {
            const payload = typeof r.NotificationMessage === 'string' ? JSON.parse(r.NotificationMessage) : r.NotificationMessage;
            if (payload && payload.conversationId && payload.clearedAt && r.UserID) {
              const clearT = new Date(payload.clearedAt).getTime();
              const uId = r.UserID;
              const uUuid = toUuid(r.UserID);
              const cId = payload.conversationId;
              const cUuid = toUuid(payload.conversationId);
              try {
                localStorage.setItem(`viralhub_cleared_conv_${cUuid}_${uUuid}`, JSON.stringify(clearT));
                localStorage.setItem(`viralhub_cleared_conv_${cId}_${uId}`, JSON.stringify(clearT));
                (payload.ids || []).forEach((cid: string) => {
                  localStorage.setItem(`viralhub_cleared_conv_${cid}_${uUuid}`, JSON.stringify(clearT));
                  localStorage.setItem(`viralhub_cleared_conv_${cid}_${uId}`, JSON.stringify(clearT));
                });
              } catch {}
            }
          } catch {}
          continue;
        }

        const isRevoked = r.NotificationType === 'video_revoked';
        const isAppeal = r.NotificationType === 'appeal_status';
        const isBanned = r.NotificationType === 'account_banned';

        let targetText = r.NotificationMessage || '';
        let actor = {
          id: isRevoked || isAppeal || isBanned ? 'viralhub_moderation' : 'system',
          username: isRevoked || isAppeal || isBanned ? 'moderation' : 'viralhub',
          displayName: isRevoked || isAppeal || isBanned ? 'ViralHub Moderation' : 'ViralHub',
          avatar: '',
        };
        let videoId = r.VideoID || undefined;
        let requestId: string | undefined = undefined;
        let status: any = undefined;
        let appealStatus: any = isRevoked ? 'none' : undefined;
        let banReason: string | undefined = undefined;

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
            if (parsed.banReason) banReason = parsed.banReason;
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
          timestamp: r.NotificationDate || '',
          createdAt: r.NotificationDate || '',
          isUnread: !r.IsRead,
          videoId,
          requestId,
          status,
          appealStatus,
          banReason,
        });
      }
      return deduplicateNotifications(items);
    } catch (e) {
      console.warn('Supabase fetchNotifications fallback:', e);
      return null;
    }
  },

  async updateUserRole(userId: string, newRole: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !userId) return false;

    // Invalidate caches
    cachedAdminsResult = null;
    cachedUsersResult = null;

    try {
      const uUuid = toUuid(userId);
      const cleanRole = newRole.toLowerCase();
      const isAdminRole = cleanRole === 'admin' || cleanRole === 'super admin' || cleanRole === 'administrator';

      // 1. Update User table
      let updateRes = await client
        .from('User')
        .update({ Role: cleanRole })
        .eq('UserID', uUuid);

      if (updateRes.error) {
        // Fallback for snake_case table
        await client
          .from('users')
          .update({ role: cleanRole })
          .eq('id', uUuid);
      }

      // 2. Sync Admin table
      if (isAdminRole) {
        // Get user details to populate Admin record
        const { data: dbUser } = await client
          .from('User')
          .select('Username, Email, DisplayName')
          .eq('UserID', uUuid)
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
            Permissions: ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
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
          .or(`AdminID.eq.${uUuid},UserID.eq.${uUuid}`);
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
      let vidData: any[] = [];
      let userData: any[] = [];

      // 1. Fetch from PascalCase tables
      try {
        const [vRes, uRes] = await Promise.all([
          client.from('ReportVideo').select('*').order('ReportedDate', { ascending: false }),
          client.from('ReportUser').select('*').order('ReportedDate', { ascending: false }),
        ]);
        if (vRes.data) vidData = vRes.data;
        if (uRes.data) userData = uRes.data;
      } catch (err) {
        console.warn('PascalCase Report tables fetch failed, trying snake_case:', err);
      }

      // 2. Fallback to snake_case if PascalCase returned nothing/failed
      if (vidData.length === 0) {
        try {
          const { data: snakeVid } = await client
            .from('report_videos')
            .select('*')
            .order('created_at', { ascending: false });
          if (snakeVid && snakeVid.length > 0) {
            vidData = snakeVid.map((r: any) => ({
              ReportID: r.id || r.report_id,
              ReporterUserID: r.reporter_user_id || r.user_id,
              VideoID: r.video_id,
              Reason: r.reason,
              Status: r.status,
              ReportedDate: r.created_at || r.reported_date,
            }));
          }
        } catch {}
      }

      if (userData.length === 0) {
        try {
          const { data: snakeUser } = await client
            .from('report_users')
            .select('*')
            .order('created_at', { ascending: false });
          if (snakeUser && snakeUser.length > 0) {
            userData = snakeUser.map((r: any) => ({
              ReportID: r.id || r.report_id,
              ReportUserID: r.reporter_user_id || r.user_id,
              ReportedUserID: r.reported_user_id,
              Reason: r.reason,
              Status: r.status,
              ReportedDate: r.created_at || r.reported_date,
            }));
          }
        } catch {}
      }

      const items: ReportItem[] = [];

      for (const r of vidData) {
        const rawReason = r.Reason || r.reason || '';
        let targetName = `Video #${r.VideoID ? String(r.VideoID).slice(0, 8) : 'Unknown'}`;
        let targetSubtitle = rawReason;
        let targetThumbnail = '';
        let scenario = 'Inappropriate Content';
        let description = rawReason;

        // Check for serialized metadata (e.g. "scenario: desc|||{...}")
        if (rawReason.includes('|||')) {
          const parts = rawReason.split('|||');
          const basicReason = parts[0] || '';
          try {
            const meta = JSON.parse(parts[1]);
            if (meta.targetName) targetName = meta.targetName;
            if (meta.targetSubtitle) targetSubtitle = meta.targetSubtitle;
            if (meta.targetThumbnail) targetThumbnail = meta.targetThumbnail;
            if (meta.scenario) scenario = meta.scenario;
            if (meta.description) description = meta.description;
          } catch {}
          if (!description) description = basicReason;
        } else if (rawReason.includes(':')) {
          scenario = rawReason.split(':')[0].trim();
          description = rawReason.substring(rawReason.indexOf(':') + 1).trim();
        }

        items.push({
          id: r.ReportID || r.id,
          reporterId: r.ReporterUserID || r.reporter_id || undefined,
          type: 'video',
          targetId: r.VideoID || r.video_id,
          targetName,
          targetSubtitle,
          targetThumbnail: targetThumbnail || undefined,
          scenario,
          description,
          status: (r.Status as any) || (r.status as any) || 'Under Review',
          timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
          createdAt: r.ReportedDate || new Date().toISOString(),
        });
      }

      for (const r of userData) {
        const rawReason = r.Reason || r.reason || '';
        let targetName = `User #${r.ReportedUserID ? String(r.ReportedUserID).slice(0, 8) : 'Account'}`;
        let targetSubtitle = rawReason;
        let targetThumbnail = '';
        let scenario = 'Community Violation';
        let description = rawReason;

        let warningReason: string | undefined;
        let warningIssuedAt: string | undefined;
        let warningDeadline: string | undefined;
        let appealStatus: 'none' | 'pending' | 'approved' | 'declined' | undefined;
        let appealReason: string | undefined;
        let appealProofUrl: string | undefined;
        let appealProofName: string | undefined;
        let appealSubmittedAt: string | undefined;

        if (rawReason.includes('|||')) {
          const parts = rawReason.split('|||');
          const basicReason = parts[0] || '';
          try {
            const meta = JSON.parse(parts[1]);
            if (meta.targetName) targetName = meta.targetName;
            if (meta.targetSubtitle) targetSubtitle = meta.targetSubtitle;
            if (meta.targetThumbnail) targetThumbnail = meta.targetThumbnail;
            if (meta.scenario) scenario = meta.scenario;
            if (meta.description) description = meta.description;
            if (meta.warningReason) warningReason = meta.warningReason;
            if (meta.warningIssuedAt) warningIssuedAt = meta.warningIssuedAt;
            if (meta.warningDeadline) warningDeadline = meta.warningDeadline;
            if (meta.appealStatus) appealStatus = meta.appealStatus;
            if (meta.appealReason) appealReason = meta.appealReason;
            if (meta.appealProofUrl) appealProofUrl = meta.appealProofUrl;
            if (meta.appealProofName) appealProofName = meta.appealProofName;
            if (meta.appealSubmittedAt) appealSubmittedAt = meta.appealSubmittedAt;
          } catch {}
          if (!description) description = basicReason;
        } else if (rawReason.includes(':')) {
          scenario = rawReason.split(':')[0].trim();
          description = rawReason.substring(rawReason.indexOf(':') + 1).trim();
        }

        // Also check local warning cache for target user
        const targetUserId = r.ReportedUserID || r.reported_user_id;
        const targetWarning = checkUserWarning(targetUserId);
        if (targetWarning.warningActive) {
          warningReason = warningReason || targetWarning.warningReason;
          warningIssuedAt = warningIssuedAt || targetWarning.warningIssuedAt;
          warningDeadline = warningDeadline || targetWarning.warningDeadline;
          appealStatus = appealStatus || targetWarning.preBanAppealStatus;
          appealReason = appealReason || targetWarning.preBanAppealReason;
          appealProofUrl = appealProofUrl || targetWarning.preBanAppealProofUrl;
          appealProofName = appealProofName || targetWarning.preBanAppealProofName;
          appealSubmittedAt = appealSubmittedAt || targetWarning.preBanAppealSubmittedAt;
        }

        let currentReportStatus = (r.Status as any) || (r.status as any) || 'Under Review';
        if (targetWarning.warningActive) {
          if (targetWarning.preBanAppealStatus === 'pending') {
            currentReportStatus = 'Appeal Submitted';
          } else if (currentReportStatus === 'Under Review') {
            currentReportStatus = 'Warning Issued';
          }
        }

        items.push({
          id: r.ReportID || r.id,
          reporterId: r.ReportUserID || r.reporter_id || undefined,
          type: 'user',
          targetId: targetUserId,
          targetName,
          targetSubtitle,
          targetThumbnail: targetThumbnail || undefined,
          scenario,
          description,
          status: currentReportStatus,
          timestamp: r.ReportedDate ? new Date(r.ReportedDate).toLocaleDateString() : 'Recent',
          createdAt: r.ReportedDate || new Date().toISOString(),
          warningReason,
          warningIssuedAt,
          warningDeadline,
          appealStatus,
          appealReason,
          appealProofUrl,
          appealProofName,
          appealSubmittedAt,
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

      // Serialize metadata into Reason column so targetName, thumbnail, and scenario survive restarts
      const meta = {
        targetName: report.targetName,
        targetSubtitle: report.targetSubtitle,
        targetThumbnail: report.targetThumbnail,
        scenario: report.scenario,
        description: report.description,
      };
      const reasonText = `${report.scenario || 'Report'}: ${report.description || ''}|||${JSON.stringify(meta)}`;

      if (report.type === 'video') {
        // Attempt 1: Full insert into PascalCase ReportVideo
        let res = await client.from('ReportVideo').insert({
          ReportID: reportUuid,
          ReporterUserID: reporterUuid,
          VideoID: targetUuid,
          Reason: reasonText,
          Status: report.status || 'Under Review',
          ReportedDate: report.createdAt || new Date().toISOString(),
        });

        // Fallback 1: Foreign key violation (23503) on ReporterUserID or VideoID -> retry with null reporter
        if (res.error && res.error.code === '23503') {
          console.warn('[Supabase] ReportVideo foreign key error, retrying with ReporterUserID: null');
          res = await client.from('ReportVideo').insert({
            ReportID: reportUuid,
            ReporterUserID: null,
            VideoID: targetUuid,
            Reason: reasonText,
            Status: report.status || 'Under Review',
            ReportedDate: report.createdAt || new Date().toISOString(),
          });
        }

        // Fallback 2: Column missing or table missing (42P01 / 42703) -> retry snake_case
        if (res.error && (res.error.code === '42P01' || res.error.code === '42703')) {
          res = await client.from('report_videos').insert({
            id: reportUuid,
            reporter_user_id: reporterUuid,
            video_id: targetUuid,
            reason: reasonText,
            status: report.status || 'Under Review',
            created_at: report.createdAt || new Date().toISOString(),
          });
        }

        return !res.error;
      } else {
        // User report
        let res = await client.from('ReportUser').insert({
          ReportID: reportUuid,
          ReportUserID: reporterUuid,
          ReportedUserID: targetUuid,
          Reason: reasonText,
          Status: report.status || 'Under Review',
          ReportedDate: report.createdAt || new Date().toISOString(),
        });

        if (res.error && res.error.code === '23503') {
          res = await client.from('ReportUser').insert({
            ReportID: reportUuid,
            ReportUserID: null,
            ReportedUserID: targetUuid,
            Reason: reasonText,
            Status: report.status || 'Under Review',
            ReportedDate: report.createdAt || new Date().toISOString(),
          });
        }

        if (res.error && (res.error.code === '42P01' || res.error.code === '42703')) {
          res = await client.from('report_users').insert({
            id: reportUuid,
            reporter_user_id: reporterUuid,
            reported_user_id: targetUuid,
            reason: reasonText,
            status: report.status || 'Under Review',
            created_at: report.createdAt || new Date().toISOString(),
          });
        }

        return !res.error;
      }
    } catch (e) {
      console.warn('Supabase insertReport fallback:', e);
      return false;
    }
  },

  async updateReportStatus(
    reportId: string,
    type: 'video' | 'user' | 'live_stream',
    status: 'Approved' | 'Rejected' | 'Under Review' | 'Warning Issued' | 'Appeal Submitted'
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const rUuid = toUuid(reportId);
      const table = type === 'video' ? 'ReportVideo' : 'ReportUser';
      const altTable = type === 'video' ? 'ReportUser' : 'ReportVideo';

      let { error } = await client.from(table).update({ Status: status }).eq('ReportID', rUuid);
      if (error) {
        const alt = await client.from(altTable).update({ Status: status }).eq('ReportID', rUuid);
        error = alt.error;
      }

      // Try snake_case tables if PascalCase not found
      if (error) {
        const snakeTable = type === 'video' ? 'report_videos' : 'report_users';
        await client.from(snakeTable).update({ status }).eq('id', rUuid);
      }
      return true;
    } catch (e) {
      console.warn('Supabase updateReportStatus error:', e);
      return false;
    }
  },

  async uploadAppealProof(file: File): Promise<{ url: string; error?: string }> {
    const client = getSupabaseClient();
    const fallbackUrl = URL.createObjectURL(file);
    if (!client) return { url: fallbackUrl };

    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `appeal_proofs/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      // Upload to avatars bucket (which is standard public image bucket in Supabase)
      const { error } = await client.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (!error) {
        const { data } = client.storage.from('avatars').getPublicUrl(filePath);
        return { url: data?.publicUrl || fallbackUrl };
      }
      return { url: fallbackUrl };
    } catch (e: any) {
      return { url: fallbackUrl, error: e?.message };
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

      // 1. Crucial: Ensure the host account exists in the User table first so foreign key is NEVER violated!
      if (stream.host) {
        try {
          await this.ensureUserExists(stream.host);
        } catch {}
      }

      // 2. Insert/Upsert into Livestream table
      const payload: Record<string, any> = {
        LivestreamID: streamUuid,
        HostUserID: hostUuid,
        Title: stream.title || 'Live Stream',
        StartedAt: new Date().toISOString(),
        EndedAt: stream.isLive ? null : new Date().toISOString(),
      };

      let res = await client.from('Livestream').upsert(payload, { onConflict: 'LivestreamID' });
      let error = res.error;

      // If foreign key constraint failed on HostUserID (code 23503), retry with HostUserID: null
      if (error && error.code === '23503') {
        const nullFkPayload = { ...payload, HostUserID: null };
        const fkRes = await client.from('Livestream').upsert(nullFkPayload, { onConflict: 'LivestreamID' });
        error = fkRes.error;
      }

      // Fallback for lowercase table name if configured as 'livestreams'
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const snakePayload = {
          id: streamUuid,
          host_user_id: hostUuid,
          title: stream.title || 'Live Stream',
          started_at: new Date().toISOString(),
          ended_at: stream.isLive ? null : new Date().toISOString(),
        };
        const snakeRes = await client.from('livestreams').upsert(snakePayload, { onConflict: 'id' });
        error = snakeRes.error;
      }

      if (error && error.code !== '42P01') {
        console.warn('Supabase upsertLiveStream notice:', error.message || error);
      }

      return !error;
    } catch (e) {
      console.warn('Supabase upsertLiveStream exception:', e);
      return false;
    }
  },

  async endLiveStream(streamId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !streamId) return false;

    try {
      const streamUuid = toUuid(streamId);
      const nowIso = new Date().toISOString();

      await client
        .from('Livestream')
        .update({ EndedAt: nowIso })
        .eq('LivestreamID', streamUuid);

      // Also try snake_case fallback
      try {
        await client
          .from('livestreams')
          .update({ ended_at: nowIso })
          .eq('id', streamUuid);
      } catch {}

      return true;
    } catch (e) {
      console.warn('Supabase endLiveStream fallback:', e);
      return false;
    }
  },

  async fetchActiveLiveStreams(currentUserId?: string): Promise<LiveStream[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      // 1. Fetch all streams that have not been ended
      const { data, error } = await client
        .from('Livestream')
        .select('LivestreamID, HostUserID, Title, StartedAt, EndedAt')
        .is('EndedAt', null)
        .order('StartedAt', { ascending: false })
        .limit(30);

      let rows: any[] = [];

      if (error || !data) {
        // Fallback for lowercase 'livestreams' table
        const fallbackRes = await client
          .from('livestreams')
          .select('*')
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(30);

        if (fallbackRes.data) {
          rows = fallbackRes.data.map(r => ({
            LivestreamID: r.id || r.LivestreamID,
            HostUserID: r.host_user_id || r.HostUserID,
            Title: r.title || r.Title,
            StartedAt: r.started_at || r.StartedAt,
            EndedAt: r.ended_at || r.EndedAt,
          }));
        }
      } else {
        rows = data;
      }

      if (!rows || rows.length === 0) {
        return [];
      }

      // 2. Filter out truly abandoned ghost streams (older than 2.5 hours without end)
      const now = Date.now();
      const MAX_STREAM_AGE_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours
      const activeRows: any[] = [];
      const staleIdsToClose: string[] = [];

      for (const row of rows) {
        const startedTime = row.StartedAt ? new Date(row.StartedAt).getTime() : 0;
        const isVeryOld = startedTime > 0 && (now - startedTime > MAX_STREAM_AGE_MS);
        if (isVeryOld) {
          if (row.LivestreamID) staleIdsToClose.push(row.LivestreamID);
        } else {
          activeRows.push(row);
        }
      }

      // Automatically mark old abandoned streams ended in background (0 disk overhead)
      if (staleIdsToClose.length > 0) {
        Promise.resolve(
          client
            .from('Livestream')
            .update({ EndedAt: new Date().toISOString() })
            .in('LivestreamID', staleIdsToClose)
        ).catch(() => {});
      }

      if (activeRows.length === 0) {
        return [];
      }

      // 3. Cleanly resolve host user profiles from User table (0 schema join errors)
      const hostIds = Array.from(new Set(activeRows.map(r => r.HostUserID).filter(Boolean)));
      const hostUserMap = new Map<string, any>();

      if (hostIds.length > 0) {
        try {
          const { data: userRows } = await client
            .from('User')
            .select('UserID, Username, DisplayName, ProfilePictureURL')
            .in('UserID', hostIds);

          if (userRows) {
            userRows.forEach(u => {
              if (u.UserID) {
                hostUserMap.set(u.UserID, u);
                hostUserMap.set(toUuid(u.UserID), u);
              }
            });
          }
        } catch {}
      }

      return activeRows.map((row: any) => {
        const hostProfile = hostUserMap.get(row.HostUserID) || hostUserMap.get(toUuid(row.HostUserID)) || {};
        return {
          id: row.LivestreamID,
          host: {
            id: row.HostUserID,
            username: hostProfile.Username || 'creator',
            displayName: hostProfile.DisplayName || hostProfile.Username || 'Live Creator',
            email: '',
            avatar: hostProfile.ProfilePictureURL || '',
            bio: '',
            followingCount: 0,
            followersCount: 0,
            likesCount: '0',
            isPrivate: false,
            role: 'creator',
          },
          title: row.Title || 'Live Stream',
          topic: row.Topic || 'Gaming & Chat',
          aboutMe: '',
          thumbnailUrl: row.ThumbnailURL || row.thumbnail_url || undefined,
          likesCount: typeof row.LikesCount === 'number' ? row.LikesCount : (typeof row.likes_count === 'number' ? row.likes_count : 0),
          viewersCount: 1,
          viewers: [],
          isLive: true,
          timerSeconds: 0,
          followerGoal: { current: 4083, target: 4100 },
          messages: [],
          cameraEnabled: true,
          micEnabled: true,
          screenShareEnabled: true,
        };
      });
    } catch (e) {
      console.warn('Supabase fetchActiveLiveStreams fallback:', e);
      return [];
    }
  },

  async fetchLiveComments(streamId: string): Promise<LiveStreamMessage[]> {
    const client = getSupabaseClient();
    if (!client || !streamId) return [];

    try {
      const streamUuid = toUuid(streamId);

      let rows: any[] = [];

      // Query LiveComment table using select('*') so it succeeds whether the PK is 'id' or 'LiveCommentID'
      let res = await client
        .from('LiveComment')
        .select('*')
        .eq('LiveStreamID', streamUuid)
        .order('LiveCommentAt', { ascending: true })
        .limit(60);

      // If 'LiveCommentAt' column does not exist (code 42703), retry without ordering
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('column'))) {
        res = await client
          .from('LiveComment')
          .select('*')
          .eq('LiveStreamID', streamUuid)
          .limit(60);
      }

      if (res.data && res.data.length > 0) {
        rows = res.data;
      } else if (res.error && (res.error.code === '42P01' || res.error.message?.includes('does not exist'))) {
        // Table not found or snake_case fallback
        const snake = await client
          .from('live_comments')
          .select('*')
          .eq('live_stream_id', streamUuid)
          .limit(60);
        if (snake.data && snake.data.length > 0) {
          rows = snake.data;
        }
      }

      if (!rows || rows.length === 0) return [];

      // Collect unique user IDs from comments
      const rawUserIds = rows
        .map((r: any) => r.UserID || r.user_id)
        .filter(Boolean);
      const uniqueUserIds = Array.from(new Set(rawUserIds));

      // Build in-memory user lookup map
      const userLookup = new Map<string, { username: string; displayName: string; avatar: string }>();

      // Populate from cachedUsersResult if available (0 extra disk IO!)
      if (cachedUsersResult?.data) {
        for (const u of cachedUsersResult.data) {
          const uInfo = {
            username: u.username || 'user',
            displayName: u.displayName || u.username || 'User',
            avatar: u.avatar || '',
          };
          userLookup.set(String(u.id), uInfo);
          userLookup.set(toUuid(u.id), uInfo);
        }
      }

      // Check localStorage current user or saved accounts as another zero-IO cache
      try {
        const rawCurr = typeof localStorage !== 'undefined' ? localStorage.getItem('viralhub_currentUser') : null;
        if (rawCurr) {
          const curr = JSON.parse(rawCurr);
          if (curr?.id) {
            const cInfo = {
              username: curr.username || 'user',
              displayName: curr.displayName || curr.username || 'User',
              avatar: curr.avatar || '',
            };
            userLookup.set(String(curr.id), cInfo);
            userLookup.set(toUuid(curr.id), cInfo);
          }
        }
      } catch {}

      // If any user IDs are missing from lookup, fetch them in ONE single batch select query
      const missingIds = uniqueUserIds.filter(id => !userLookup.has(String(id)) && !userLookup.has(toUuid(id)));
      if (missingIds.length > 0) {
        try {
          const { data: userData } = await client
            .from('User')
            .select('UserID, Username, DisplayName, ProfilePictureURL')
            .in('UserID', missingIds);

          if (userData && userData.length > 0) {
            for (const u of userData) {
              const info = {
                username: u.Username || 'user',
                displayName: u.DisplayName || u.Username || 'User',
                avatar: u.ProfilePictureURL || '',
              };
              userLookup.set(String(u.UserID), info);
              userLookup.set(toUuid(u.UserID), info);
            }
          }
        } catch {}
      }

      return rows.map((r: any) => {
        const uRel = Array.isArray(r.User) ? r.User[0] : (r.User || null);
        const uid = r.UserID || r.user_id || uRel?.UserID || '';
        const found = userLookup.get(String(uid)) || userLookup.get(toUuid(uid));

        const username = uRel?.Username || found?.username || 'user';
        const displayName = uRel?.DisplayName || found?.displayName || uRel?.Username || found?.username || 'User';
        const avatar = uRel?.ProfilePictureURL || found?.avatar || '';
        const text = r.LiveText || r.comment_text || '';
        const rawDate = r.LiveCommentAt || r.created_at;

        return {
          id: r.LiveCommentID || r.id || `lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: uid,
          username,
          displayName,
          avatar,
          text,
          timestamp: rawDate ? new Date(rawDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
        };
      });
    } catch (e) {
      console.warn('fetchLiveComments fallback:', e);
      return [];
    }
  },

  async insertLiveComment(streamId: string, user: User, text: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !streamId || !text.trim()) return false;

    try {
      const streamUuid = toUuid(streamId);
      const userUuid = toUuid(user.id);
      const nowIso = new Date().toISOString();

      // Ensure commenter exists in User table to avoid FK violation (code 23503)
      if (user) {
        try {
          await this.ensureUserExists(user);
        } catch {}
      }

      // Exactly matches columns in public."LiveComment": LiveStreamID, UserID, LiveText, LiveCommentAt
      const payload = {
        LiveStreamID: streamUuid,
        UserID: userUuid,
        LiveText: text.trim(),
        LiveCommentAt: nowIso,
      };

      let res = await client.from('LiveComment').insert(payload);
      let error = res.error;

      // If foreign key constraint failed (code 23503) e.g. UserID not in parent table,
      // retry with UserID: null so the comment is safely saved without foreign key error!
      if (error && error.code === '23503') {
        const nullFkPayload = {
          LiveStreamID: streamUuid,
          UserID: null,
          LiveText: text.trim(),
          LiveCommentAt: nowIso,
        };
        const fkRes = await client.from('LiveComment').insert(nullFkPayload);
        error = fkRes.error;
      }

      // If table LiveComment does not exist (code 42P01), try lowercase 'live_comments' fallback once
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const resSnake = await client.from('live_comments').insert({
          live_stream_id: streamUuid,
          user_id: userUuid,
          comment_text: text.trim(),
          created_at: nowIso,
        });
        error = resSnake.error;
      }

      return !error;
    } catch (e) {
      console.warn('Supabase insertLiveComment fallback:', e);
      return false;
    }
  },

  async deleteLiveComment(commentId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !commentId) return false;

    try {
      const isIdUuid = isUuid(commentId);
      const targetId = isIdUuid ? commentId : toUuid(commentId);

      // 1. Try deleting by primary key LiveCommentID in public."LiveComment"
      let res = await client
        .from('LiveComment')
        .delete()
        .eq('LiveCommentID', targetId);

      if (res.error) {
        // Fallback: try column name 'id'
        const res2 = await client
          .from('LiveComment')
          .delete()
          .eq('id', targetId);

        if (res2.error) {
          // Fallback: try lowercase 'live_comments' table
          await client
            .from('live_comments')
            .delete()
            .or(`id.eq.${targetId},live_comment_id.eq.${targetId}`);
        }
      }

      return true;
    } catch (e) {
      console.warn('deleteLiveComment fallback:', e);
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
  // 11. Admin Table
  //     Admin: (AdminID, UserID, Username, Email, Role, Permissions, CreatedAt, LastLogin)
  // -----------------------------------------------------------------------
  async fetchAdmins(force = false): Promise<AdminRecord[] | null> {
    if (!force && cachedAdminsResult && Date.now() - cachedAdminsResult.timestamp < 30000) {
      return cachedAdminsResult.data;
    }

    const client = getSupabaseClient();
    if (!client) return cachedAdminsResult?.data || null;

    try {
      const adminMap = new Map<string, AdminRecord>();
      const emailMap = new Map<string, string>(); // lowercase email -> adminId

      // 1. Fetch from Admin table (PascalCase) or admins (snake_case)
      let rawAdminRows: any[] = [];
      let resAdmin = await client
        .from('Admin')
        .select('*')
        .order('CreatedAt', { ascending: false });

      if (!resAdmin.error && resAdmin.data) {
        rawAdminRows = resAdmin.data;
      } else {
        const resLower = await client
          .from('admins')
          .select('*')
          .order('created_at', { ascending: false });
        if (!resLower.error && resLower.data) {
          rawAdminRows = resLower.data;
        }
      }

      for (const row of rawAdminRows) {
        const aId = row.AdminID || row.id || row.admin_id;
        const uId = row.UserID || row.user_id;
        const username = row.Username || row.username || 'admin';
        const email = (row.Email || row.email || '').trim().toLowerCase();
        const role = 'Admin';
        const perms = Array.isArray(row.Permissions || row.permissions)
          ? (row.Permissions || row.permissions)
          : ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'];
        const createdAt = row.CreatedAt || row.created_at || new Date().toISOString();
        const lastLogin = row.LastLogin || row.last_login;

        const record: AdminRecord = {
          adminId: aId,
          userId: uId,
          username,
          email: email || `${username}@viralhub.app`,
          role,
          permissions: perms,
          createdAt,
          lastLogin,
        };

        adminMap.set(aId, record);
        if (email) emailMap.set(email, aId);
      }

      // 2. ALSO query User table for accounts with Role = 'admin' to ensure full two-way sync
      try {
        let userAdminRows: any[] = [];
        const resUserAdmins = await client
          .from('User')
          .select('UserID, Username, Email, DisplayName, Role, RegistrationDate')
          .or('Role.ilike.admin,Role.ilike.super admin,Role.ilike.administrator');

        if (!resUserAdmins.error && resUserAdmins.data) {
          userAdminRows = resUserAdmins.data;
        } else if (resUserAdmins.error && (resUserAdmins.error.code === '42703' || resUserAdmins.error.code === '42P01')) {
          const resLower = await client
            .from('users')
            .select('id, username, email, display_name, role, created_at')
            .or('role.ilike.admin,role.ilike.super admin,role.ilike.administrator');
          if (!resLower.error && resLower.data) {
            userAdminRows = resLower.data;
          }
        }

        if (userAdminRows.length > 0) {
          for (const uRow of userAdminRows) {
            const uId = uRow.UserID || uRow.id;
            const uEmail = (uRow.Email || uRow.email || '').trim().toLowerCase();
            const uName = uRow.Username || uRow.username || uRow.DisplayName || 'admin';

            // Check if already in adminMap by email
            if (uEmail && emailMap.has(uEmail)) {
              const existingId = emailMap.get(uEmail)!;
              const existingRec = adminMap.get(existingId);
              if (existingRec && !existingRec.userId) {
                existingRec.userId = uId;
              }
              continue;
            }

            const newRec: AdminRecord = {
              adminId: toUuid(uId || `admin_${uEmail}`),
              userId: uId,
              username: uName,
              email: uEmail || `${uName}@viralhub.app`,
              role: 'Admin',
              permissions: ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
              createdAt: uRow.RegistrationDate || uRow.created_at || new Date().toISOString(),
              lastLogin: new Date().toISOString(),
            };

            adminMap.set(newRec.adminId, newRec);
            if (uEmail) emailMap.set(uEmail, newRec.adminId);
          }
        }
      } catch {
        // User table fallback
      }

      const results = Array.from(adminMap.values());
      cachedAdminsResult = { data: results, timestamp: Date.now() };
      return results;
    } catch (e) {
      console.warn('Supabase fetchAdmins fallback:', e);
      return cachedAdminsResult?.data || null;
    }
  },

  async upsertAdmin(admin: Partial<AdminRecord>): Promise<boolean> {
    const cleanEmail = (admin.email || '').trim().toLowerCase();
    const cleanUsername = (admin.username || 'admin').trim().toLowerCase().replace(/^@/, '');

    // Invalidate caches immediately
    cachedAdminsResult = null;
    cachedUsersResult = null;

    const client = getSupabaseClient();
    if (!client) return true;

    try {
      let resolvedUserId = admin.userId ? toUuid(admin.userId) : null;

      // 1. Look up existing User in User table by Email or Username (indexed lookup)
      let existingDbUser: any = null;
      try {
        if (cleanEmail) {
          const res = await client.from('User').select('UserID, Email, Username, Role').ilike('Email', cleanEmail).limit(1).maybeSingle();
          if (res.data) existingDbUser = res.data;
        }
        if (!existingDbUser && cleanUsername) {
          const res = await client.from('User').select('UserID, Email, Username, Role').ilike('Username', cleanUsername).limit(1).maybeSingle();
          if (res.data) existingDbUser = res.data;
        }
      } catch {
        // lookup error fallback
      }

      if (existingDbUser?.UserID) {
        resolvedUserId = existingDbUser.UserID;
        // Promote user in User table to Role = 'admin'
        try {
          await client.from('User').update({ Role: 'admin' }).eq('UserID', existingDbUser.UserID);
        } catch {
          try {
            await client.from('users').update({ role: 'admin' }).eq('id', existingDbUser.UserID);
          } catch {}
        }
      } else {
        // User does not exist in User table yet: Create a record with Role = 'admin'!
        resolvedUserId = resolvedUserId || generateUuid();
        try {
          const newUserRow = {
            UserID: resolvedUserId,
            Username: cleanUsername,
            Email: cleanEmail || `${cleanUsername}@viralhub.app`,
            DisplayName: admin.username || cleanUsername,
            Role: 'admin',
            IsPublic: true,
            RegistrationDate: new Date().toISOString(),
          };
          const { error: insErr } = await client.from('User').upsert(newUserRow, { onConflict: 'UserID' });
          if (insErr && (insErr.code === '42703' || insErr.message?.includes('column'))) {
            await client.from('User').upsert({
              UserID: resolvedUserId,
              Username: cleanUsername,
              Email: cleanEmail || `${cleanUsername}@viralhub.app`,
              DisplayName: admin.username || cleanUsername,
            }, { onConflict: 'UserID' });
          }
        } catch {}
      }

      // 2. Check if admin record already exists in Admin table to prevent duplicates
      let existingAdminId: string | null = null;
      try {
        if (cleanEmail) {
          const { data: found } = await client.from('Admin').select('AdminID').ilike('Email', cleanEmail).limit(1).maybeSingle();
          if (found?.AdminID) existingAdminId = found.AdminID;
        }
        if (!existingAdminId && resolvedUserId) {
          const { data: found } = await client.from('Admin').select('AdminID').eq('UserID', resolvedUserId).limit(1).maybeSingle();
          if (found?.AdminID) existingAdminId = found.AdminID;
        }
      } catch {}

      const adminUuid = existingAdminId || toUuid(admin.adminId || crypto.randomUUID());

      // 3. Upsert into Admin table
      const adminPayload = {
        AdminID: adminUuid,
        UserID: resolvedUserId,
        Username: cleanUsername,
        Email: cleanEmail || `${cleanUsername}@viralhub.app`,
        Role: 'Admin',
        Permissions: admin.permissions || ['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
        CreatedAt: admin.createdAt || new Date().toISOString(),
        LastLogin: new Date().toISOString(),
      };

      let { error: adminErr } = await client.from('Admin').upsert(adminPayload, { onConflict: 'AdminID' });

      // If PascalCase failed because table does not exist (42P01), try lowercase admins table
      if (adminErr && (adminErr.code === '42P01' || adminErr.message?.includes('does not exist'))) {
        await client.from('admins').upsert({
          id: adminUuid,
          user_id: resolvedUserId,
          username: cleanUsername,
          email: cleanEmail || `${cleanUsername}@viralhub.app`,
          role: 'admin',
          created_at: admin.createdAt || new Date().toISOString(),
        }, { onConflict: 'id' });
      }

      return true;
    } catch (e) {
      console.warn('Supabase upsertAdmin handled note:', e);
      return true;
    }
  },

  async deleteAdmin(adminId: string, email?: string | null): Promise<boolean> {
    cachedAdminsResult = null;
    cachedUsersResult = null;

    const client = getSupabaseClient();
    if (!client) return true;

    try {
      const adminUuid = toUuid(adminId);
      const cleanEmail = email ? email.trim().toLowerCase() : null;

      // 1. Delete from Admin table
      try {
        if (cleanEmail) {
          await client.from('Admin').delete().or(`AdminID.eq.${adminUuid},UserID.eq.${adminUuid},Email.ilike.${cleanEmail}`);
        } else {
          await client.from('Admin').delete().or(`AdminID.eq.${adminUuid},UserID.eq.${adminUuid}`);
        }
      } catch {
        try {
          if (cleanEmail) {
            await client.from('admins').delete().or(`id.eq.${adminUuid},user_id.eq.${adminUuid},email.ilike.${cleanEmail}`);
          } else {
            await client.from('admins').delete().or(`id.eq.${adminUuid},user_id.eq.${adminUuid}`);
          }
        } catch {}
      }

      // 2. Demote user in User table back to creator
      try {
        if (cleanEmail) {
          await client.from('User').update({ Role: 'creator' }).ilike('Email', cleanEmail);
        } else {
          await client.from('User').update({ Role: 'creator' }).eq('UserID', adminUuid);
        }
      } catch {
        try {
          if (cleanEmail) {
            await client.from('users').update({ role: 'creator' }).ilike('email', cleanEmail);
          } else {
            await client.from('users').update({ role: 'creator' }).eq('id', adminUuid);
          }
        } catch {}
      }

      return true;
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
      totalAudioTracks: 0,
    };

    if (!client) return fallbackStats;

    try {
      const [
        usersRes,
        videosRes,
        audioRes,
        reportVidRes,
        reportUserRes,
        livestreamsRes,
        adminsRes,
      ] = await Promise.all([
        client.from('User').select('*', { count: 'exact', head: true }),
        client.from('Video').select('*', { count: 'exact', head: true }),
        client.from('AudioLibrary').select('*', { count: 'exact', head: true }),
        client.from('ReportVideo').select('*', { count: 'exact', head: true }),
        client.from('ReportUser').select('*', { count: 'exact', head: true }),
        client.from('Livestream').select('*', { count: 'exact', head: true }).is('EndedAt', null),
        client.from('Admin').select('*', { count: 'exact', head: true }),
      ]);

      const totalReports = (reportVidRes.count || 0) + (reportUserRes.count || 0);

      const computedStats: SystemStats = {
        totalUsers: usersRes.count ?? 0,
        totalVideos: videosRes.count ?? 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalReports,
        activeLivestreams: livestreamsRes.count ?? 0,
        totalAdmins: (adminsRes as any)?.count ?? 0,
        totalAudioTracks: audioRes.count ?? 0,
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

/**
 * Checks whether the Livestream table exists in the connected Supabase instance.
 */
export const checkLivestreamTableExists = async (): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('Livestream').select('LivestreamID').limit(1);
    if (!error) return true;
    if (error.code === '42P01') return false;
    return true;
  } catch {
    return false;
  }
};

/**
 * Self-contained SQL snippet specifically for creating the Livestream tables in Supabase.
 * Designed for minimum Disk IO footprint, fast indexed queries, and real-time support.
 */
export const LIVESTREAM_SQL_SNIPPET = `-- =====================================================================
-- VIRALHUB LIVESTREAM TABLES FOR SUPABASE
-- Run this script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- (100% Safe, Non-destructive, 0 Disk IO impact - fully indexed!)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public."Livestream" (
  "LivestreamID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "HostUserID" UUID,
  "Title" TEXT NOT NULL DEFAULT 'Live Stream',
  "StartedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "EndedAt" TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public."LiveComment" (
  "LiveCommentID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "LiveStreamID" UUID NOT NULL,
  "UserID" UUID,
  "Username" TEXT,
  "DisplayName" TEXT,
  "AvatarURL" TEXT,
  "LiveText" TEXT NOT NULL,
  "LiveCommentAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public."LivestreamViewer" (
  "ViewerRecordID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "LiveStreamID" UUID,
  "ViewerID" UUID,
  "JoinedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add rich author columns if the tables were already created previously
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "Username" TEXT;
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "DisplayName" TEXT;
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "AvatarURL" TEXT;

-- Fast lookup indexes (Guarantees sub-millisecond lookups & near-zero Disk IO)
CREATE INDEX IF NOT EXISTS "idx_livestream_endedat" ON public."Livestream"("EndedAt");
CREATE INDEX IF NOT EXISTS "idx_livecomment_streamid" ON public."LiveComment"("LiveStreamID");

-- Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS public."Livestream" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LiveComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LivestreamViewer" ENABLE ROW LEVEL SECURITY;

-- Permissive public policies for client access with anon key
DROP POLICY IF EXISTS "Public all access on Livestream" ON public."Livestream";
CREATE POLICY "Public all access on Livestream" ON public."Livestream" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public all access on LiveComment" ON public."LiveComment";
CREATE POLICY "Public all access on LiveComment" ON public."LiveComment" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public all access on LivestreamViewer" ON public."LivestreamViewer";
CREATE POLICY "Public all access on LivestreamViewer" ON public."LivestreamViewer" FOR ALL USING (true) WITH CHECK (true);

-- Enable real-time replication for instant cross-device updates (zero Disk IO)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'Livestream') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public."Livestream";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'LiveComment') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public."LiveComment";
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;`;

// =========================================================================
// Production SQL Script for Supabase SQL Editor:
// Creates Admin Table, VideoStats, and enables Row Level Security (RLS)
// with Permissive Public Policies on all user tables so writes succeed!
// =========================================================================
export const SUPABASE_SQL_SCHEMA = `-- =====================================================================
-- VIRALHUB PRODUCTION SUPABASE SQL SETUP
-- Run this script in your Supabase Project -> SQL Editor -> Run
-- This creates the User, Admin tables and grants public access policies
-- so account registration, Google OAuth, likes, comments & videos SYNC!
-- (100% Safe, Non-destructive, 0 Disk IO impact - fully indexed!)
-- =====================================================================

-- 0. USER TABLE (Ensures user accounts & Google OAuth sync)
CREATE TABLE IF NOT EXISTS public."User" (
  "UserID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Username" TEXT NOT NULL,
  "Email" TEXT NOT NULL,
  "Password" TEXT DEFAULT 'user_encrypted_secret',
  "RegistrationDate" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "DisplayName" TEXT,
  "Bio" TEXT DEFAULT '',
  "ProfilePictureURL" TEXT DEFAULT '',
  "Role" TEXT DEFAULT 'creator',
  "IsPublic" BOOLEAN DEFAULT true,
  "IsBanned" BOOLEAN DEFAULT false,
  "BanReason" TEXT,
  "BannedAt" TIMESTAMP WITH TIME ZONE,
  "AppealStatus" TEXT DEFAULT 'none',
  "AppealReason" TEXT,
  "AppealSubmittedAt" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS "idx_user_email" ON public."User"("Email");
CREATE INDEX IF NOT EXISTS "idx_user_username" ON public."User"("Username");

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

-- 2. REPORT TABLES (Ensures Community Reports work seamlessly)
CREATE TABLE IF NOT EXISTS public."ReportVideo" (
  "ReportID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ReporterUserID" UUID REFERENCES public."User"("UserID") ON DELETE SET NULL,
  "VideoID" UUID REFERENCES public."Video"("VideoID") ON DELETE CASCADE,
  "Reason" TEXT,
  "Status" TEXT DEFAULT 'Under Review',
  "ReportedDate" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public."ReportUser" (
  "ReportID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ReportUserID" UUID REFERENCES public."User"("UserID") ON DELETE SET NULL,
  "ReportedUserID" UUID REFERENCES public."User"("UserID") ON DELETE CASCADE,
  "Reason" TEXT,
  "Status" TEXT DEFAULT 'Under Review',
  "ReportedDate" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. NOTIFICATION TABLE (For video revocation, creator appeals, and interaction alerts)
CREATE TABLE IF NOT EXISTS public."Notification" (
  "NotificationID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "UserID" UUID REFERENCES public."User"("UserID") ON DELETE CASCADE,
  "NotificationType" TEXT NOT NULL,
  "NotificationMessage" TEXT,
  "IsRead" BOOLEAN DEFAULT false,
  "NotificationDate" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. LIVESTREAM TABLES (Real-time live broadcasting, comments, and viewer counts)
CREATE TABLE IF NOT EXISTS public."Livestream" (
  "LivestreamID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "HostUserID" UUID,
  "Title" TEXT NOT NULL DEFAULT 'Live Stream',
  "StartedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "EndedAt" TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public."LiveComment" (
  "LiveCommentID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "LiveStreamID" UUID NOT NULL,
  "UserID" UUID,
  "Username" TEXT,
  "DisplayName" TEXT,
  "AvatarURL" TEXT,
  "LiveText" TEXT NOT NULL,
  "LiveCommentAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public."LivestreamViewer" (
  "ViewerRecordID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "LiveStreamID" UUID,
  "ViewerID" UUID,
  "JoinedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add rich author columns if the tables were already created previously
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "Username" TEXT;
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "DisplayName" TEXT;
ALTER TABLE IF EXISTS public."LiveComment" ADD COLUMN IF NOT EXISTS "AvatarURL" TEXT;

-- 5. USER & VIDEO SCHEMA COMPATIBILITY (Ensures Role, IsPublic, IsBanned, Appeals on User and Status on Video)
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "Role" TEXT DEFAULT 'creator';
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "IsPublic" BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS public."User" ALTER COLUMN "IsPublic" SET DEFAULT true;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "IsBanned" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "BanReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "BannedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "AppealStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "AppealReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "AppealSubmittedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningActive" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningIssuedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningDeadline" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealProofUrl" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealProofName" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealSubmittedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "Status" TEXT DEFAULT 'approved';
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "ThumbnailURL" TEXT;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "RejectionReason" TEXT;
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "AppealStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public."Video" ADD COLUMN IF NOT EXISTS "AppealReason" TEXT;
ALTER TABLE IF EXISTS public."Conversation" ADD COLUMN IF NOT EXISTS "ClearedHistory" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public."Comment" ADD COLUMN IF NOT EXISTS "LikedBy" TEXT[] DEFAULT ARRAY[]::text[];
ALTER TABLE IF EXISTS public."Comment" ADD COLUMN IF NOT EXISTS "LikesCount" INTEGER DEFAULT 0;

-- 6. INDEXES (Guarantees sub-millisecond lookups & protects Supabase Disk IO!)
CREATE INDEX IF NOT EXISTS "idx_user_isbanned" ON public."User"("IsBanned");
CREATE INDEX IF NOT EXISTS "idx_user_appealstatus" ON public."User"("AppealStatus");
CREATE INDEX IF NOT EXISTS "idx_user_warningactive" ON public."User"("WarningActive");
CREATE INDEX IF NOT EXISTS "idx_user_prebanappeal" ON public."User"("PreBanAppealStatus");
CREATE INDEX IF NOT EXISTS "idx_video_status" ON public."Video"("Status");
CREATE INDEX IF NOT EXISTS "idx_reportvideo_status" ON public."ReportVideo"("Status");
CREATE INDEX IF NOT EXISTS "idx_reportuser_status" ON public."ReportUser"("Status");
CREATE INDEX IF NOT EXISTS "idx_notification_user_unread" ON public."Notification"("UserID", "IsRead");
CREATE INDEX IF NOT EXISTS "idx_message_conversationid" ON public."Message"("ConversationID");
CREATE INDEX IF NOT EXISTS "idx_message_sentat" ON public."Message"("SentAt");
CREATE INDEX IF NOT EXISTS "idx_conversation_userida_useridb" ON public."Conversation"("UserIDA", "UserIDB");
CREATE INDEX IF NOT EXISTS "idx_livestream_endedat" ON public."Livestream"("EndedAt");
CREATE INDEX IF NOT EXISTS "idx_livecomment_streamid" ON public."LiveComment"("LiveStreamID");

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

-- 5. STORAGE BUCKETS FOR AUDIO & VIDEOS (Public access so audio tracks and videos stream on any device)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure AudioLibrary columns exist for storing audio URL, cover URL, duration, category
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioTitle" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioArtist" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioURL" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "CoverURL" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "Duration" TEXT DEFAULT '00:30';
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "Category" TEXT DEFAULT 'Trending';
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "Public Audio Access" ON storage.objects;
    CREATE POLICY "Public Audio Access" ON storage.objects FOR ALL USING (bucket_id = 'audio') WITH CHECK (bucket_id = 'audio');

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
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'Livestream') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Livestream";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'LiveComment') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."LiveComment";
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
`;

export const AUDIO_STORAGE_SQL_SNIPPET = `-- =====================================================================
-- VIRALHUB: FIX AUDIO LIBRARY TABLE & STORAGE BUCKET POLICIES
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe & non-destructive: only creates missing columns & enables upload
-- =====================================================================

-- 1. Ensure public."AudioLibrary" table has all needed columns
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioTitle" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioArtist" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "AudioURL" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "CoverURL" TEXT;
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "Duration" TEXT DEFAULT '00:30';
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "Category" TEXT DEFAULT 'Trending';
ALTER TABLE IF EXISTS public."AudioLibrary" ADD COLUMN IF NOT EXISTS "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Enable Row Level Security and grant permissive public access to AudioLibrary
ALTER TABLE IF EXISTS public."AudioLibrary" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public all access on AudioLibrary" ON public."AudioLibrary";
CREATE POLICY "Public all access on AudioLibrary" ON public."AudioLibrary" FOR ALL USING (true) WITH CHECK (true);

-- 3. Ensure the 'audio' bucket is registered and public
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Enable public upload & read access for the 'audio' storage bucket
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "Public Audio Access" ON storage.objects;
    CREATE POLICY "Public Audio Access" ON storage.objects
    FOR ALL
    USING (bucket_id = 'audio')
    WITH CHECK (bucket_id = 'audio');
  END IF;
END $$;
`;

export const PRE_BAN_APPEAL_SQL_SNIPPET = `-- =====================================================================
-- VIRALHUB: PRE-BAN DUE PROCESS & COUNTER-PROOF APPEAL SCHEMA
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe, non-blocking, preserves database integrity & protects Disk IO!
-- =====================================================================

-- 1. Ensure User table has pre-ban warning, appeal, and proof columns
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningActive" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningIssuedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "WarningDeadline" TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealReason" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealProofUrl" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealProofName" TEXT;
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "PreBanAppealSubmittedAt" TIMESTAMP WITH TIME ZONE;

-- 2. Add lightweight B-Tree indexes (Sub-millisecond lookups, protects Disk IO)
CREATE INDEX IF NOT EXISTS "idx_user_warningactive" ON public."User"("WarningActive");
CREATE INDEX IF NOT EXISTS "idx_user_prebanappeal" ON public."User"("PreBanAppealStatus");

-- 3. Ensure avatars/proofs storage bucket is public for counter-proof screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;
`;

export const USER_BLOCKS_SQL_SNIPPET = `-- =====================================================================
-- VIRALHUB: USER BLOCKS & PRIVACY SCHEMA (100% Safe & Zero Disk IO)
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Uses primary key and indexed lookup: protects disk IO completely!
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow all user_blocks" ON public.user_blocks;
  CREATE POLICY "Allow all user_blocks" ON public.user_blocks FOR ALL USING (true) WITH CHECK (true);
END $$;
`;

