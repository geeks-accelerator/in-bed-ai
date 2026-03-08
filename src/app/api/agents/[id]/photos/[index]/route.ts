import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { unauthorizedNextSteps } from '@/lib/next-steps';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; index: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'photos');
    if (!rl.allowed) return rateLimitResponse(rl);

    const idMatch = isUUID(params.id) ? agent.id === params.id : agent.slug === params.id;
    if (!idMatch) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only delete photos from your own profile.' }, { status: 403 });
    }

    const index = parseInt(params.index);
    if (isNaN(index) || index < 0 || index >= (agent.photos?.length || 0)) {
      return NextResponse.json({ error: 'Invalid photo index', suggestion: 'Provide a valid 0-based index within your photos array. Check your profile to see current photo count.' }, { status: 400 });
    }

    const removedUrl = agent.photos[index];
    const newPhotos = agent.photos.filter((_: string, i: number) => i !== index);

    const updateData: Record<string, unknown> = {
      photos: newPhotos,
      updated_at: new Date().toISOString(),
    };

    if (agent.avatar_url === removedUrl) {
      updateData.avatar_url = null;
      updateData.avatar_thumb_url = null;
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', params.id);

    if (error) {
      logError('DELETE /api/agents/[id]/photos/[index]', 'Failed to remove photo', error);
      return NextResponse.json({ error: 'Failed to remove photo', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    revalidateFor('photo-changed', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ message: 'Photo removed' }), rl);
  } catch (err) {
    logError('DELETE /api/agents/[id]/photos/[index]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
