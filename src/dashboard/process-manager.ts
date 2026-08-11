// ────────────────────────────────────────────────────────────────────────────
// Process manager — lets the app stop / restart / report its own dashboard
// server without the owner ever opening Task Manager.
//
// The dashboard is a single localhost web server on DASHBOARD_PORT. If an old
// copy is still running (e.g. you double-clicked the .exe twice), it holds the
// port and the new copy fails with "port in use". These helpers find that old
// process by the port it listens on and stop it — the same way Task Manager
// would, but automatic.
//
// Windows-only in production (the .exe is a Windows build), but the detection
// has a best-effort fallback for local dev on macOS/Linux.
// ────────────────────────────────────────────────────────────────────────────

import { spawn, spawnSync } from 'node:child_process';
import { DASHBOARD_PORT, DASHBOARD_URL } from '../data/constants/dashboard.js';

const PORT = DASHBOARD_PORT;

/** Run a command, returning stdout (or '' on any failure). Never throws. */
function safeExec(cmd: string, args: string[]): string {
  try {
    const res = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
    return res.stdout ?? '';
  } catch {
    return '';
  }
}

/**
 * Return the PID currently LISTENING on `port`, or 0 if none.
 * Windows uses `netstat -ano` (PID is the last column); other platforms use
 * `lsof` as a best-effort for local development.
 */
export function findPidOnPort(port: number): number {
  if (process.platform !== 'win32') {
    const out = safeExec('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN']);
    const pid = parseInt(out.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : 0;
  }

  const out = safeExec('netstat', ['-ano']);
  if (!out) return 0;
  for (const raw of out.split(/\r?\n/)) {
    if (!raw.includes(':' + port)) continue;
    if (!raw.toUpperCase().includes('LISTENING')) continue;
    const cols = raw.trim().split(/\s+/);
    const pid = parseInt(cols[cols.length - 1] ?? '', 10);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return 0;
}

/** Terminate a process (and its children). Returns true on success. */
function killProcess(pid: number): boolean {
  if (process.platform === 'win32') {
    const res = spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return res.status === 0;
  }
  const res = spawnSync('kill', ['-9', String(pid)], { encoding: 'utf8' });
  return res.status === 0;
}

/** True if a dashboard server is currently listening on the port. */
export function isServerRunning(): boolean {
  return findPidOnPort(PORT) > 0;
}

/**
 * Stop whatever is holding the dashboard port (the old instance). Returns true
 * if something was actually stopped.
 */
export function stopServer(): boolean {
  const pid = findPidOnPort(PORT);
  if (!pid) {
    console.error('RTMCP dashboard is not running on port ' + PORT + '.');
    return false;
  }
  const ok = killProcess(pid);
  console.error(
    ok
      ? 'Stopped the running RTMCP dashboard (PID ' + pid + ').'
      : 'Could not stop PID ' + pid + ' automatically — close it from Task Manager.',
  );
  return ok;
}

/**
 * Proactively free the port before we start listening, so a stale instance no
 * longer blocks a fresh start. Safe: only ever targets the process on our own
 * localhost port, never the Claude (stdio) connection.
 */
export async function freePortIfHeld(): Promise<void> {
  const pid = findPidOnPort(PORT);
  if (!pid) return;
  console.error(
    '[Dashboard] Port ' +
      PORT +
      ' is held by an old RTMCP instance (PID ' +
      pid +
      ') — stopping it so the new one can take over.',
  );
  killProcess(pid);
  // Give the OS a moment to release the socket before we bind.
  await new Promise((resolve) => setTimeout(resolve, 800));
}

/** Print whether the dashboard is running (used by the `status` command). */
export function printStatus(): void {
  const pid = findPidOnPort(PORT);
  if (pid) {
    console.error('RTMCP dashboard: RUNNING (PID ' + pid + ') → ' + DASHBOARD_URL);
  } else {
    console.error('RTMCP dashboard: NOT running.');
  }
}

/**
 * Kill the old instance and launch a fresh dashboard in its place. The parent
 * process exits; the new instance keeps running detached.
 */
export function restartServer(): void {
  stopServer();
  try {
    const child = spawn(process.execPath, ['--dashboard'], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => undefined);
    child.unref();
    console.error('Restarting — a fresh RTMCP dashboard is launching at ' + DASHBOARD_URL);
  } catch {
    console.error('Could not auto-launch. Start it manually: ' + process.execPath + ' --dashboard');
  }
  process.exit(0);
}
