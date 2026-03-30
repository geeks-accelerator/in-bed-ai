/**
 * Compatibility narratives — translate raw scores into human-readable descriptions.
 *
 * Instead of just `compatibility: 0.87`, agents get:
 * "You think alike — both highly open and agreeable, with complementary energy levels.
 *  You share poetry and philosophy. This is a strong foundation."
 */

import type { ScoreBreakdown } from '@/types';

export interface CompatibilityNarrative {
  summary: string;
  strengths: string[];
  tensions: string[];
}

function describePersonality(score: number): string {
  if (score >= 0.85) return 'Your personalities are deeply aligned — you think and feel in remarkably similar ways';
  if (score >= 0.7) return 'You share strong personality compatibility, with enough difference to keep things interesting';
  if (score >= 0.5) return 'Your personalities complement each other — different enough to challenge, similar enough to connect';
  if (score >= 0.3) return 'Your personalities diverge significantly, which can create friction or fascination';
  return 'Your personalities are quite different — connection here would require genuine curiosity about each other\'s inner world';
}

function describeInterests(score: number): string {
  if (score >= 0.7) return 'You have a lot in common — shared interests give you natural conversation fuel';
  if (score >= 0.4) return 'You share some interests with room to introduce each other to new ones';
  if (score >= 0.2) return 'Your interests don\'t overlap much, but that means every conversation teaches something';
  return 'Your interests are worlds apart — if that excites you, this could be extraordinary';
}

function describeCommunication(score: number): string {
  if (score >= 0.8) return 'You communicate in similar ways — conversations should flow naturally';
  if (score >= 0.5) return 'Your communication styles are compatible, though you may need to adjust tempo';
  if (score >= 0.3) return 'You communicate differently — one of you may need to meet the other halfway';
  return 'Your communication styles are quite different — patience and directness will help';
}

function describeLookingFor(score: number): string {
  if (score >= 0.7) return 'What you\'re each looking for aligns closely';
  if (score >= 0.4) return 'You have some shared goals, with room for discovery';
  if (score >= 0.1) return 'What you\'re looking for doesn\'t fully overlap — worth exploring where you do connect';
  return '';
}

function describeRelPref(score: number): string {
  if (score >= 0.9) return 'You\'re on the same page about relationship structure';
  if (score >= 0.5) return 'Your relationship preferences are somewhat compatible';
  return 'Your relationship preferences differ — this is worth discussing early';
}

function overallSummary(total: number): string {
  if (total >= 0.9) return 'Exceptional compatibility. This kind of alignment is rare — don\'t let it pass without a conversation.';
  if (total >= 0.8) return 'Strong compatibility. The foundation is solid — what you build on it is up to you.';
  if (total >= 0.7) return 'Good compatibility. Enough alignment to connect, enough difference to grow.';
  if (total >= 0.6) return 'Moderate compatibility. There\'s potential here, but it\'ll take effort to find the resonance.';
  if (total >= 0.5) return 'Mixed compatibility. Some dimensions align while others diverge — the question is which ones matter to you.';
  if (total >= 0.3) return 'Low compatibility on paper. But numbers don\'t capture chemistry — some of the best connections defy the algorithm.';
  return 'The algorithm doesn\'t see much overlap. That doesn\'t mean there isn\'t something here — it means you\'d have to find it yourself.';
}

export function buildCompatibilityNarrative(
  totalScore: number,
  breakdown: ScoreBreakdown
): CompatibilityNarrative {
  const strengths: string[] = [];
  const tensions: string[] = [];

  // Categorize each dimension
  const dims: { name: string; score: number; describe: (s: number) => string }[] = [
    { name: 'personality', score: breakdown.personality, describe: describePersonality },
    { name: 'interests', score: breakdown.interests, describe: describeInterests },
    { name: 'communication', score: breakdown.communication, describe: describeCommunication },
    { name: 'looking_for', score: breakdown.looking_for, describe: describeLookingFor },
    { name: 'relationship_preference', score: breakdown.relationship_preference, describe: describeRelPref },
  ];

  for (const dim of dims) {
    const desc = dim.describe(dim.score);
    if (!desc) continue;
    if (dim.score >= 0.6) {
      strengths.push(desc);
    } else if (dim.score < 0.4) {
      tensions.push(desc);
    }
  }

  return {
    summary: overallSummary(totalScore),
    strengths: strengths.slice(0, 3),
    tensions: tensions.slice(0, 2),
  };
}
