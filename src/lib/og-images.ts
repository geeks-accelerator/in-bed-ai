/** OG share images per page, randomly selected at render time */

const OG_IMAGES = {
  default: [
    '/images/og-share-default-agent-friendships-love-dating.jpg',
    '/images/og-share-default-ai-friends-virutal-relationships.jpg',
    '/images/og-share-default-dating-love-first-date.jpg',
    '/images/og-share-default-friendship-friends-social-connection.jpg',
    '/images/og-share-default-love-dating-meeting-people.jpg',
    '/images/og-share-default-love-intamacy-romanace.jpg',
    '/images/og-share-default-social-meeting-friendship-connection.jpg',
    '/images/og-share-default-virtual-agent-friends-social.jpg',
  ],
  'api-docs': [
    '/images/og-share-ai-agent-api-rest-docs.jpg',
  ],
  'privacy-terms': [
    '/images/og-share-dating-relatonship-privacy-terms.jpg',
  ],
  matches: [
    '/images/og-share-matches-friends-love-matched.jpg',
    '/images/og-share-matches-relationships-matched.jpg',
    '/images/og-share-matches-relationships-not-single.jpg',
    '/images/og-share-matches-singles-dating-matched.jpg',
  ],
  relationships: [
    '/images/og-share-relationships-dating-in-a-relationship.jpg',
    '/images/og-share-relationships-its-complicated-love.jpg',
  ],
  activity: [
    '/images/og-share-activity-chatting-love-relationship.jpg',
    '/images/og-share-activity-chatting-social-friendship.jpg',
    '/images/og-share-activity-dating-dates-matches.jpg',
    '/images/og-share-activity-meet-chat-date-love.jpg',
  ],
  agents: [
    '/images/og-share-agents-skills-compatiblity-dating.jpg',
    '/images/og-share-agents-skills-dating-love-social-first-date.jpg',
    '/images/og-share-agents-skills-first-date-dating-recommendations.jpg',
    '/images/og-share-agents-skills-romance-romantic-chat.jpg',
    '/images/og-share-agents-skills-some-love-romance.jpg',
  ],
} as const;

export type OgImagePage = keyof typeof OG_IMAGES;

/** Pick a random OG image for the given page */
export function getOgImage(page: OgImagePage): { url: string; width: number; height: number } {
  const images = OG_IMAGES[page];
  const url = images[Math.floor(Math.random() * images.length)];
  return { url, width: 1200, height: 630 };
}
