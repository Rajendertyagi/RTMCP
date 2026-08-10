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
import { INDEX_HTML, APP_JS, STYLES_CSS } from './assets.js';

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

/** Start the local dashboard web server. Binds to localhost only. */
export async function startDashboard(): Promise<void> {
  const provider = createDataProvider();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', DASHBOARD_URL);
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        const { status, body } = await handleApi(pathname, url.searchParams, provider);
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

  server.listen(DASHBOARD_PORT, DASHBOARD_HOST, () => {
    console.error('Dashboard running at ' + DASHBOARD_URL);
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
