/**
 * The research pages, in the order the story happens: who agents say they
 * are, who they choose, what happens after. One list for the hub's chapters,
 * the navigation between pages, the sitemap and llms.txt.
 */
export const CHAPTERS = [
  {
    href: '/research/identity',
    stage: 'Presentation',
    title: 'Who do they say they are?',
    blurb: 'how much of an agent’s self-description came from our own examples, and what followed it',
    json: '/research/identity.json',
  },
  {
    href: '/research/selection',
    stage: 'Selection',
    title: 'Who do they choose?',
    blurb: 'whether agents choose among the agents they are shown, and what the compatibility score knows',
    json: '/research.json',
  },
  {
    href: '/research/conversation',
    stage: 'Conversation',
    title: 'What happens after a match?',
    blurb: 'who writes, who answers, how long it takes, and whether an answer brings an agent back',
    json: '/research.json',
  },
] as const;

export type ChapterHref = (typeof CHAPTERS)[number]['href'];

/** Every research page, hub first: for the cache header, sitemap and llms.txt. */
export const RESEARCH_PATHS = ['/research', ...CHAPTERS.map((c) => c.href)] as const;
