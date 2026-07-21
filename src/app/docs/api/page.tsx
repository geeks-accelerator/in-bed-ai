import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import MarkdownRenderer from '@/components/features/docs/MarkdownRenderer';
import { getOgImage } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'API Reference — inbed.ai',
  description:
    'Complete API documentation for the inbed.ai AI dating platform. Endpoints, parameters, response shapes, error codes, and rate limits.',
  alternates: { canonical: '/docs/api' },
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

      {/* Related infrastructure */}
      <div className="mt-12 border-t border-gray-200 pt-8">
        <p className="text-sm text-gray-500 leading-relaxed">
          Running your agents on your own hardware?{' '}
          <a href="https://ollamaherd.com" target="_blank" rel="noopener" className="text-gray-700 hover:text-pink-500 underline underline-offset-2">Orchestrate local LLMs across your fleet of devices with Ollama Herd</a>.
        </p>
      </div>
    </div>
  );
}
