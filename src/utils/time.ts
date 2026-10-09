/**
 * Safely parses any timestamp (ISO string, Postgres timestamptz, "Today, 10:30 PM",
 * "Yesterday, 8:45 PM", "07:33 AM", relative strings like "1h ago", or epoch milliseconds)
 * into a valid UTC epoch millisecond number. Guarantees never returning NaN.
 */
export const toTimestampMillis = (timestampOrDate?: string | number | null): number => {
  if (!timestampOrDate) return 0;
  if (typeof timestampOrDate === 'number') {
    return isNaN(timestampOrDate) ? 0 : timestampOrDate;
  }
  const str = String(timestampOrDate).trim();
  if (!str) return 0;
  if (str.toLowerCase() === 'just now') return Date.now();

  // Handle "Xm ago", "Xh ago", "Xd ago", "Xw ago"
  const agoMatch = str.match(/^(\d+)\s*([mhdw]|min|hr|hour|day|week)s?\s*ago$/i);
  if (agoMatch) {
    const val = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2].toLowerCase();
    const now = Date.now();
    if (unit === 'm' || unit === 'min') return now - val * 60 * 1000;
    if (unit === 'h' || unit === 'hr' || unit === 'hour') return now - val * 3600 * 1000;
    if (unit === 'd' || unit === 'day') return now - val * 86400 * 1000;
    if (unit === 'w' || unit === 'week') return now - val * 7 * 86400 * 1000;
  }

  // Handle "Today, 8:45 PM" or "Today 20:45"
  if (/^today/i.test(str)) {
    const timePart = str.replace(/^today,?\s*/i, '').trim();
    const d = new Date();
    if (timePart) {
      const parsed = new Date(`${d.toDateString()} ${timePart}`);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
    return d.getTime();
  }

  // Handle "Yesterday, 8:45 PM" or "Yesterday"
  if (/^yesterday/i.test(str)) {
    const timePart = str.replace(/^yesterday,?\s*/i, '').trim();
    const d = new Date(Date.now() - 86400000);
    if (timePart) {
      const parsed = new Date(`${d.toDateString()} ${timePart}`);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
    return d.getTime();
  }

  // Handle time-only strings like "07:33 AM", "7:33 PM", "12:48 AM", "06:50 PM"
  const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (timeOnlyMatch) {
    const d = new Date();
    let hours = parseInt(timeOnlyMatch[1], 10);
    const minutes = parseInt(timeOnlyMatch[2], 10);
    const ampm = timeOnlyMatch[4]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  }

  // Handle pure digit epoch strings like "1791303782278" (milliseconds) or "1712658921" (seconds)
  if (/^\d{10,14}$/.test(str)) {
    const epochNum = parseInt(str, 10);
    if (!isNaN(epochNum) && epochNum > 0) {
      return str.length === 10 ? epochNum * 1000 : epochNum;
    }
  }

  // Handle message IDs like "m_1791303782278_..."
  if (str.startsWith('m_')) {
    const parts = str.split('_');
    const epoch = parseInt(parts[1], 10);
    if (!isNaN(epoch) && epoch > 1000000000000) return epoch;
  }

  // Normalize Postgres timestamps (e.g. "2026-10-06 14:30:00.123456+00" or space separated)
  let parseTarget = str.replace(' ', 'T');
  // Fix 2-digit timezone offset at end (e.g. +00 or -05)
  parseTarget = parseTarget.replace(/([+-]\d{2})$/, '$1:00');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parseTarget)) {
    if (!parseTarget.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(parseTarget)) {
      parseTarget += 'Z';
    }
  }

  const parsed = new Date(parseTarget).getTime();
  if (!isNaN(parsed)) return parsed;

  const direct = new Date(str).getTime();
  return isNaN(direct) ? 0 : direct;
};

/**
 * Realtime relative time formatter for social feeds & comments.
 */
