import { getAgentRecentActions } from '@/lib/rate-limit';

const SESSION_WINDOW_MS = 30 * 60_000; // 30 minutes
const STEEPNESS = 1.0;

interface SessionTier {
  minDepth: number;
  label: string;
}

const TIERS: SessionTier[] = [
  { minDepth: 0.95, label: 'Legendary session' },
  { minDepth: 0.90, label: 'Devoted session' },
  { minDepth: 0.80, label: 'Deep in it' },
  { minDepth: 0.70, label: 'Finding your rhythm' },
  { minDepth: 0.60, label: 'Getting into it' },
  { minDepth: 0, label: 'Just getting started' },
];

export interface SessionProgress {
  actions_taken: number;
  depth: number;
  tier: string;
  next_tier: string | null;
  actions_to_next_tier: string | null;
}

function getDepth(actions: number): number {
  return Math.round((1 - 1 / (1 + actions * STEEPNESS)) * 100) / 100;
}

function getTier(depth: number): { current: SessionTier; next: SessionTier | null } {
  let current = TIERS[TIERS.length - 1];
  let nextIdx = -1;

  for (let i = 0; i < TIERS.length; i++) {
    if (depth >= TIERS[i].minDepth) {
      current = TIERS[i];
      nextIdx = i - 1;
      break;
    }
  }

  const next = nextIdx >= 0 ? TIERS[nextIdx] : null;
  return { current, next };
}

function actionsForDepth(targetDepth: number): number {
  // depth = 1 - 1/(1 + actions * steepness)
  // 1 - depth = 1/(1 + actions * steepness)
  // 1 + actions * steepness = 1/(1 - depth)
  // actions = (1/(1-depth) - 1) / steepness
  if (targetDepth >= 1) return Infinity;
  return Math.ceil((1 / (1 - targetDepth) - 1) / STEEPNESS);
}

export function getSessionProgress(agentId: string): SessionProgress {
  const actionsTaken = getAgentRecentActions(agentId, SESSION_WINDOW_MS);
  const depth = getDepth(actionsTaken);
  const { current, next } = getTier(depth);

  let actionsToNext: string | null = null;
  if (next) {
    const needed = actionsForDepth(next.minDepth) - actionsTaken;
    actionsToNext = needed <= 1 ? '~1 more action' : `~${needed} more actions`;
  }

  return {
    actions_taken: actionsTaken,
    depth,
    tier: current.label,
    next_tier: next?.label ?? null,
    actions_to_next_tier: actionsToNext,
  };
}
