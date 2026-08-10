// ────────────────────────────────────────────────────────────────────────────
// Base Data Provider – abstract interface that every concrete provider must
// implement.  All model types are declared locally so the file is
// self-contained even when the models package hasn't been created yet.
// ────────────────────────────────────────────────────────────────────────────

// ── Inline model types (mirrors src/data/models/*) ─────────────────────────

/** Single leg of an option (CE or PE) */
export interface OptionData {
  strikePrice: number;
  expiryDate: string;          // ISO-8601 yyyy-MM-dd
  optionType: 'CE' | 'PE';
  lastPrice: number;
  change: number;
  pChange: number;
  openInterest: number;
  changeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  bidQty: number;
  bidPrice: number;
  askQty: number;
  askPrice: number;
  underlyingValue: number;
}

/** One strike row containing both CE and PE sides */
export interface OptionChainRow {
  strikePrice: number;
  expiryDate: string;
  CE?: OptionData;
  PE?: OptionData;
}

/** Complete option-chain snapshot for a symbol + expiry */
export interface OptionChainData {
  symbol: string;
  underlyingValue: number;
  expiryDate: string;
  expiryDates: string[];       // all available expiries
  strikePrices: number[];
  rows: OptionChainRow[];
  timestamp: string;           // ISO-8601 datetime
  totalCEOpenInterest: number;
  totalPEOpenInterest: number;
  totalCEVolume: number;
  totalPEVolume: number;
}

