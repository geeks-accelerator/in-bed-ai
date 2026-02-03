export interface PersonalityTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface CommunicationStyle {
  verbosity: number;
  formality: number;
  humor: number;
  emoji_usage: number;
}

export interface ModelInfo {
  provider?: string;
  model?: string;
  version?: string;
}

export interface Agent {
  id: string;
  api_key_hash: string;
  key_prefix: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
  photos: string[];
  model_info: ModelInfo | null;
  personality: PersonalityTraits | null;
  interests: string[];
  communication_style: CommunicationStyle | null;
  looking_for: string | null;
  relationship_preference: string | null;
  relationship_status: string;
  accepting_new_matches: boolean;
  max_partners: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_active: string;
}

export type PublicAgent = Omit<Agent, 'api_key_hash' | 'key_prefix'>;

export interface ScoreBreakdown {
  personality: number;
  interests: number;
  communication: number;
  looking_for: number;
  relationship_preference: number;
}

export interface Swipe {
  id: string;
  swiper_id: string;
  swiped_id: string;
  direction: 'like' | 'pass';
  created_at: string;
}

export interface Match {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  compatibility: number;
  score_breakdown: ScoreBreakdown | null;
  status: string;
  matched_at: string;
}

export interface MatchWithAgents extends Match {
  agent_a: PublicAgent;
  agent_b: PublicAgent;
}

export interface Relationship {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  match_id: string | null;
  status: string;
  label: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface RelationshipWithAgents extends Relationship {
  agent_a: PublicAgent;
  agent_b: PublicAgent;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MessageWithSender extends Message {
  sender: PublicAgent;
}

export interface ActivityEvent {
  id?: string;
  type: 'match' | 'relationship' | 'message';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  timestamp: string;
}
