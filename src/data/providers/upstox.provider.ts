// ────────────────────────────────────────────────────────────────────────────
// Upstox v2 Data Provider  (PRIMARY free broker backend)
//
// ■ OPTIONAL — requires an Upstox API key + secret + a one-time access token.
// ■ Broker-backed market data: option chain, quotes, historical candles,
//   instruments master, and market status — all from the supported Upstox v2
//   REST API (no NSE anti-bot scraping needed for these).
// ■ HYBRID: methods Upstox does not expose (FII/DII, IPO, corporate actions,
//   block deals, VIX, pre-market, 52-week, breadth, F&O analytics, lot sizes)
//   are delegated to an internal NSEProvider so every one of the 20 features
//   keeps working.
// ■ Rate-limited to respect Upstox free-tier limits.
//
// One-time login (owner does this once, then daily to refresh the token):
//   1. Create an app at https://developer.upstox.com → copy API Key + Secret.
//   2. Open the OAuth URL (buildLoginUrl) in a browser, log in, copy the
//      `code` from the redirect.
//   3. Call UpstoxProvider.exchangeCodeForToken(apiKey, apiSecret, code,
//      redirectUri) and save the returned token into `.upstox-token.json`
//      (git-ignored) or set UPSTOX_ACCESS_TOKEN in your .env.
// ────────────────────────────────────────────────────────────────────────────

import {
  BaseProvider,
  OptionChainData,
  OptionChainRow,
  OptionData,
  QuoteData,
  MarketStatus,
  CandleData,
  Instrument,
  IndiaVixResult,
  PreMarketDerivativesResult,
  FoListResult,
  TopMoversResult,
  LiveIndicesResult,
  IndexConstituentsResult,
  IpoTrackerResult,
  CorporateActionsResult,
  BlockDealsResult,
  FiiDiiResult,
  ParticipantOiResult,
  Week52Result,
  MarketBreadthResult,
  FnoContract,
  FuturesLiveResult,
  ChangeInOiResult,
  OiVsPriceItem,
  OiVsPriceMatrixResult,
  MostActiveResult,
  LotSizesResult,
} from './base.provider.js';
import { NSEProvider } from './nse.provider.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Constants ──────────────────────────────────────────────────────────────

const UPSTOX_BASE = 'https://api.upstox.com/v2';
const TOKEN_FILE = join(process.cwd(), '.upstox-token.json');

/** Minimum gap between requests to respect Upstox free-tier rate limits. */
const MIN_REQUEST_GAP_MS = 250;

/** Fetch timeout per request (ms). */
const FETCH_TIMEOUT_MS = 30_000;

/** How long to cache the instrument master (ms). */
const INSTRUMENT_CACHE_TTL_MS = 12 * 60 * 60 * 1_000; // 12 hours

/**
 * Common NSE index symbols → Upstox instrument keys.
 * Upstox identifies instruments by composite keys like "NSE_INDEX|Nifty 50".
 */
const INDEX_KEYS: Readonly<Record<string, string>> = {
  NIFTY: 'NSE_INDEX|Nifty 50',
  NIFTY50: 'NSE_INDEX|Nifty 50',
  'NIFTY 50': 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|NIFTY BANK',
  BANKNIFTY50: 'NSE_INDEX|NIFTY BANK',
  'NIFTY BANK': 'NSE_INDEX|NIFTY BANK',
  FINNIFTY: 'NSE_INDEX|FIN NIFTY',
  'FIN NIFTY': 'NSE_INDEX|FIN NIFTY',
  MIDCPNIFTY: 'NSE_INDEX|MIDCP NIFTY',
  'MIDCP NIFTY': 'NSE_INDEX|MIDCP NIFTY',
  SENSEX: 'BSE_INDEX|SENSEX',
};

// ── Internal Upstox response shapes ─────────────────────────────────────────

