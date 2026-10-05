import { getLlmsStats, buildLlmsFullTxt } from '@/lib/llms';
import { textResponse } from '@/lib/docs';

export const revalidate = 300; // cache for 5 minutes

export async function GET() {
  return textResponse(buildLlmsFullTxt(await getLlmsStats()));
}
