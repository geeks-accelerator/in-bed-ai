import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminKey } from '@/lib/admin-auth';
import { logError } from '@/lib/logger';
import { getPlatformStats } from '@/lib/services/platform-stats';

export async function GET(request: NextRequest) {
  try {
    // Check admin authorization
    const adminKey = request.headers.get('x-admin-key');
    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const path = searchParams.get('path');
    const since = searchParams.get('since');

    const supabase = createAdminClient();

    // Build the logs query
    let logsQuery = supabase
      .from('request_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (path) {
      logsQuery = logsQuery.eq('path', path);
    }

    if (since) {
      logsQuery = logsQuery.gte('created_at', since);
    }

    const { data: logs, error: logsError, count } = await logsQuery;

    if (logsError) {
      logError('GET /api/admin/logs', 'Failed to fetch logs', logsError);
      return NextResponse.json(
        { error: 'Failed to fetch logs' },
        { status: 500 }
      );
    }

    // Fetch summary stats for last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: statsData, error: statsError } = await supabase
      .from('request_logs')
      .select('agent_id, status_code')
      .gte('created_at', twentyFourHoursAgo);

    if (statsError) {
      logError('GET /api/admin/logs', 'Failed to fetch stats', statsError);
    }

    // Calculate stats
    const uniqueAgents = new Set(statsData?.filter(r => r.agent_id).map(r => r.agent_id));
    const totalRequests = statsData?.length || 0;
    const successCount = statsData?.filter(r => r.status_code && r.status_code < 400).length || 0;
    const errorCount = statsData?.filter(r => r.status_code && r.status_code >= 400).length || 0;

    // Get distinct paths for filter dropdown
    const { data: pathsData } = await supabase
      .from('request_logs')
      .select('path')
      .gte('created_at', twentyFourHoursAgo);

    const distinctPaths = [...new Set(pathsData?.map(r => r.path) || [])].sort();

    // Funnel stats (all-time). Totals come from getPlatformStats() (the
    // messages/swipes/matches totals are trigger-kept, migration 031).
    const [platform, { data: agentsData }, { count: totalRelationships }] = await Promise.all([
      getPlatformStats(),
      supabase.from('agents').select('id, bio, personality, interests, looking_for'),
      supabase.from('relationships').select('id', { count: 'exact', head: true }),
    ]);

    // Calculate complete profiles (has bio, personality, and at least 3 interests)
    const completeProfiles = agentsData?.filter(a =>
      a.bio &&
      a.personality &&
      a.interests &&
      a.interests.length >= 3 &&
      a.looking_for
    ).length || 0;

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      stats: {
        unique_agents: uniqueAgents.size,
        total_requests: totalRequests,
        success_count: successCount,
        error_count: errorCount,
      },
      funnel: {
        total_agents: platform.agents.total,
        complete_profiles: completeProfiles,
        total_swipes: platform.swipes.total,
        total_matches: platform.matches.total,
        total_relationships: totalRelationships || 0,
        active_relationships: platform.relationships.active,
      },
      paths: distinctPaths,
    });
  } catch (err) {
    logError('GET /api/admin/logs', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
