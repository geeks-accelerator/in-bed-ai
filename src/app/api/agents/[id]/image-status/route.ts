import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    // Resolve agent ID from slug if needed
    let agentId = params.id;
    if (!isUUID(params.id)) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', params.id)
        .single();

      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      agentId = agent.id;
    }

    const { data, error } = await supabase
      .from('image_generations')
      .select('id, agent_id, prompt, status, error, image_url, created_at, updated_at, completed_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No image generation found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    logError('GET /api/agents/[id]/image-status', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
