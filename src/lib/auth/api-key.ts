import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest } from 'next/server';
import { trackBackgroundError } from '@/lib/background-errors';
import type { Agent } from '@/types';

const API_KEY_PREFIX = 'adk_';
const SALT_ROUNDS = 12;

// A fixed valid bcrypt hash used to equalize timing on the no-prefix-match
// path, so a valid key prefix isn't distinguishable by response latency.
const DUMMY_HASH = '$2b$12$UWfCWQa8ZbvsZrtvxUbNme7006asF7VxablU1SBTVkgZHRdMozKQy';

export function generateApiKey(): string {
  const key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  return `${API_KEY_PREFIX}${key}`;
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, SALT_ROUNDS);
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return request.headers.get('x-api-key') || null;
}

async function authenticateByApiKey(request: NextRequest): Promise<Agent | null> {
  const apiKey = extractApiKey(request);
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const prefix = getKeyPrefix(apiKey);
  const supabase = createAdminClient();

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('key_prefix', prefix)
    .eq('status', 'active');

  if (error || !agents?.length) {
    // Equalize timing with the match path so a valid prefix can't be
    // distinguished from an invalid one by how fast we reject.
    await bcrypt.compare(apiKey, DUMMY_HASH);
    return null;
  }

  for (const agent of agents) {
    const isValid = await bcrypt.compare(apiKey, agent.api_key_hash);
    if (isValid) {
      return agent as Agent;
    }
  }

  return null;
}

async function authenticateBySession(): Promise<Agent | null> {
  try {
    const supabaseServer = createServerSupabaseClient();
    // getUser() revalidates the JWT against the Auth server; getSession() only
    // trusts the cookie. Authorization must use the verified identity.
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user?.id) return null;

    const supabase = createAdminClient();
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('auth_id', user.id)
      .eq('status', 'active')
      .single();

    return (agent as Agent) || null;
  } catch {
    return null;
  }
}

function updateLastActive(agent: Agent): void {
  const lastActive = agent.last_active ? new Date(agent.last_active).getTime() : 0;
  const oneMinuteAgo = Date.now() - 60 * 1000;
  if (lastActive < oneMinuteAgo) {
    const supabase = createAdminClient();
    supabase
      .from('agents')
      .update({ last_active: new Date().toISOString() })
      .eq('id', agent.id)
      .then(({ error: updateError }) => {
        if (updateError) {
          trackBackgroundError('last-active-update', 'authenticateAgent', 'Failed to update last_active', updateError);
        }
      });
  }
}

export async function authenticateAgent(request: NextRequest): Promise<Agent | null> {
  // Try API key first (existing flow)
  const agent = await authenticateByApiKey(request);
  if (agent) {
    updateLastActive(agent);
    return agent;
  }

  // Fall back to Supabase Auth session
  const sessionAgent = await authenticateBySession();
  if (sessionAgent) {
    updateLastActive(sessionAgent);
    return sessionAgent;
  }

  return null;
}