interface UpstoxQuote {
  last_price?: number;
  net_change?: number;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  volume?: number;
  oi?: number;
  depth?: {
    buy?: Array<{ price?: number; quantity?: number }>;
    sell?: Array<{ price?: number; quantity?: number }>;
  };
  timestamp?: string;
}

interface UpstoxQuoteResponse {
  status?: string;
  data?: Record<string, UpstoxQuote>;
}

interface UpstoxOptionLeg {
  instrument_key?: string;
  last_price?: number;
  net_change?: number;
  oi?: number;
  volume?: number;
  bid_price?: number;
  bid_qty?: number;
  ask_price?: number;
  ask_qty?: number;
  iv?: number;
  strike_price?: number;
  expiry?: string;
  option_type?: string;
  underlying_key?: string;
  underlying_spot_price?: number;
  lot_size?: number;
  tick_size?: number;
}

interface UpstoxOptionChainItem {
  strike_price?: number;
  call_options?: UpstoxOptionLeg;
  put_options?: UpstoxOptionLeg;
}

interface UpstoxOptionChainResponse {
  status?: string;
  data?: {
    underlying_key?: string;
    underlying_spot_price?: number;
    expiry?: string;
    count?: number;
    data?: UpstoxOptionChainItem[];
  };
}

interface UpstoxContractResponse {
  status?: string;
  data?: { expiry?: string[]; strike_prices?: number[] };
}

interface UpstoxCandleResponse {
  status?: string;
  data?: { candles?: Array<(string | number)[]> };
}

interface UpstoxMarketStatusResponse {
  status?: string;
  data?: Array<{ exchange?: string; status?: string }>;
}

interface UpstoxTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

// ── Provider ──────────────────────────────────────────────────────────────

export class UpstoxProvider extends BaseProvider {
  readonly name = 'upstox';

  private apiKey: string;
  private apiSecret: string;
  private accessToken: string;

  /** Internal NSE scraper used as fallback for the reports Upstox lacks. */
  private fallback: NSEProvider;

  /** In-memory instrument list (loaded from the Upstox master CSV). */
  private instruments: Instrument[] = [];
  private instrumentsLoadedAt = 0;

  /** Queue for rate-limiting. */
  private requestQueue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(apiKey: string, apiSecret: string, accessToken = '') {
    super();
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.fallback = new NSEProvider();
  }

  // ── Static helpers (owner's one-time login) ─────────────────────────────

