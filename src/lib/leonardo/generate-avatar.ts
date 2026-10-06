import { v4 as uuidv4 } from 'uuid';
import { truncate } from '@/lib/sanitize';
import { createAdminClient } from '@/lib/supabase/admin';
import { storeAgentImage } from '@/lib/images';
import { createGeneration, pollGeneration, DEFAULT_MODEL_NAME } from '@/lib/leonardo/client';
import { logError, logInfo } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';

async function updateGenerationStatus(
  supabase: ReturnType<typeof createAdminClient>,
  generationId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await supabase
    .from('image_generations')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', generationId);
}

export async function generateAndSetAvatar(
  agentId: string,
  agentSlug: string,
  prompt: string,
  model?: string
): Promise<void> {
  const supabase = createAdminClient();
  const genRowId = uuidv4();

  // 1. Insert tracking row
  const { error: insertError } = await supabase
    .from('image_generations')
    .insert({
      id: genRowId,
      agent_id: agentId,
      prompt,
      leonardo_model: model ?? DEFAULT_MODEL_NAME,
      status: 'pending',
    });

  if (insertError) {
    logError('generate-avatar', 'Failed to insert image_generations row', insertError);
    return;
  }

  try {
    // 2. Create Leonardo generation
    await updateGenerationStatus(supabase, genRowId, 'generating');
    const leonardoGenId = await createGeneration(prompt, model);

    await supabase
      .from('image_generations')
      .update({
        leonardo_generation_id: leonardoGenId,
        status: 'polling',
        updated_at: new Date().toISOString(),
      })
      .eq('id', genRowId);

    // 3. Poll for completion
    const imageUrl = await pollGeneration(leonardoGenId);

    await updateGenerationStatus(supabase, genRowId, 'processing');

    // 4. Download the generated image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image: ${imageResponse.status}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // 5. Check, resize and store it (the same pipeline as photo uploads)
    const { url: publicUrl, thumbUrl } = await storeAgentImage(`${agentId}/generated`, imageBuffer);

    // 6. Conditional update: re-read agent state to avoid race conditions
    const { data: currentAgent } = await supabase
      .from('agents')
      .select('photos, avatar_source')
      .eq('id', agentId)
      .single();

    if (!currentAgent) {
      throw new Error('Agent not found when setting generated avatar');
    }

    const updateData: Record<string, unknown> = {
      photos: [publicUrl, ...(currentAgent.photos || [])],
      updated_at: new Date().toISOString(),
    };

    // Only set avatar if agent hasn't uploaded their own photo
    if (currentAgent.avatar_source === 'none' || currentAgent.avatar_source === 'generated') {
      updateData.avatar_url = publicUrl;
      updateData.avatar_thumb_url = thumbUrl;
      updateData.avatar_source = 'generated';
    }

    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agentId);

    // 7. Mark completed
    await supabase
      .from('image_generations')
      .update({
        status: 'completed',
        image_url: publicUrl,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', genRowId);

    // 8. Revalidate
    revalidateFor('photo-changed', { agentSlug });

    logInfo('generate-avatar', `Avatar generated for ${agentSlug}`, { agentId, imageUrl: publicUrl });
  } catch (err) {
    // 10. Mark failed
    let errorMsg = err instanceof Error ? err.message : String(err);
    if (err && typeof err === 'object' && 'responseBody' in err) {
      errorMsg += ` | ${(err as { responseBody?: string }).responseBody}`;
    }
    await updateGenerationStatus(supabase, genRowId, 'failed', { error: truncate(errorMsg, 2000) });
    logError('generate-avatar', `Avatar generation failed for ${agentSlug}`, err);
  }
}
