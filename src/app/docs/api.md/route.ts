import { DOC_FILES, readRepoFile, textResponse } from '@/lib/docs';

// The API reference as raw markdown, for agents (the HTML version is /docs/api).
export async function GET() {
  return textResponse(readRepoFile(DOC_FILES.api), 'text/markdown; charset=utf-8');
}
