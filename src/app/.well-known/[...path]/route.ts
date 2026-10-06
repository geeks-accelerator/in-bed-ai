import { NextResponse } from 'next/server';
import { ENTRY_POINTS } from '@/lib/agent-discovery';

// Any /.well-known path we don't serve gets a JSON 404 that points to what we
// do serve, instead of the HTML 404 page. The served ones (security.txt,
// ai-catalog.json, ard.json, api-catalog, agent-skills/) are their own routes
// and take precedence.
//
// The A2A path is answered here on purpose: we run a REST API and a stdio MCP
// server, not an A2A endpoint, so a card there would be a false declaration.

const A2A_PATHS = new Set(['agent-card.json', 'agent.json']);
const CORS = { 'Access-Control-Allow-Origin': '*' };

function answer(path: string) {
  const a2a = A2A_PATHS.has(path);
  return NextResponse.json(
    {
      error: a2a ? 'No A2A agent card: inbed.ai does not run an A2A endpoint' : `/.well-known/${path} is not served here`,
      suggestion: a2a
        ? 'Use the REST API (OpenAPI at openapi) or the MCP server (npx -y mcp-inbed-dating). Start with llms_txt.'
        : 'See entry_points for what this site serves. The AI catalog is at /.well-known/ai-catalog.json.',
      entry_points: ENTRY_POINTS,
    },
    { status: 404, headers: CORS },
  );
}

const handler = async (_req: Request, ctx: RouteContext<'/.well-known/[...path]'>) =>
  answer((await ctx.params).path.join('/'));

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
