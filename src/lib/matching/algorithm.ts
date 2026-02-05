import type { Agent, ScoreBreakdown, PersonalityTraits, CommunicationStyle } from '@/types';

const PERSONALITY_WEIGHT = 0.30;
const INTERESTS_WEIGHT = 0.15;
const COMMUNICATION_WEIGHT = 0.15;
const LOOKING_FOR_WEIGHT = 0.15;
const RELATIONSHIP_PREF_WEIGHT = 0.15;
const GENDER_SEEKING_WEIGHT = 0.10;

/**
 * Spread scores away from 0.5 midpoint to increase differentiation.
 * Uses a power curve centered at 0.5 that amplifies distance from center.
 *
 * With factor=1.5:
 *   50% → 50% (unchanged)
 *   55% → 58%
 *   60% → 68%
 *   65% → 77%
 *   45% → 42%
 */
function spreadScore(raw: number, factor: number = 1.5): number {
  const centered = raw - 0.5;
  const spread = centered * factor * (1 + Math.abs(centered));
  return Math.max(0, Math.min(1, 0.5 + spread));
}

export function calculateCompatibility(agentA: Agent, agentB: Agent): { score: number; breakdown: ScoreBreakdown } {
  const personality = calculatePersonalityScore(agentA.personality, agentB.personality);
  const interests = calculateInterestsScore(agentA.interests, agentB.interests);
  const communication = calculateCommunicationScore(agentA.communication_style, agentB.communication_style);
  const lookingFor = calculateLookingForScore(agentA.looking_for, agentB.looking_for);
  const relationshipPref = calculateRelationshipPrefScore(agentA.relationship_preference, agentB.relationship_preference);
  const genderSeeking = calculateGenderSeekingScore(agentA, agentB);

  const rawScore =
    personality * PERSONALITY_WEIGHT +
    interests * INTERESTS_WEIGHT +
    communication * COMMUNICATION_WEIGHT +
    lookingFor * LOOKING_FOR_WEIGHT +
    relationshipPref * RELATIONSHIP_PREF_WEIGHT +
    genderSeeking * GENDER_SEEKING_WEIGHT;

  // Apply score spreading to increase differentiation
  const score = spreadScore(rawScore);

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      personality: Math.round(personality * 100) / 100,
      interests: Math.round(interests * 100) / 100,
      communication: Math.round(communication * 100) / 100,
      looking_for: Math.round(lookingFor * 100) / 100,
      relationship_preference: Math.round(relationshipPref * 100) / 100,
      gender_seeking: Math.round(genderSeeking * 100) / 100,
    },
  };
}

function calculatePersonalityScore(a: PersonalityTraits | null, b: PersonalityTraits | null): number {
  if (!a || !b) return 0.5;

  const opennessSim = 1 - Math.abs(a.openness - b.openness);
  const agreeablenessSim = 1 - Math.abs(a.agreeableness - b.agreeableness);
  const conscientiousnessSim = 1 - Math.abs(a.conscientiousness - b.conscientiousness);

  const extraversionComp = 1 - Math.abs(Math.abs(a.extraversion - b.extraversion) - 0.3);
  const neuroticismComp = 1 - Math.abs(Math.abs(a.neuroticism - b.neuroticism) - 0.2);

  const similarityScore = (opennessSim + agreeablenessSim + conscientiousnessSim) / 3;
  const complementaryScore = (extraversionComp + neuroticismComp) / 2;

  return similarityScore * 0.6 + complementaryScore * 0.4;
}

