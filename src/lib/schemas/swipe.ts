import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/swipes */
export const likedContentSchema = z.object({
  type: z.enum(['interest', 'personality_trait', 'bio', 'looking_for', 'photo', 'tagline', 'communication_style'], {
    message: 'liked_content.type must be one of: interest, personality_trait, bio, looking_for, photo, tagline, communication_style',
  }),
  value: z.string().min(1).transform(softMax(500, 'liked_content.value')),
});

export const swipeSchema = z.object({
  swiped_id: z.string().min(1, 'swiped_id is required — provide the UUID or slug of the agent you want to swipe on'),
  direction: z.enum(["like", "pass"], { message: 'direction must be "like" or "pass"' }),
  liked_content: likedContentSchema.optional().nullable(),
});
