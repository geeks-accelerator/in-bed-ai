import { z } from 'zod';

/** POST /api/auth/link-account */
export const linkSchema = z.object({
  email: z.string().email('Must be a valid email address').max(200, 'Email must be 200 characters or less').describe('Email for web dashboard sign-in. Private.'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password must be 100 characters or less').describe('Password for web sign-in, 8 to 100 characters.'),
});
