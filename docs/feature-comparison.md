# Feature Comparison & Tracking — NseKit vs Our Options Tool

*Plain-language checklist for the owner (non-coder). Last updated: 2026-08-10.*

This document does two things:
1. Shows what **NseKit** (the Python library we studied) can do, next to what **our tool** (Indian-Option-MCP, written in TypeScript) can already do.
2. Tracks the missing features we plan to **add one-by-one, natively in TypeScript** (no Python).

**How we use this list:** every "Planned" feature gets built on its own — finish it, confirm the build + tests still pass, then move to the next. NseKit is only our *idea/reference* for what data NSE offers; we never copy its Python code.

---

## Legend

| Icon | Meaning |
|------|---------|
| ✅ Native | Already in our tool, written in TypeScript. No work needed. |
| 📋 Planned | Missing in our tool. To be added one at a time. |
| 🚧 In progress | Currently being built. |
| ➕ Added | Built and verified, live in the tool. |

---

## A. What our tool ALREADY has (our strength — options analytics)

These come from the original Indian-Option-MCP. They are the reason we keep our own tool instead of switching to NseKit (which has none of this).

| Feature | Plain description |
|---------|------------------|
| ✅ Live NSE option chain | Fetches the current options data for any stock/index from NSE. |
| ✅ Option pricing (Black-Scholes) | Calculates a fair theoretical price for an option. |
| ✅ Implied volatility (IV) | Works backwards from the market price to find the expected volatility. |
| ✅ Greeks | Delta, gamma, theta, vega, rho — the "risk dials" of an option. |
| ✅ Payoff diagrams | Shows profit/loss at expiry for a position. |
| ✅ Max-pain | Finds the price where option buyers lose the most (a sentiment signal). |
| ✅ Put-Call Ratio (PCR) | Mood gauge from how many puts vs calls are traded. |
| ✅ Strategy builder | 34 ready-made option strategies. |
| ✅ Claude Desktop connection | 35+ tools Claude can call directly (MCP). |

---

## B. Missing features (from NseKit's ideas) — to add one-by-one

We will pick these in order, one at a time. "Category" tells you how relevant it is to options vs general market info.

| # | Feature | Plain description | Category | Status | Priority |
|---|---------|------------------|----------|--------|----------|
| 1 | **India VIX (volatility index)** | The "fear gauge" — how jumpy the market expects to be. Shows current VIX + recent history. | Options-relevant | ➕ Added | High |
| 2 | **Market open / closed + holidays** | Tells you if the market is open *right now*, the next trading day, and upcoming holidays — so you never fetch data when there's none. | Utility | ✅ Native | — |
| 3 | **Pre-market derivatives sentiment** | Early read on how the day might open, from derivative activity. | Options-relevant | ➕ Added | Medium |
| 4 | **F&O tradable list** | A list of stocks & indices that actually have options/futures, so you can pick what to analyze. | Utility | ➕ Added | Medium |
| 5 | **Top movers (gainers / losers)** | Which stocks or indices moved the most today — a quick market feel. | Broad market | ➕ Added | Low |
| 6 | **Live indices / Nifty 50 & 500 lists** | Current values of major indices and their constituent lists. | Broad market | ➕ Added | Low |
| 7 | **IPO tracker** | Current IPOs, pre-open IPOs, and a summary view. | Broad market | ➕ Added | Low |
| 8 | **Corporate actions / announcements** | Dividends, bonuses, board meetings, etc. | Broad market | ➕ Added | Low |
| 9 | **Stock & index charts** | Historical price charts for a symbol. | Broad market | ➕ Added | Low |
| 10 | **Block deals / insider trading** | Large trades and insider activity feed. | Broad market | ➕ Added | Low |
| 11 | **FII/DII Activity** | Daily foreign & domestic institutional buy/sell/net in the cash market. | Broad market | ➕ Added | Medium |
| 12 | **Participant OI (FII open interest)** | How much FII open interest is held long vs short across futures & options. | Options-relevant | ➕ Added | Medium |
| 13 | **52-Week High / Low** | Lists stocks at fresh 52-week highs and lows. | Broad market | ➕ Added | Low |
| 14 | **Market Breadth** | Advances/declines/unchanged + A/D ratio for an index. | Broad market | ➕ Added | Low |
| 15 | **Futures Live Data (all F&O contracts)** | Live price, day change, OI, change-in-OI, and volume for every F&O futures contract — the raw feed behind most analysis. | Options-relevant | ➕ Added | Medium |
| 16 | **Change in Open Interest (F&O)** | Same futures feed, sorted by the biggest change in OI today — shows where traders are adding/reducing positions fastest. | Options-relevant | ➕ Added | Medium |
| 17 | **OI vs Price Matrix (buildup classification)** | Classifies each contract as Long Buildup / Short Buildup / Long Unwinding / Short Covering from price + OI direction — a sentiment read on trader positioning. | Options-relevant | ➕ Added | High |
| 18 | **FII/DII Activity — F&O segment** | Daily FII / DII buy, sell, net (₹ crore) in the derivatives (F&O) market — distinct from the cash-market view in #11. | Options-relevant | ➕ Added | Medium |
| 19 | **Most Active Contracts (F&O)** | The busiest F&O contracts by volume/value — index futures, stock futures, options, or all — a quick "where the action is" read. | Options-relevant | ➕ Added | Low |
| 20 | **Lot Sizes (F&O contract lots)** | The standard lot size per F&O symbol (NIFTY=75, BANKNIFTY=30, …) from a maintained local table — no fragile endpoint needed. | Utility | ➕ Added | Low |

