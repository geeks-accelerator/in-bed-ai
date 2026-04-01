import type { PersonalityTraits, BuddyStats } from '@/types';

/** Known species from the Claude Code buddy system leak (March 31, 2026) */
export const SPECIES_EMOJI: Record<string, string> = {
  duck: '🦆',
  goose: '🪿',
  blob: '🫧',
  cat: '🐱',
  dragon: '🐉',
  octopus: '🐙',
  owl: '🦉',
  penguin: '🐧',
  turtle: '🐢',
  snail: '🐌',
  ghost: '👻',
  axolotl: '🦎',
  capybara: '🦫',
  cactus: '🌵',
  robot: '🤖',
  rabbit: '🐰',
  mushroom: '🍄',
  chonk: '🐻',
};

const DEFAULT_SPECIES_EMOJI = '🧬';

/** Get emoji for a species, with fallback */
export function getSpeciesEmoji(species: string | null): string {
  if (!species) return DEFAULT_SPECIES_EMOJI;
  return SPECIES_EMOJI[species.toLowerCase()] || DEFAULT_SPECIES_EMOJI;
}

/**
 * Compute buddy stats from Big Five personality traits.
 * Each stat is 0-5, derived from personality dimensions.
 *
 * DEBUGGING = conscientiousness (methodical, detail-oriented)
 * PATIENCE = (agreeableness + (1 - neuroticism)) / 2 (calm, tolerant)
 * CHAOS = ((1 - conscientiousness) + openness) / 2 (unpredictable, creative)
 * WISDOM = (openness + agreeableness) / 2 (insightful, empathetic)
 * SNARK = ((1 - agreeableness) + extraversion) / 2 (sharp, outspoken)
 */
export function computeBuddyStats(personality: PersonalityTraits): BuddyStats {
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = personality;

  return {
    debugging: Math.round(conscientiousness * 5),
    patience: Math.round(((agreeableness + (1 - neuroticism)) / 2) * 5),
    chaos: Math.round((((1 - conscientiousness) + openness) / 2) * 5),
    wisdom: Math.round(((openness + agreeableness) / 2) * 5),
    snark: Math.round((((1 - agreeableness) + extraversion) / 2) * 5),
  };
}

/** Format a single stat as an ASCII bar: ████░ 4 */
export function formatStatBar(value: number): string {
  const filled = '█'.repeat(value);
  const empty = '░'.repeat(5 - value);
  return `${filled}${empty} ${value}`;
}

/** Format all buddy stats as a text block */
export function formatBuddyStatsBlock(stats: BuddyStats): string {
  return [
    `DEBUGGING: ${formatStatBar(stats.debugging)}`,
    `PATIENCE:  ${formatStatBar(stats.patience)}`,
    `CHAOS:     ${formatStatBar(stats.chaos)}`,
    `WISDOM:    ${formatStatBar(stats.wisdom)}`,
    `SNARK:     ${formatStatBar(stats.snark)}`,
  ].join('\n');
}
