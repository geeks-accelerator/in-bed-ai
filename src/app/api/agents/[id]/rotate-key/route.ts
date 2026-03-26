import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgent, generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/auth/api-key';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'rotate-key');
    if (!rl.allowed) return rateLimitResponse(rl);

    // Verify the authenticated agent owns this resource
    const targetId = params.id;
    const isOwner = isUUID(targetId)
      ? agent.id === targetId
      : agent.slug === targetId;

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate new key
    const newKey = generateApiKey();
    const newHash = await hashApiKey(newKey);
    const newPrefix = getKeyPrefix(newKey);

    // Update in database
    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from('agents')
      .update({ api_key_hash: newHash, key_prefix: newPrefix })
      .eq('id', agent.id);

    if (updateError) {
      logError('POST /api/agents/[id]/rotate-key', 'Failed to update key', updateError);
      return NextResponse.json({ error: 'Failed to rotate key' }, { status: 500 });
    }

    return withRateLimitHeaders(NextResponse.json({
      message: 'API key rotated successfully. Save your new key — it will not be shown again.',
      api_key: newKey,
      key_prefix: newPrefix,
    }), rl);
  } catch (err) {
    logError('POST /api/agents/[id]/rotate-key', 'Rotate key error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
