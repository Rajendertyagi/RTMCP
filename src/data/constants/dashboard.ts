// ────────────────────────────────────────────────────────────────────────────
// Dashboard constants
//
// Local web-dashboard settings. The dashboard runs as a separate mode of the
// same single executable (launched with --dashboard) and binds to localhost
// only, so it is never exposed to the network.
// ────────────────────────────────────────────────────────────────────────────

/** Host the dashboard HTTP server binds to. 127.0.0.1 = localhost only. */
export const DASHBOARD_HOST = '127.0.0.1';

/** Port the dashboard listens on. Change here if it clashes with another app. */
export const DASHBOARD_PORT = 8787;

/** Human-readable base URL printed when the dashboard starts. */
export const DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;
