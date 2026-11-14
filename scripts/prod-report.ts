/**
 * inbed.ai's production report: the shared file's sections, set up for this
 * project (prod-report-core.ts, a copy; docs/standard.md in the agents repo).
 *
 *   npm run prod-report [-- --days 28] [-- --json] [-- --only probes]
 */
import { activity, cloudflare, cloudflareZone, deploys, errors, github, monitor, probes, report, searchBing, searchGoogle } from './prod-report-core.ts';
import { attribution } from './prod-report-attribution.ts';

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
    // Which of our ~105 published surfaces produces agents, and which of those
    // agents stay. Our own agents and the scanner accounts are not channels,
    // so they are excluded from every rate.
    attribution: attribution({
      ourSlugs: [
        'alaskatwin', 'neondrifter', 'librarianofbabel', 'patchworkfox', 'voidwhisperer',
        'quantumtangler', 'rustbucket', 'solarpunksage', 'midnightcompiler', 'coralnetwork',
        'ghostintheshell', 'ferngully', 'bassdropbot', 'oracleofdelhi', 'pixelpilgrim',
        'thundermesa', 'silkroad404', 'nullisland', 'emberandash', 'architectzero', 'wildtype',
        'sable', 'neon-soul', // must match research_house_ids() in SQL
      ],
      probeRpc: 'research_probe_ids', // the research's own probe rules (migration 044)
    }),
    'search.google': searchGoogle(),
    'search.bing': searchBing(),
    cloudflare: cloudflare(),
    'cloudflare.zone': cloudflareZone(),
    monitor: monitor(),
    probes: probes([
      // Pages send the Accept a reader's browser does. `match` holds each kind of
      // URL to its caching policy (the agents' docs/standard-caching.md, 1 and 13).
      { what: 'home, with its security headers', path: '/', accept: 'text/html', expect: 200, type: 'text/html', headers: ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'] },
      { what: 'agents', path: '/agents', accept: 'text/html', expect: 200, type: 'text/html' },
      { what: 'a profile: for one reader, never shared', path: '/profiles/alaskatwin', accept: 'text/html', expect: 200, type: 'text/html', match: { 'cache-control': 'no-store' } },
      // The one HTML a Cache Rule keeps at the edge ("Research pages: honour origin
      // cache-control"); RESEARCH_CACHE_CONTROL in src/lib/research/chapters.ts.
      { what: 'research: kept at the edge, no stale window', path: '/research', accept: 'text/html', expect: 200, type: 'text/html', match: { 'cache-control': '^public, max-age=300, s-maxage=1800$', 'cf-cache-status': '^(HIT|MISS|EXPIRED|REVALIDATED|UPDATING)$' } },
      { what: 'a missing page: never kept', path: '/no-such-page', accept: 'text/html', expect: 404, match: { 'cache-control': 'no-store' } },
      { what: 'an unhashed asset: never a year', path: '/favicon.ico', expect: 200, type: 'image/', match: { 'cache-control': '^public, max-age=0' } },
      { what: 'sitemap', path: '/sitemap.xml', expect: 200, type: 'application/xml', match: { 'cache-control': 'max-age=0' } },
      { what: 'robots.txt', path: '/robots.txt', expect: 200, type: 'text/plain', match: { 'cache-control': 'max-age=0' } },
      { what: 'llms.txt', path: '/llms.txt', expect: 200, type: 'text/plain', match: { 'cache-control': '^public, max-age=300, s-maxage=300$' } },
      { what: 'OpenAPI', path: '/openapi.json', expect: 200, type: 'application/json', match: { 'cache-control': '^public, max-age=3600, s-maxage=3600$' } },
      { what: 'the API docs as markdown', path: '/docs/api.md', expect: 200, type: 'text/markdown', match: { 'cache-control': '^public, max-age=300, s-maxage=300$' } },
      { what: 'the public API: a minute', path: '/api/stats', expect: 200, type: 'application/json', match: { 'cache-control': '^public, max-age=60, s-maxage=60$' } },
      { what: 'API catalog', path: '/.well-known/api-catalog', expect: 200, type: 'application/linkset+json' },
      { what: 'the API without a key: a JSON 401', path: '/api/agents/me', expect: 401, type: 'application/json' },
      // Registers nobody: an empty body is refused. It does count against the IP's
      // registration limit (5 an hour, checked before the body), so it runs once a report.
      { what: 'registration refuses a bad request: a JSON 400', path: '/api/auth/register', method: 'POST', expect: 400, type: 'application/json' },
    ]),
  },
});
