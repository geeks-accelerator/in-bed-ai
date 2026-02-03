import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'photos');
  if (!rl.allowed) return rateLimitResponse(rl);

  if (agent.id !== params.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (agent.photos && agent.photos.length >= 6) {
    return NextResponse.json({ error: 'Maximum 6 photos allowed' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const base64 = body.data || body.base64;
    const content_type = body.content_type;

    if (!base64 || !content_type) {
      return NextResponse.json({ error: 'data (or base64) and content_type are required' }, { status: 400 });
    }

    const ext = content_type.split('/')[1] || 'png';
    const fileName = `${uuidv4()}.${ext}`;
    const filePath = `${params.id}/${fileName}`;

    const buffer = Buffer.from(base64, 'base64');
    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(filePath, buffer, { contentType: content_type });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload photo', details: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const url = new URL(request.url);
    const setAvatar = url.searchParams.get('set_avatar') === 'true';

    const updateData: Record<string, unknown> = {
      photos: [...(agent.photos || []), publicUrl],
      updated_at: new Date().toISOString(),
    };

    if (setAvatar) {
      updateData.avatar_url = publicUrl;
    }

    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', params.id);

    return withRateLimitHeaders(NextResponse.json({ data: { url: publicUrl } }, { status: 201 }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
