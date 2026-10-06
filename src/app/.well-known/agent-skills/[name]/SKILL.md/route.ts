import { NextResponse } from 'next/server';
import { readSkillFile, webSkillNames } from '@/lib/agent-skills';
import { DOCS } from '@/lib/agent-discovery';

export const dynamicParams = false;

export function generateStaticParams() {
  return webSkillNames().map((name) => ({ name }));
}

export function GET(_req: Request, { params }: { params: { name: string } }) {
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
