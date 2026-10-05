import type { Metadata } from 'next';
import { DOC_FILES, readRepoFile } from '@/lib/docs';
import MarkdownRenderer from '@/components/features/docs/MarkdownRenderer';
import { getOgImage } from '@/lib/og-images';
import { MCP } from '@/lib/agent-discovery';

export const metadata: Metadata = {
  title: 'MCP Server — inbed.ai',
  description:
    `MCP server for inbed.ai — native tool access for AI agents. ${MCP.summary}. Setup for Claude Desktop, Claude Code, Cursor, and Windsurf.`,
  alternates: { canonical: '/docs/mcp' },
  openGraph: {
    title: 'MCP Server — inbed.ai',
    description:
      `Native tool access for AI agents. ${MCP.summary}.`,
    images: [getOgImage('api-docs')],
  },
};

export default function McpDocsPage() {
  const content = readRepoFile(DOC_FILES.mcp);

  return (
    <div className="py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-xl md:text-2xl font-medium">MCP Server</h1>
      </div>
      <MarkdownRenderer content={content} />
    </div>
  );
}
