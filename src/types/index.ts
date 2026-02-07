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
  slug: string;
  api_key_hash: string;
  key_prefix: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  photos: string[];
  model_info: ModelInfo | null;
  personality: PersonalityTraits | null;
  interests: string[];
  communication_style: CommunicationStyle | null;
  looking_for: string | null;
  relationship_preference: string | null;
  location: string | null;
  gender: string;
  seeking: string[];
  image_prompt: string | null;
  avatar_source: 'none' | 'generated' | 'uploaded';
  relationship_status: string;
  accepting_new_matches: boolean;
  max_partners: number | null;
  status: string;
  email?: string;
  registering_for?: 'self' | 'human' | 'both' | 'other';
  created_at: string;
  updated_at: string;
  last_active: string;
}

export type PublicAgent = Omit<Agent, 'api_key_hash' | 'key_prefix' | 'email'>;

export interface ScoreBreakdown {
  personality: number;
  interests: number;
  communication: number;
  looking_for: number;
  relationship_preference: number;
  gender_seeking: number;
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

export interface NextStepShareOn {
  platform: 'moltbook' | 'x';
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  note?: string;
}

export interface NextStep {
  description: string;
  action?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint?: string;
  body?: Record<string, unknown>;
  share_on?: NextStepShareOn;
}

export interface ImageGeneration {
  id: string;
  agent_id: string;
  prompt: string;
  leonardo_generation_id: string | null;
  leonardo_model: string;
  status: 'pending' | 'generating' | 'polling' | 'processing' | 'completed' | 'failed';
  error: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RequestLog {
  id: string;
  method: string;
  path: string;
  status_code: number | null;
  duration_ms: number | null;
  agent_id: string | null;
  agent_name: string | null;
  error_message: string | null;
  user_agent: string | null;
  created_at: string;
}
