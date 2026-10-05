import fs from 'fs';
import path from 'path';

/** Markdown sources served on the web (read from the repo at request time). */
export const DOC_FILES = {
  api: 'docs/API.md',
  mcp: 'docs/architecture/mcp-server.md',
  datingSkill: 'skills/dating/SKILL.md',
} as const;

/** Read a repo file relative to the project root (Railway runs `npm start` from it). */
export function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
}

/** Drop a leading YAML frontmatter block (SKILL.md files carry one). */
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\n*/, '');
}

/** A cacheable text response (llms.txt, /docs/api.md, security.txt). */
export function textResponse(content: string, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
