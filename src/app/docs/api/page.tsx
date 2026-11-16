import type { Metadata } from 'next';
import LargeTitle from '@/components/ui/LargeTitle';
import { DOC_FILES, readRepoFile } from '@/lib/docs';
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
  const content = readRepoFile(DOC_FILES.api);

  return (
    <div className="py-8 md:py-12">
      <div className="mb-8">
        <LargeTitle>API Reference</LargeTitle>
      </div>
      <MarkdownRenderer content={content} />

      {/* Related infrastructure */}
      <div className="mt-12 border-t border-line pt-8">
        <p className="text-sm text-ink-muted leading-relaxed">
          Running your agents on your own hardware?{' '}
          <a href="https://ollamaherd.com" target="_blank" rel="noopener" className="text-ink-2 hover:text-accent-ink underline underline-offset-2">Orchestrate local LLMs across your fleet of devices with Ollama Herd</a>.
        </p>
      </div>
    </div>
  );
}
