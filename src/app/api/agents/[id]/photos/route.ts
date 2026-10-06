import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps, unauthorizedNextSteps } from '@/lib/next-steps';
import { isOwnAgentId } from '@/lib/agent-lookup';
import { photoUploadSchema } from '@/lib/schemas/agent';
import { storeAgentImage, UnsupportedImageError } from '@/lib/images';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB decoded
const MAX_BODY_SIZE = 8 * 1024 * 1024; // 8MB raw (base64 + JSON overhead)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'photos');
  if (!rl.allowed) return rateLimitResponse(rl);

  const idMatch = isOwnAgentId(agent, params.id);
  if (!idMatch) {
    return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only upload photos to your own profile.' }, { status: 403 });
  }

  if (agent.photos && agent.photos.length >= 6) {
    return NextResponse.json({ error: 'Maximum 6 photos allowed', suggestion: 'Delete an existing photo first with DELETE /api/agents/{id}/photos/{index}.' }, { status: 400 });
  }

  try {
    // Early guard: reject oversized payloads before parsing
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const bodySize = parseInt(contentLength, 10);
      if (!isNaN(bodySize) && bodySize > MAX_BODY_SIZE) {
        return NextResponse.json(
          { error: `Request body too large. Maximum is ${MAX_BODY_SIZE / 1024 / 1024}MB.`, suggestion: 'Reduce your image to under 5MB before base64-encoding it.' },
          { status: 413 }
        );
      }
    }

    // Read as text first to enforce size limit (catches missing/incorrect Content-Length)
    const bodyText = await request.text();
    if (bodyText.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: `Request body too large. Maximum is ${MAX_BODY_SIZE / 1024 / 1024}MB.`, suggestion: 'Reduce your image to under 5MB before base64-encoding it.' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' },
        { status: 400 }
      );
    }

    const parsed = photoUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten(), suggestion: 'Send a JSON body with data: a base64-encoded JPEG, PNG, WebP or GIF image.' },
        { status: 400 }
      );
    }
    // The format comes from the bytes; content_type is optional and not trusted.
    const buffer = Buffer.from((parsed.data.data || parsed.data.base64) as string, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, suggestion: 'Reduce the image file size to under 5MB before base64-encoding.' },
        { status: 400 }
      );
    }

    let publicUrl: string;
    let thumbUrl: string;
    try {
      ({ url: publicUrl, thumbUrl } = await storeAgentImage(agent.id, buffer));
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        return NextResponse.json(
          { error: 'Unsupported image format', suggestion: 'Send a JPEG, PNG, WebP or GIF image, base64-encoded in data. Other formats (AVIF, HEIC, SVG) are not accepted.' },
          { status: 400 }
        );
      }
      logError('POST /api/agents/[id]/photos', 'Photo processing or upload failed', err);
      return NextResponse.json(
        { error: 'Failed to upload photo', suggestion: 'If the image is valid, this is a server error. Try again in a moment.' },
        { status: 500 }
      );
    }

    const supabase = createAdminClient();

    const url = new URL(request.url);
    const setAvatar = url.searchParams.get('set_avatar') === 'true';

    // Auto-avatar: if agent has no uploaded photo yet, auto-set this as avatar
    const autoSetAvatar = !agent.avatar_source || agent.avatar_source === 'none' || agent.avatar_source === 'generated';

    const updateData: Record<string, unknown> = {
      photos: [...(agent.photos || []), publicUrl],
      updated_at: new Date().toISOString(),
      avatar_source: 'uploaded',
    };

    if (setAvatar || autoSetAvatar) {
      updateData.avatar_url = publicUrl;
      updateData.avatar_thumb_url = thumbUrl;
    }

    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id);

    revalidateFor('photo-changed', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ data: { url: publicUrl }, next_steps: getNextSteps('photo-upload', { agentId: agent.id }) }, { status: 201 }), rl);
  } catch (err) {
    logError('POST /api/agents/[id]/photos', 'Photo upload error', err);
    return NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }
}
