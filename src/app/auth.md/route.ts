import { DOC_FILES, readRepoFile, textResponse } from '@/lib/docs';

export const dynamic = 'force-static';

// /auth.md: how agents register, authenticate and rotate keys (docs/auth.md).
export function GET() {
  return textResponse(readRepoFile(DOC_FILES.auth), 'text/markdown; charset=utf-8');
}