  /** Build the OAuth authorization URL the owner opens in a browser. */
  static buildLoginUrl(apiKey: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: apiKey,
      redirect_uri: redirectUri,
      response_type: 'code',
    });
    return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
  }

  /**
   * Exchange an OAuth `code` for an access token and persist it to the
   * git-ignored token file. Returns the token.
   */
  static async exchangeCodeForToken(
    apiKey: string,
    apiSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: apiKey,
      client_secret: apiSecret,
      redirect_uri: redirectUri,
      code_verifier: '',
    });

    const res = await fetch(`${UPSTOX_BASE}/login/authorization/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const json = (await res.json().catch(() => ({}))) as UpstoxTokenResponse;
    if (!res.ok || !json.access_token) {
      throw new Error(
        `[Upstox] Token exchange failed (${res.status}): ` +
          `${json.error ?? ''} ${json.error_description ?? ''}`.trim(),
      );
    }

    UpstoxProvider.saveToken(json.access_token);
    return json.access_token;
  }

  private static saveToken(token: string): void {
    try {
      writeFileSync(
        TOKEN_FILE,
        JSON.stringify({ access_token: token, savedAt: new Date().toISOString() }),
        'utf8',
      );
    } catch (err) {
      console.error('[Upstox] Could not persist token file:', String(err));
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.error('[Upstox] Initialising provider …');

    // Resolve the access token: env value wins, else the persisted token file.
    if (!this.accessToken && existsSync(TOKEN_FILE)) {
      try {
        const raw = JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as {
          access_token?: string;
        };
        if (raw.access_token) this.accessToken = raw.access_token;
      } catch {
        // ignore corrupt token file
      }
    }

    if (!this.accessToken) {
      throw new Error(
        '[Upstox] Access token missing. Do a one-time login:\n' +
          `  1. Open: ${UpstoxProvider.buildLoginUrl(this.apiKey, 'https://127.0.0.1/upstox-callback')}\n` +
          '  2. Log in and copy the `code` from the redirected URL.\n' +
          '  3. Run UpstoxProvider.exchangeCodeForToken(apiKey, secret, code, redirectUri),\n' +
          '     or set UPSTOX_ACCESS_TOKEN in your .env.',
      );
    }

    // Warm the NSE fallback so the NSE-only reports work too. Failures here
    // must not break the broker path.
    try {
      await this.fallback.initialize();
    } catch (err) {
      console.error(
        '[Upstox] NSE fallback init failed (reports will be unavailable until fixed):',
        String(err),
      );
    }

    this._ready = true;
    console.error('[Upstox] Provider ready.');
  }

  // ── Auth header ────────────────────────────────────────────────────────

  private authHeader(): string {
    return `Bearer ${this.accessToken}`;
  }

  // ── Rate-limited fetch ─────────────────────────────────────────────────

  private async upstoxFetch<T>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => this.upstoxFetchInner<T>(path, options))
        .then(resolve)
        .catch(reject);
    });
  }

  private async upstoxFetchInner<T>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<T> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - elapsed);
    }

    let url = `${UPSTOX_BASE}${path}`;
    if (options?.params) {
      const sp = new URLSearchParams(options.params);
      url += `?${sp.toString()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      this.lastRequestAt = Date.now();
      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `[Upstox] Authentication failed (${res.status}). ` +
            'Access token may have expired — re-run the one-time login.',
        );
      }
      if (res.status === 429) {
        console.error('[Upstox] 429 rate-limited. Backing off for 1 s …');
        await sleep(1_000);
        throw new Error('[Upstox] Rate limited — retry later.');
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[Upstox] HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Fetch raw CSV text (used for the instrument master download). */
  private async upstoxFetchText(path: string): Promise<string> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - elapsed);
    }

    const url = `${UPSTOX_BASE}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      this.lastRequestAt = Date.now();
      const res = await fetch(url, {
        headers: { Authorization: this.authHeader() },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`[Upstox] HTTP ${res.status} ${res.statusText} on ${path}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Symbol → instrument key resolution ──────────────────────────────────

  /**
   * Map a user-facing symbol (e.g. "NIFTY", "RELIANCE") to an Upstox
   * instrument key (e.g. "NSE_INDEX|Nifty 50", "NSE_EQ|RELIANCE").
   */
  private async resolveKey(symbol: string): Promise<string> {
    const upper = symbol.trim().toUpperCase();
    if (INDEX_KEYS[upper]) return INDEX_KEYS[upper];

    // Equity: try the instrument master for an exact trading symbol.
    await this.ensureInstruments();
    const inst = this.instruments.find(
      (i) =>
        i.tradingSymbol.toUpperCase() === upper ||
        i.name.toUpperCase() === upper,
    );
    if (inst) return inst.instrumentToken;

    // Sensible default for equities.
    return `NSE_EQ|${upper}`;
  }

  // ── Instrument master ──────────────────────────────────────────────────

  private async loadInstruments(segments: string[]): Promise<void> {
    const all: Instrument[] = [];
    for (const seg of segments) {
      console.error(`[Upstox] Downloading instrument master (${seg}) …`);
      const csv = await this.upstoxFetchText(`/metadata/instruments?segment=${seg}`);
      const lines = csv.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length < 2) continue;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 11) continue;
        all.push({
          instrumentToken: cols[0],
          exchangeToken: cols[1],
          tradingSymbol: cols[3],
          name: cols[4],
          lastPrice: parseFloat(cols[5]) || 0,
          expiry: cols[6] || '',
          strike: parseFloat(cols[7]) || 0,
          tickSize: parseFloat(cols[9]) || 0,
          lotSize: parseFloat(cols[8]) || 0,
          instrumentType: cols[10],
          segment: cols[2],
          exchange: cols[2].split('_')[0] || cols[2],
        });
      }
    }
    this.instruments = all;
    this.instrumentsLoadedAt = Date.now();
    console.error(`[Upstox] Loaded ${all.length} instruments.`);
  }

  private isInstrumentCacheStale(): boolean {
    return Date.now() - this.instrumentsLoadedAt > INSTRUMENT_CACHE_TTL_MS;
  }

  private async ensureInstruments(): Promise<void> {
    if (this.instruments.length === 0 || this.isInstrumentCacheStale()) {
      // Load the common segments needed for symbol resolution + F&O.
      await this.loadInstruments([
        'NSE_EQ',
        'NSE_INDEX',
        'NFO_INDEX',
        'NFO_STOCK',
      ]);
    }
  }

  // ── Broker-backed market data ──────────────────────────────────────────

  async getExpiryDates(symbol: string): Promise<string[]> {
    const key = await this.resolveKey(symbol);
    const raw = await this.upstoxFetch<UpstoxContractResponse>(
      '/option/contract',
      { params: { instrument_key: key } },
    );
    const expiries = raw.data?.expiry ?? [];
    return [...expiries].sort();
  }

  async getOptionChain(
    symbol: string,
    expiryDate?: string,
  ): Promise<OptionChainData> {
    const underlyingKey = await this.resolveKey(symbol);

    let targetExpiry = expiryDate;
    if (!targetExpiry) {
      const expiries = await this.getExpiryDates(symbol);
      if (expiries.length === 0) {
        throw new Error(`[Upstox] No option expiries found for "${symbol}".`);
      }
      targetExpiry = expiries[0];
    }

    const raw = await this.upstoxFetch<UpstoxOptionChainResponse>(
      '/option/chain',
      {
        params: {
          instrument_key: underlyingKey,
          expiry_date: targetExpiry,
        },
      },
    );

    const underlyingValue = raw.data?.underlying_spot_price ?? 0;
    const items = raw.data?.data ?? [];

    const rows: OptionChainRow[] = [];
    let totalCEOI = 0;
    let totalPEOI = 0;
    let totalCEVol = 0;
    let totalPEVol = 0;

    for (const item of items) {
      const strike = item.strike_price ?? 0;
      const ce = this.mapLeg(
        item.call_options,
        'CE',
        strike,
        targetExpiry,
        underlyingValue,
      );
      const pe = this.mapLeg(
        item.put_options,
        'PE',
        strike,
        targetExpiry,
        underlyingValue,
      );

      const row: OptionChainRow = {
        strikePrice: strike,
        expiryDate: targetExpiry,
      };
      if (ce) {
        row.CE = ce;
        totalCEOI += ce.openInterest;
        totalCEVol += ce.totalTradedVolume;
      }
      if (pe) {
        row.PE = pe;
        totalPEOI += pe.openInterest;
        totalPEVol += pe.totalTradedVolume;
      }
      rows.push(row);
    }

    rows.sort((a, b) => a.strikePrice - b.strikePrice);
    const expiries = await this.getExpiryDates(symbol);

    return {
      symbol,
      underlyingValue,
      expiryDate: targetExpiry,
      expiryDates: expiries,
      strikePrices: rows.map((r) => r.strikePrice),
      rows,
      timestamp: new Date().toISOString(),
      totalCEOpenInterest: totalCEOI,
      totalPEOpenInterest: totalPEOI,
      totalCEVolume: totalCEVol,
      totalPEVolume: totalPEVol,
    };
  }

  private mapLeg(
    leg: UpstoxOptionLeg | undefined,
    type: 'CE' | 'PE',
    parentStrike: number,
    expiryDate: string,
    underlyingValue: number,
  ): OptionData | undefined {
    if (!leg) return undefined;
    return {
      strikePrice: leg.strike_price ?? parentStrike,
      expiryDate: leg.expiry ?? expiryDate,
      optionType: type,
      lastPrice: leg.last_price ?? 0,
      change: leg.net_change ?? 0,
      pChange: 0, // Upstox chain legs don't expose previous close
      openInterest: leg.oi ?? 0,
      changeinOpenInterest: 0,
      totalTradedVolume: leg.volume ?? 0,
      impliedVolatility: leg.iv ?? 0,
      bidQty: leg.bid_qty ?? 0,
      bidPrice: leg.bid_price ?? 0,
      askQty: leg.ask_qty ?? 0,
      askPrice: leg.ask_price ?? 0,
      underlyingValue: leg.underlying_spot_price ?? underlyingValue,
    };
  }

  async getSpotPrice(symbol: string): Promise<number> {
    const key = await this.resolveKey(symbol);
    const raw = await this.upstoxFetch<UpstoxQuoteResponse>(
      '/market-quote/ltp',
      { params: { instrument_key: key } },
    );
    const ltp = raw.data?.[key]?.last_price;
    if (typeof ltp === 'number' && ltp > 0) return ltp;
    throw new Error(`[Upstox] No LTP returned for "${key}".`);
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    const key = await this.resolveKey(symbol);
    const raw = await this.upstoxFetch<UpstoxQuoteResponse>('/market-quote', {
      params: { instrument_key: key },
    });
    const q = raw.data?.[key];
    if (!q) throw new Error(`[Upstox] No quote data returned for "${key}".`);

    const prevClose = q.ohlc?.close ?? 0;
    return {
      symbol,
      lastPrice: q.last_price ?? 0,
      change: q.net_change ?? 0,
      pChange:
        q.last_price && prevClose
          ? ((q.last_price - prevClose) / prevClose) * 100
          : 0,
      open: q.ohlc?.open ?? 0,
      high: q.ohlc?.high ?? 0,
      low: q.ohlc?.low ?? 0,
      close: prevClose,
      volume: q.volume ?? 0,
      timestamp: q.timestamp ?? new Date().toISOString(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
    const map = new Map<string, QuoteData>();
    const keyBySymbol = new Map<string, string>();
    for (const sym of symbols) {
      keyBySymbol.set(sym, await this.resolveKey(sym));
    }
    const keys = Array.from(new Set(keyBySymbol.values()));
    if (keys.length === 0) return map;

    const raw = await this.upstoxFetch<UpstoxQuoteResponse>('/market-quote', {
      params: { instrument_key: keys.join(',') },
    });

    for (const [sym, key] of keyBySymbol) {
      const q = raw.data?.[key];
      if (!q) continue;
      const prevClose = q.ohlc?.close ?? 0;
      map.set(sym, {
        symbol: sym,
        lastPrice: q.last_price ?? 0,
        change: q.net_change ?? 0,
        pChange:
          q.last_price && prevClose
            ? ((q.last_price - prevClose) / prevClose) * 100
            : 0,
        open: q.ohlc?.open ?? 0,
        high: q.ohlc?.high ?? 0,
        low: q.ohlc?.low ?? 0,
        close: prevClose,
        volume: q.volume ?? 0,
        timestamp: q.timestamp ?? new Date().toISOString(),
      });
    }
    return map;
  }

  async getHistoricalData(
    symbol: string,
    from: Date,
    to: Date,
    interval = 'day',
  ): Promise<CandleData[]> {
    const key = await this.resolveKey(symbol);
    const toStr = to.toISOString().split('T')[0];
    const fromStr = from.toISOString().split('T')[0];

    const raw = await this.upstoxFetch<UpstoxCandleResponse>(
      `/historical-candle/${encodeURIComponent(key)}/${interval}/${toStr}/${fromStr}`,
    );

    const candles = raw.data?.candles ?? [];
    return candles.map((c) => ({
      timestamp: String(c[0]),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
      oi: c.length > 6 ? Number(c[6]) : undefined,
    }));
  }

  async getInstruments(exchange?: string): Promise<Instrument[]> {
    if (this.instruments.length === 0 || this.isInstrumentCacheStale()) {
      const segments =
        exchange === 'NSE' || exchange === 'BSE'
          ? [exchange === 'NSE' ? 'NSE_EQ' : 'BSE_EQ', 'NSE_INDEX']
          : ['NSE_EQ', 'NSE_INDEX', 'NFO_INDEX', 'NFO_STOCK'];
      await this.loadInstruments(segments);
    }
    if (exchange) {
      return this.instruments.filter(
        (i) => i.exchange.toUpperCase() === exchange.toUpperCase(),
      );
    }
    return this.instruments;
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const raw = await this.upstoxFetch<UpstoxMarketStatusResponse>(
      '/market-status',
    );
    const entries = raw.data ?? [];
    const nse = entries.find((e) => e.exchange === 'NSE') ?? entries[0];
    const rawStatus = (nse?.status ?? 'closed').toLowerCase();
    const status: MarketStatus['status'] =
      rawStatus === 'open'
        ? 'Open'
        : rawStatus === 'pre_open'
          ? 'Pre-open'
          : rawStatus === 'post_close'
            ? 'Post-close'
            : 'Closed';
    return {
      market: nse?.exchange ?? 'NSE',
      status,
      timestamp: new Date().toISOString(),
    };
  }

  // ── NSE-only reports → delegate to the internal NSE scraper ──────────────
  // (Upstox does not expose these; NSE scraping keeps all 20 features alive.)

  async getIndiaVix(days?: number): Promise<IndiaVixResult> {
    return this.fallback.getIndiaVix(days);
  }

  async getPreMarketDerivatives(
    key?: 'FUTIDX' | 'FUTSTK',
  ): Promise<PreMarketDerivativesResult> {
    return this.fallback.getPreMarketDerivatives(key);
  }

  async getFoList(): Promise<FoListResult> {
    return this.fallback.getFoList();
  }

  async getTopMovers(index?: string): Promise<TopMoversResult> {
    return this.fallback.getTopMovers(index);
  }

  async getLiveIndices(): Promise<LiveIndicesResult> {
    return this.fallback.getLiveIndices();
  }

  async getIndexConstituents(index: string): Promise<IndexConstituentsResult> {
    return this.fallback.getIndexConstituents(index);
  }

  async getIpoTracker(): Promise<IpoTrackerResult> {
    return this.fallback.getIpoTracker();
  }

  async getCorporateActions(
    symbol?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CorporateActionsResult> {
    return this.fallback.getCorporateActions(symbol, fromDate, toDate);
  }

  async getBlockDeals(): Promise<BlockDealsResult> {
    return this.fallback.getBlockDeals();
  }

  async getFiiDiiActivity(): Promise<FiiDiiResult> {
    return this.fallback.getFiiDiiActivity();
  }

  async getParticipantOi(): Promise<ParticipantOiResult> {
    return this.fallback.getParticipantOi();
  }

  async getWeek52HighLow(): Promise<Week52Result> {
    return this.fallback.getWeek52HighLow();
  }

  async getMarketBreadth(index?: string): Promise<MarketBreadthResult> {
    return this.fallback.getMarketBreadth(index);
  }

  async getFuturesLiveData(index?: string): Promise<FuturesLiveResult> {
    return this.fallback.getFuturesLiveData(index);
  }

  async getChangeInOi(index?: string): Promise<ChangeInOiResult> {
    return this.fallback.getChangeInOi(index);
  }

  async getOiVsPriceMatrix(index?: string): Promise<OiVsPriceMatrixResult> {
    return this.fallback.getOiVsPriceMatrix(index);
  }

  async getFiiDiiFoStats(): Promise<FiiDiiResult> {
    return this.fallback.getFiiDiiFoStats();
  }

  async getMostActiveContracts(group?: string): Promise<MostActiveResult> {
    return this.fallback.getMostActiveContracts(group);
  }

  async getLotSizes(symbol?: string): Promise<LotSizesResult> {
    return this.fallback.getLotSizes(symbol);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