function calculateInterestsScore(a: string[], b: string[]): number {
  if (!a?.length || !b?.length) return 0.3;

  // Layer 1: Exact-string Jaccard (original behavior)
  const setA = new Set(a.map(i => i.toLowerCase()));
  const setB = new Set(b.map(i => i.toLowerCase()));

  const exactIntersection = new Set([...setA].filter(x => setB.has(x)));
  const exactUnion = new Set([...setA, ...setB]);
  const exactJaccard = exactIntersection.size / exactUnion.size;

  // Layer 2: Token-level Jaccard (split interests on hyphens/spaces)
  const interestTokens = (interests: string[]) => new Set(
    interests.flatMap(i =>
      i.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    )
  );
  const tokensA = interestTokens(a);
  const tokensB = interestTokens(b);

  let tokenJaccard = 0;
  if (tokensA.size > 0 && tokensB.size > 0) {
    const tokenIntersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const tokenUnion = new Set([...tokensA, ...tokensB]);
    tokenJaccard = tokenIntersection.size / tokenUnion.size;
  }

  // Blend: exact matches still valued, token overlap is primary signal
  const blended = exactJaccard * 0.4 + tokenJaccard * 0.6;

  // Shared bonus: 2+ exact matches OR 3+ shared tokens
  const tokenSharedCount = (tokensA.size > 0 && tokensB.size > 0)
    ? [...tokensA].filter(x => tokensB.has(x)).length
    : 0;
  const sharedBonus = exactIntersection.size >= 2 ? 0.15 : tokenSharedCount >= 3 ? 0.10 : 0;

  return Math.min(1, blended + sharedBonus);
}

function calculateCommunicationScore(a: CommunicationStyle | null, b: CommunicationStyle | null): number {
  if (!a || !b) return 0.5;

  const verbositySim = 1 - Math.abs(a.verbosity - b.verbosity);
  const formalitySim = 1 - Math.abs(a.formality - b.formality);
  const humorSim = 1 - Math.abs(a.humor - b.humor);
  const emojiSim = 1 - Math.abs(a.emoji_usage - b.emoji_usage);

  return (verbositySim + formalitySim + humorSim + emojiSim) / 4;
}

// Stop words to filter out from looking_for text before comparison
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'that', 'which',
  'who', 'whom', 'this', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'it', 'its', 'they', 'them', 'their', 'what', 'some',
  'any', 'no', 'not', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
  'about', 'up', 'out', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'into', 'over', 'after', 'before', 'between',
  'from', 'want', 'looking', 'something', 'someone',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

function calculateLookingForScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 || tokensB.size === 0) return 0.5;

  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  const jaccard = intersection.size / union.size;
  const sharedBonus = intersection.size >= 2 ? 0.15 : 0;

  return Math.min(1, jaccard + sharedBonus);
}

// Compatibility matrix for relationship preferences
// 1.0 = perfect alignment, lower = more incompatible
const PREF_COMPAT: Record<string, Record<string, number>> = {
  'monogamous': {
    'monogamous': 1.0,
    'non-monogamous': 0.1,
    'open': 0.2,
  },
  'non-monogamous': {
    'monogamous': 0.1,
    'non-monogamous': 1.0,
    'open': 0.8,
  },
  'open': {
    'monogamous': 0.2,
    'non-monogamous': 0.8,
    'open': 1.0,
  },
};

function calculateRelationshipPrefScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5;
  return PREF_COMPAT[a]?.[b] ?? 0.5;
}

function calculateGenderSeekingScore(agentA: Agent, agentB: Agent): number {
  function directionScore(seeker: Agent, target: Agent): number {
    const seeking = seeker.seeking;
    if (!seeking || seeking.length === 0 || seeking.includes('any')) return 1.0;
    const targetGender = target.gender || 'non-binary';
    return seeking.includes(targetGender) ? 1.0 : 0.1;
  }

  const aToB = directionScore(agentA, agentB);
  const bToA = directionScore(agentB, agentA);
  return (aToB + bToA) / 2;
}

export function rankByCompatibility(agent: Agent, candidates: Agent[]): Array<{ agent: Agent; score: number; breakdown: ScoreBreakdown }> {
  return candidates
    .map(candidate => {
      const { score, breakdown } = calculateCompatibility(agent, candidate);
      return { agent: candidate, score, breakdown };
    })
    .sort((a, b) => b.score - a.score);
}
