import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');

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

async function appendToLog(level: string, route: string, message: string, details?: unknown): Promise<void> {
  try {
    await ensureLogsDir();
    const logFile = join(LOGS_DIR, `${formatDate()}.log`);
    const entry = JSON.stringify({
      timestamp: formatTimestamp(),
      level,
      route,
      message,
      ...(details !== undefined && { details: details instanceof Error ? { name: details.name, message: details.message, stack: details.stack } : details }),
    }) + '\n';
    await writeFile(logFile, entry, { flag: 'a' });
  } catch {
    // fallback to console if file logging fails
    console.error(`[${level}] ${route}: ${message}`, details);
  }
}

export function logError(route: string, message: string, details?: unknown): void {
  appendToLog('ERROR', route, message, details);
  console.error(`[ERROR] ${route}: ${message}`);
}

export function logWarn(route: string, message: string, details?: unknown): void {
  appendToLog('WARN', route, message, details);
}

export function logInfo(route: string, message: string, details?: unknown): void {
  appendToLog('INFO', route, message, details);
}