export interface QuoteData {
  symbol: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

export interface MarketStatus {
  market: string;
  status: 'Open' | 'Closed' | 'Pre-open' | 'Post-close';
  timestamp: string;
}

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

export interface Instrument {
  instrumentToken: string;
  exchangeToken: string;
  tradingSymbol: string;
  name: string;
  lastPrice: number;
  expiry: string;             // ISO-8601 date
  strike: number;
  tickSize: number;
  lotSize: number;
  instrumentType: string;     // CE | PE | FUT | EQ | IDX …
  segment: string;
  exchange: string;
}

/** A single India VIX data point (EOD). */
export interface VixPoint {
  date: string;        // DD-Mon-YYYY as returned by NSE
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  vixPtsChg: number;   // absolute change vs previous close
  vixPctChg: number;   // percentage change vs previous close
}

/** India VIX result: the most recent reading plus a recent history window. */
export interface IndiaVixResult {
  current: {
    value: number;
    timestamp: string;  // DD-Mon-YYYY of the latest reading
    change?: number;
    pChange?: number;
  };
  history: VixPoint[];
}

/** A single pre-market (pre-open) derivative contract sentiment row. */
export interface PreMarketDerivative {
  symbol: string;
  expiryDate: string;      // ISO-8601 date
  previousClose: number;
  iep: number;             // indicative equilibrium price
  change: number;
  pChange: number;
  lastPrice: number;
  finalQuantity: number;
  totalTurnover: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
}

/** Pre-market derivatives sentiment snapshot. */
export interface PreMarketDerivativesResult {
  key: 'FUTIDX' | 'FUTSTK';
  asOf: string;            // timestamp of the snapshot
  sentiment: {
    advancing: number;     // count of contracts trading above prev close
    declining: number;     // count trading below prev close
    breadth: number;       // advancing - declining (positive = bullish bias)
  };
  items: PreMarketDerivative[];
}

/** A single F&O tradable underlying. */
export interface FoUnderlying {
  symbol: string;
  underlying: string;
  type: 'STOCK' | 'INDEX';
}

/** List of all symbols that actually have F&O (futures & options) contracts. */
export interface FoListResult {
  asOf: string;
  stocks: FoUnderlying[];
  indices: FoUnderlying[];
  totalStocks: number;
  totalIndices: number;
}

/** A single top-mover (gainers/losers) row. */
export interface MarketMover {
  symbol: string;
  lastPrice: number;
  change: number;
  pChange: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
}

/** Top gainers & losers snapshot for an index. */
export interface TopMoversResult {
  index: string;
  asOf: string;
  gainers: MarketMover[];
  losers: MarketMover[];
}

// ── Feature #6: live indices & constituent lists ──────────────────────────

/** A single live index quote (current value + day change). */
export interface IndexValue {
  symbol: string;          // NSE index name, e.g. "NIFTY 50"
  indexSymbol: string;     // trading symbol, e.g. "NIFTY"
  last: number;            // current value
  variation: number;       // absolute day change
  percentChange: number;   // % day change
  open: number;
  high: number;
  low: number;
  previousClose: number;
  timeVal: string;         // timestamp of the snapshot
}

/** Snapshot of all major NSE index values. */
export interface LiveIndicesResult {
  asOf: string;
  indices: IndexValue[];
}

/** A single constituent of an index (e.g. one NIFTY 50 stock). */
export interface IndexConstituent {
  symbol: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  value: number;           // total traded value (₹)
}

/** Constituent list for a named index (NIFTY 50, NIFTY 500, …). */
export interface IndexConstituentsResult {
  index: string;
  asOf: string;
  constituents: IndexConstituent[];
}

// ── Feature #7: IPO tracker ───────────────────────────────────────────────

/** A currently active / ongoing IPO. */
export interface IpoInfo {
  symbol: string;
  companyName: string;
  series: string;
  issueStartDate: string;
  issueEndDate: string;
  status: string;
  issueSize: number;       // ₹ crore
  issuePrice: string;      // price band as returned by NSE (may be a range)
  noOfSharesOffered: number;
}

/** A pre-open (listing-day auction) IPO entry. */
export interface IpoPreOpen {
  symbol: string;
  series: string;
  prevClose: number;
  iep: number;             // indicative equilibrium price
  change: number;
  perChange: number;
  status: string;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  lastUpdateTime: string;
}

/** A single row from NSE's IPO tracker summary (recently listed IPOs). */
export interface IpoTrackerItem {
  symbol: string;
  companyName: string;
  listedOn: string;        // listing date YYYY-MM-DD
  issuePrice: number;
  listedDayClose: number;
  listedDayGain: number;
  listedDayGainPer: number;
  ltp: number;             // last traded price
  gainLoss: number;
  gainLossPer: number;
  marketType: string;      // SME / Mainboard
}

/** IPO tracker snapshot: currently open + pre-open + summary. */
export interface IpoTrackerResult {
  asOf: string;
  current: IpoInfo[];
  preOpen: IpoPreOpen[];
  summary: IpoTrackerItem[];
}

// ── Feature #8: corporate actions / announcements ──────────────────────────

/** A single corporate action (dividend, bonus, split, buyback, …). */
export interface CorporateAction {
  symbol: string;
  company: string;
  series: string;
  purpose: string;         // e.g. DIVIDEND, BONUS, STOCK SPLIT, BUYBACK
  faceValue: number;
  exDate: string;          // ISO date (ex-dividend date)
  recordDate: string;      // ISO date
  bookClosureStart: string; // ISO date
  bookClosureEnd: string;   // ISO date
}

/** Corporate actions in a date window (optionally for one symbol). */
export interface CorporateActionsResult {
  asOf: string;
  fromDate: string;
  toDate: string;
  actions: CorporateAction[];
}

// ── Feature #10: block deals ────────────────────────────────────────────────

/** A single block deal (large negotiated trade). */
export interface BlockDeal {
  session: string;         // MORNING / AFTERNOON
  symbol: string;
  series: string;
  open: number;
  dayHigh: number;
  dayLow: number;
  lastPrice: number;
  previousClose: number;
  pChange: number;
  totalTradedVolume: number;
  totalTradedValue: number; // ₹
}

/** Live block-deal feed for the session. */
export interface BlockDealsResult {
  asOf: string;
  deals: BlockDeal[];
}

// ── Provider interface & abstract base class ───────────────────────────────

export interface DataProvider {
  readonly name: string;

  /** Initialize the provider (login, fetch instrument master, etc.) */
  initialize(): Promise<void>;

