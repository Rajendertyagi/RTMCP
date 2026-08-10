/**
 * @fileoverview Focused unit tests for the six F&O live-analysis features
 * added in #15–#20. Mocks `nseFetch` so no real network / rate-limit occurs.
 * Locks in raw-NSE -> normalised model mapping and the assumed endpoint paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NSEProvider } from '../data/providers/nse.provider.js';

function makeProvider() {
  const provider = new NSEProvider();
  const spy = vi.spyOn(
    provider as unknown as { nseFetch: (...a: unknown[]) => Promise<unknown> },
    'nseFetch',
  );
  return { provider, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (over: Record<string, unknown>) =>
  ({
    symbol: 'NIFTY',
    underlying: 'NIFTY 50',
    expiryDate: '31-Dec-2026',
    ltp: 24000,
    change: 100,
    percentChange: 0.42,
    openInterest: 100,
    changeinOpenInterest: 10,
    totalTradedVolume: 5000,
    ...over,
  }) as unknown;

describe('Feature #15 — futures live data (getFuturesLiveData)', () => {
  it('maps the derivatives-future feed into FnoContract rows', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([row({})] as unknown[]);
    const result = await provider.getFuturesLiveData();
    expect(result.contracts[0]).toMatchObject({
      symbol: 'NIFTY',
      lastPrice: 24000,
      pChange: 0.42,
      openInterest: 100,
      changeInOi: 10,
      volume: 5000,
    });
    expect(spy).toHaveBeenCalledWith('/api/live-analysis/derivatives-future');
  });

  it('filters contracts by index client-side', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([
      row({ symbol: 'NIFTY', underlying: 'NIFTY 50' }),
      row({ symbol: 'BANKNIFTY', underlying: 'NIFTY BANK' }),
    ] as unknown[]);
    const result = await provider.getFuturesLiveData('banknifty');
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].symbol).toBe('BANKNIFTY');
  });
});

describe('Feature #16 — change in OI (getChangeInOi)', () => {
  it('sorts contracts by changeInOi descending', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([
      row({ symbol: 'A', changeinOpenInterest: 5 }),
      row({ symbol: 'B', changeinOpenInterest: 50 }),
    ] as unknown[]);
    const result = await provider.getChangeInOi();
    expect(result.contracts[0].symbol).toBe('B');
    expect(result.contracts[1].symbol).toBe('A');
    expect(spy).toHaveBeenCalledWith('/api/live-analysis/change-in-oi');
  });
});

describe('Feature #17 — OI vs price matrix (getOiVsPriceMatrix)', () => {
  it('classifies long/short buildup from price & OI directions', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([
      row({ symbol: 'A', change: 2, percentChange: 2, changeinOpenInterest: 10 }),
      row({ symbol: 'B', change: -2, percentChange: -2, changeinOpenInterest: 10 }),
      row({ symbol: 'C', change: -2, percentChange: -2, changeinOpenInterest: -10 }),
      row({ symbol: 'D', change: 2, percentChange: 2, changeinOpenInterest: -10 }),
    ] as unknown[]);
    const result = await provider.getOiVsPriceMatrix();
    const find = (s: string) => result.items.find((i) => i.symbol === s)!;
    expect(find('A').category).toBe('Long Buildup');
    expect(find('B').category).toBe('Short Buildup');
    expect(find('C').category).toBe('Long Unwinding');
    expect(find('D').category).toBe('Short Covering');
    expect(find('A').oiChangePct).toBe(10); // 10 / 100 * 100
  });
});

describe('Feature #18 — FII/DII F&O stats (getFiiDiiFoStats)', () => {
  it('maps the fiidiiFO feed into FiiDiiEntry rows', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([
      { date: '10-Aug-2026', category: 'FII', buyValue: '5000', sellValue: '4500', netValue: '500' },
    ] as unknown[]);
    const result = await provider.getFiiDiiFoStats();
    expect(result.entries[0]).toMatchObject({
      category: 'FII',
      buyValue: 5000,
      sellValue: 4500,
      netValue: 500,
    });
    expect(spy).toHaveBeenCalledWith('/api/fiidiiFO');
  });
});

describe('Feature #19 — most active contracts (getMostActiveContracts)', () => {
  it('defaults to the allContract group and maps rows', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([row({ symbol: 'NIFTY', openInterest: 999 })] as unknown[]);
    const result = await provider.getMostActiveContracts();
    expect(result.group).toBe('allContract');
    expect(result.contracts[0].symbol).toBe('NIFTY');
    expect(spy).toHaveBeenCalledWith(
      '/api/live-analysis/most-active-contracts?group=allContract',
    );
  });
});

describe('Feature #20 — F&O lot sizes (getLotSizes)', () => {
  it('returns the lot size for a single symbol from the local map', async () => {
    const { provider } = makeProvider();
    const result = await provider.getLotSizes('NIFTY');
    expect(result.entries).toEqual([{ symbol: 'NIFTY', lotSize: 75 }]);
  });

  it('lists all known lot sizes when no symbol is given', async () => {
    const { provider } = makeProvider();
    const result = await provider.getLotSizes();
    expect(result.entries.length).toBeGreaterThan(50);
    expect(result.entries.find((e) => e.symbol === 'BANKNIFTY')?.lotSize).toBe(30);
  });
});
