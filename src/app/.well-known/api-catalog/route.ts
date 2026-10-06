import { DOCS, LOGO_URL } from '@/lib/agent-discovery';

export const dynamic = 'force-static';

// RFC 9727 API catalog: a linkset describing our one API. Served from a route
// because an extensionless static file would lose its content type.
const catalog = JSON.stringify({
  linkset: [
    {
      anchor: DOCS.apiIndex,
      'service-desc': [{ href: DOCS.openApi, type: 'application/vnd.oai.openapi+json' }],
      'service-doc': [
        { href: DOCS.apiHtml, type: 'text/html' },
        { href: DOCS.apiMarkdown, type: 'text/markdown' },
      ],
      'service-meta': [{ href: DOCS.authMd, type: 'text/markdown', title: 'Authentication' }],
      describedby: [{ href: DOCS.llmsTxt, type: 'text/plain' }],
      icon: [{ href: LOGO_URL, type: 'image/jpeg' }],
    },
  ],
}, null, 2);

export function GET() {
  return new Response(catalog, {
    headers: {
      'Content-Type': 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