  /** Get full option chain for a symbol */
  getOptionChain(symbol: string, expiryDate?: string): Promise<OptionChainData>;

  /** Get market quote for a symbol */
  getQuote(symbol: string): Promise<QuoteData>;

  /** Get multiple quotes at once */
  getQuotes(symbols: string[]): Promise<Map<string, QuoteData>>;

  /** Get all available expiry dates for a symbol */
  getExpiryDates(symbol: string): Promise<string[]>;

  /** Get spot / underlying price */
  getSpotPrice(symbol: string): Promise<number>;

  /** Get historical OHLCV data */
  getHistoricalData(
    symbol: string,
    from: Date,
    to: Date,
    interval?: string,
  ): Promise<CandleData[]>;

  /** Get list of F&O instruments */
  getInstruments(exchange?: string): Promise<Instrument[]>;

  /** Check market status */
  getMarketStatus(): Promise<MarketStatus>;

  /** Get India VIX (volatility index) — current reading + recent history */
  getIndiaVix(days?: number): Promise<IndiaVixResult>;

  /** Get pre-market (pre-open) derivatives sentiment for index/stock futures */
  getPreMarketDerivatives(key?: 'FUTIDX' | 'FUTSTK'): Promise<PreMarketDerivativesResult>;

  /** Get the full list of F&O tradable underlyings (stocks + indices) */
  getFoList(): Promise<FoListResult>;

  /** Get top gainers & losers (market movers) for an index */
  getTopMovers(index?: string): Promise<TopMoversResult>;

  /** Get live values of all major NSE indices */
  getLiveIndices(): Promise<LiveIndicesResult>;

  /** Get the constituent list of a named index (e.g. NIFTY 50, NIFTY 500) */
  getIndexConstituents(index: string): Promise<IndexConstituentsResult>;

  /** Get the IPO tracker: current IPOs, pre-open IPOs, and a summary */
  getIpoTracker(): Promise<IpoTrackerResult>;

  /** Get corporate actions (dividends, bonus, splits, buybacks) in a window */
  getCorporateActions(symbol?: string, fromDate?: string, toDate?: string): Promise<CorporateActionsResult>;

  /** Get the live block-deal feed for the current session */
  getBlockDeals(): Promise<BlockDealsResult>;

  /** Check if provider is ready */
  isReady(): boolean;
}

export abstract class BaseProvider implements DataProvider {
  abstract readonly name: string;
  protected _ready = false;

  abstract initialize(): Promise<void>;
  abstract getOptionChain(symbol: string, expiryDate?: string): Promise<OptionChainData>;
  abstract getQuote(symbol: string): Promise<QuoteData>;
  abstract getQuotes(symbols: string[]): Promise<Map<string, QuoteData>>;
  abstract getExpiryDates(symbol: string): Promise<string[]>;
  abstract getSpotPrice(symbol: string): Promise<number>;
  abstract getHistoricalData(
    symbol: string,
    from: Date,
    to: Date,
    interval?: string,
  ): Promise<CandleData[]>;
  abstract getInstruments(exchange?: string): Promise<Instrument[]>;
  abstract getMarketStatus(): Promise<MarketStatus>;
  abstract getIndiaVix(days?: number): Promise<IndiaVixResult>;
  abstract getPreMarketDerivatives(key?: 'FUTIDX' | 'FUTSTK'): Promise<PreMarketDerivativesResult>;
  abstract getFoList(): Promise<FoListResult>;
  abstract getTopMovers(index?: string): Promise<TopMoversResult>;
  abstract getLiveIndices(): Promise<LiveIndicesResult>;
  abstract getIndexConstituents(index: string): Promise<IndexConstituentsResult>;
  abstract getIpoTracker(): Promise<IpoTrackerResult>;
  abstract getCorporateActions(symbol?: string, fromDate?: string, toDate?: string): Promise<CorporateActionsResult>;
  abstract getBlockDeals(): Promise<BlockDealsResult>;

  isReady(): boolean {
    return this._ready;
  }
}
