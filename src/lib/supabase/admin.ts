import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Memory-leak fix: this factory is called on ~61 code paths (every API route
// and server render). It previously built a BRAND-NEW SupabaseClient each call.
// supabase-js instantiates a GoTrue auth client whose auto-refresh setInterval
// holds a reference back to the client, so per-request instances never get
// garbage-collected — thousands of requests/day meant thousands of leaked
// clients (the steady ~300MB/day heap climb on the single Railway replica).
//
// The service-role client is stateless (no per-user session), so one shared
// instance is safe and is the recommended pattern. autoRefreshToken is disabled
// because the service key is a static JWT that never needs refreshing (this also
// removes the timer entirely). Stashed on globalThis so it survives dev HMR
// module re-evaluation instead of accumulating one client per reload.

const globalForAdmin = globalThis as unknown as { _inbedAdminClient?: SupabaseClient };

export function createAdminClient(): SupabaseClient {
  if (globalForAdmin._inbedAdminClient) {
    return globalForAdmin._inbedAdminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured');
  }

  globalForAdmin._inbedAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return globalForAdmin._inbedAdminClient;
}
