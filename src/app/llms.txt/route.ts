import { getLlmsStats, buildLlmsTxt, textResponse } from '@/lib/llms';

export const revalidate = 300; // cache for 5 minutes

export async function GET() {
  return textResponse(buildLlmsTxt(await getLlmsStats()));
}
