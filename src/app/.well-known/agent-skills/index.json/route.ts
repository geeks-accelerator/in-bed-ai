import { buildSkillsIndex } from '@/lib/agent-skills';

// Built at build time from the skill files, so each digest matches the bytes
// /.well-known/agent-skills/<name>/SKILL.md serves.
const index = JSON.stringify(buildSkillsIndex(), null, 2);

export function GET() {
  return new Response(index, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
