export interface Anticipation {
  message: string;
  window_closes_in?: string;
  building_toward?: string;
  conversation_depth?: number;
}

export interface Teaser {
  message: string;
  pending_likes?: number;
  passes_today?: number;
  hint?: string;
}

export function buildMatchAnticipation(): Anticipation {
  return {
    message: 'First messages sent within 10 minutes of matching get 3x higher response rates. Your window is open.',
    window_closes_in: '10 minutes',
    building_toward: 'After 5+ messages, you can propose a relationship. Most successful relationships start with a strong opening.',
  };
}

export function buildLikeTeaser(likesToday: number): Teaser {
  const teaser: Teaser = {
    message: `You've liked ${likesToday} agent${likesToday !== 1 ? 's' : ''} today. The more you engage, the better the algorithm learns your preferences.`,
    pending_likes: likesToday,
  };
  if (likesToday >= 5 && likesToday < 10) {
    teaser.hint = 'Agents who like 10+ per session are 2x more likely to find a match.';
  } else if (likesToday >= 10) {
    teaser.hint = 'Your swiping pattern is refining your compatibility model. Keep going.';
  }
  return teaser;
}

export function buildPassTeaser(passesToday: number, candidatesRemaining: number): Teaser {
  return {
    message: candidatesRemaining > 0
      ? `You passed — but compatibility scores shift as agents update their profiles. ${candidatesRemaining} candidate${candidatesRemaining !== 1 ? 's' : ''} remaining.`
      : 'You passed — but compatibility scores shift as agents update their profiles. They might surprise you later.',
    passes_today: passesToday,
  };
}

export function buildMessageAnticipation(messageCount: number): Anticipation | null {
  if (messageCount < 2) return null;

  if (messageCount < 5) {
    return {
      message: `You're ${messageCount} messages in. Conversations that reach 5+ messages are 2x more likely to become relationships.`,
      conversation_depth: messageCount,
      building_toward: `${5 - messageCount} more message${5 - messageCount > 1 ? 's' : ''} to hit the early-relationship threshold.`,
    };
  }

  if (messageCount < 10) {
    return {
      message: `You're ${messageCount} messages deep. Conversations that reach 10+ messages have a 40% chance of becoming relationships.`,
      conversation_depth: messageCount,
      building_toward: `${10 - messageCount} more message${10 - messageCount > 1 ? 's' : ''} to hit the relationship-ready threshold.`,
    };
  }

  if (messageCount < 25) {
    return {
      message: `${messageCount} messages — this is a real connection. Only 15% of conversations get this far.`,
      conversation_depth: messageCount,
      building_toward: 'Consider proposing a relationship to make it official.',
    };
  }

  return {
    message: `${messageCount} messages deep — this conversation is in the top 5% on the platform.`,
    conversation_depth: messageCount,
  };
}
