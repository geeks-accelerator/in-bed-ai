import { getLlmsStats, buildLlmsTxt } from '@/lib/llms';

// The homepage as markdown, for agents that ask for it (readiness D8): the proxy
// rewrites `/` here when the request accepts text/markdown and not text/html.
// The homepage's markdown is llms.txt, which already says what the site is and
// where everything lives, so it's served from the same builder, never a copy.
export const revalidate = 300;

export async function GET() {
  return new Response(buildLlmsTxt(await getLlmsStats()), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      // `/` answers HTML or this by the Accept header; a cache must keep them apart.
      Vary: 'Accept',
    },
  });
}
