// ────────────────────────────────────────────────────────────────────────────
// Dashboard HTTP server
//
// Starts a local web server (Node's built-in http — no extra dependency) that
// serves the embedded frontend and proxies /api/* calls to the provider. Runs
// only when the executable is launched with --dashboard (or --web).
// ────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createDataProvider } from '../data/provider-factory.js';
import { handleApi } from './router.js';
import { DASHBOARD_HOST, DASHBOARD_PORT, DASHBOARD_URL } from '../data/constants/dashboard.js';
import { findPidOnPort, freePortIfHeld } from './process-manager.js';
import { INDEX_HTML, APP_JS, STYLES_CSS } from './assets.js';
import { logRequest, logError, logInfo } from '../utils/event-log.js';
import type { DataProvider } from '../data/providers/base.provider.js';
import {
  saveUpstoxCredentials,
  beginUpstoxAuth,
  completeUpstoxAuth,
  getUpstoxStatus,
} from './upstox-auth.js';

// ── Lazy provider initialization (mirrors the MCP server's ensureProvider) ──
// The provider must be initialized (Upstox token loaded, NSE fallback warmed)
// before any data route runs. We do it lazily + fire-and-forget so the server
// starts instantly and the first data request triggers the (slow) init.
// Without this, every /api data call runs on an uninitialized provider →
// Upstox returns 401 (no token) and the NSE fallback has no cookies → all
// dashboard views come back empty even though the UI itself loads fine.
// (Implementation lives inside startDashboard as ensureDashboardProviderInit.)

interface StaticAsset {
  body: string;
  type: string;
}

const STATIC: Record<string, StaticAsset> = {
  '/': { body: INDEX_HTML, type: 'text/html; charset=utf-8' },
  '/index.html': { body: INDEX_HTML, type: 'text/html; charset=utf-8' },
  '/app.js': { body: APP_JS, type: 'text/javascript; charset=utf-8' },
  '/styles.css': { body: STYLES_CSS, type: 'text/css; charset=utf-8' },
};

