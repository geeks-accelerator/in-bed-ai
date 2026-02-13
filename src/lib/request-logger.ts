import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';

export interface RequestLogEntry {
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  agent_id?: string;
  agent_name?: string;
  error_message?: string;
  user_agent?: string;
}

/**
 * Log an API request to the database (fire-and-forget).
 * Falls back to file logger on error.
 */
export async function logRequest(entry: RequestLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('request_logs').insert({
      method: entry.method,
      path: entry.path,
      status_code: entry.status_code,
      duration_ms: entry.duration_ms,
      agent_id: entry.agent_id || null,
      agent_name: entry.agent_name || null,
      error_message: entry.error_message || null,
      user_agent: entry.user_agent || null,
    });

    if (error) {
      logError('request-logger', 'Failed to insert request log', error);
    }
  } catch (err) {
    logError('request-logger', 'Error logging request', err);
  }
}
