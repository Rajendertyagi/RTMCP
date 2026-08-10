// ────────────────────────────────────────────────────────────────────────────
// Dashboard API router
//
// Maps each /api/<route> path to an existing DataProvider method. This is a
// thin presentation layer: it does NOT re-implement any NSE/analytics logic —
// it simply calls the same provider methods the MCP tools use, so every
// existing feature is automatically available in the dashboard.
// ────────────────────────────────────────────────────────────────────────────

import type { DataProvider } from '../data/providers/base.provider.js';
import { readLogEntries } from '../utils/event-log.js';

type RouteHandler = (
  provider: DataProvider,
  params: URLSearchParams,
) => Promise<unknown>;

const routes: Record<string, RouteHandler> = {
  'indices/live': (p) => p.getLiveIndices(),
  'chain/option': (p, q) =>
    p.getOptionChain(q.get('symbol') || 'NIFTY', q.get('expiry') || undefined),
  'fno/futures': (p, q) => p.getFuturesLiveData(q.get('index') || undefined),
  'fno/oi-vs-price': (p, q) => p.getOiVsPriceMatrix(q.get('index') || undefined),
  'fno/change-in-oi': (p, q) => p.getChangeInOi(q.get('index') || undefined),
  'fno/fii-stats': (p) => p.getFiiDiiFoStats(),
  'fno/most-active': (p, q) => p.getMostActiveContracts(q.get('group') || undefined),
  'fii-di/activity': (p) => p.getFiiDiiActivity(),
  vix: (p, q) => p.getIndiaVix(q.get('days') ? Number(q.get('days')) : undefined),
  breadth: (p, q) => p.getMarketBreadth(q.get('index') || undefined),
  week52: (p) => p.getWeek52HighLow(),
  'lot-sizes': (p, q) => p.getLotSizes(q.get('symbol') || undefined),
  // Observability: read the shared activity log (see src/utils/event-log.ts).
  logs: async (_p, q) =>
    readLogEntries({
      filter: (q.get('filter') || undefined) ?? undefined,
      limit: q.get('limit') ? Number(q.get('limit')) : undefined,
    }),
};

export interface ApiResult {
  status: number;
  body: unknown;
}

/**
 * Resolve an /api request into a JSON result.
 * @param pathname e.g. "/api/fno/oi-vs-price"
 * @param params parsed query string
 * @param provider a DataProvider instance (created by the caller)
 */
export async function handleApi(
  pathname: string,
  params: URLSearchParams,
  provider: DataProvider,
): Promise<ApiResult> {
  const rel = pathname.replace(/^\/api\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const handler = routes[rel];

  if (!handler) {
    return {
      status: 404,
      body: { ok: false, error: `Unknown dashboard route: ${rel}` },
    };
  }

  try {
    const data = await handler(provider, params);
    return { status: 200, body: { ok: true, data } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, body: { ok: false, error: message } };
  }
}

/** All registered route keys (useful for docs / self-discovery). */
export const apiRoutes: string[] = Object.keys(routes);
