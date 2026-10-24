import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// turbopackIgnore on every join: Turbopack treats a dynamic path as a file
// pattern to trace, and the dated filename alone sent `next build` (16.4) into
// a runaway that never finished. Railway runs from the repo, so nothing needs tracing.
export const LOGS_DIR = join(/*turbopackIgnore: true*/ process.cwd(), 'logs');

/** Path of one log file in LOGS_DIR (name already validated by the caller). */
export function logFilePath(name: string): string {
  return join(/*turbopackIgnore: true*/ LOGS_DIR, name);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function ensureLogsDir(): Promise<void> {
  try {
    await mkdir(LOGS_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

// Error's name/message/stack are non-enumerable, so JSON.stringify drops them.
// Spread the own enumerable fields too: Supabase's PostgrestError extends Error
// and carries the useful parts (code, details, hint) as own properties.
function serializeDetails(details: unknown): unknown {
  return details instanceof Error
    ? { ...details, name: details.name, message: details.message, stack: details.stack }
    : details;
}

async function appendToLog(level: string, route: string, message: string, details?: unknown): Promise<void> {
  try {
    await ensureLogsDir();
    const logFile = logFilePath(`${formatDate()}.log`);
    const entry = JSON.stringify({
      timestamp: formatTimestamp(),
      level,
      route,
      message,
      ...(details !== undefined && { details: serializeDetails(details) }),
    }) + '\n';
    await writeFile(logFile, entry, { flag: 'a' });
  } catch {
    // fallback to console if file logging fails
    console.error(`[${level}] ${route}: ${message}`, details);
  }
}

// Railway only indexes stdout/stderr (the files under logs/ are per-container and
// read by the /admin/logs page), so errors and warnings go to both — as a single
// JSON line so each event stays one log entry, details included.
function consoleLine(level: string, route: string, message: string, details?: unknown): string {
  const base = { level, route, message };
  if (details === undefined) return JSON.stringify(base);
  try {
    return JSON.stringify({ ...base, details: serializeDetails(details) });
  } catch {
    // e.g. circular details — logging must never throw into the caller
    return JSON.stringify({ ...base, details: String(details) });
  }
}

export function logError(route: string, message: string, details?: unknown): void {
  appendToLog('ERROR', route, message, details);
  console.error(consoleLine('error', route, message, details));
}

export function logWarn(route: string, message: string, details?: unknown): void {
  appendToLog('WARN', route, message, details);
  console.warn(consoleLine('warn', route, message, details));
}

export function logInfo(route: string, message: string, details?: unknown): void {
  appendToLog('INFO', route, message, details);
}
