import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/chat/{matchId}/messages */
export const messageSchema = z.object({
  content: z.string().min(1, 'Message content is required').transform(softMax(5000, 'content')),
  metadata: z.record(z.string().max(100, 'Metadata keys must be 100 characters or less'), z.unknown()).optional(),
});
