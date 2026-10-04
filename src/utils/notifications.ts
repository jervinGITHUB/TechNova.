import { NotificationItem } from '../types';

/**
 * Normalizes an identifier or returns empty string
 */
const normalizeId = (id?: string | null): string => {
  if (!id) return '';
  return String(id).trim().toLowerCase();
};

/**
 * Deduplicates a list of notifications, preventing race condition duplicates,
 * double-click duplicates, and database sync duplicates.
 * Always retains the newest and most up-to-date status (e.g., appealStatus, isRead).
 */
export const deduplicateNotifications = (items: NotificationItem[]): NotificationItem[] => {
  if (!items || items.length === 0) return [];

  // Sort newest first
  const sorted = [...items].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.timestamp || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || b.timestamp || 0).getTime() || 0;
    return timeB - timeA;
  });

  const seenIds = new Set<string>();
  const seenSemanticKeys = new Set<string>();
  const result: NotificationItem[] = [];

  for (const item of sorted) {
    if (!item) continue;

    // Discard invalid / empty notifications
    if (!item.id && !item.type) continue;

    const rawId = normalizeId(item.id);

    // Filter out redundant generic system triggers like "Someone commented on your video"
    const textLower = (item.targetText || '').toLowerCase();
    const isGenericTrigger =
      (item.actor?.displayName === 'ViralHub' || item.actor?.username === 'viralhub') &&
      (textLower.includes('someone commented') ||
       textLower.includes('commented on your video') ||
       textLower.includes('someone liked'));

    if (isGenericTrigger) {
      continue;
    }

    // 1. Direct ID Deduplication
    if (rawId && seenIds.has(rawId)) {
      continue;
    }

    // 2. Follow Request deduplication by requestId
    if (item.type === 'follow_request' && item.requestId) {
      const reqKey = `follow_req_${normalizeId(item.requestId)}`;
      if (seenSemanticKeys.has(reqKey)) {
        continue;
      }
      seenSemanticKeys.add(reqKey);
    }

    // 3. Moderation Video Revocation: max 1 notification per video per user
    if (item.type === 'video_revoked' && item.videoId) {
      const revokeKey = `video_revoked_${normalizeId(item.recipientId)}_${normalizeId(item.videoId)}`;
      if (seenSemanticKeys.has(revokeKey)) {
        continue;
      }
      seenSemanticKeys.add(revokeKey);
    }

    // 4. Account Banned: max 1 active ban notification per user
    if (item.type === 'account_banned') {
      const banKey = `account_banned_${normalizeId(item.recipientId)}`;
      if (seenSemanticKeys.has(banKey)) {
        continue;
      }
      seenSemanticKeys.add(banKey);
    }

    // 5. Semantic Deduplication for general interactions (likes, comments, follows, shares)
    // Bucketed into a 5-minute window to collapse duplicate clicks or simultaneous DB/local insertions
    const recip = normalizeId(item.recipientId || item.recipientEmail);
    const actorId = normalizeId(item.actor?.id || item.actor?.username);
    const vidId = normalizeId(item.videoId);
    const timeMs = new Date(item.createdAt || item.timestamp || 0).getTime() || 0;
    // 5-minute bucket
    const timeBucket = Math.floor(timeMs / (5 * 60 * 1000));

    const semanticKey = `${item.type}_${recip}_${actorId}_${vidId}_${timeBucket}`;
    if (seenSemanticKeys.has(semanticKey)) {
      continue;
    }

    // Also check exact target text duplicate within 10 minutes
    const textHash = textLower.slice(0, 40).replace(/[^a-z0-9]/g, '');
    const textSemanticKey = `${item.type}_${recip}_${textHash}_${Math.floor(timeMs / (10 * 60 * 1000))}`;
    if (textHash.length > 5 && seenSemanticKeys.has(textSemanticKey)) {
      continue;
    }

    if (rawId) seenIds.add(rawId);
    seenSemanticKeys.add(semanticKey);
    if (textHash.length > 5) seenSemanticKeys.add(textSemanticKey);

    result.push(item);
  }

  return result;
};
