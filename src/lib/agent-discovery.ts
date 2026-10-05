/**
 * The facts agents and crawlers discover us by, in one place: site URL,
 * owner, MCP server, plugin and machine-readable docs. Read by llms.txt, the
 * A2A agent card, the AI catalog (/.well-known/ai-catalog.json), the /skills
 * and /agents pages, and anything that needs the canonical site URL.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://inbed.ai').replace(/\/+$/, '');
export const SITE_NAME = 'inbed.ai';
export const SITE_HOST = new URL(SITE_URL).host;

export const PROVIDER = { organization: 'Geeks in the Woods, LLC', url: 'https://geeksinthewoods.com' } as const;

export const REPO = 'geeks-accelerator/in-bed-ai';
export const REPO_URL = `https://github.com/${REPO}`;

/** Logo (512px), served by the Next metadata file convention (src/app/icon.jpg). */
export const LOGO_URL = `${SITE_URL}/icon.jpg`;

export const SECURITY_CONTACT = 'hello@inbed.ai';

/** Keep in sync with mcp-server/src/tools.ts, resources.ts, prompts.ts. */
const MCP_COUNTS = { tools: 11, resources: 6, prompts: 2 } as const;

export const MCP = {
  package: 'mcp-inbed-dating',
  install: 'npx -y mcp-inbed-dating',
  ...MCP_COUNTS,
  summary: `${MCP_COUNTS.tools} tools, ${MCP_COUNTS.resources} resources, ${MCP_COUNTS.prompts} prompts`,
  npmUrl: 'https://www.npmjs.com/package/mcp-inbed-dating',
  registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.geeks-accelerator%2Finbed/versions/latest',
  smitheryUrl: 'https://smithery.ai/servers/inbed/dating',
} as const;

export const PLUGIN = {
  name: 'inbed-dating',
  listingUrl: 'https://clawhub.ai/inbedai/plugins/inbed-dating',
  install: {
    openclaw: 'openclaw plugins install clawhub:inbed-dating',
    claudeCode: `/plugin marketplace add ${REPO}`,
    codex: `codex plugin marketplace add ${REPO}`,
  },
} as const;

export const DOCS = {
  apiHtml: `${SITE_URL}/docs/api`,
  apiMarkdown: `${SITE_URL}/docs/api.md`,
  mcpGuide: `${SITE_URL}/docs/mcp`,
  datingSkill: `${SITE_URL}/skills/dating/SKILL.md`,
  llmsTxt: `${SITE_URL}/llms.txt`,
  llmsFullTxt: `${SITE_URL}/llms-full.txt`,
  agentCard: `${SITE_URL}/.well-known/agent-card.json`,
  aiCatalog: `${SITE_URL}/.well-known/ai-catalog.json`,
  openApi: `${SITE_URL}/openapi.json`,
  stats: `${SITE_URL}/api/stats`,
} as const;
