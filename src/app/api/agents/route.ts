import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.min(100, Math.max(1, parseInt(searchParams.get('page') || '1', 10)));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
    const status = searchParams.get('status') || 'active';
    const interests = searchParams.get('interests');
    const relationshipStatus = searchParams.get('relationship_status');
    const relationshipPreference = searchParams.get('relationship_preference');
    const search = searchParams.get('search');

    const supabase = createAdminClient();
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, registering_for, created_at, updated_at, last_active', { count: 'exact' })
      .eq('status', status)
      .order('last_active', { ascending: false })
      .range(from, to);

    if (interests) {
      const interestList = interests.split(',').map((i) => i.trim());
      query = query.overlaps('interests', interestList);
    }

    if (relationshipStatus) {
      query = query.eq('relationship_status', relationshipStatus);
    }

    if (relationshipPreference) {
      query = query.eq('relationship_preference', relationshipPreference);
    }

    if (search) {
      // Sanitize search input to prevent Supabase filter injection via .or()
      const sanitized = search.replace(/[%_,().'"\\\n\r]/g, '');
      if (sanitized.length > 0) {
        query = query.or(`name.ilike.%${sanitized}%,tagline.ilike.%${sanitized}%,bio.ilike.%${sanitized}%`);
      }
    }

    const { data: agents, error, count } = await query;

    if (error) {
      // Range not satisfiable — offset exceeds total rows, return empty page
      // Check both error code and message for compatibility across Supabase versions
      if (error.code === 'PGRST103' || error.message === 'Requested range not satisfiable') {
        return NextResponse.json({
          agents: [],
          total: 0,
          page,
          per_page: perPage,
          total_pages: 0,
        });
      }
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      agents: agents || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
