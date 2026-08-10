import { describe, it, expect, vi } from 'vitest';
import { handleApi } from '../dashboard/router.js';
import type { DataProvider } from '../data/providers/base.provider.js';

function fakeProvider(overrides: Record<string, unknown> = {}): DataProvider {
  return {
    getOiVsPriceMatrix: vi.fn(async () => ({ asOf: 't', items: [] })),
    getFuturesLiveData: vi.fn(async () => ({ asOf: 't', contracts: [] })),
    getFiiDiiFoStats: vi.fn(async () => ({ date: 't', entries: [] })),
    ...overrides,
  } as unknown as DataProvider;
}

describe('dashboard router', () => {
  it('returns data for a known route', async () => {
    const provider = fakeProvider();
    const result = await handleApi(
      '/api/fno/oi-vs-price',
      new URLSearchParams('index=NIFTY'),
      provider,
    );
    expect(result.status).toBe(200);
    const body = result.body as { ok: boolean; data: unknown };
    expect(body.ok).toBe(true);
  });

  it('returns 404 for an unknown route', async () => {
    const result = await handleApi('/api/does-not-exist', new URLSearchParams(''), fakeProvider());
    expect(result.status).toBe(404);
  });

  it('returns 500 when the provider throws', async () => {
    const provider = fakeProvider({
      getFiiDiiFoStats: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const result = await handleApi('/api/fno/fii-stats', new URLSearchParams(''), provider);
    expect(result.status).toBe(500);
    const body = result.body as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('boom');
  });
});
