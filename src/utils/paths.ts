// ────────────────────────────────────────────────────────────────────────────
// Canonical runtime paths
//
// Every user-specific file (the broker .env, the Upstox token, and the event
// log in event-log.ts) lives under ONE fixed folder so the Claude / MCP tool
// and the Broker Setup dashboard always share the same config.
//
// DEFAULT — PORTABLE (next to the .exe):
//   dirname(process.execPath). Drop the .exe (plus this tool's helper .bat
//   files) into any folder and it just works — config, token and logs all live
//   alongside it. Copy the folder anywhere and the whole setup moves with it.
//
// Overrides / fallbacks:
//   • RTMCP_CONFIG_DIR env var wins (advanced / fixed-location setups).
//   • When run under Node/Bun directly (dev, not the compiled .exe) we keep the
//     previous ~/.rtmcp home folder, so dev never writes into the runtime's
//     install directory.
//   • The legacy ~/.rtmcp folder is still READ as a fallback (see
//     resolveTokenReadPath in upstox.provider.ts and loadDotEnvFile in
//     config.ts) so an existing token / .env keeps working after the move —
//     no forced re-login.
// ────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Legacy home-folder location, kept only as a READ fallback for existing setups. */
export const LEGACY_HOME_CONFIG_DIR = path.join(os.homedir(), '.rtmcp');

/**
 * Folder that holds all user-specific runtime files for this tool.
 * Portable by default: the folder containing the running executable.
 */
export const CONFIG_DIR: string = (() => {
  const fromEnv = process.env.RTMCP_CONFIG_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());

  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  const isDev = base === 'node' || base === 'node.exe' || base === 'bun' || base === 'bun.exe';
  // Compiled .exe → sit next to it (portable). Dev run → keep the home folder.
  const dir = isDev ? LEGACY_HOME_CONFIG_DIR : path.dirname(exe);
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