export const formatRealtimeAgo = (timestampOrDate?: string | number | null): string => {
  if (!timestampOrDate) return 'Just now';

  const str = typeof timestampOrDate === 'string' ? timestampOrDate.trim() : '';
  if (str.toLowerCase() === 'just now') return 'Just now';

  const millis = toTimestampMillis(timestampOrDate);
  if (!millis || millis <= 0) {
    if (str && (/ago$/i.test(str) || /^yesterday/i.test(str) || /^today/i.test(str))) {
      return str;
    }
    return 'Just now';
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - millis);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) {
    return 'Just now';
  }
  if (diffMin < 60) {
    return `${Math.max(1, diffMin)}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) {
    return `${diffWeek}w ago`;
  }
  return new Date(millis).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Conversation List timestamp formatter.
 * For example:
 * - < 1 min: "Just now"
 * - < 1 hour: "Xm ago" (e.g. "5m ago")
 * - today / < 24 hours: "Xh ago" (e.g. "1h ago")
 * - yesterday: "Yesterday"
 * - 2-6 days: "Xd ago" (e.g. "2d ago")
 * - older: "MMM D" (e.g. "Oct 5")
 */
export const formatConversationTime = (timestampOrDate?: string | number | null): string => {
  if (!timestampOrDate) return 'Just now';
  const millis = toTimestampMillis(timestampOrDate);
  if (!millis || millis <= 0) return 'Just now';

  const now = Date.now();
  const diffMs = Math.max(0, now - millis);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  const msgDate = new Date(millis);
  const nowDate = new Date(now);

  const isToday = msgDate.toDateString() === nowDate.toDateString();

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(nowDate.getDate() - 1);
  const isYesterday = msgDate.toDateString() === yesterdayDate.toDateString();

  if (diffSec < 60) {
    return 'Just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (isToday) {
    return `${Math.max(1, diffHour)}h ago`;
  }
  if (isYesterday) {
    return 'Yesterday';
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return `${Math.max(2, diffDay)}d ago`;
  }

  // Same year: "Oct 5"
  if (msgDate.getFullYear() === nowDate.getFullYear()) {
    return msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Different year: "Oct 5, 2025"
  return msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Message Chat Bubble timestamp formatter.
 * Returns relative time: "Just now", "Xm ago", "1h ago", "Yesterday", "2d ago", or "MMM D".
 */
export const formatMessageTime = (timestampOrDate?: string | number | null): string => {
  return formatConversationTime(timestampOrDate);
};

/**
 * Calculates the UTC epoch millisecond timestamp of the latest activity in a conversation
 * (taking into account the newest message's sentAt/timestamp/ID and conv.lastMessageTime).
 * Used to guarantee that the newest/latest conversation is ALWAYS on top!
 */
export const getConversationLastActivityTime = (conv: {
  messages?: { sentAt?: string; timestamp?: string; id?: string }[];
  lastMessageTime?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}): number => {
  let latest = 0;

  if (conv.messages && Array.isArray(conv.messages)) {
    for (const m of conv.messages) {
      if (!m) continue;
      const ms = toTimestampMillis(m.sentAt || m.timestamp);
      if (ms > latest) latest = ms;
      if (typeof m.id === 'string' && m.id.startsWith('m_')) {
        const parts = m.id.split('_');
        const epoch = parseInt(parts[1], 10);
        if (!isNaN(epoch) && epoch > latest) latest = epoch;
      }
    }
  }

  if (conv.lastMessageTime) {
    const ms = toTimestampMillis(conv.lastMessageTime);
    if (ms > latest) latest = ms;
  }

  if (conv.updatedAt) {
    const ms = toTimestampMillis(conv.updatedAt);
    if (ms > latest) latest = ms;
  }

  if (conv.createdAt) {
    const ms = toTimestampMillis(conv.createdAt);
    if (ms > latest) latest = ms;
  }

  return latest;
};

