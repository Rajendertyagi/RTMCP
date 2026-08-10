#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Upstox one-time login helper
//
// Usage:
//   1. Put UPSTOX_API_KEY and UPSTOX_API_SECRET in your .env file (git-ignored).
//   2. Register the redirect URI below in your Upstox app (Developer Console).
//   3. Run:  node scripts/upstox-login.mjs
//   4. Open the printed URL, log in, and copy the `code` from the redirect.
//   5. Paste the code here. The token is saved to .upstox-token.json.
//
// Tokens last ~24h — re-run this daily (or whenever the tool reports an
// expired token) to refresh.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const UPSTOX_BASE = 'https://api.upstox.com/v2';
const DEFAULT_REDIRECT_URI = 'https://127.0.0.1/upstox-callback';

// ── Tiny .env loader (mirrors src/config.ts, host env wins) ─────────────────
function loadDotEnv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function main() {
  loadDotEnv();

  const apiKey = process.env['UPSTOX_API_KEY'];
  const apiSecret = process.env['UPSTOX_API_SECRET'];
  const redirectUri = process.env['UPSTOX_REDIRECT_URI'] || DEFAULT_REDIRECT_URI;

  if (!apiKey || !apiSecret) {
    fail(
      'UPSTOX_API_KEY / UPSTOX_API_SECRET not found.\n' +
        'Add them to your .env file (git-ignored), e.g.:\n' +
        '  UPSTOX_API_KEY=your_key\n' +
        '  UPSTOX_API_SECRET=your_secret',
    );
  }

  const authUrl =
    `${UPSTOX_BASE}/login/authorization/dialog?` +
    new URLSearchParams({
      client_id: apiKey,
      redirect_uri: redirectUri,
      response_type: 'code',
    }).toString();

  console.log('\n🔐 Step 1 — open this URL in your browser and log in to Upstox:');
  console.log(`\n  ${authUrl}\n`);
  console.log(
    `   (Make sure "${redirectUri}" is registered as a Redirect URI in your Upstox app.)\n`,
  );
  console.log(
    '   After login, the browser will try to open a page that may not load —\n' +
      '   that is fine. Copy the full URL from the address bar; the part after\n' +
      '   "?code=" is your authorization code.\n',
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const codeUrl = (await rl.question('Paste the full redirect URL (or just the code): ')).trim();
  rl.close();

  // Accept either the full redirect URL or a bare code.
  let code = codeUrl;
  const match = codeUrl.match(/[?&]code=([^&]+)/);
  if (match) code = decodeURIComponent(match[1]);

  if (!code) fail('No authorization code found. Please paste the redirect URL or code.');

  console.log('\n🔄 Step 2 — exchanging code for an access token …');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: apiKey,
    client_secret: apiSecret,
    redirect_uri: redirectUri,
    code_verifier: '',
  });

  let json;
  try {
    const res = await fetch(`${UPSTOX_BASE}/login/authorization/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      fail(
        `Token exchange failed (${res.status}): ${json.error ?? ''} ${
          json.error_description ?? ''
        }`.trim(),
      );
    }
  } catch (err) {
    fail(`Network error during token exchange: ${String(err)}`);
  }

  const outPath = join(process.cwd(), '.upstox-token.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      { access_token: json.access_token, savedAt: new Date().toISOString() },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\n✅ Token saved to ${outPath}`);
  console.log('   Now set DATA_PROVIDER=upstox in your .env (or Claude Desktop env)');
  console.log('   and (re)start the server. Re-run this script daily to refresh.\n');
}

main().catch((err) => fail(String(err)));
