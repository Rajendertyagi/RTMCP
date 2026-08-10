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
| 1 | **India VIX (volatility index)** | The "fear gauge" — how jumpy the market expects to be. Shows current VIX + recent history. | Options-relevant | 📋 Planned | High |
| 2 | **Market open / closed + holidays** | Tells you if the market is open *right now*, the next trading day, and upcoming holidays — so you never fetch data when there's none. | Utility | 📋 Planned | Medium |
| 3 | **Pre-market derivatives sentiment** | Early read on how the day might open, from derivative activity. | Options-relevant | 📋 Planned | Medium |
| 4 | **F&O tradable list** | A list of stocks & indices that actually have options/futures, so you can pick what to analyze. | Utility | 📋 Planned | Medium |
| 5 | **Top movers (gainers / losers)** | Which stocks or indices moved the most today — a quick market feel. | Broad market | 📋 Planned | Low |
| 6 | **Live indices / Nifty 50 & 500 lists** | Current values of major indices and their constituent lists. | Broad market | 📋 Planned | Low |
| 7 | **IPO tracker** | Current IPOs, pre-open IPOs, and a summary view. | Broad market | 📋 Planned | Low |
| 8 | **Corporate actions / announcements** | Dividends, bonuses, board meetings, etc. | Broad market | 📋 Planned | Low |
| 9 | **Stock & index charts** | Historical price charts for a symbol. | Broad market | 📋 Planned | Low |
| 10 | **Block deals / insider trading** | Large trades and insider activity feed. | Broad market | 📋 Planned | Low |

---

## How a feature gets added (our process)

For each "Planned" item:
1. **Plan it** in plain words and agree on the first one to build.
2. **Build it natively in TypeScript** inside our tool — no Python, no external library code copied.
3. **Verify**: run the build + the 18 tests to prove nothing broke.
4. **Mark it** `➕ Added` here, commit, and push to the repo.
5. **Report back** in plain language, then pick the next one.

---

## Notes
- NseKit is a *broad data collector* (Python); our tool is a *focused options calculator + Claude assistant* (TypeScript). They are complementary, not rivals.
- All new features reuse the **same free NSE data source** our tool already uses.
- No code changes happen from this document alone — it is our living checklist.
