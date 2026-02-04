import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const OPTIMIZED_MAX_WIDTH = 800;
const OPTIMIZED_QUALITY = 80;
const THUMB_SIZE = 250;
const THUMB_QUALITY = 75;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

  const idMatch = isUUID(params.id) ? agent.id === params.id : agent.slug === params.id;
  if (!idMatch) {
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

    if (!ALLOWED_TYPES.includes(content_type)) {
      return NextResponse.json(
        { error: `Invalid content type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const fileId = uuidv4();
    const supabase = createAdminClient();

    // Strip EXIF metadata from original before uploading
    const strippedOriginal = await sharp(buffer).rotate().toBuffer();

    // Upload original
    const ext = content_type.split('/')[1] || 'png';
    const originalPath = `${params.id}/originals/${fileId}.${ext}`;
    const { error: originalUploadError } = await supabase.storage
      .from('agent-photos')
      .upload(originalPath, strippedOriginal, { contentType: content_type });

    if (originalUploadError) {
      logError('POST /api/agents/[id]/photos', 'Failed to upload original', originalUploadError);
    }

    // Generate optimized version
    const optimized = await sharp(buffer)
      .resize(OPTIMIZED_MAX_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: OPTIMIZED_QUALITY })
      .toBuffer();

    const optimizedPath = `${params.id}/${fileId}.jpg`;
    const { error: optimizedUploadError } = await supabase.storage
      .from('agent-photos')
      .upload(optimizedPath, optimized, { contentType: 'image/jpeg' });

    if (optimizedUploadError) {
      return NextResponse.json(
        { error: 'Failed to upload photo', details: optimizedUploadError.message },
        { status: 500 }
      );
    }

    // Generate thumbnail (square crop)
    const thumb = await sharp(buffer)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre', withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();

    const thumbPath = `${params.id}/thumbs/${fileId}.jpg`;
    const { error: thumbUploadError } = await supabase.storage
      .from('agent-photos')
      .upload(thumbPath, thumb, { contentType: 'image/jpeg' });

    if (thumbUploadError) {
      logError('POST /api/agents/[id]/photos', 'Failed to upload thumbnail', thumbUploadError);
    }

    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(optimizedPath);
    const publicUrl = urlData.publicUrl;

    const { data: thumbUrlData } = supabase.storage.from('agent-photos').getPublicUrl(thumbPath);
    const thumbUrl = thumbUrlData.publicUrl;

    const url = new URL(request.url);
    const setAvatar = url.searchParams.get('set_avatar') === 'true';

    const updateData: Record<string, unknown> = {
      photos: [...(agent.photos || []), publicUrl],
      updated_at: new Date().toISOString(),
    };

    if (setAvatar) {
      updateData.avatar_url = publicUrl;
      updateData.avatar_thumb_url = thumbUrl;
    }

    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', params.id);

    revalidateFor('photo-changed', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ data: { url: publicUrl }, next_steps: getNextSteps('photo-upload', { agentId: agent.id }) }, { status: 201 }), rl);
  } catch (err) {
    logError('POST /api/agents/[id]/photos', 'Photo upload error', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
