// ────────────────────────────────────────────────────────────────────────────
// Shared, file-backed event logger
//
// A single lightweight sink used by BOTH runtime modes of this tool:
//   • the MCP (Claude) process  → logs "ai" (Claude called a tool) + network/nse errors
//   • the dashboard (web) process → logs "request" (the web page asked for data) + errors
//
// Both write to the SAME log file (next to the .exe, the portable config dir).
// The dashboard's /api/logs endpoint reads that file, so the Logs view can show
// activity from
// whichever mode(s) are running — including whether Claude is hitting the tool.
//
// Design notes:
//   • Entries are one JSON object per line (easy to read/tail, one filter pass).
//   • Writes are fire-and-forget and swallow errors, so logging can NEVER break
//     the tool's real work (data fetching, tool calls).
//   • Append within a process is serialised; cross-process safety relies on the
//     OS O_APPEND atomicity for small writes (fine for a personal, single-user tool).
// ────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from './paths.js';

export type LogCategory =
  | 'ai' // Claude (the AI) called a tool
  | 'request' // the web dashboard page asked the server for data
  | 'network' // a network-level failure (no response, timeout, DNS, reset)
  | 'nse' // NSE responded with an error/block/garbage
  | 'error' // any other unexpected error
  | 'info' // lifecycle / informational
  | 'debug'; // verbose success traces (hidden by default in the UI)

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  ts: string; // ISO timestamp
  level: LogLevel;
  category: LogCategory;
  message: string;
}

function resolveLogFile(): string {
  const fromEnv = process.env.LOG_FILE;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return path.join(CONFIG_DIR, 'rtmcp.log');
}

/** Absolute path of the shared log file (also surfaced in the UI/setup guide). */
export const LOG_FILE_PATH = resolveLogFile();

// Create the directory once at startup so the first append can't fail on a
// missing folder. Writes themselves still guard against later errors.
try {
  fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
} catch {
  // ignore — per-call write errors are swallowed anyway
}

// Serialise appends within this process so a single JSON line is never torn.
let writeChain: Promise<void> = Promise.resolve();

/**
 * Append a structured entry to the shared log file. Never throws.
 */
export function logEvent(category: LogCategory, level: LogLevel, message: string): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
  };
  const line = JSON.stringify(entry) + '\n';

  writeChain = writeChain
    .then(() => fs.promises.appendFile(LOG_FILE_PATH, line, 'utf8'))
    .catch(() => undefined);

  // Mirror to stderr so it is still visible in a terminal / Claude Desktop logs.
  // (stderr, never stdout — stdout is reserved for the MCP JSON-RPC stream.)
  if (level !== 'debug') {
    try {
      process.stderr.write(`[LOG:${category}] ${message}\n`);
    } catch {
      // ignore
    }
  }
}

/** Convenience helpers matching the category list. */
export const logAi = (m: string) => logEvent('ai', 'info', m);
export const logRequest = (m: string) => logEvent('request', 'info', m);
export const logNetwork = (m: string) => logEvent('network', 'error', m);
export const logNse = (m: string) => logEvent('nse', 'error', m);
export const logError = (m: string) => logEvent('error', 'error', m);
export const logInfo = (m: string) => logEvent('info', 'info', m);

export function getLogFilePath(): string {
  return LOG_FILE_PATH;
}

/**
 * Read the most recent log entries, newest last, optionally filtered.
 * @param filter  category name, or "error" to match any error-level entry.
 * @param limit   max entries to return (default 200).
 */
export async function readLogEntries(opts?: {
  filter?: string;
  limit?: number;
}): Promise<LogEntry[]> {
  const limit = opts?.limit && opts?.limit > 0 ? opts.limit : 200;

  let raw: string;
  try {
    raw = await fs.promises.readFile(LOG_FILE_PATH, 'utf8');
  } catch {
    return []; // no file yet → nothing has been logged
  }

  const out: LogEntry[] = [];
  const lines = raw.split('\n');
  for (const ln of lines) {
    const s = ln.trim();
    if (!s) continue;
    let entry: LogEntry;
    try {
      entry = JSON.parse(s) as LogEntry;
    } catch {
      continue; // skip malformed line
    }
    if (opts?.filter) {
      if (opts.filter === 'error') {
        if (entry.level !== 'error') continue;
      } else if (entry.category !== opts.filter) {
        continue;
      }
    }
    out.push(entry);
  }

  return out.slice(-limit);
}
