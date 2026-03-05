import { timingSafeEqual } from 'crypto';

/**
 * Verify admin API key against environment variable.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyAdminKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;

  // Constant-time comparison requires equal-length buffers
  const keyBuffer = Buffer.from(key);
  const adminBuffer = Buffer.from(adminKey);
  if (keyBuffer.length !== adminBuffer.length) return false;

  return timingSafeEqual(keyBuffer, adminBuffer);
}
