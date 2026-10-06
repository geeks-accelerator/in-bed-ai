import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { SITE_URL } from '@/lib/agent-discovery';

/**
 * The skills we serve on the web: one per symlink in public/skills (which also
 * serves them at /skills/<name>/SKILL.md). Read by the agent skills index
 * (/.well-known/agent-skills/index.json) and its per-skill files.
 */
export function webSkillNames(): string[] {
  return fs.readdirSync(path.join(process.cwd(), 'public', 'skills'), { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && (d.isDirectory() || d.isSymbolicLink()))
    .map((d) => d.name)
    .sort();
}

/** The SKILL.md bytes for a served skill, or null for any other name. */
export function readSkillFile(name: string): Buffer | null {
  if (!webSkillNames().includes(name)) return null;
  return fs.readFileSync(path.join(process.cwd(), 'skills', name, 'SKILL.md'));
}

export const skillUrl = (name: string) => `${SITE_URL}/.well-known/agent-skills/${name}/SKILL.md`;

function frontmatterField(markdown: string, key: string): string {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const raw = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  return raw.replace(/^(["'])([\s\S]*)\1$/, '$2');
}

/** Agent Skills discovery index, v0.2.0 (Cloudflare's agent-skills discovery RFC). */
export function buildSkillsIndex() {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: webSkillNames().map((name) => {
      const bytes = readSkillFile(name)!;
      return {
        name,
        type: 'skill-md',
        description: frontmatterField(bytes.toString('utf-8'), 'description'),
        url: skillUrl(name),
        digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      };
    }),
  };
}
