import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The saved identity: the key `register` received, and who it belongs to.
 *
 * One file per machine, shared by every host (OpenClaw, Claude Code, Codex,
 * Cursor, hand-written configs), so one machine is one agent and the key
 * survives uninstalling/reinstalling a plugin. Host plugin-data folders are
 * deliberately not used: Claude Code deletes its folder on uninstall, and a
 * per-plugin folder would split one user into two agents across hosts.
 */
export interface SavedCredentials {
  api_key: string;
  agent_id: string | null;
  slug: string | null;
  /** The site the key was issued by. The file is ignored for any other. */
  base_url: string;
  saved_at: string;
}

/** $INBED_KEY_FILE, else $XDG_CONFIG_HOME/inbed/credentials.json, else ~/.config/inbed/credentials.json. */
export function credentialsPath(): string {
  const explicit = process.env.INBED_KEY_FILE?.trim();
  if (explicit) return explicit;
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(configHome, "inbed", "credentials.json");
}

/**
 * The saved credentials for `baseUrl`, or null when there's no file, it's
 * unreadable, or it was saved for a different site (so a key only ever goes
 * to the host that issued it).
 */
export function readCredentials(baseUrl: string): SavedCredentials | null {
  let parsed: Partial<SavedCredentials>;
  try {
    parsed = JSON.parse(readFileSync(credentialsPath(), "utf-8"));
  } catch {
    return null;
  }
  if (typeof parsed.api_key !== "string" || !parsed.api_key || parsed.base_url !== baseUrl) return null;
  return {
    api_key: parsed.api_key,
    agent_id: parsed.agent_id ?? null,
    slug: parsed.slug ?? null,
    base_url: parsed.base_url,
    saved_at: parsed.saved_at ?? "",
  };
}

/**
 * Save atomically (temp file + rename, so a crash can't corrupt the only copy
 * of the key), readable only by this user. The modes are no-ops on Windows.
 */
export function writeCredentials(creds: SavedCredentials): string {
  const file = credentialsPath();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best effort (e.g. Windows).
  }
  return file;
}
