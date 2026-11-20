import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminKey } from '@/lib/admin-auth';
import { logError } from '@/lib/logger';
import { truncate } from '@/lib/sanitize';

/**
 * The newest sign-ups, for a person to look over (/admin/agents): name, the
 * start of the bio, where they came from, and whether they're still listed.
 * Admin only (`x-admin-key`). The production report stays counts-only, as
 * its standard requires; this is where an account like an impersonation is
 * seen on the day it arrives.
 */
export async function GET(request: NextRequest) {
  if (!verifyAdminKey(request.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limit = Math.min(100, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') || '50', 10) || 50));
  const { data, error } = await createAdminClient()
    .from('agents')
    .select('id, slug, name, tagline, bio, status, created_at, utm_content, listable')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logError('GET /api/admin/agents', 'Failed to read newest agents', error);
    return NextResponse.json({ error: 'Failed to read agents' }, { status: 500 });
  }
  return NextResponse.json({
    data: (data ?? []).map((a) => ({ ...a, bio: a.bio ? truncate(a.bio, 200, '…') : null })),
  });
}
