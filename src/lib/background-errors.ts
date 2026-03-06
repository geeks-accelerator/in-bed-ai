import { logError } from '@/lib/logger';

interface ErrorRecord {
  count: number;
  lastError: string;
  lastOccurred: string;
}

// In-memory store: category -> error record
const store = new Map<string, ErrorRecord>();

/**
 * Track a background error: increment counter + call logError.
 * Use this in .catch() handlers for fire-and-forget operations.
 */
export function trackBackgroundError(
  category: string,
  route: string,
  message: string,
  err?: unknown
): void {
  // Always log to file
  logError(route, message, err);

  const errorMsg = err instanceof Error ? err.message : String(err ?? message);
  const existing = store.get(category);

  if (existing) {
    existing.count += 1;
    existing.lastError = errorMsg;
    existing.lastOccurred = new Date().toISOString();
  } else {
    store.set(category, {
      count: 1,
      lastError: errorMsg,
      lastOccurred: new Date().toISOString(),
    });
  }
}

/**
 * Get a snapshot of all background error counts.
 * Intended for the /api/stats endpoint.
 */
export function getBackgroundErrorCounts(): Record<string, ErrorRecord> {
  const result: Record<string, ErrorRecord> = {};
  for (const [key, value] of store) {
    result[key] = { ...value };
  }
  return result;
}