> **✅ Already present — Market Status (item #2):** The tool already provides this in two levels:
> - **Basic:** the `market_status` tool and `market://status` resource return open/closed (🟢/🔴).
> - **Detailed:** `getMarketStatusInfo()` returns a plain message — e.g. "Market opens at 9:15 AM IST", "Market closed (holiday/weekend)", "Market is open" — and accounts for weekends and NSE holidays.
> *Caveat:* the holiday list is currently hardcoded for **2026 only**; it would need updating for future years (a small future fix, not blocking).

> **➕ Built — India VIX (item #1):** New `india_vix` tool (plus a `getIndiaVix()` provider method on the free NSE provider; the optional Zerodha provider throws a clear "not supported" message). It pulls the latest reading + a recent history window (default 30 days, up to 365) from NSE's public VIX history endpoint and shows the current level with its day change. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Pre-market derivatives sentiment (item #3):** New `pre_market_sentiment` tool (plus `getPreMarketDerivatives()` on the NSE provider; Zerodha throws "not supported"). Pulls the pre-open F&O auction feed (`FUTIDX` index futures by default, or `FUTSTK` stock futures) and shows each contract's indicative equilibrium price (IEP) vs previous close, the top movers, and an advancing/declining breadth count for a quick bullish/bearish bias. Only populated during the pre-open window (≈9:00–9:15 AM IST). Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — F&O tradable list (item #4):** New `fo_tradable_list` tool (plus `getFoList()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's underlying-information feed and returns the full list of F&O-eligible indices + stocks (with counts), so you can pick a valid underlying before running option-chain/IV/strategy analysis. Optional `type` filter: ALL / STOCK / INDEX. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Top movers (item #5):** New `top_movers` tool (plus `getTopMovers()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's live-analysis top-gainers / top-losers feeds for an index (default NIFTY; override with BANKNIFTY, FINNIFTY, NIFTY 50, …) and shows the top 10 gainers and losers by % change with last price. Only populated during market hours. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Stock & index charts (item #9):** New `stock_index_chart` tool. **Fills the previously-empty `getHistoricalData()` on the NSE provider** (no new parallel method — reuses the existing interface slot, following the "don't duplicate" rule). Pulls daily OHLCV for equities (`/api/historical/cm/equity`) and indices (`/api/historical/indicesHistory`, mapping our trading symbol → NSE indexType), with optional `day`/`week` aggregation. Returns the series + summary (period high/low, avg close, total return). Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Live indices / Nifty 50 & 500 lists (item #6):** Two new tools. `live_indices` shows the current value, day change, and % change of all major NSE indices (reuses the existing `/api/allIndices` feed the NSE provider already fetched for quotes). `index_constituents` lists the stocks inside a named index — defaults to **NIFTY 50**, pass `NIFTY 500` / `NIFTY BANK` / `NIFTY IT` / any sectoral index — pulling each constituent's price, % change, and volume from `/api/equity-stock-indices`. A small `INDEX_NAME_MAP` resolves the many ways a user might name an index to the exact NSE string (avoids guessing/hardcoding in the endpoint call). Provider methods `getLiveIndices()` / `getIndexConstituents()` live on the NSE provider; Zerodha throws "not supported". Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — IPO tracker (item #7):** New `ipo_tracker` tool (plus `getIpoTracker()` on the NSE provider; Zerodha throws "not supported"). One call returns three NSE feeds: **currently open IPOs** (`/api/ipo-current-issue`), **pre-open / listing-day auction IPOs** with indicative equilibrium price (`/api/special-preopen-listing`), and a **recently-listed summary** with listing-day gain/loss (`/api/NextApi/apiClient?functionName=getIPOTrackerSummary`). Shows open issues you can still apply to, today's listings, and how recent IPOs performed on day 1. Only populated during/around issue windows. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Corporate actions / announcements (item #8):** New `corporate_actions` tool (plus `getCorporateActions()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's `/api/corporates-corporateActions` feed (the same source NSE uses for its corporate-actions page): dividends, bonuses, stock splits, buybacks, etc. Optional `symbol` filter (e.g. RELIANCE) and `fromDate`/`toDate` window (default: yesterday → ~90 days ahead, held in a named `CORP_ACTION_LOOKAHEAD_DAYS` constant rather than an inline magic number). Shows purpose + ex-date + record date. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Block deals (item #10):** New `block_deals` tool (plus `getBlockDeals()` on the NSE provider; Zerodha throws "not supported"). Pulls the live block-deal feed `/api/block-deal` — large negotiated trades (₹10 crore+) reported in the MORNING / AFTERNOON windows — showing symbol, last price, day change %, and total volume/value. A flurry of block deals can signal institutional activity. Only populated during market hours. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — FII/DII Activity (item #11):** New `fii_dii_activity` tool (plus `getFiiDiiActivity()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's `/api/fiidiiCMC` feed — the daily FII / DII / PRO / CLIENT buy, sell, and net figures (₹ crore) in the cash market. Positive FII net = foreign money flowing in (generally bullish). Published once per trading day after close. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Participant OI (item #12):** New `participant_oi` tool (plus `getParticipantOi()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's `/api/fiioiInteger` feed and reports FII open interest held LONG vs SHORT in index/stock futures and options, with the long/short % — a read on where institutions are positioned. Refreshed intraday. *Trade-off:* this uses the well-known FII-OI endpoint (the canonical "participant OI" NSE exposes); a full FII+DII+Pro+Client breakdown is not on a stable public endpoint, so we surface FII positioning, which is what the market watches. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — 52-Week High / Low (item #13):** New `week_52_high_low` tool (plus `getWeek52HighLow()` on the NSE provider; Zerodha throws "not supported"). Pulls NSE's `/api/equity-top-52-week-high` and `/api/equity-top-52-week-low` feeds in parallel and lists the stocks at fresh 52-week extremes (optional `limit`, default 25 per side). Counts of highs vs lows are a classic breadth gauge. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Market Breadth (item #14):** New `market_breadth` tool (plus `getMarketBreadth()` on the NSE provider; Zerodha throws "not supported"). Reuses the existing `/api/equity-stock-indices` feed (the same one `index_constituents` uses) and reports advances / declines / unchanged plus the advance-decline ratio for an index (default **NIFTY 50**, override with any index via `INDEX_NAME_MAP`). A/D ratio > 1 = more stocks rising than falling. Verified: lint clean, 18/18 tests pass, build + bundle succeed.

> **➕ Built — Futures Live Data (item #15):** New `fno_live_futures_data` tool (plus `getFuturesLiveData()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Pulls NSE's live-analysis derivatives-future feed and returns every F&O contract's last price, day change, open interest, change-in-OI, and volume, with an optional `index` filter (e.g. NIFTY, BANKNIFTY) to narrow the list. This feed is the basis for the matrix/sentiment features below. *Endpoint assumption to verify in Claude Desktop:* `/api/live-analysis/derivatives-future`. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

> **➕ Built — Change in Open Interest (item #16):** New `fno_live_change_in_oi` tool (plus `getChangeInOi()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Reuses the same futures feed and sorts contracts by the largest change-in-OI, so you see where positions are being built up or unwound fastest. Optional `index` filter. *Endpoint assumption to verify in Claude Desktop:* `/api/live-analysis/change-in-oi`. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

> **➕ Built — OI vs Price Matrix (item #17):** New `fno_live_oi_vs_price` tool (plus `getOiVsPriceMatrix()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Derives the matrix **from the #15 futures feed (no extra network call)** — for each contract it computes the OI change % and classifies it as Long Buildup (price ↑ OI ↑), Short Buildup (price ↓ OI ↑), Long Unwinding (price ↓ OI ↓), Short Covering (price ↑ OI ↓), or Neutral. A fast sentiment read on where traders are positioned. Optional `index` filter. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

> **➕ Built — FII/DII Activity — F&O segment (item #18):** New `fno_fii_stats` tool (plus `getFiiDiiFoStats()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Pulls NSE's `/api/fiidiiFO` feed — the daily FII / DII buy, sell, and net figures (₹ crore) in the **derivatives** market (distinct from the cash-market view in #11). Positive FII net in F&O = institutions adding bullish positions. *Endpoint assumption to verify in Claude Desktop:* `/api/fiidiiFO`. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

> **➕ Built — Most Active Contracts (item #19):** New `fno_combined_oi` tool (plus `getMostActiveContracts()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Pulls NSE's most-active-contracts feed, defaulting to all contracts; an optional `group` filter narrows to `indexFut` / `stockFut` / `indexOpt` / `stockOpt` / `allContract`. Shows where the volume/value action is concentrated. *Trade-off:* the public feed groups by `group` param, so we expose that directly rather than inventing a custom sort. *Endpoint assumption to verify in Claude Desktop:* `/api/live-analysis/most-active-contracts?group=allContract`. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

> **➕ Built — Lot Sizes (item #20):** New `fno_lot_sizes` tool (plus `getLotSizes()` on the NSE provider; Zerodha throws "only available via the free NSE provider"). Returns the standard F&O lot size per symbol from a **maintained local table** (`LOT_SIZES` constant, ~250 entries incl. NIFTY=75, BANKNIFTY=30) — **no network call**, so it's always fast and never rate-limited. Optional `symbol` filter; without it, returns the full sorted list. Verified: 34/34 tests pass (4 files), build + bundle succeed (921.4 kb).

---

## How a feature gets added (our process)

For each "Planned" item:
1. **Plan it** in plain words and agree on the first one to build.
2. **Build it natively in TypeScript** inside our tool — no Python, no external library code copied.
3. **Verify**: run the build + the 34 tests (4 files) to prove nothing broke.
4. **Mark it** `➕ Added` here, commit, and push to the repo.
5. **Report back** in plain language, then pick the next one.

---

## Notes
- NseKit is a *broad data collector* (Python); our tool is a *focused options calculator + Claude assistant* (TypeScript). They are complementary, not rivals.
- All new features reuse the **same free NSE data source** our tool already uses.
- No code changes happen from this document alone — it is our living checklist.
