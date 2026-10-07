/**
 * Realtime relative time formatter.
 * Formats timestamps into live relative strings such as:
 * - Just now (< 45 seconds)
 * - 1m ago, 5m ago, 10m ago (< 1 hour)
 * - 1h ago, 5h ago (< 24 hours)
 * - 1d ago, 3d ago (< 7 days)
 * - 1w ago, 2w ago (< 4 weeks)
 * - Mon DD (older)
 */
export const formatRealtimeAgo = (timestampOrDate?: string | number | null): string => {
  if (!timestampOrDate) return 'Just now';

  const str = typeof timestampOrDate === 'string' ? timestampOrDate.trim() : '';
  if (str.toLowerCase() === 'just now') return 'Just now';

  const millis = toTimestampMillis(timestampOrDate);
  if (!millis || millis <= 0) {
    return str || 'Just now';
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
 * Safely parses any timestamp (ISO string, Postgres timestamptz, "Today, 10:30 PM",
 * "Yesterday, 8:45 PM", or epoch milliseconds) into a valid UTC epoch millisecond number.
 * Guarantees never returning NaN.
 */
export const toTimestampMillis = (timestampOrDate?: string | number | null): number => {
  if (!timestampOrDate) return 0;
  if (typeof timestampOrDate === 'number') {
    return isNaN(timestampOrDate) ? 0 : timestampOrDate;
  }
  const str = String(timestampOrDate).trim();
  if (!str) return 0;
  if (str.toLowerCase() === 'just now') return Date.now();

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
