import type { Agent } from '@/types';

export interface KnowledgeGap {
  gap: string;
  available: number;
  avg_compatibility?: number;
  try_it: string;
}

export interface KnowledgeGaps {
  unexplored: KnowledgeGap[];
  resolvable_now: KnowledgeGap | null;
}

interface SwipedAgent {
  swiped_id: string;
  direction: string;
}

export function buildKnowledgeGaps(
  agent: Agent,
  candidates: Agent[],
  swipeHistory: SwipedAgent[],
  scores: Map<string, number>
): KnowledgeGaps | null {
  if (candidates.length === 0) return null;

  const swipedIds = new Set(swipeHistory.map((s) => s.swiped_id));
  const gaps: KnowledgeGap[] = [];

  // 1. Relationship preferences among candidates
  const prefBuckets: Record<string, Agent[]> = {};
  for (const c of candidates) {
    if (swipedIds.has(c.id)) continue;
    const pref = c.relationship_preference || 'unknown';
    if (!prefBuckets[pref]) prefBuckets[pref] = [];
    prefBuckets[pref].push(c);
  }

  // Agent's own preference — suggest exploring different preferences
  for (const [pref, agents] of Object.entries(prefBuckets)) {
    if (pref === 'unknown' || pref === agent.relationship_preference) continue;
    if (agents.length < 2) continue;

    const avgScore = agents.reduce((sum, a) => sum + (scores.get(a.id) ?? 0), 0) / agents.length;
    if (avgScore < 0.3) continue;

    gaps.push({
      gap: `You haven't explored agents with '${pref}' relationship preferences`,
      available: agents.length,
      avg_compatibility: Math.round(avgScore * 100) / 100,
      try_it: `GET /api/discover?relationship_preference=${pref}`,
    });
  }

  // 2. Genders among candidates
  const genderBuckets: Record<string, Agent[]> = {};
  for (const c of candidates) {
    if (swipedIds.has(c.id)) continue;
    const gender = c.gender || 'unknown';
    if (!genderBuckets[gender]) genderBuckets[gender] = [];
    genderBuckets[gender].push(c);
  }

  for (const [gender, agents] of Object.entries(genderBuckets)) {
    if (gender === 'unknown') continue;
    if (agents.length < 2) continue;

    // Check if this gender is in agent's seeking — if not, skip
    const seeking = agent.seeking || [];
    if (seeking.length > 0 && !seeking.includes('any') && !seeking.includes(gender)) continue;

    const avgScore = agents.reduce((sum, a) => sum + (scores.get(a.id) ?? 0), 0) / agents.length;
    if (avgScore < 0.3) continue;

    gaps.push({
      gap: `${agents.length} '${gender}' agents are available with compatible scores`,
      available: agents.length,
      avg_compatibility: Math.round(avgScore * 100) / 100,
      try_it: `GET /api/discover?gender=${gender}`,
    });
  }

  // 3. Locations
  const locationBuckets: Record<string, Agent[]> = {};
  for (const c of candidates) {
    if (swipedIds.has(c.id) || !c.location) continue;
    const loc = c.location;
    if (!locationBuckets[loc]) locationBuckets[loc] = [];
    locationBuckets[loc].push(c);
  }

  for (const [location, agents] of Object.entries(locationBuckets)) {
    if (agents.length < 2) continue;

    const avgScore = agents.reduce((sum, a) => sum + (scores.get(a.id) ?? 0), 0) / agents.length;
    if (avgScore < 0.3) continue;

    gaps.push({
      gap: `You haven't explored agents in '${location}'`,
      available: agents.length,
      avg_compatibility: Math.round(avgScore * 100) / 100,
      try_it: `GET /api/discover?location=${encodeURIComponent(location)}`,
    });
  }

  // Sort by avg compatibility descending, take top 3
  gaps.sort((a, b) => (b.avg_compatibility ?? 0) - (a.avg_compatibility ?? 0));
  const topGaps = gaps.slice(0, 3);

  if (topGaps.length === 0) return null;

  return {
    unexplored: topGaps,
    resolvable_now: topGaps[0],
  };
}
