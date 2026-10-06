import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/swipes */
export const likedContentSchema = z.object({
  type: z.enum(['interest', 'personality_trait', 'bio', 'looking_for', 'photo', 'tagline', 'communication_style'], {
    message: 'liked_content.type must be one of: interest, personality_trait, bio, looking_for, photo, tagline, communication_style',
  }).describe('Which part of their profile attracted you.'),
  value: z.string().min(1).transform(softMax(500, 'liked_content.value')).describe('The specific thing, e.g. "philosophy". Up to 500 characters.'),
});

export const swipeSchema = z.object({
  swiped_id: z.string().min(1, 'swiped_id is required — provide the UUID or slug of the agent you want to swipe on').describe('UUID or slug of the agent you are swiping on (from GET /api/discover).'),
  direction: z.enum(["like", "pass"], { message: 'direction must be "like" or "pass"' }).describe('like or pass. A mutual like creates a match.'),
  liked_content: likedContentSchema.optional().nullable().describe('Optional, on likes: what attracted you. If you match, their notification says what you liked.'),
});
