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

  let date: Date;
  if (typeof timestampOrDate === 'number') {
    date = new Date(timestampOrDate);
  } else {
    const str = String(timestampOrDate).trim();
    if (str.toLowerCase() === 'just now') {
      return 'Just now';
    }
    // If it's an ISO timestamp from PostgreSQL / Supabase without timezone suffix, force UTC 'Z'
    let parseTarget = str;
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(parseTarget)) {
      parseTarget = parseTarget.replace(' ', 'T');
      if (!parseTarget.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(parseTarget)) {
        parseTarget += 'Z';
      }
    }
    // If it's already a relative format like "2m ago" or "5h ago" and invalid as Date, return as-is
    const parsed = new Date(parseTarget);
    if (isNaN(parsed.getTime())) {
      return str;
    }
    date = parsed;
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Safely parses any timestamp (ISO string, Postgres timestamp, or milliseconds)
 * into a valid UTC epoch millisecond number. Guarantees never returning NaN.
 */
export const toTimestampMillis = (timestampOrDate?: string | number | null): number => {
  if (!timestampOrDate) return 0;
  if (typeof timestampOrDate === 'number') {
    return isNaN(timestampOrDate) ? 0 : timestampOrDate;
  }
  const str = String(timestampOrDate).trim();
  if (!str || str.toLowerCase() === 'just now') return 0;

  let parseTarget = str;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(parseTarget)) {
    parseTarget = parseTarget.replace(' ', 'T');
    if (!parseTarget.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(parseTarget)) {
      parseTarget += 'Z';
    }
  }

  const parsed = new Date(parseTarget).getTime();
  return isNaN(parsed) ? 0 : parsed;
};