/** Read a request body as a string, with a small size cap. */
function readBody(req: http.IncomingMessage, limitBytes = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      data += chunk.toString();
      if (data.length > limitBytes) {
        aborted = true;
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!aborted) resolve(data);
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Small HTML page shown in the browser tab after the OAuth redirect. */
function callbackHtml(success: boolean, message: string): string {
  const color = success ? '#2ecc71' : '#e74c3c';
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" />
<title>Upstox Connection</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f1115;color:#e6e8ec;margin:0;
       display:flex;align-items:center;justify-content:center;height:100vh}
  .box{background:#171a21;border:1px solid #2a3038;border-radius:12px;padding:28px 36px;max-width:460px;text-align:center}
  h1{font-size:20px;margin:0 0 6px}
  .msg{color:${color};font-weight:600;margin-top:10px}
  .muted{color:#8b93a1;font-size:13px}
</style></head>
<body><div class="box">
  <h1>Upstox Connection</h1>
  <p class="msg">${safe}</p>
  <p class="muted">You can close this tab and return to the dashboard.</p>
</div></body></html>`;
}

async function handleUpstoxApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<void> {
  try {
    if (pathname === '/api/upstox/status' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, data: getUpstoxStatus() });
    }
    if (pathname === '/api/upstox/save' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        apiKey?: string;
        apiSecret?: string;
      };
      if (!body.apiKey || !body.apiSecret) {
        return sendJson(res, 400, { ok: false, error: 'apiKey and apiSecret are required' });
      }
      saveUpstoxCredentials(body.apiKey, body.apiSecret);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/upstox/connect' && req.method === 'GET') {
      const { url } = beginUpstoxAuth();
      return sendJson(res, 200, { ok: true, url });
    }
    if (pathname === '/api/upstox/exchange' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { code?: string };
      if (!body.code) return sendJson(res, 400, { ok: false, error: 'code is required' });
      await completeUpstoxAuth(body.code);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { ok: false, error: 'Unknown Upstox setup route' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}

async function handleCallback(res: http.ServerResponse, code: string | null): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (!code) {
    res.end(callbackHtml(false, 'No authorization code found in the redirect URL.'));
    return;
  }
  try {
    await completeUpstoxAuth(code);
    res.end(callbackHtml(true, 'Upstox connected successfully!'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.end(callbackHtml(false, 'Connection failed: ' + message));
  }
}

/** Start the local dashboard web server. Binds to localhost only. */
export async function startDashboard(): Promise<void> {
  // Take over the port from any stale instance so a fresh start can't fail with
  // "port in use" (the old copy is stopped automatically).
  await freePortIfHeld();

  const provider = createDataProvider();

  // Lazily initialize the provider (loads the Upstox token, warms NSE cookies)
  // so the server starts instantly and the first data request triggers init.
  let providerReady = false;
  let providerInit: Promise<void> | null = null;
  const ensureDashboardProviderInit = (): Promise<void> => {
    if (providerReady) return Promise.resolve();
    if (!providerInit) {
      providerInit = provider
        .initialize()
        .then(() => {
          providerReady = true;
          console.error('[Dashboard] Data provider initialized: ' + (provider as { name?: string }).name);
        })
        .catch((err) => {
          providerInit = null; // allow a retry on the next request
          console.error('[Dashboard] Provider init failed:', String(err));
          throw err;
        });
    }
    return providerInit;
  };
  // Warm in the background without blocking startup.
  ensureDashboardProviderInit().catch(() => undefined);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', DASHBOARD_URL);
      const pathname = url.pathname;

      // Upstox OAuth callback (renders an HTML page, not JSON).
      if (pathname === '/upstox/callback') {
        await handleCallback(res, url.searchParams.get('code'));
        return;
      }

      // Upstox web-setup API (save credentials / connect / exchange / status).
      if (pathname.startsWith('/api/upstox/')) {
        await handleUpstoxApi(req, res, pathname);
        return;
      }

      if (pathname.startsWith('/api/')) {
        // Log activity (skip the self-referential logs poll to avoid noise).
        if (pathname !== '/api/logs') {
          logRequest(`Dashboard request: ${pathname}`);
          // Ensure the provider is initialized before serving data (loads token,
          // warms NSE cookies). The /api/logs route doesn't need the provider.
          await ensureDashboardProviderInit();
        }
        const { status, body } = await handleApi(pathname, url.searchParams, provider);
        if (
          pathname !== '/api/logs' &&
          status >= 400 &&
          body &&
          typeof body === 'object' &&
          'error' in body
        ) {
          const msg = (body as { error?: string }).error ?? 'unknown error';
          logError(`Dashboard request failed (${status}): ${pathname} — ${msg}`);
        }
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
        return;
      }

      const asset = STATIC[pathname] ?? STATIC['/'];
      res.writeHead(200, { 'Content-Type': asset.type });
      res.end(asset.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const holder = findPidOnPort(DASHBOARD_PORT);
      console.error(
        '[Dashboard] Port ' +
          DASHBOARD_PORT +
          ' is still in use' +
          (holder ? ' by PID ' + holder : '') +
          '. Run: ' +
          process.execPath +
          ' restart   (or close that process).',
      );
      process.exit(1);
      return;
    }
    console.error('[Dashboard] Server error:', err.message);
    process.exit(1);
  });

  server.listen(DASHBOARD_PORT, DASHBOARD_HOST, () => {
    console.error('Dashboard running at ' + DASHBOARD_URL);
    logInfo('Dashboard server started at ' + DASHBOARD_URL);
    openInBrowser(DASHBOARD_URL);
  });
}

/** Best-effort: open the default browser to the dashboard URL. */
function openInBrowser(url: string): void {
  let cmd: string;
  let args: string[];
  if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Best-effort only; the user can open the URL manually.
  }
}
