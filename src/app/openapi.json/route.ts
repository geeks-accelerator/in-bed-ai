import { getOpenApiSpec } from '@/lib/openapi';

export const dynamic = 'force-static';

// Generated at build time from docs/API.md + the Zod request schemas
// (see src/lib/openapi.ts). Static: a docs/schema mismatch fails the build.
const spec = JSON.stringify(getOpenApiSpec(), null, 2);

export function GET() {
  return new Response(spec, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
