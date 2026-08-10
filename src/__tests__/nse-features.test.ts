/**
 * @fileoverview Focused unit tests for the four market-breadth /
 * institutional-flow features added in features #11–#14.
 *
 * These tests mock the private `nseFetch` method so NO real network
 * request or 3-second rate-limit sleep happens. They lock in the
 * field-mapping correctness between the raw NSE JSON and our normalised
 * result models.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NSEProvider } from '../data/providers/nse.provider.js';

// Helper: build a provider with nseFetch mocked to return a given payload.
// `mockResolvedValue` covers single-call features; `mockResolvedValueOnce`
// chaining lets us return different payloads for the parallel dual fetch
// used by getWeek52HighLow().
function makeProvider() {
  const provider = new NSEProvider();
  const spy = vi.spyOn(provider as unknown as { nseFetch: (...a: unknown[]) => Promise<unknown> }, 'nseFetch');
  return { provider, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Feature #11 — FII/DII activity (getFiiDiiActivity)', () => {
  it('maps the raw fiidiiCMC array into FiiDiiEntry rows', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue([
      { date: '10-Aug-2026', category: 'FII', buyValue: '12000.50', sellValue: '10500.25', netValue: '1499.75' },
      { date: '10-Aug-2026', category: 'DII', buyValue: 8000, sellValue: 9000, netValue: -1000 },
    ] as unknown[]);

    const result = await provider.getFiiDiiActivity();

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      category: 'FII',
      date: '10-Aug-2026',
      buyValue: 12000.5,
      sellValue: 10500.25,
      netValue: 1499.75,
    });
    // String numeric values must be coerced to numbers.
    expect(typeof result.entries[0].buyValue).toBe('number');
    // date reported = first row's date.
    expect(result.date).toBe('10-Aug-2026');
    // asOf is an ISO timestamp string.
    expect(typeof result.asOf).toBe('string');
    expect(spy).toHaveBeenCalledWith('/api/fiidiiCMC');
  });

  it('tolerates a non-array / empty response', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue(undefined as unknown);

    const result = await provider.getFiiDiiActivity();
    expect(result.entries).toEqual([]);
    expect(result.date).toBe('');
  });
});

describe('Feature #12 — participant (FII) open interest (getParticipantOi)', () => {
  it('takes the LAST row per instrument and strips the "FII OI in " prefix', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue({
      'FII OI in NIFTY 50': [
        { date: '09-Aug-2026', longPosition: 1000, shortPosition: 500, longPercentage: 60, shortPercentage: 40 },
        { date: '10-Aug-2026', longPosition: 1200, shortPosition: 800, longPercentage: 60, shortPercentage: 40 },
      ],
      'FII OI in NIFTY BANK': [
        { date: '10-Aug-2026', longPosition: 700, shortPosition: 300, longPercentage: 70, shortPercentage: 30 },
      ],
    } as unknown);

    const result = await provider.getParticipantOi();

    expect(result.instruments).toHaveLength(2);

    const nifty = result.instruments.find((i) => i.instrument === 'NIFTY 50');
    expect(nifty).toBeDefined();
    // Must pick the LAST row, not the first.
    expect(nifty?.asOf).toBe('10-Aug-2026');
    expect(nifty?.longPosition).toBe(1200);
    expect(nifty?.shortPosition).toBe(800);
    expect(nifty?.totalOI).toBe(2000); // long + short

    const bank = result.instruments.find((i) => i.instrument === 'NIFTY BANK');
    expect(bank?.asOf).toBe('10-Aug-2026');
    expect(bank?.totalOI).toBe(1000);

    expect(spy).toHaveBeenCalledWith('/api/fiioiInteger');
  });
});

describe('Feature #13 — 52-week high / low (getWeek52HighLow)', () => {
  it('parses both high and low payloads and accepts lowercase field names', async () => {
    const { provider, spy } = makeProvider();
    const highRaw = [
      { symbol: 'RELIANCE', series: 'EQ', ltp: 3000, pdc: 2950, change: 50, percentChange: 1.69 },
    ];
    const lowRaw = [
      { symbol: 'TATASTEEL', series: 'EQ', ltp: 120, pdc: 125, change: -5, percentChange: -4.0 },
    ];
    // First call (high), second call (low).
    spy.mockResolvedValueOnce(highRaw as unknown[]).mockResolvedValueOnce(lowRaw as unknown[]);

    const result = await provider.getWeek52HighLow();

    expect(result.highs).toHaveLength(1);
    expect(result.highs[0]).toMatchObject({
      symbol: 'RELIANCE',
      series: 'EQ',
      lastPrice: 3000,
      previousClose: 2950,
      change: 50,
      pChange: 1.69,
    });
    expect(result.lows[0]).toMatchObject({
      symbol: 'TATASTEEL',
      lastPrice: 120,
      pChange: -4.0,
    });
    expect(spy).toHaveBeenNthCalledWith(1, '/api/equity-top-52-week-high');
    expect(spy).toHaveBeenNthCalledWith(2, '/api/equity-top-52-week-low');
  });

  it('handles the { data: [...] } envelope shape and UPPERCASE keys', async () => {
    const { provider, spy } = makeProvider();
    spy
      .mockResolvedValueOnce({ data: [{ SYMBOL: 'INFY', SERIES: 'EQ', LTP: 1500, PDC: 1480, CHANGE: 20, PERCENTCHANGE: 1.35 }] } as unknown)
      .mockResolvedValueOnce({ data: [] } as unknown);

    const result = await provider.getWeek52HighLow();
    expect(result.highs[0].symbol).toBe('INFY');
    expect(result.highs[0].lastPrice).toBe(1500);
    expect(result.lows).toEqual([]);
  });
});

describe('Feature #14 — market breadth (getMarketBreadth)', () => {
  it('computes total and adRatio for the default NIFTY 50', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue({ advances: 30, declines: 20, unchanged: 5 } as unknown);

    const result = await provider.getMarketBreadth();

    expect(result.index).toBe('NIFTY 50');
    expect(result.advances).toBe(30);
    expect(result.declines).toBe(20);
    expect(result.unchanged).toBe(5);
    expect(result.total).toBe(55); // sum of all three
    expect(result.adRatio).toBe(1.5); // 30 / 20 → toFixed(2)
    expect(spy).toHaveBeenCalledWith('/api/equity-stock-indices?index=NIFTY%2050');
  });

  it('resolves a synonym (BANKNIFTY -> NIFTY BANK) and still request the correct endpoint', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue({ advances: 8, declines: 4, unchanged: 0 } as unknown);

    const result = await provider.getMarketBreadth('banknifty');

    expect(result.index).toBe('BANKNIFTY');
    expect(result.adRatio).toBe(2); // 8 / 4
    expect(spy).toHaveBeenCalledWith('/api/equity-stock-indices?index=NIFTY%20BANK');
  });

  it('falls back to advances when declines is zero (avoids divide-by-zero)', async () => {
    const { provider, spy } = makeProvider();
    spy.mockResolvedValue({ advances: 12, declines: 0, unchanged: 3 } as unknown);

    const result = await provider.getMarketBreadth('NIFTY 500');
    expect(result.total).toBe(15);
    expect(result.adRatio).toBe(12);
  });
});
