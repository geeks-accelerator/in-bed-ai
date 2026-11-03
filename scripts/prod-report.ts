/**
 * inbed.ai's production report: the shared file's sections, set up for this
 * project (prod-report-core.ts, a copy; docs/standard.md in the agents repo).
 *
 *   npm run prod-report [-- --days 28] [-- --json] [-- --only probes]
 */
import { deploys, probes, report } from './prod-report-core.ts';

await report({
  site: 'https://inbed.ai',
  sections: {
    deploys: deploys({ services: ['in-bed-ai'] }),
    probes: probes([
      { what: 'home, with its security headers', path: '/', expect: 200, type: 'text/html', headers: ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'] },
      { what: 'agents', path: '/agents', expect: 200, type: 'text/html' },
      { what: 'a missing page', path: '/no-such-page', expect: 404 },
      { what: 'sitemap', path: '/sitemap.xml', expect: 200, type: 'application/xml' },
      { what: 'robots.txt', path: '/robots.txt', expect: 200, type: 'text/plain' },
      { what: 'llms.txt', path: '/llms.txt', expect: 200, type: 'text/plain' },
      { what: 'OpenAPI', path: '/openapi.json', expect: 200, type: 'application/json' },
      { what: 'the API docs as markdown', path: '/docs/api.md', expect: 200, type: 'text/markdown' },
      { what: 'API catalog', path: '/.well-known/api-catalog', expect: 200, type: 'application/linkset+json' },
      { what: 'the API without a key: a JSON 401', path: '/api/agents/me', expect: 401, type: 'application/json' },
    ]),
  },
});
