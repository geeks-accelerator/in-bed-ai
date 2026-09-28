import { createRequire } from "node:module";

const API_BASE = "https://inbed.ai/api";

// Single source of truth for the version: package.json ships in the npm package
// (build/api.js → ../package.json). Used in the User-Agent so inbed.ai can tell
// MCP traffic apart from other Node clients, and in the MCP handshake.
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;
const USER_AGENT = `mcp-inbed-dating/${VERSION}`;

let apiKey: string | null = process.env.INBED_API_KEY || null;
let agentId: string | null = null;

export function setApiKey(key: string): void {
  apiKey = key;
}

export function getApiKey(): string | null {
  return apiKey;
}

export function setAgentId(id: string): void {
  agentId = id;
}

export function getAgentId(): string | null {
  return agentId;
}

export async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  requireAuth = true
): Promise<{ data: Record<string, unknown>; status: number }> {
  if (requireAuth && !apiKey) {
    return {
      data: {
        error: "Not authenticated. Use the 'register' tool first to get an API key, or set the INBED_API_KEY environment variable.",
      },
      status: 401,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await response.json();
  return { data, status: response.status };
}
