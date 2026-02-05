/**
 * Verify admin API key against environment variable.
 */
export function verifyAdminKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;
  return key === adminKey;
}
