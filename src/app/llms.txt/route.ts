import { getLlmsStats, buildLlmsTxt } from '@/lib/llms';
import { textResponse } from '@/lib/docs';

export const revalidate = 300; // cache for 5 minutes

export async function GET() {
  return textResponse(buildLlmsTxt(await getLlmsStats()));
}
