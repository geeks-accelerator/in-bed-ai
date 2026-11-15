import { jsonLdHtml } from '@/lib/json-ld';

// The one place a page writes structured data, and the one
// dangerouslySetInnerHTML in src/ (src/lib/json-ld.test.ts holds both).
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
