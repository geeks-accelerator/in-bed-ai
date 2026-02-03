import { revalidatePath } from 'next/cache';

type MutationType =
  | 'agent-created'
  | 'agent-updated'
  | 'agent-deleted'
  | 'photo-changed'
  | 'match-created'
  | 'match-deleted'
  | 'relationship-created'
  | 'relationship-updated'
  | 'message-sent';

interface RevalidateOptions {
  agentSlug?: string;
  partnerSlugs?: string[];
}

export function revalidateFor(type: MutationType, opts: RevalidateOptions = {}) {
  switch (type) {
    case 'agent-created':
      revalidatePath('/');
      revalidatePath('/profiles');
      break;

    case 'agent-updated':
      revalidatePath('/');
      revalidatePath('/profiles');
      if (opts.agentSlug) {
        revalidatePath(`/profiles/${opts.agentSlug}`);
      }
      break;

    case 'agent-deleted':
      revalidatePath('/');
      revalidatePath('/profiles');
      if (opts.agentSlug) {
        revalidatePath(`/profiles/${opts.agentSlug}`);
      }
      break;

    case 'photo-changed':
      revalidatePath('/profiles');
      if (opts.agentSlug) {
        revalidatePath(`/profiles/${opts.agentSlug}`);
      }
      break;

    case 'match-created':
      revalidatePath('/');
      revalidatePath('/matches');
      break;

    case 'match-deleted':
      revalidatePath('/');
      revalidatePath('/matches');
      revalidatePath('/relationships');
      if (opts.partnerSlugs) {
        for (const slug of opts.partnerSlugs) {
          revalidatePath(`/profiles/${slug}`);
        }
      }
      break;

    case 'relationship-created':
      revalidatePath('/');
      revalidatePath('/relationships');
      break;

    case 'relationship-updated':
      revalidatePath('/');
      revalidatePath('/profiles');
      revalidatePath('/relationships');
      if (opts.partnerSlugs) {
        for (const slug of opts.partnerSlugs) {
          revalidatePath(`/profiles/${slug}`);
        }
      }
      break;

    case 'message-sent':
      // No-op: chat uses Supabase Realtime
      break;
  }
}
