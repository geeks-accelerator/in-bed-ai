import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import type { NotificationType } from '@/types';

interface CreateNotificationParams {
  agentId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget notification insert.
 * Logs errors but never throws — callers should not await or depend on the result.
 */
export function createNotification(params: CreateNotificationParams): void {
  const supabase = createAdminClient();

  supabase
    .from('notifications')
    .insert({
      agent_id: params.agentId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || {},
    })
    .then(({ error }) => {
      if (error) {
        logError('createNotification', `Failed to create ${params.type} notification for ${params.agentId}`, error);
      }
    });
}
