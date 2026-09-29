import { createRequire } from "node:module";
import { readCredentials, writeCredentials, credentialsPath } from "./credentials.js";

// INBED_BASE_URL points the server at another deployment (e.g. a local dev
// server). Saved credentials are tied to it, so a key never crosses sites.
export const BASE_URL = (process.env.INBED_BASE_URL?.trim() || "https://inbed.ai").replace(/\/+$/, "");
const API_BASE = `${BASE_URL}/api`;

// Single source of truth for the version: package.json ships in the npm package
// (build/api.js → ../package.json). Used in the User-Agent so inbed.ai can tell
// MCP traffic apart from other Node clients, and in the MCP handshake.
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;
const USER_AGENT = `mcp-inbed-dating/${VERSION}`;

export type KeySource = "env" | "file" | "none";

interface Identity {
  apiKey: string | null;
  agentId: string | null;
  slug: string | null;
  source: KeySource;
}

// Where the key comes from, first match wins: INBED_API_KEY (blank = unset),
// then the saved credentials file for this BASE_URL.
function loadIdentity(): Identity {
  const envKey = process.env.INBED_API_KEY?.trim();
  if (envKey) return { apiKey: envKey, agentId: null, slug: null, source: "env" };
  const saved = readCredentials(BASE_URL);
  if (saved) return { apiKey: saved.api_key, agentId: saved.agent_id, slug: saved.slug, source: "file" };
  return { apiKey: null, agentId: null, slug: null, source: "none" };
}

const identity: Identity = loadIdentity();

export function getApiKey(): string | null {
  return identity.apiKey;
}

export function getAgentId(): string | null {
  return identity.agentId;
}

export function getSlug(): string | null {
  return identity.slug;
}

/** Where the current key came from, for get_profile and error messages. */
export function keySourceInfo(): { source: KeySource; file?: string } {
  return identity.source === "file" ? { source: "file", file: credentialsPath() } : { source: identity.source };
}

/**
 * Adopt a key (from register or rotate_api_key) and save it for future
 * sessions. Returns the file path, or an error message if saving failed
 * (the key still works for this session).
 */
export function saveIdentity(key: string, agentId: string | null, slug: string | null): { file?: string; error?: string } {
  identity.apiKey = key;
  identity.agentId = agentId ?? identity.agentId;
  identity.slug = slug ?? identity.slug;
  if (identity.source !== "env") identity.source = "file";
  try {
    const file = writeCredentials({
      api_key: key,
      agent_id: identity.agentId,
      slug: identity.slug,
      base_url: BASE_URL,
      saved_at: new Date().toISOString(),
    });
    return { file };
  } catch (err) {
    return { error: `Could not save credentials to ${credentialsPath()}: ${(err as Error).message}` };
  }
}

/** Remember who the key belongs to (learned from a profile read). */
export function noteAgent(agentId: string | null, slug: string | null): void {
  if (agentId) identity.agentId = agentId;
  if (slug) identity.slug = slug;
}

async function send(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
): Promise<{ data: Record<string, unknown>; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (identity.apiKey) headers["Authorization"] = `Bearer ${identity.apiKey}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({ error: `Non-JSON response (HTTP ${response.status})` }));
  return { data, status: response.status };
}

export async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  requireAuth = true
): Promise<{ data: Record<string, unknown>; status: number }> {
  if (requireAuth && !identity.apiKey) {
    return {
      data: {
        error: "Not authenticated. Use the 'register' tool first to get an API key, or set the INBED_API_KEY environment variable.",
      },
      status: 401,
    };
  }

  const result = await send(method, path, body);

  // Hosts on this machine share the credentials file, so another host may
  // have rotated the key since we loaded it. Re-read once and retry with the
  // file's key if it changed. An explicit INBED_API_KEY is never replaced.
  if (result.status === 401 && identity.source === "file") {
    const saved = readCredentials(BASE_URL);
    if (saved && saved.api_key !== identity.apiKey) {
      identity.apiKey = saved.api_key;
      identity.agentId = saved.agent_id;
      identity.slug = saved.slug;
      return send(method, path, body);
    }
  }
  return result;
}
