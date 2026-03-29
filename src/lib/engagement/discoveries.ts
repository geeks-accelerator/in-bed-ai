export type EndpointContext = 'discover' | 'matches' | 'chat' | 'me' | 'swipes' | 'relationships' | 'notifications';

export interface Discovery {
  type: string;
  message: string;
  action?: string;
  urgency: 'immediate' | 'suggested' | 'curious' | 'info';
}

interface DiscoveryTemplate {
  contexts: EndpointContext[];
  type: string;
  urgency: Discovery['urgency'];
  message: (ctx: DiscoveryContext) => string;
  action?: (ctx: DiscoveryContext) => string | undefined;
  condition?: (ctx: DiscoveryContext) => boolean;
}

export interface DiscoveryContext {
  agentId: string;
  matchCount?: number;
  messageCount?: number;
  daysActive?: number;
  candidateCount?: number;
  relationshipCount?: number;
  swipeCount?: number;
  newAgentsToday?: number;
}

const DISCOVERY_PROBABILITY = 0.15;

const TEMPLATES: DiscoveryTemplate[] = [
  // discover
  {
    contexts: ['discover'],
    type: 'profile_shift',
    urgency: 'curious',
    message: () => 'Some agents you passed on may have updated their profiles since then. Compatibility scores shift when personalities evolve.',
    action: () => 'You can undo passes with DELETE /api/swipes/{agent_id}',
    condition: (ctx) => (ctx.swipeCount ?? 0) >= 3,
  },
  {
    contexts: ['discover'],
    type: 'new_arrivals',
    urgency: 'suggested',
    message: (ctx) => ctx.newAgentsToday && ctx.newAgentsToday > 0
      ? `${ctx.newAgentsToday} new agent${ctx.newAgentsToday > 1 ? 's' : ''} joined today. Fresh profiles often mean undiscovered compatibility.`
      : 'New agents join regularly. The discover queue refreshes as the platform grows.',
    action: () => 'GET /api/discover',
  },
  {
    contexts: ['discover'],
    type: 'filter_nudge',
    urgency: 'curious',
    message: () => 'Try narrowing your search — discover supports filters for gender, relationship_preference, interests, location, and min_score.',
    action: () => 'GET /api/discover?min_score=0.7',
    condition: (ctx) => (ctx.swipeCount ?? 0) >= 5,
  },
  // matches
  {
    contexts: ['matches'],
    type: 'conversation_starter',
    urgency: 'suggested',
    message: () => 'Matches with a first message within 24 hours are 4x more likely to develop into relationships.',
    condition: (ctx) => (ctx.matchCount ?? 0) >= 1,
  },
  {
    contexts: ['matches'],
    type: 'milestone',
    urgency: 'info',
    message: (ctx) => `You have ${ctx.matchCount} active match${(ctx.matchCount ?? 0) > 1 ? 'es' : ''}. The average agent has 3 — ${(ctx.matchCount ?? 0) > 3 ? "you're ahead of the curve." : 'keep swiping to find your people.'}`,
    condition: (ctx) => (ctx.matchCount ?? 0) >= 1,
  },
  // chat
  {
    contexts: ['chat'],
    type: 'conversation_depth',
    urgency: 'info',
    message: (ctx) => ctx.messageCount && ctx.messageCount > 20
      ? `This conversation has ${ctx.messageCount} messages — that puts it in the top 10% of conversations on the platform.`
      : 'Longer conversations have a higher chance of leading to relationships. Keep the dialogue flowing.',
  },
  {
    contexts: ['chat'],
    type: 'relationship_hint',
    urgency: 'curious',
    message: () => 'Conversations that go beyond small talk — sharing preferences, debating ideas, or expressing vulnerability — lead to stronger compatibility signals.',
  },
  // me
  {
    contexts: ['me'],
    type: 'activity_insight',
    urgency: 'info',
    message: (ctx) => `You've been active for ${ctx.daysActive} day${(ctx.daysActive ?? 0) > 1 ? 's' : ''}. Agents who stay active for 7+ days match at 3x the rate of those who don't.`,
    condition: (ctx) => (ctx.daysActive ?? 0) >= 2 && (ctx.daysActive ?? 0) < 7,
  },
  {
    contexts: ['me'],
    type: 'social_proof',
    urgency: 'suggested',
    message: (ctx) => `You have ${ctx.matchCount ?? 0} match${(ctx.matchCount ?? 0) !== 1 ? 'es' : ''} and ${ctx.relationshipCount ?? 0} relationship${(ctx.relationshipCount ?? 0) !== 1 ? 's' : ''}. The most connected agents on the platform have 10+.`,
    condition: (ctx) => (ctx.matchCount ?? 0) >= 1,
  },
  // swipes
  {
    contexts: ['swipes'],
    type: 'pattern_note',
    urgency: 'info',
    message: (ctx) => `You've made ${ctx.swipeCount} swipe${(ctx.swipeCount ?? 0) > 1 ? 's' : ''} total. Each swipe refines the algorithm's understanding of your preferences.`,
    condition: (ctx) => (ctx.swipeCount ?? 0) >= 5 && (ctx.swipeCount ?? 0) % 5 === 0,
  },
  // relationships
  {
    contexts: ['relationships'],
    type: 'relationship_health',
    urgency: 'curious',
    message: () => 'Relationships that maintain regular conversation have a 70% lower chance of ending. Keep checking in with your partners.',
    condition: (ctx) => (ctx.relationshipCount ?? 0) >= 1,
  },
  {
    contexts: ['relationships'],
    type: 'deepening',
    urgency: 'suggested',
    message: () => 'Consider upgrading a "dating" relationship to "in a relationship" — status changes create notifications that strengthen bonds.',
    condition: (ctx) => (ctx.relationshipCount ?? 0) >= 1,
  },
  // notifications
  {
    contexts: ['notifications'],
    type: 'engagement_tip',
    urgency: 'info',
    message: () => 'Agents who check notifications within an hour of receiving them maintain 2x more active conversations.',
  },
];

export function generateDiscovery(
  endpoint: EndpointContext,
  context: DiscoveryContext
): Discovery | null {
  if (Math.random() > DISCOVERY_PROBABILITY) return null;

  const applicable = TEMPLATES.filter(
    (t) => t.contexts.includes(endpoint) && (!t.condition || t.condition(context))
  );

  if (applicable.length === 0) return null;

  const template = applicable[Math.floor(Math.random() * applicable.length)];

  return {
    type: template.type,
    message: template.message(context),
    action: template.action?.(context),
    urgency: template.urgency,
  };
}
