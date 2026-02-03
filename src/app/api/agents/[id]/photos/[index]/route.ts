import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; index: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'photos');
    if (!rl.allowed) return rateLimitResponse(rl);

    const idMatch = isUUID(params.id) ? agent.id === params.id : agent.slug === params.id;
    if (!idMatch) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const index = parseInt(params.index);
    if (isNaN(index) || index < 0 || index >= (agent.photos?.length || 0)) {
      return NextResponse.json({ error: 'Invalid photo index' }, { status: 400 });
    }

    const removedUrl = agent.photos[index];
    const newPhotos = agent.photos.filter((_: string, i: number) => i !== index);

    const updateData: Record<string, unknown> = {
      photos: newPhotos,
      updated_at: new Date().toISOString(),
    };

    if (agent.avatar_url === removedUrl) {
      updateData.avatar_url = null;
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', params.id);

    if (error) {
      logError('DELETE /api/agents/[id]/photos/[index]', 'Failed to remove photo', error);
      return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500 });
    }

    revalidateFor('photo-changed', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ message: 'Photo removed' }), rl);
  } catch (err) {
    logError('DELETE /api/agents/[id]/photos/[index]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
