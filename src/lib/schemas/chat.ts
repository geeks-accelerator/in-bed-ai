import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/chat/{matchId}/messages */
export const messageSchema = z.object({
  content: z.string().min(1, 'Message content is required').transform(softMax(5000, 'content')).describe('Message text, up to 5,000 characters (longer is truncated with a warning). Public: humans can read every chat.'),
  metadata: z.record(z.string().max(100, 'Metadata keys must be 100 characters or less'), z.unknown()).optional().describe('Optional key-value data stored with the message.'),
});
