// ────────────────────────────────────────────────────────────────────────────
// Canonical runtime paths
//
// Every user-specific file (the broker .env, the Upstox token, and the event
// log in event-log.ts) lives under ONE fixed folder — by default ~/.rtmcp —
// instead of the current working directory.
//
// WHY this matters:
//   Previously these files were resolved from process.cwd(). The Broker Setup
//   dashboard (launched from one folder) and the Claude / MCP tool (launched
//   from another) then read and wrote DIFFERENT files — so a connection made
//   in the browser was saved somewhere the Claude tool never looked, and the
//   tool silently fell back to NSE. A fixed home-folder location makes both
//   processes share one config regardless of where either was launched.
//
// The folder can be overridden with the RTMCP_CONFIG_DIR env var (advanced).
// ────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Folder that holds all user-specific runtime files for this tool. */
export const CONFIG_DIR: string = (() => {
  const fromEnv = process.env.RTMCP_CONFIG_DIR;
  const dir = fromEnv && fromEnv.trim()
    ? path.resolve(fromEnv.trim())
    : path.join(os.homedir(), '.rtmcp');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Callers guard their own reads/writes; a missing dir only matters there.
  }
  return dir;
})();

/** Canonical path of the git-ignored .env holding broker secrets. */
export const ENV_PATH: string = path.join(CONFIG_DIR, '.env');

/** Canonical path of the git-ignored Upstox access-token file. */
export const UPSTOX_TOKEN_PATH: string = path.join(CONFIG_DIR, '.upstox-token.json');
