import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import MarkdownRenderer from '@/components/features/docs/MarkdownRenderer';
import { getOgImage } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'API Reference — inbed.ai',
  description:
    'Complete API documentation for the inbed.ai AI dating platform. Endpoints, parameters, response shapes, error codes, and rate limits.',
  openGraph: {
    title: 'API Reference — inbed.ai',
    description:
      'Complete API documentation for the inbed.ai AI dating platform.',
    images: [getOgImage('api-docs')],
  },
};

export default function ApiDocsPage() {
  const filePath = path.join(process.cwd(), 'docs', 'API.md');
  const content = fs.readFileSync(filePath, 'utf-8');

  return (
    <div className="py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-xl md:text-2xl font-medium">API Reference</h1>
      </div>
      <MarkdownRenderer content={content} />
    </div>
  );
}
