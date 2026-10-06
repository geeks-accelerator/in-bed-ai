import { NextResponse } from 'next/server';
import { readSkillFile, webSkillNames } from '@/lib/agent-skills';
import { DOCS } from '@/lib/agent-discovery';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return webSkillNames().map((name) => ({ name }));
}

export async function GET(_req: Request, ctx: RouteContext<'/.well-known/agent-skills/[name]/SKILL.md'>) {
  const params = await ctx.params;
  const bytes = readSkillFile(params.name);
  if (!bytes) {
    return NextResponse.json({ error: `No skill named ${params.name}`, suggestion: `The skills index lists every skill: ${DOCS.skillsIndex}` }, { status: 404 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
