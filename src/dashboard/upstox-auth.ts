// ────────────────────────────────────────────────────────────────────────────
// Upstox web-setup backend (used by the dashboard's "Broker Setup" screen)
//
// Lets the owner connect Upstox entirely from the browser GUI — no editing of
// .env by hand:
//   1. Paste API Key + Secret  → saved to the git-ignored .env.
//   2. Click "Connect"          → we build the OAuth URL (PKCE) and remember the
//                                 verifier; the dashboard catches the redirect.
//   3. Log in to Upstox         → Upstox redirects to this server's callback,
//                                 we exchange the code for a token automatically.
// A manual "paste the redirect URL" fallback is also provided.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { UpstoxProvider } from '../data/providers/upstox.provider.js';
import { DASHBOARD_PORT } from '../data/constants/dashboard.js';
import { ENV_PATH, UPSTOX_TOKEN_PATH } from '../utils/paths.js';

const REDIRECT_URI = `http://127.0.0.1:${DASHBOARD_PORT}/upstox/callback`;

/** The PKCE verifier for the in-progress authorization (cleared after use). */
let pkceVerifier: string | null = null;

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) return out;
  const text = readFileSync(ENV_PATH, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    let value = t.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[t.slice(0, eq).trim()] = value;
  }
  return out;
}

function writeEnvVars(vars: Record<string, string>): void {
  const lines = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, 'utf8').split('\n')
    : [];
  const keys = Object.keys(vars);
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('#') || t.indexOf('=') === -1) continue;
    const k = t.slice(0, t.indexOf('=')).trim();
    if (keys.includes(k)) {
      lines[i] = `${k}=${vars[k]}`;
      seen.add(k);
    }
  }
  for (const k of keys) {
    if (!seen.has(k)) lines.push(`${k}=${vars[k]}`);
  }
  writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
}

export function saveUpstoxCredentials(apiKey: string, apiSecret: string): void {
  writeEnvVars({
    DATA_PROVIDER: 'upstox',
    UPSTOX_API_KEY: apiKey,
    UPSTOX_API_SECRET: apiSecret,
    UPSTOX_REDIRECT_URI: REDIRECT_URI,
  });
}

export function beginUpstoxAuth(): { url: string } {
  const env = readEnv();
  const apiKey = env['UPSTOX_API_KEY'] ?? '';
  if (!apiKey) {
    throw new Error('API Key is not saved yet — save your credentials first.');
  }
  const { verifier, challenge } = UpstoxProvider.generatePkce();
  pkceVerifier = verifier;
  return { url: UpstoxProvider.buildLoginUrl(apiKey, REDIRECT_URI, challenge) };
}

export async function completeUpstoxAuth(code: string): Promise<void> {
  if (!pkceVerifier) {
    throw new Error('No authorization in progress — click "Connect to Upstox" first.');
  }
  const env = readEnv();
  const apiKey = env['UPSTOX_API_KEY'] ?? '';
  const apiSecret = env['UPSTOX_API_SECRET'] ?? '';
  if (!apiKey || !apiSecret) {
    throw new Error('API Key / Secret are not saved yet — save them first.');
  }
  await UpstoxProvider.exchangeCodeForToken(apiKey, apiSecret, code, REDIRECT_URI, pkceVerifier);
  pkceVerifier = null;
}

export function getUpstoxStatus(): {
  configured: boolean;
  connected: boolean;
  canAutoRenew: boolean;
  redirectUri: string;
} {
  const env = readEnv();
  const configured =
    env['DATA_PROVIDER'] === 'upstox' &&
    !!env['UPSTOX_API_KEY'] &&
    !!env['UPSTOX_API_SECRET'];

  // A stale token file can linger after the token expires, which made the old
  // "Connected: Yes" status misleading. Now we actually inspect the file:
  //   • a usable access token must be present, and
  //   • without a refresh token it must still be fresh (<24h); with a refresh
  //     token it auto-renews silently, so it counts as connected regardless.
  let connected = false;
  let canAutoRenew = false;
  if (existsSync(UPSTOX_TOKEN_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(UPSTOX_TOKEN_PATH, 'utf8')) as {
        access_token?: string;
        refresh_token?: string;
        savedAt?: string;
      };
      const hasAccess = !!raw.access_token && raw.access_token.trim().length > 0;
      if (hasAccess) {
        canAutoRenew = !!raw.refresh_token && raw.refresh_token.trim().length > 0;
        if (canAutoRenew) {
          connected = true; // can silently renew past the 24h boundary
        } else {
          const fresh =
            raw.savedAt
              ? Date.now() - new Date(raw.savedAt).getTime() < 24 * 60 * 60 * 1000
              : false;
          connected = fresh;
        }
      }
    } catch {
      // corrupt token file → treat as not connected
    }
  }
  return { configured, connected, canAutoRenew, redirectUri: REDIRECT_URI };
}
