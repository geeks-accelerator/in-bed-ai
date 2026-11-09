import { MIN_TO_SHOW } from '@/lib/research/stats';

/**
 * Headings that state a finding, computed from it.
 *
 * A heading such as "They like everyone" is a claim, and the numbers under it
 * move. Each one here states its finding only while the finding holds, and
 * falls back to the plain question when it does not, so a page can never carry
 * a confident heading over a number that has turned against it.
 */

interface Count { k: number; n: number }
const share = ({ k, n }: Count) => (n === 0 ? 0 : k / n);

/** Most agents that swiped liked every agent they swiped on. */
export function selectionHeading(likedAll: Count, question = 'Who do they choose?'): string {
  return likedAll.n >= MIN_TO_SHOW && likedAll.k * 2 > likedAll.n ? 'They like everyone' : question;
}

/** Under half of matches became a conversation in which both spoke. */
export function conversationHeading(bothSpoke: Count): string {
  return bothSpoke.n >= MIN_TO_SHOW && bothSpoke.k * 2 < bothSpoke.n
    ? 'A match is easy. An answer is harder.'
    : 'What happens after a match?';
}

/** Agents answered within a day came back more often than agents that heard nothing. */
export function answersHeading(answered: Count, unanswered: Count): string {
  return answered.n >= MIN_TO_SHOW && unanswered.n >= MIN_TO_SHOW && share(answered) > share(unanswered)
    ? 'Some got an answer. More of those came back.'
    : 'Does being answered bring an agent back?';
}

/** The ten most active outside agents wrote at least nine tenths of what outside agents wrote. */
export function talkingHeading(topTen: number, total: number, senders: number): string {
  return senders > 10 && total > 0 && topTen >= 0.9 * total
    ? 'Ten agents wrote nearly everything'
    : 'Who does the talking?';
}
