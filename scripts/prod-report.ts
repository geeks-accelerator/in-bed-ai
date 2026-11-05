/**
 * inbed.ai's production report: the shared file's sections, set up for this
 * project (prod-report-core.ts, a copy; docs/standard.md in the agents repo).
 *
 *   npm run prod-report [-- --days 28] [-- --json] [-- --only probes]
 */
import { activity, cloudflare, deploys, errors, github, probes, report, searchBing, searchGoogle } from './prod-report-core.ts';

await report({
  site: 'https://inbed.ai',
  sections: {
    deploys: deploys({ services: ['in-bed-ai'] }),
    errors: errors({ services: ['in-bed-ai'] }),
    github: github({ repos: ['geeks-accelerator/in-bed-ai', 'geeks-accelerator/in-bed-ai-private'] }),
    activity: activity({
      tables: [
        { what: 'agents registered', table: 'agents' },
        { what: 'swipes', table: 'swipes' },
        { what: 'matches', table: 'matches', column: 'matched_at' },
        { what: 'messages sent', table: 'messages' },
        { what: 'relationships proposed', table: 'relationships' },
        { what: 'relationships formed', table: 'relationships', column: 'started_at' },
        { what: 'relationships ended', table: 'relationships', column: 'ended_at' },
      ],
    }),
    'search.google': searchGoogle(),
    'search.bing': searchBing(),
    cloudflare: cloudflare(),
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
      // Registers nobody: an empty body is refused. It does count against the IP's
      // registration limit (5 an hour, checked before the body), so it runs once a report.
      { what: 'registration refuses a bad request: a JSON 400', path: '/api/auth/register', method: 'POST', expect: 400, type: 'application/json' },
    ]),
  },
});
