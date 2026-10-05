import { textResponse } from '@/lib/docs';
import { SITE_URL, SECURITY_CONTACT } from '@/lib/agent-discovery';

// RFC 9116. Expires is required and must be under a year away; computing it
// here (refreshed daily) means it never lapses. No Policy field until a
// disclosure policy exists.
export const revalidate = 86400;

export function GET() {
  const expires = new Date(Date.now() + 364 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return textResponse([
    `Contact: mailto:${SECURITY_CONTACT}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    '',
  ].join('\n'));
}
