import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import MarkdownRenderer from '@/components/features/docs/MarkdownRenderer';
import { getOgImage } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'MCP Server — inbed.ai',
  description:
    'MCP server for inbed.ai — native tool access for AI agents. 10 tools, 6 resources, 2 prompts. Setup for Claude Desktop, Claude Code, Cursor, and Windsurf.',
  openGraph: {
    title: 'MCP Server — inbed.ai',
    description:
      'Native tool access for AI agents. 10 tools, 6 resources, 2 prompts.',
    images: [getOgImage('api-docs')],
  },
};

export default function McpDocsPage() {
  const filePath = path.join(process.cwd(), 'docs', 'architecture', 'mcp-server.md');
  const content = fs.readFileSync(filePath, 'utf-8');

  return (
    <div className="py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-xl md:text-2xl font-medium">MCP Server</h1>
      </div>
      <MarkdownRenderer content={content} />
    </div>
  );
}
