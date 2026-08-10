/**
 * @module server
 * MCP Server setup — creates the McpServer instance and registers all tools,
 * resources, and prompts for the Indian Options analytics platform.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createDataProvider } from './data/provider-factory.js';
import { config } from './config.js';
import { MemoryCache } from './data/cache/memory-cache.js';

// Engine imports
import { optionPrice, calculateGreeks } from './engine/black-scholes.js';
import { calculateIV } from './engine/implied-volatility.js';
import { calculatePayoffAtExpiry, findBreakevens } from './engine/payoff.js';
import { calculateMaxPain } from './engine/max-pain.js';
import { calculatePCR } from './engine/pcr.js';
import { analyzeOIDistribution, detectOIActivity } from './engine/oi-analysis.js';
import {
  calculateIVSmile, calculateIVSkew, calculateIVRank, calculateIVPercentile,
  calculateHistoricalVolatility, hvVsIvAnalysis, expectedMove,
} from './engine/iv-surface.js';
import { STRATEGIES, buildStrategy, suggestStrategies, listStrategies } from './engine/strategy-builder.js';
import { estimateMargin } from './engine/margin-calculator.js';
import { probabilityOfProfit, riskRewardRatio, kellyFraction, optimalPositionSize } from './engine/risk-metrics.js';

// Constants
import { getLotSize } from './data/constants/lot-sizes.js';
import { getNextExpiry, getAllExpiries, isExpiryDay as checkExpiryDay } from './data/constants/expiry-calendar.js';
import { INDICES, getIndexByTradingSymbol } from './data/constants/indices.js';

// Utils
import { daysToExpiry, isMarketOpen, getMarketStatusInfo } from './utils/date.js';
import { formatCurrency, formatNumber, formatPercent, formatLargeNumber, formatOI } from './utils/format.js';

// Types — use the provider's own interface, not the model
import type { OptionChainData, OptionData } from './data/providers/base.provider.js';

const provider = createDataProvider();
const chainCache = new MemoryCache<OptionChainData>({
  maxSize: 50,
  ttlMs: config.CACHE_TTL_SECONDS * 1000,
});

// ── Lazy provider initialization ─────────────────────────────────────────
// Claude Desktop has a strict timeout on MCP server startup.
// NSE cookie fetch can take 10-15s → we MUST NOT block createServer().
// Instead, the provider initializes lazily on the first tool call.
let providerReady = false;
let providerInitPromise: Promise<void> | null = null;

async function ensureProvider(): Promise<void> {
  if (providerReady) return;
  if (!providerInitPromise) {
    providerInitPromise = provider.initialize().then(() => {
      providerReady = true;
      console.error('Data provider initialized: ' + (provider as { name: string }).name);
    }).catch((err) => {
      providerInitPromise = null; // allow retry
      throw err;
    });
  }
  await providerInitPromise;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'indian-option-mcp',
    version: '1.1.0',
  });

  // Fire-and-forget: start init in background (but don't block server startup)
  ensureProvider().catch(() => {});

  // Helper to get cached option chain (ensures provider is ready)
  async function getChain(symbol: string, expiry?: string): Promise<OptionChainData> {
    await ensureProvider();
    const key = `${symbol}:${expiry || 'nearest'}`;
    return chainCache.getOrFetch(key, () => provider.getOptionChain(symbol, expiry));
  }

  // Helper: get index info (strike interval etc)
  function getStrikeInterval(symbol: string): number {
    const info = getIndexByTradingSymbol(symbol);
    return info?.strikeInterval ?? 50;
  }

  // ════════════════════════════════════════════════════════════
  // OPTION CHAIN TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'get_option_chain',
    'Get the complete option chain for an Indian F&O symbol (NIFTY, BANKNIFTY, RELIANCE, etc.) with strike prices, LTP, Open Interest, IV, volume, bid/ask for both calls and puts.',
    {
      symbol: z.string().describe('Underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE'),
      expiry: z.string().optional().describe('Expiry date (DD-Mon-YYYY or YYYY-MM-DD). Defaults to nearest expiry.'),
      strike_range: z.number().optional().describe('Number of strikes around ATM to include (default: 10)'),
    },
    async ({ symbol, expiry, strike_range }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const range = strike_range ?? 10;
      const spotPrice = chain.underlyingValue;

      // Filter to strikes near ATM
      let filteredData = chain.rows;
      if (range > 0) {
        const sorted = [...chain.rows].sort((a, b) =>
          Math.abs(a.strikePrice - spotPrice) - Math.abs(b.strikePrice - spotPrice)
        );
        const nearbyStrikes = new Set(sorted.slice(0, range * 2).map(d => d.strikePrice));
        filteredData = chain.rows.filter(d => nearbyStrikes.has(d.strikePrice));
      }

      // Format as a readable table
      const lines = [
        `📊 Option Chain: ${symbol} | Spot: ₹${formatNumber(spotPrice)}`,
        `📅 Expiry: ${filteredData[0]?.expiryDate || expiry || 'nearest'}`,
        `⏰ Last Updated: ${chain.timestamp}`,
        '',
        'CALLS                                    |  Strike  |                                    PUTS',
        'OI        Chg OI    Volume   IV%     LTP  |          |  LTP     IV%    Volume   Chg OI      OI',
        '-'.repeat(105),
      ];

      for (const row of filteredData.sort((a, b) => a.strikePrice - b.strikePrice)) {
        const isATM = Math.abs(row.strikePrice - spotPrice) <= getStrikeInterval(symbol.toUpperCase()) / 2;
        const marker = isATM ? '→' : ' ';

        const ce = row.CE;
        const pe = row.PE;

        const ceStr = ce
          ? `${formatOI(ce.openInterest).padStart(8)} ${(ce.changeinOpenInterest >= 0 ? '+' : '') + formatOI(ce.changeinOpenInterest).padStart(7)} ${formatOI(ce.totalTradedVolume).padStart(8)} ${(ce.impliedVolatility?.toFixed(1) || '-').padStart(6)} ${ce.lastPrice.toFixed(2).padStart(8)}`
          : ' '.repeat(45);
        const peStr = pe
          ? `${pe.lastPrice.toFixed(2).padEnd(8)} ${(pe.impliedVolatility?.toFixed(1) || '-').padEnd(6)} ${formatOI(pe.totalTradedVolume).padEnd(8)} ${(pe.changeinOpenInterest >= 0 ? '+' : '') + formatOI(pe.changeinOpenInterest).padEnd(7)} ${formatOI(pe.openInterest).padEnd(8)}`
          : '';

        lines.push(`${ceStr} |${marker}${row.strikePrice.toString().padStart(7)} | ${peStr}`);
      }

      lines.push('', `Available Expiries: ${chain.expiryDates.slice(0, 8).join(', ')}${chain.expiryDates.length > 8 ? '...' : ''}`);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'get_expiry_dates',
    'Get all available F&O expiry dates for an Indian stock or index. Use to find weekly/monthly expiries before building strategies. Returns a numbered list of expiry dates sorted chronologically.',
    {
      symbol: z.string().describe('NSE underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE, TATASTEEL'),
    },
    async ({ symbol }) => {
      const chain = await getChain(symbol.toUpperCase());
      const expiries = chain.expiryDates;
      const text = [
        `📅 Expiry Dates for ${symbol.toUpperCase()}:`,
        ...expiries.map((e, i) => `  ${i + 1}. ${e}`),
      ].join('\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.tool(
    'get_spot_price',
    'Get the current spot/underlying price of an Indian stock or index from NSE. Use this to check the latest price before calculating Greeks or building strategies. Returns spot price with timestamp.',
    {
      symbol: z.string().describe('NSE underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE, INFY'),
    },
    async ({ symbol }) => {
      const chain = await getChain(symbol.toUpperCase());
      return {
        content: [{ type: 'text' as const, text: `${symbol.toUpperCase()} Spot Price: ₹${formatNumber(chain.underlyingValue)}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // GREEKS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'calculate_greeks',
    'Calculate all Option Greeks (Delta, Gamma, Theta, Vega, Rho) for a given option using Black-Scholes model.',
    {
      spot: z.number().describe('Current underlying price'),
      strike: z.number().describe('Option strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      iv: z.number().describe('Implied Volatility as percentage, e.g. 15 for 15%'),
      type: z.enum(['CE', 'PE']).describe('Option type: CE (Call) or PE (Put)'),
      rate: z.number().optional().describe('Risk-free rate in % (default: 7% for India)'),
    },
    async ({ spot, strike, expiry_days, iv, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const r = (rate ?? 7) / 100;
      const sigma = iv / 100;

      const greeks = calculateGreeks(spot, strike, T, r, sigma, 0, type);
      const price = optionPrice(spot, strike, T, r, sigma, 0, type);

      const text = [
        `🔢 Greeks for ${type} ${strike} (Spot: ₹${spot}, IV: ${iv}%, DTE: ${expiry_days})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  Theoretical Price: ₹${price.toFixed(2)}`,
        `  Delta (Δ):  ${greeks.delta.toFixed(4)}    — Price changes ₹${(greeks.delta * 1).toFixed(2)} per ₹1 move`,
        `  Gamma (Γ):  ${greeks.gamma.toFixed(6)}    — Delta changes ${greeks.gamma.toFixed(4)} per ₹1 move`,
        `  Theta (Θ):  ${greeks.theta.toFixed(2)}     — Loses ₹${Math.abs(greeks.theta).toFixed(2)} per day`,
        `  Vega  (ν):  ${greeks.vega.toFixed(2)}     — Changes ₹${greeks.vega.toFixed(2)} per 1% IV change`,
        `  Rho   (ρ):  ${greeks.rho.toFixed(2)}     — Changes ₹${greeks.rho.toFixed(2)} per 1% rate change`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.tool(
    'calculate_iv',
    'Calculate Implied Volatility from the market price of an option using Newton-Raphson method.',
    {
      market_price: z.number().describe('Current market premium of the option'),
      spot: z.number().describe('Underlying spot price'),
      strike: z.number().describe('Strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
      rate: z.number().optional().describe('Risk-free rate % (default: 7)'),
    },
    async ({ market_price, spot, strike, expiry_days, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const r = (rate ?? 7) / 100;
      const iv = calculateIV(market_price, spot, strike, T, r, type);

      if (iv === null) {
        return { content: [{ type: 'text' as const, text: 'Could not converge on IV. Check inputs (option may be deep ITM/OTM or near expiry).' }] };
      }

      return {
        content: [{ type: 'text' as const, text: `Implied Volatility for ${type} ${strike}: ${(iv * 100).toFixed(2)}% (annualized)` }],
      };
    }
  );

  server.tool(
    'calculate_option_price',
    'Calculate theoretical option price using Black-Scholes model.',
    {
      spot: z.number().describe('Underlying price'),
      strike: z.number().describe('Strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      iv: z.number().describe('IV as percentage'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
      rate: z.number().optional().describe('Risk-free rate % (default: 7)'),
    },
    async ({ spot, strike, expiry_days, iv, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const price = optionPrice(spot, strike, T, (rate ?? 7) / 100, iv / 100, 0, type);
      return {
        content: [{ type: 'text' as const, text: `Theoretical ${type} ${strike} price: ₹${price.toFixed(2)} (Spot: ₹${spot}, IV: ${iv}%, DTE: ${expiry_days})` }],
      };
    }
  );

  server.tool(
    'what_if_greeks',
    'What-if scenario: Show how Greeks change under hypothetical spot price, IV, or time conditions.',
    {
      spot: z.number().describe('Hypothetical spot price'),
      strike: z.number().describe('Strike price'),
      iv: z.number().describe('Hypothetical IV %'),
      days_to_expiry: z.number().describe('Hypothetical days to expiry'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
    },
    async ({ spot, strike, iv, days_to_expiry, type }) => {
      const T = Math.max(days_to_expiry / 365, 1 / (365 * 24));
      const greeks = calculateGreeks(spot, strike, T, 0.07, iv / 100, 0, type);
      const price = optionPrice(spot, strike, T, 0.07, iv / 100, 0, type);

      const text = [
        `🔮 What-If: ${type} ${strike} @ Spot ₹${spot}, IV ${iv}%, DTE ${days_to_expiry}`,
        `  Price: ₹${price.toFixed(2)} | Δ ${greeks.delta.toFixed(4)} | Γ ${greeks.gamma.toFixed(6)} | Θ ${greeks.theta.toFixed(2)} | ν ${greeks.vega.toFixed(2)}`,
      ].join('\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // STRATEGY TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'build_strategy',
    'Build a pre-defined options strategy (Iron Condor, Bull Call Spread, Straddle, etc.) with real market prices for an Indian F&O symbol.',
    {
      symbol: z.string().describe('Underlying symbol'),
      expiry: z.string().optional().describe('Expiry date'),
      strategy_name: z.string().describe('Strategy name: iron_condor, bull_call_spread, short_straddle, long_straddle, bear_put_spread, etc. Use list_strategies to see all.'),
      otm_offset: z.number().optional().describe('Number of strikes away from ATM for OTM legs (default: varies by strategy)'),
    },
    async ({ symbol, expiry, strategy_name, otm_offset }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;
      const strikeInterval = getStrikeInterval(symbol.toUpperCase());
      const lotSize = getLotSize(symbol.toUpperCase());

      // Find ATM strike
      const atmStrike = chain.rows.reduce((closest, row) =>
        Math.abs(row.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? row : closest
      ).strikePrice;

      // Build premium map from actual market prices
      const premiums = new Map<string, number>();
      for (const row of chain.rows) {
        if (row.CE) premiums.set(`${row.strikePrice}-CE`, row.CE.lastPrice);
        if (row.PE) premiums.set(`${row.strikePrice}-PE`, row.PE.lastPrice);
      }

      const params = {
        spotPrice: spot,
        atmStrike,
        strikeInterval,
        expiry: chain.expiryDates[0] ?? '',
        premiums,
        otmOffset: otm_offset,
      };

      const template = STRATEGIES[strategy_name];
      if (!template) {
        return {
          content: [{ type: 'text' as const, text: `Unknown strategy "${strategy_name}". Use list_strategies to see available strategies.` }],
        };
      }

      const legs = buildStrategy(strategy_name, params);

      // Calculate payoff — map strategy legs to payoff legs (add expiry field)
      const payoffLegs = legs.map(l => ({
        type: l.type,
        strike: l.strike,
        premium: l.premium,
        qty: l.qty,
        action: l.action,
        expiry: l.expiry,
      }));

      const payoff = calculatePayoffAtExpiry(
        payoffLegs,
        { min: spot * 0.85, max: spot * 1.15, steps: 100 },
        lotSize
      );

      // Net premium
      let netPremium = 0;
      for (const l of legs) {
        if (l.action === 'SELL') netPremium += l.premium * l.qty;
        else netPremium -= l.premium * l.qty;
      }

      const isCredit = netPremium > 0;

      const lines = [
        `📋 ${template.displayName} — ${symbol.toUpperCase()}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊 Spot: ₹${formatNumber(spot)} | ATM: ${atmStrike} | Lot: ${lotSize}`,
        `📅 Expiry: ${chain.expiryDates[0]}`,
        `🎯 Outlook: ${template.outlook}`,
        `⚠️ Risk Level: ${template.riskLevel}`,
        '',
        '📐 Legs:',
        ...legs.map(l => `  ${l.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${l.qty}x ${l.type} ${l.strike} @ ₹${l.premium.toFixed(2)}`),
        '',
        `💰 Net Premium: ${isCredit ? '🟢 Credit' : '🔴 Debit'} ₹${Math.abs(netPremium).toFixed(2)} per share`,
        `   Per Lot: ${formatCurrency(Math.abs(netPremium) * lotSize)}`,
        '',
        `📈 Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `📉 Max Loss:   ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `⚖️ Risk/Reward: ${riskRewardRatio(payoff.maxProfit, Math.abs(payoff.maxLoss)).toFixed(2)}`,
        `📍 Breakevens:  ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ') || 'N/A'}`,
        '',
        `ℹ️ ${template.description}`,
        `📖 Max Profit: ${template.maxProfit}`,
        `📖 Max Loss: ${template.maxLoss}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'custom_strategy',
    'Build a custom multi-leg options strategy with specific strikes and actions.',
    {
      symbol: z.string().describe('Underlying symbol'),
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        action: z.enum(['BUY', 'SELL']),
        qty: z.number().default(1),
      })).describe('Array of strategy legs'),
      expiry: z.string().optional(),
    },
    async ({ symbol, legs, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;
      const lotSize = getLotSize(symbol.toUpperCase());

      // Get real premiums from market data
      const fullLegs = legs.map(l => {
        const row = chain.rows.find(r => r.strikePrice === l.strike);
        const premium = l.type === 'CE'
          ? row?.CE?.lastPrice ?? 0
          : row?.PE?.lastPrice ?? 0;
        return { ...l, premium, expiry: chain.expiryDates[0] ?? '' };
      });

      const payoff = calculatePayoffAtExpiry(
        fullLegs,
        { min: spot * 0.85, max: spot * 1.15, steps: 100 },
        lotSize
      );

      let netPremium = 0;
      for (const l of fullLegs) {
        netPremium += (l.action === 'SELL' ? 1 : -1) * l.premium * l.qty;
      }

      const lines = [
        `📋 Custom Strategy — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | Lot: ${lotSize}`,
        '',
        ...fullLegs.map(l => `  ${l.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${l.qty}x ${l.type} ${l.strike} @ ₹${l.premium.toFixed(2)}`),
        '',
        `Net: ${netPremium > 0 ? 'Credit' : 'Debit'} ₹${Math.abs(netPremium).toFixed(2)}/share (₹${formatNumber(Math.abs(netPremium) * lotSize)} per lot)`,
        `Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `Max Loss: ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `Breakevens: ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ') || 'N/A'}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'suggest_strategy',
    'Get AI-friendly strategy suggestions based on your market outlook, risk preference, and capital.',
    {
      outlook: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'VOLATILE']).describe('Your market view'),
      risk_level: z.enum(['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']).optional().describe('Maximum acceptable risk level'),
    },
    async ({ outlook, risk_level }) => {
      const suggestions = suggestStrategies(outlook, risk_level);

      const lines = [
        `💡 Strategy Suggestions for ${outlook} outlook${risk_level ? ` (max risk: ${risk_level})` : ''}:`,
        '',
        ...suggestions.map((s, i) => [
          `${i + 1}. ${s.displayName} [${s.riskLevel}]`,
          `   ${s.description}`,
          `   📊 ${s.outlook}`,
          `   Max Profit: ${s.maxProfit} | Max Loss: ${s.maxLoss}`,
          `   Use: build_strategy with strategy_name="${s.name}"`,
          '',
        ].join('\n')),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'list_strategies',
    'List all available pre-built options strategies, optionally filtered by category.',
    {
      category: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'VOLATILITY']).optional(),
    },
    async ({ category }) => {
      const strategies = listStrategies(category);

      const lines = [
        `📚 Available Strategies${category ? ` (${category})` : ''}:`,
        '',
        ...strategies.map(s =>
          `  • ${s.name.padEnd(28)} ${s.displayName.padEnd(28)} [${s.riskLevel.padEnd(9)}] ${s.legCount} legs`
        ),
        '',
        'Use build_strategy with the strategy name to build it with real market prices.',
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'calculate_payoff',
    'Calculate the payoff/P&L at expiry for given option legs at various underlying prices.',
    {
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        premium: z.number(),
        qty: z.number().default(1),
        action: z.enum(['BUY', 'SELL']),
      })),
      spot_price: z.number().describe('Current spot price for range calculation'),
      lot_size: z.number().describe('Lot size'),
    },
    async ({ legs, spot_price, lot_size }) => {
      // Add expiry field required by the payoff engine
      const legsWithExpiry = legs.map(l => ({ ...l, expiry: '' }));
      const payoff = calculatePayoffAtExpiry(
        legsWithExpiry,
        { min: spot_price * 0.85, max: spot_price * 1.15, steps: 50 },
        lot_size
      );

      const lines = [
        `📊 Payoff Analysis (per lot of ${lot_size})`,
        `Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `Max Loss: ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `Breakevens: ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ')}`,
        '',
        'Price     │ P&L',
        '──────────┼──────────',
        ...payoff.data
          .filter((_, i) => i % 3 === 0) // show every 3rd point
          .map(p => `₹${formatNumber(p.underlyingPrice, 0).padStart(8)} │ ${p.pnl >= 0 ? '+' : ''}${formatCurrency(p.pnl)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // OI ANALYSIS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'calculate_max_pain',
    'Calculate the Max Pain strike price — the price at which option buyers lose the most money.',
    {
      symbol: z.string().describe('Symbol, e.g. NIFTY'),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const lotSize = getLotSize(symbol.toUpperCase());

      const oiData = chain.rows
        .filter(r => r.CE || r.PE)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
        }));

      const result = calculateMaxPain(oiData, lotSize);

      const lines = [
        `🎯 Max Pain Analysis — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(chain.underlyingValue)} | Expiry: ${chain.expiryDates[0]}`,
        '',
        `🎯 Max Pain Strike: ₹${result.maxPainStrike}`,
        `   Distance from Spot: ${formatPercent(((result.maxPainStrike - chain.underlyingValue) / chain.underlyingValue) * 100)}`,
        '',
        'Top 5 pain levels:',
        ...result.painByStrike
          .sort((a, b) => a.totalPain - b.totalPain)
          .slice(0, 5)
          .map((p, i) => `  ${i + 1}. ₹${p.strike} — Total Pain: ${formatLargeNumber(p.totalPain)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'get_pcr',
    'Calculate Put-Call Ratio (PCR) based on Open Interest, Volume, and OI Change.',
    {
      symbol: z.string().describe('Symbol'),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);

      const oiData = chain.rows
        .filter(r => r.CE || r.PE)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
          callVolume: r.CE?.totalTradedVolume ?? 0,
          putVolume: r.PE?.totalTradedVolume ?? 0,
          callOIChange: r.CE?.changeinOpenInterest ?? 0,
          putOIChange: r.PE?.changeinOpenInterest ?? 0,
        }));

      const pcr = calculatePCR(oiData);

      const lines = [
        `📊 Put-Call Ratio — ${symbol.toUpperCase()}`,
        `Expiry: ${chain.expiryDates[0]}`,
        '',
        `  OI PCR:     ${pcr.oiPCR.toFixed(3)}`,
        `  Volume PCR: ${pcr.volumePCR.toFixed(3)}`,
        `  Change PCR: ${pcr.changePCR?.toFixed(3) ?? 'N/A'}`,
        '',
        `  📍 Interpretation: ${pcr.interpretation}`,
        '',
        `  PCR > 1.0 → Excessive put writing → Contrarian BULLISH`,
        `  PCR < 0.7 → Excessive call writing → Contrarian BEARISH`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'highest_oi_strikes',
    'Find strikes with highest Open Interest — these act as support (Put OI) and resistance (Call OI) levels.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      top_n: z.number().optional().describe('Number of top strikes to show (default: 5)'),
    },
    async ({ symbol, expiry, top_n }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const n = top_n ?? 5;

      const oiData = chain.rows.map(r => ({
        strike: r.strikePrice,
        callOI: r.CE?.openInterest ?? 0,
        putOI: r.PE?.openInterest ?? 0,
        callOIChange: r.CE?.changeinOpenInterest,
        putOIChange: r.PE?.changeinOpenInterest,
      }));

      const analysis = analyzeOIDistribution(oiData);

      const lines = [
        `🏔️ OI-Based Support & Resistance — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(chain.underlyingValue)}`,
        '',
        `🔴 RESISTANCE (Highest Call OI — Sellers defending):`,
        ...analysis.topCallOIStrikes.slice(0, n).map((s, i) =>
          `  ${i + 1}. ₹${s.strike} — OI: ${formatOI(s.oi)}`
        ),
        '',
        `🟢 SUPPORT (Highest Put OI — Sellers defending):`,
        ...analysis.topPutOIStrikes.slice(0, n).map((s, i) =>
          `  ${i + 1}. ₹${s.strike} — OI: ${formatOI(s.oi)}`
        ),
        '',
        `📊 ${analysis.summary}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'oi_change_analysis',
    'Analyze Change in Open Interest across strikes to identify emerging support/resistance and market sentiment.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);

      const oiData = chain.rows
        .filter(r => (r.CE?.changeinOpenInterest ?? 0) !== 0 || (r.PE?.changeinOpenInterest ?? 0) !== 0)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
          callOIChange: r.CE?.changeinOpenInterest ?? 0,
          putOIChange: r.PE?.changeinOpenInterest ?? 0,
        }));

      const analysis = analyzeOIDistribution(oiData);

      const lines = [
        `📈 OI Change Analysis — ${symbol.toUpperCase()}`,
        '',
        `🔴 Highest Call OI Increase (Emerging Resistance): ₹${analysis.highestCallOIChange.strike} (+${formatOI(analysis.highestCallOIChange.change)})`,
        `🟢 Highest Put OI Increase (Emerging Support): ₹${analysis.highestPutOIChange.strike} (+${formatOI(analysis.highestPutOIChange.change)})`,
        '',
        `📊 ${analysis.summary}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // IV ANALYTICS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'iv_smile',
    'Get the IV Smile — Implied Volatility across different strike prices for a single expiry.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;

      const smileData = chain.rows
        .filter(r => (r.CE?.impliedVolatility && r.CE.impliedVolatility > 0) || (r.PE?.impliedVolatility && r.PE.impliedVolatility > 0))
        .map(r => ({
          strike: r.strikePrice,
          callIV: r.CE?.impliedVolatility ? r.CE.impliedVolatility : null,
          putIV: r.PE?.impliedVolatility ? r.PE.impliedVolatility : null,
        }));

      const smile = calculateIVSmile(smileData, spot);
      const skew = calculateIVSkew(smileData, spot);

      const lines = [
        `📈 IV Smile — ${symbol.toUpperCase()} (Spot: ₹${formatNumber(spot)})`,
        '',
        'Strike    │ Moneyness │ Call IV │ Put IV │ Avg IV',
        '──────────┼───────────┼─────────┼────────┼────────',
        ...smile
          .filter(p => Math.abs(p.moneyness - 1) < 0.1) // Show strikes within 10% of ATM
          .map(p =>
            `${('₹' + p.strike).padStart(9)} │ ${p.moneyness.toFixed(3).padStart(9)} │ ${(p.callIV?.toFixed(1) ?? '-').padStart(7)} │ ${(p.putIV?.toFixed(1) ?? '-').padStart(6)} │ ${(p.avgIV?.toFixed(1) ?? '-').padStart(6)}`
          ),
        '',
        `📐 IV Skew: ${skew.skew.toFixed(4)}`,
        `   ${skew.description}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'expected_move',
    'Calculate the Expected Move — the price range the market expects the underlying to stay within by expiry.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      confidence: z.number().optional().describe('Sigma multiplier: 1=68%, 1.645=90%, 1.96=95% (default: 1)'),
    },
    async ({ symbol, expiry: expiryInput, confidence }) => {
      const chain = await getChain(symbol.toUpperCase(), expiryInput);
      const spot = chain.underlyingValue;

      // Get ATM IV
      const atmRow = chain.rows.reduce((closest, r) =>
        Math.abs(r.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? r : closest
      );
      const atmIV = ((atmRow.CE?.impliedVolatility ?? 0) + (atmRow.PE?.impliedVolatility ?? 0)) / 2 / 100; // convert % to decimal
      const dte = daysToExpiry(chain.expiryDates[0] ?? new Date().toISOString());

      const move = expectedMove(spot, atmIV, dte, confidence ?? 1);

      const confLabel = confidence === 1.96 ? '95%' : confidence === 1.645 ? '90%' : '68%';

      const lines = [
        `📏 Expected Move — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | ATM IV: ${(atmIV * 100).toFixed(1)}% | DTE: ${dte}`,
        '',
        `At ${confidence ?? 1}σ (${confLabel} probability):`,
        `  📈 Upper Range: ₹${formatNumber(move.upper)}`,
        `  📉 Lower Range: ₹${formatNumber(move.lower)}`,
        `  📏 Total Range:  ₹${formatNumber(move.range)} (${formatPercent(move.movePercent)})`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MARKET DATA TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'market_overview',
    'Get a comprehensive overview of Indian market indices — NIFTY, BANKNIFTY with current values and key options data.',
    {},
    async () => {
      const results: string[] = ['📊 Indian Market Overview', ''];

      for (const idx of ['NIFTY', 'BANKNIFTY']) {
        try {
          const chain = await getChain(idx);
          const spot = chain.underlyingValue;
          const lotSize = getLotSize(idx);

          // ATM data
          const atmRow = chain.rows.reduce((closest, r) =>
            Math.abs(r.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? r : closest
          );
          const atmIV = ((atmRow.CE?.impliedVolatility ?? 0) + (atmRow.PE?.impliedVolatility ?? 0)) / 2;

          // PCR
          const totalCallOI = chain.rows.reduce((s, r) => s + (r.CE?.openInterest ?? 0), 0);
          const totalPutOI = chain.rows.reduce((s, r) => s + (r.PE?.openInterest ?? 0), 0);
          const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

          results.push(
            `${idx}: ₹${formatNumber(spot)} | ATM IV: ${(atmIV * 100).toFixed(1)}% | PCR: ${pcr.toFixed(3)} | Lot: ${lotSize}`,
          );
        } catch {
          results.push(`${idx}: Data unavailable`);
        }
      }

      const status = getMarketStatusInfo();
      results.push('', `🕐 ${status.message}`);

      return { content: [{ type: 'text' as const, text: results.join('\n') }] };
    }
  );

  server.tool(
    'market_status',
    'Check if the Indian stock market (NSE) is currently open or closed. Returns market status with trading hours info. Use before placing trades or to explain why data may be stale. Accounts for weekends and Indian market holidays.',
    {},
    async () => {
      const status = getMarketStatusInfo();
      return {
        content: [{ type: 'text' as const, text: `${status.isOpen ? '🟢' : '🔴'} ${status.message}` }],
      };
    }
  );

  server.tool(
    'india_vix',
    'Get the India VIX — the market "fear gauge" that measures how volatile traders expect the NSE to be over the next ~30 days. Returns the latest reading (with its day change) plus a recent history window. Lower VIX ≈ calm market, higher VIX ≈ fearful/jumpy market. Useful context before reading option prices or implied volatility.',
    {
      days: z.number().int().min(1).max(365).optional()
        .describe('How many past days of VIX history to return (default 30, max 365).'),
    },
    async ({ days }) => {
      await ensureProvider();
      const result = await provider.getIndiaVix(days);

      const cur = result.current;
      const arrow = (cur.change ?? 0) >= 0 ? '▲' : '▼';
      const lines: string[] = [
        `🌊 India VIX — ${cur.timestamp}`,
        `Current: ${cur.value.toFixed(2)}  ${arrow} ${Math.abs(cur.change ?? 0).toFixed(2)} (${cur.pChange?.toFixed(2)}%)`,
        '',
        `Recent (last ${Math.min(result.history.length, 10)} sessions):`,
      ];

      // Show the 10 most recent sessions, newest first.
      const recent = result.history.slice(-10).reverse();
      for (const p of recent) {
        lines.push(
          `  ${p.date}: ${p.close.toFixed(2)}  (O ${p.open.toFixed(2)} / H ${p.high.toFixed(2)} / L ${p.low.toFixed(2)})`,
        );
      }

      lines.push('', '↳ Low VIX ≈ calm market · High VIX ≈ fearful/jumpy market');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'pre_market_sentiment',
    'Early read on how the trading day may open, from pre-market (pre-open) futures activity. Shows the indicative equilibrium price (IEP) vs previous close for index/stock futures, plus an advancing/declining breadth count — a quick bullish/bearish bias gauge before the market opens. Only meaningful during the pre-open window (≈9:00–9:15 AM IST); outside that it is usually empty or stale.',
    {
      segment: z.enum(['FUTIDX', 'FUTSTK']).optional()
        .describe("FUTIDX = index futures (NIFTY, BANKNIFTY, …) [default]; FUTSTK = stock futures."),
    },
    async ({ segment }) => {
      await ensureProvider();
      const result = await provider.getPreMarketDerivatives(segment);

      if (!result.items.length) {
        return {
          content: [{
            type: 'text' as const,
            text:
              'No pre-market F&O data available right now. This feed is only populated during the pre-open window (≈9:00–9:15 AM IST) on trading days. Try again then, or after the market opens.',
          }],
        };
      }

      const s = result.sentiment;
      const bias = s.breadth > 0 ? '🟢 Bullish bias' : s.breadth < 0 ? '🔴 Bearish bias' : '⚪ Neutral';
      const lines: string[] = [
        `🌅 Pre-market F&O sentiment (${result.key}) — as of ${result.asOf}`,
        `${bias}  ·  Advancing ${s.advancing} / Declining ${s.declining}  ·  Breadth ${s.breadth >= 0 ? '+' : ''}${s.breadth}`,
        '',
        'Top movers (by % change):',
      ];

      const movers = [...result.items]
        .sort((a, b) => b.pChange - a.pChange)
        .slice(0, 10);
      for (const it of movers) {
        const arrow = it.change >= 0 ? '▲' : '▼';
        lines.push(
          `  ${arrow} ${it.symbol.padEnd(12)} IEP ${it.iep.toFixed(2)}  ${it.pChange >= 0 ? '+' : ''}${it.pChange.toFixed(2)}%`,
        );
      }

      lines.push('', '↳ IEP = indicative equilibrium price (where the auction is balancing)');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fo_tradable_list',
    'List all stocks and indices that actually have futures & options (F&O) contracts on NSE. Use this to pick a valid underlying before running option-chain, IV, or strategy analysis — if a symbol is not on this list, it has no tradable options. Returns the index list, the stock list, and counts.',
    {
      type: z.enum(['ALL', 'STOCK', 'INDEX']).optional()
        .describe('Which list to return: ALL (default), STOCK only, or INDEX only.'),
    },
    async ({ type }) => {
      await ensureProvider();
      const result = await provider.getFoList();

      const filter = type ?? 'ALL';
      const lines: string[] = [
        `📋 F&O Tradable List (as of ${result.asOf})`,
        `Indices: ${result.totalIndices} · Stocks: ${result.totalStocks}`,
        '',
      ];

      if (filter === 'ALL' || filter === 'INDEX') {
        lines.push('— Indices —');
        lines.push(result.indices.map((i) => i.symbol).sort().join(', '));
        lines.push('');
      }

      if (filter === 'ALL' || filter === 'STOCK') {
        lines.push(`— Stocks (${result.totalStocks}) —`);
        lines.push(result.stocks.map((s) => s.symbol).sort().join(', '));
        lines.push('');
      }

      lines.push('↳ Only symbols shown here have tradable F&O contracts.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'top_movers',
    'Quick market feel — the top gainers and losers (by % change) for an index right now. Default is NIFTY; pass another index (e.g. BANKNIFTY, FINNIFTY, NIFTY 50) to narrow it. Helps you spot which stocks or indices are moving the most today. Only meaningful during market hours.',
    {
      index: z.string().optional()
        .describe("Index to scan, e.g. NIFTY (default), BANKNIFTY, FINNIFTY, NIFTY 50."),
    },
    async ({ index }) => {
      await ensureProvider();
      const result = await provider.getTopMovers(index);

      if (!result.gainers.length && !result.losers.length) {
        return {
          content: [{
            type: 'text' as const,
            text:
              `No top-movers data available right now for ${result.index}. ` +
              'This feed is populated during market hours on trading days. Try again when the market is open.',
          }],
        };
      }

      const lines: string[] = [`📈 Top Movers — ${result.index} (as of ${result.asOf})`, ''];

      const fmt = (m: { symbol: string; lastPrice: number; pChange: number }) =>
        `  ${m.symbol.padEnd(12)} ₹${m.lastPrice.toFixed(2).padStart(10)}  ${m.pChange >= 0 ? '+' : ''}${m.pChange.toFixed(2)}%`;

      lines.push('🟢 Top Gainers');
      for (const g of result.gainers.slice(0, 10)) lines.push(fmt(g));
      lines.push('', '🔴 Top Losers');
      for (const l of result.losers.slice(0, 10)) lines.push(fmt(l));

      lines.push('', '↳ Sorted by % change; figures are live during market hours.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'stock_index_chart',
    'Get historical daily (or weekly) price data — open/high/low/close + volume — for any NSE stock or index over a date range, so you can see the price trend ("chart"). For indices use the index name (NIFTY 50, BANKNIFTY, FINNIFTY, …); for stocks use the ticker (RELIANCE, INFY, …). Returns the series plus a summary (period high/low, average close, total return). Note: Claude Desktop shows this as data, not a picture — ask the assistant to describe the trend.',
    {
      symbol: z.string().describe('NSE symbol, e.g. RELIANCE (stock) or NIFTY 50 / BANKNIFTY (index)'),
      from: z.string().optional().describe('Start date YYYY-MM-DD (default 90 days ago)'),
      to: z.string().optional().describe('End date YYYY-MM-DD (default today)'),
      interval: z.enum(['day', 'week']).optional().describe('day (default) or week aggregation'),
    },
    async ({ symbol, from, to, interval }) => {
      await ensureProvider();

      const toDate = to ? new Date(to) : new Date();
      const fromDate = from
        ? new Date(from)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d; })();

      const candles = await provider.getHistoricalData(symbol, fromDate, toDate, interval ?? 'day');

      if (!candles.length) {
        return {
          content: [{
            type: 'text' as const,
            text:
              `No historical data returned for ${symbol}. ` +
              'Check the symbol (use the F&O tradable list for valid names) and the date range, then try again.',
          }],
        };
      }

      const closes = candles.map((c) => c.close);
      const periodHigh = Math.max(...closes);
      const periodLow = Math.min(...closes);
      const avgClose = closes.reduce((s, v) => s + v, 0) / closes.length;
      const totalReturn = candles.length > 1
        ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100
        : 0;

      const lines: string[] = [
        `📈 ${symbol.toUpperCase()} — ${candles[0].timestamp} → ${candles[candles.length - 1].timestamp} (${(interval ?? 'day')})`,
        `Points: ${candles.length}`,
        `Period high: ${periodHigh.toFixed(2)} · low: ${periodLow.toFixed(2)} · avg close: ${avgClose.toFixed(2)}`,
        `Total return: ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`,
        '',
        'Date         Close       Volume',
      ];

      for (const c of candles) {
        lines.push(
          `${c.timestamp}  ${c.close.toFixed(2).padStart(10)}  ${c.volume.toLocaleString('en-IN')}`,
        );
      }

      lines.push('', '↳ Values are historical EOD; ask the assistant to summarise the trend or flag key levels.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'live_indices',
    'Current values of all major NSE indices (NIFTY 50, BANKNIFTY, NIFTY IT, sectoral indices, INDIA VIX, …) — last price, day change, and % change at a glance. Use this for a quick "where is the market right now" snapshot before drilling into a specific index or running option analysis. Best read during or shortly after market hours.',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getLiveIndices();

      const lines: string[] = [`📊 Live Indices — as of ${result.asOf}`, ''];

      // Show the widely-tracked ones first, then the rest.
      const priority = [
        'NIFTY 50', 'NIFTY BANK', 'INDIA VIX', 'NIFTY FIN SERVICE',
        'NIFTY MIDCAP SELECT', 'NIFTY NEXT 50',
      ];
      const byPriority = [...result.indices].sort((a, b) => {
        const ia = priority.indexOf(a.symbol);
        const ib = priority.indexOf(b.symbol);
        if (ia === -1 && ib === -1) return a.symbol.localeCompare(b.symbol);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      for (const idx of byPriority) {
        const arrow = idx.variation >= 0 ? '▲' : '▼';
        lines.push(
          `  ${idx.symbol.padEnd(22)} ${idx.last.toFixed(2).padStart(10)}  ${arrow} ${idx.variation >= 0 ? '+' : ''}${idx.variation.toFixed(2)} (${idx.percentChange >= 0 ? '+' : ''}${idx.percentChange.toFixed(2)}%)`,
        );
      }

      lines.push('', '↳ Figures are live during market hours; outside hours they show the last close.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'index_constituents',
    'List the stocks that make up a named NSE index — by default NIFTY 50, or pass NIFTY 500 / NIFTY BANK / NIFTY IT / any sectoral index. Each constituent shows its last price, day change %, and traded volume — handy for seeing which stocks are driving an index. Defaults to NIFTY 50.',
    {
      index: z.string().optional()
        .describe('Index name, e.g. NIFTY 50 (default), NIFTY 500, NIFTY BANK, NIFTY IT.'),
    },
    async ({ index }) => {
      await ensureProvider();
      const name = index ?? 'NIFTY 50';
      const result = await provider.getIndexConstituents(name);

      if (!result.constituents.length) {
        return {
          content: [{
            type: 'text' as const,
            text:
              `No constituents returned for "${result.index}". ` +
              'Check the index name (use NIFTY 50, NIFTY 500, NIFTY BANK, NIFTY IT, …), or try again during market hours.',
          }],
        };
      }

      const lines: string[] = [`🧩 ${result.index} — ${result.constituents.length} constituents (as of ${result.asOf})`, ''];

      const fmt = (c: { symbol: string; lastPrice: number; pChange: number; volume: number }) =>
        `  ${c.symbol.padEnd(14)} ₹${c.lastPrice.toFixed(2).padStart(10)}  ${c.pChange >= 0 ? '+' : ''}${c.pChange.toFixed(2)}%  vol ${c.volume.toLocaleString('en-IN')}`;

      lines.push('Top 15 by % change (gainers & losers):');
      const sorted = [...result.constituents].sort((a, b) => b.pChange - a.pChange);
      for (const c of sorted.slice(0, 15)) lines.push(fmt(c));

      lines.push('', `↳ Full list has ${result.constituents.length} stocks; ask for a specific one or a sector.`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'ipo_tracker',
    'IPO watch — what is happening in the new-listings market right now. Returns three things in one view: (1) currently open IPOs you can still apply to, (2) pre-open (listing-day auction) IPOs with their indicative price, and (3) a summary of recently listed IPOs with listing-day gain/loss. Use it to track new issues without leaving the assistant.',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getIpoTracker();

      const lines: string[] = ['🆕 IPO Tracker', ''];

      // (1) Currently open
      lines.push(`— Currently open (${result.current.length}) —`);
      if (result.current.length) {
        for (const ipo of result.current) {
          lines.push(
            `  ${ipo.symbol.padEnd(12)} ${ipo.companyName} · ${ipo.series} · ${ipo.status}` +
            (ipo.issuePrice ? ` · ₹${ipo.issuePrice}` : '') +
            ` · ${ipo.issueStartDate} → ${ipo.issueEndDate}`,
          );
        }
      } else {
        lines.push('  None open right now.');
      }

      // (2) Pre-open
      lines.push('', `— Pre-open / listing today (${result.preOpen.length}) —`);
      if (result.preOpen.length) {
        for (const p of result.preOpen) {
          const arrow = p.change >= 0 ? '▲' : '▼';
          lines.push(
            `  ${p.symbol.padEnd(12)} IEP ₹${p.iep.toFixed(2)}  ${arrow} ${p.perChange >= 0 ? '+' : ''}${p.perChange.toFixed(2)}%  (prev close ₹${p.prevClose.toFixed(2)})`,
          );
        }
      } else {
        lines.push('  None in pre-open right now.');
      }

      // (3) Summary
      lines.push('', `— Recently listed (${result.summary.length}) —`);
      if (result.summary.length) {
        for (const s of result.summary.slice(0, 12)) {
          const arrow = s.gainLossPer >= 0 ? '▲' : '▼';
          lines.push(
            `  ${s.symbol.padEnd(12)} ${s.marketType.padEnd(9)} issued ₹${s.issuePrice.toFixed(2)} · listed ₹${s.listedDayClose.toFixed(2)} (${arrow} ${s.listedDayGainPer >= 0 ? '+' : ''}${s.listedDayGainPer.toFixed(2)}% on day 1)`,
          );
        }
      } else {
        lines.push('  No recently-listed data available.');
      }

      lines.push('', '↳ "IEP" = indicative equilibrium price during the listing-day auction.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'corporate_actions',
    'Corporate actions watch — dividends, bonuses, stock splits, buybacks and similar announcements from NSE. Pass a stock symbol (e.g. RELIANCE) to see that company\'s upcoming actions, or leave it blank to see everything in the window. Returns the purpose (dividend/bonus/split/…), ex-date, and record date for each. Useful before an earnings/action date that can move a stock or its options.',
    {
      symbol: z.string().optional()
        .describe('NSE equity symbol, e.g. RELIANCE, INFY. Omit to see all actions in the window.'),
      fromDate: z.string().optional()
        .describe('Start date YYYY-MM-DD (default: yesterday).'),
      toDate: z.string().optional()
        .describe('End date YYYY-MM-DD (default: ~90 days ahead).'),
    },
    async ({ symbol, fromDate, toDate }) => {
      await ensureProvider();
      const result = await provider.getCorporateActions(
        symbol ?? undefined,
        fromDate ?? undefined,
        toDate ?? undefined,
      );

      const lines: string[] = [
        `🏛️ Corporate Actions — ${result.fromDate} → ${result.toDate}`,
        `(${result.actions.length} found)`,
        '',
      ];

      if (!result.actions.length) {
        lines.push('No corporate actions in this window. Try a wider date range or a specific symbol.');
      } else {
        for (const a of result.actions.slice(0, 30)) {
          const purpose = a.purpose || '(unspecified)';
          const ex = a.exDate ? ` · ex ${a.exDate}` : '';
          lines.push(`  ${a.symbol.padEnd(12)} ${purpose}${ex}`);
        }
        if (result.actions.length > 30) {
          lines.push('', `… and ${result.actions.length - 30} more.`);
        }
      }

      lines.push('', '↳ ex-date = first day the stock trades without the action (price adjusts then).');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'block_deals',
    'Block-deal watch — large negotiated trades (₹10 crore+) reported to the exchange in the MORNING or AFTERNOON window. Shows the stock, its last price, day change %, and the total volume/value of the block. A flurry of block deals in a stock can signal institutional activity. Only meaningful during market hours.',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getBlockDeals();

      if (!result.deals.length) {
        return {
          content: [{
            type: 'text' as const,
            text:
              'No block deals reported right now. This feed is populated during market hours ' +
              'in the MORNING and AFTERNOON windows. Try again when the market is open.',
          }],
        };
      }

      const lines: string[] = [`🧱 Block Deals (${result.deals.length})`, ''];
      const fmt = (d: { symbol: string; lastPrice: number; pChange: number; totalTradedVolume: number; totalTradedValue: number; session: string }) =>
        `  [${d.session.padEnd(9)}] ${d.symbol.padEnd(12)} ₹${d.lastPrice.toFixed(2).padStart(10)} ${d.pChange >= 0 ? '+' : ''}${d.pChange.toFixed(2)}%  vol ${d.totalTradedVolume.toLocaleString('en-IN')} · ₹${d.totalTradedValue.toLocaleString('en-IN')}`;

      for (const d of result.deals.slice(0, 30)) lines.push(fmt(d));
      if (result.deals.length > 30) lines.push('', `… and ${result.deals.length - 30} more.`);

      lines.push('', '↳ Block deals are large trades done at a negotiated price, reported separately from normal trades.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fii_dii_activity',
    'Daily FII/DII activity in the Indian cash market — how much Foreign (FII) and Domestic (DII) Institutional Investors bought vs sold, as net ₹ crore. Positive FII net = foreign money flowing in (generally bullish); negative = flowing out. Also shows PRO and CLIENT figures. Published once per trading day after market close.',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getFiiDiiActivity();

      if (!result.entries.length) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No FII/DII activity data available right now. This is published once per trading day (after market close). Try again later.',
          }],
        };
      }

      const lines: string[] = [
        `🏦 FII / DII Activity — ${result.date || 'latest'}`,
        '',
        'Category     Buy(₹cr)    Sell(₹cr)    Net(₹cr)',
        '─────────  ──────────  ──────────  ──────────',
      ];
      for (const e of result.entries) {
        const net = `${e.netValue >= 0 ? '+' : ''}${e.netValue.toLocaleString('en-IN')}`.padStart(11);
        lines.push(
          `${e.category.padEnd(10)} ${String(e.buyValue.toLocaleString('en-IN')).padStart(11)} ${String(e.sellValue.toLocaleString('en-IN')).padStart(11)} ${net}`,
        );
      }
      lines.push('', '↳ FII = foreign institutions, DII = domestic institutions. Large FII net inflows are typically read as bullish.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'participant_oi',
    'FII open-interest positioning across futures & options — how much OI foreign institutions hold LONG vs SHORT in index/stock futures and options. A high long % in index futures suggests bullish institutional sentiment; a high short % suggests bearish hedging. Refreshed intraday.',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getParticipantOi();

      if (!result.instruments.length) {
        return {
          content: [{ type: 'text' as const, text: 'No participant OI data available right now. Try during market hours.' }],
        };
      }

      const fmt = (i: { instrument: string; longPosition: number; shortPosition: number; longPercentage: number; shortPercentage: number; totalOI: number }) =>
        `  ${i.instrument.padEnd(15)} long ₹${i.longPosition.toLocaleString('en-IN')}cr (${i.longPercentage.toFixed(1)}%) · short ₹${i.shortPosition.toLocaleString('en-IN')}cr (${i.shortPercentage.toFixed(1)}%) · total ₹${i.totalOI.toLocaleString('en-IN')}cr`;
      const lines: string[] = ['📊 FII Open Interest (Long vs Short)', ''];
      for (const i of result.instruments) lines.push(fmt(i));
      lines.push('', '↳ Shows where FIIs are positioned. Long-heavy = bullish bias; short-heavy = bearish / hedged.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'week_52_high_low',
    'Lists stocks hitting fresh 52-week highs and 52-week lows today. A high count of 52-week highs signals strong broad participation; a surge in 52-week lows signals broad weakness/distress. Optional limit controls rows per list.',
    {
      limit: z.number().int().positive().max(50).optional().describe('Max rows per list (default 25)'),
    },
    async ({ limit }) => {
      await ensureProvider();
      const result = await provider.getWeek52HighLow();
      const n = limit ?? 25;

      const fmt = (it: { symbol: string; lastPrice: number; pChange: number }) =>
        `  ${it.symbol.padEnd(12)} ₹${it.lastPrice.toFixed(2).padStart(10)} ${it.pChange >= 0 ? '+' : ''}${it.pChange.toFixed(2)}%`;
      const lines: string[] = [`📈 52-Week HIGH (${result.highs.length} stocks)`, ''];
      if (!result.highs.length) lines.push('  (none reported)');
      for (const it of result.highs.slice(0, n)) lines.push(fmt(it));
      lines.push('', `📉 52-Week LOW (${result.lows.length} stocks)`, '');
      if (!result.lows.length) lines.push('  (none reported)');
      for (const it of result.lows.slice(0, n)) lines.push(fmt(it));
      lines.push('', '↳ Counts of highs vs lows are a classic market-breadth gauge.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'market_breadth',
    'Market breadth for an index — how many constituents are advancing (up), declining (down), or unchanged, plus the advance-decline ratio. Ratio > 1 = more stocks rising than falling (bullish breadth); < 1 = weak breadth. Default index: NIFTY 50.',
    {
      index: z.string().optional().describe('Index name, e.g. NIFTY 50, NIFTY BANK, NIFTY 500 (default NIFTY 50)'),
    },
    async ({ index }) => {
      await ensureProvider();
      const result = await provider.getMarketBreadth(index);

      const lines: string[] = [
        `📏 Market Breadth — ${result.index}`,
        '',
        `  Advances : ${result.advances}`,
        `  Declines : ${result.declines}`,
        `  Unchanged: ${result.unchanged}`,
        `  Total    : ${result.total}`,
        `  A/D Ratio: ${result.adRatio}`,
        '',
        result.adRatio > 1
          ? '↳ More stocks advancing than declining — breadth is constructive.'
          :         result.adRatio < 1
          ? '↳ More stocks declining than advancing — breadth is weak.'
          : '↳ Advances and declines are balanced.',
      ];
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_live_futures_data',
    'Live NSE futures data — per-contract last price, change %, open interest, and change in OI across index/stock futures. Optional index filter (e.g. NIFTY, BANKNIFTY) narrows it down. Best during market hours.',
    {
      index: z.string().optional().describe('Optional filter, e.g. NIFTY, BANKNIFTY (default: all futures)'),
    },
    async ({ index }) => {
      await ensureProvider();
      const result = await provider.getFuturesLiveData(index);
      const fmt = (c: { symbol: string; expiry: string; lastPrice: number; pChange: number; openInterest: number; changeInOi: number }) =>
        `  ${c.symbol.padEnd(12)} ${c.expiry.padEnd(12)} ₹${c.lastPrice.toFixed(2).padStart(10)} ${c.pChange >= 0 ? '+' : ''}${c.pChange.toFixed(2)}%  OI ${c.openInterest.toLocaleString('en-IN')}  ΔOI ${c.changeInOi >= 0 ? '+' : ''}${c.changeInOi.toLocaleString('en-IN')}`;
      const lines: string[] = [`📈 Live Futures Data${result.index ? ' — ' + result.index : ''} (${result.contracts.length} contracts)`, ''];
      if (!result.contracts.length) lines.push('  (no data — market may be closed)');
      for (const c of result.contracts.slice(0, 50)) lines.push(fmt(c));
      lines.push('', '↳ OI = open interest; ΔOI = change in OI vs previous day.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_live_change_in_oi',
    'Contracts ranked by change in open interest (ΔOI) — shows where fresh positions are being built or squared off. Positive ΔOI = new positions added; negative = positions closed. Optional index filter.',
    {
      index: z.string().optional().describe('Optional filter, e.g. NIFTY, BANKNIFTY (default: all)'),
    },
    async ({ index }) => {
      await ensureProvider();
      const result = await provider.getChangeInOi(index);
      const fmt = (c: { symbol: string; expiry: string; openInterest: number; changeInOi: number }) =>
        `  ${c.symbol.padEnd(12)} ${c.expiry.padEnd(12)} OI ${c.openInterest.toLocaleString('en-IN')}  ΔOI ${c.changeInOi >= 0 ? '+' : ''}${c.changeInOi.toLocaleString('en-IN')}`;
      const lines: string[] = [`🔁 Change in Open Interest${result.index ? ' — ' + result.index : ''} (${result.contracts.length} contracts)`, ''];
      if (!result.contracts.length) lines.push('  (no data — market may be closed)');
      for (const c of result.contracts.slice(0, 50)) lines.push(fmt(c));
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_live_oi_vs_price',
    'OI vs Price matrix — classifies each futures contract by whether price and open interest are rising/falling together: Long Buildup (price↑ OI↑), Short Buildup (price↓ OI↑), Long Unwinding (price↓ OI↓), Short Covering (price↑ OI↓). A read on trader positioning. Optional index filter.',
    {
      index: z.string().optional().describe('Optional filter, e.g. NIFTY, BANKNIFTY (default: all futures)'),
    },
    async ({ index }) => {
      await ensureProvider();
      const result = await provider.getOiVsPriceMatrix(index);
      const fmt = (i: { symbol: string; expiry: string; pChange: number; oiChangePct: number; category: string }) =>
        `  ${i.symbol.padEnd(12)} ${i.expiry.padEnd(12)} price ${i.pChange >= 0 ? '+' : ''}${i.pChange.toFixed(2)}%  OI ${i.oiChangePct >= 0 ? '+' : ''}${i.oiChangePct.toFixed(2)}%  → ${i.category}`;
      const lines: string[] = [`🔃 OI vs Price Matrix${result.index ? ' — ' + result.index : ''} (${result.items.length} contracts)`, ''];
      if (!result.items.length) lines.push('  (no data — market may be closed)');
      for (const i of result.items.slice(0, 50)) lines.push(fmt(i));
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_fii_stats',
    'FII/DII trading activity in the Futures & Options segment — buy, sell and net value (₹ crore) for FIIs and DIIs in index/stock futures & options. Complements the cash-market FII/DII view (fii_dii_activity) and the OI-positioning view (participant_oi).',
    {},
    async () => {
      await ensureProvider();
      const result = await provider.getFiiDiiFoStats();
      const fmt = (e: { category: string; date: string; buyValue: number; sellValue: number; netValue: number }) =>
        `  ${e.category.padEnd(6)} ${e.date.padEnd(12)} buy ₹${e.buyValue.toLocaleString('en-IN')}cr  sell ₹${e.sellValue.toLocaleString('en-IN')}cr  net ${e.netValue >= 0 ? '+' : ''}₹${e.netValue.toLocaleString('en-IN')}cr`;
      const lines: string[] = ['🏦 FII / DII Activity (F&O)', ''];
      if (!result.entries.length) lines.push('  (no data — market may be closed)');
      for (const e of result.entries) lines.push(fmt(e));
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_combined_oi',
    'Most-active F&O contracts ranked by open interest / volume — where the most positions are concentrated ("combined OI"). Optional group filter: allContract (default), FUTIDX, FUTSTK, OPTIDX, OPTSTK.',
    {
      group: z.string().optional().describe('Group filter: allContract (default), FUTIDX, FUTSTK, OPTIDX, OPTSTK'),
    },
    async ({ group }) => {
      await ensureProvider();
      const result = await provider.getMostActiveContracts(group);
      const fmt = (c: { symbol: string; expiry: string; openInterest: number; volume: number }) =>
        `  ${c.symbol.padEnd(12)} ${c.expiry.padEnd(12)} OI ${c.openInterest.toLocaleString('en-IN')}  vol ${c.volume.toLocaleString('en-IN')}`;
      const lines: string[] = [`🔥 Most Active Contracts — ${result.group} (${result.contracts.length})`, ''];
      if (!result.contracts.length) lines.push('  (no data — market may be closed)');
      for (const c of result.contracts.slice(0, 50)) lines.push(fmt(c));
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fno_lot_sizes',
    'F&O lot sizes (shares per contract) for NSE derivatives — a reference table. Pass a symbol (e.g. NIFTY, RELIANCE) for a single value, or omit it to list all known F&O lot sizes.',
    {
      symbol: z.string().optional().describe('Optional NSE F&O symbol, e.g. NIFTY, BANKNIFTY, RELIANCE (default: list all)'),
    },
    async ({ symbol }) => {
      await ensureProvider();
      const result = await provider.getLotSizes(symbol);
      const fmt = (e: { symbol: string; lotSize: number }) => `  ${e.symbol.padEnd(15)} ${e.lotSize} shares/lot`;
      const lines: string[] = [`📐 F&O Lot Sizes (${result.entries.length} entries)`, ''];
      if (!result.entries.length) lines.push(`  (unknown symbol "${symbol}" — check spelling or list all)`);
      for (const e of result.entries.slice(0, 100)) lines.push(fmt(e));
      if (result.entries.length > 100) lines.push(`  … and ${result.entries.length - 100} more — pass a symbol to narrow down.`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'lot_size',
    'Get the F&O lot size (number of shares per contract) for any NSE stock or index. Essential for calculating strategy costs, margin, and position sizing. Returns the current lot size as defined by NSE.',
    {
      symbol: z.string().describe('NSE F&O symbol, e.g. NIFTY (75), BANKNIFTY (30), RELIANCE, TATASTEEL'),
    },
    async ({ symbol }) => {
      const size = getLotSize(symbol.toUpperCase());
      return {
        content: [{ type: 'text' as const, text: `Lot size for ${symbol.toUpperCase()}: ${size} shares per lot` }],
      };
    }
  );

  server.tool(
    'next_expiry',
    'Get the next upcoming F&O expiry date for an Indian stock or index. Supports both weekly (index) and monthly expiries. Use to determine time-to-expiry for Greeks calculations or strategy timing.',
    {
      symbol: z.string().describe('NSE F&O symbol, e.g. NIFTY, BANKNIFTY, RELIANCE'),
      weekly: z.boolean().optional().describe('If true, get weekly expiry (only indices have weekly)'),
    },
    async ({ symbol, weekly }) => {
      const expiry = getNextExpiry(symbol.toUpperCase(), weekly ?? false);
      return {
        content: [{ type: 'text' as const, text: `Next expiry for ${symbol.toUpperCase()}: ${expiry.toDateString()}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // RISK MANAGEMENT TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'estimate_margin',
    'Estimate the margin required for an options strategy (SPAN + Exposure margin).',
    {
      symbol: z.string(),
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        premium: z.number(),
        qty: z.number().default(1),
        action: z.enum(['BUY', 'SELL']),
      })),
    },
    async ({ symbol, legs }) => {
      const chain = await getChain(symbol.toUpperCase());
      const spot = chain.underlyingValue;
      const lotSize = getLotSize(symbol.toUpperCase());

      const margin = estimateMargin(legs, spot, lotSize);

      const lines = [
        `💰 Margin Estimate — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | Lot: ${lotSize}`,
        '',
        `  SPAN Margin:     ${formatCurrency(margin.spanMargin)}`,
        `  Exposure Margin: ${formatCurrency(margin.exposureMargin)}`,
        `  Total Margin:    ${formatCurrency(margin.totalMargin)}`,
        margin.premiumReceived > 0 ? `  Premium Received: ${formatCurrency(margin.premiumReceived)}` : '',
        margin.marginBenefit > 0 ? `  Hedge Benefit:    ${formatCurrency(margin.marginBenefit)}` : '',
        '',
        '⚠️ Note: This is an estimate. Actual margins are calculated by the exchange using SPAN.',
      ].filter(Boolean);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'probability_of_profit',
    'Calculate the Probability of Profit (POP) for an options strategy using log-normal distribution.',
    {
      breakevens: z.array(z.number()).describe('Breakeven price(s) of the strategy'),
      spot_price: z.number(),
      iv: z.number().describe('IV as percentage'),
      days_to_expiry: z.number(),
      strategy_type: z.enum(['CREDIT', 'DEBIT']),
    },
    async ({ breakevens, spot_price, iv, days_to_expiry, strategy_type }) => {
      const pop = probabilityOfProfit(breakevens, spot_price, iv / 100, days_to_expiry, strategy_type);

      return {
        content: [{ type: 'text' as const, text: `Probability of Profit: ${(pop * 100).toFixed(1)}%\n(${strategy_type} strategy, ${days_to_expiry} DTE, IV: ${iv}%)` }],
      };
    }
  );

  server.tool(
    'position_sizing',
    'Calculate optimal position size based on capital and risk tolerance.',
    {
      capital: z.number().describe('Total trading capital in ₹'),
      risk_percent: z.number().describe('Max % of capital to risk per trade (e.g. 2)'),
      max_loss_per_lot: z.number().describe('Maximum loss per lot for the strategy in ₹'),
      lot_size: z.number().describe('Lot size of the instrument'),
    },
    async ({ capital, risk_percent, max_loss_per_lot, lot_size }) => {
      const result = optimalPositionSize(capital, risk_percent, max_loss_per_lot, lot_size);

      const lines = [
        `📐 Position Sizing (${risk_percent}% risk rule)`,
        `  Capital: ${formatCurrency(capital)}`,
        `  Max Risk: ${formatCurrency(capital * risk_percent / 100)}`,
        `  Max Loss/Lot: ${formatCurrency(max_loss_per_lot * lot_size)}`,
        '',
        `  ✅ Recommended: ${result.lots} lot(s)`,
        `  Total Risk: ${formatCurrency(result.totalRisk)} (${result.capitalUsedPercent.toFixed(1)}% of capital)`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // SCANNER TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'scan_high_oi',
    'Find strikes with the highest Open Interest buildup — indicates significant institutional positioning.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      min_oi: z.number().optional().describe('Minimum OI threshold'),
    },
    async ({ symbol, expiry, min_oi }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const threshold = min_oi ?? 0;

      const callOI = chain.rows
        .filter(r => (r.CE?.openInterest ?? 0) > threshold)
        .sort((a, b) => (b.CE?.openInterest ?? 0) - (a.CE?.openInterest ?? 0))
        .slice(0, 10);

      const putOI = chain.rows
        .filter(r => (r.PE?.openInterest ?? 0) > threshold)
        .sort((a, b) => (b.PE?.openInterest ?? 0) - (a.PE?.openInterest ?? 0))
        .slice(0, 10);

      const lines = [
        `🔍 High OI Scanner — ${symbol.toUpperCase()}`,
        '',
        '📞 Top Call OI:',
        ...callOI.map(r => `  ₹${r.strikePrice} — OI: ${formatOI(r.CE!.openInterest)} | LTP: ₹${r.CE!.lastPrice.toFixed(2)}`),
        '',
        '📱 Top Put OI:',
        ...putOI.map(r => `  ₹${r.strikePrice} — OI: ${formatOI(r.PE!.openInterest)} | LTP: ₹${r.PE!.lastPrice.toFixed(2)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'unusual_activity',
    'Detect unusual options activity — strikes with abnormally high volume relative to open interest.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      threshold: z.number().optional().describe('Volume/OI ratio threshold (default: 0.5)'),
    },
    async ({ symbol, expiry, threshold: thresh }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const threshold = thresh ?? 0.5;

      const unusual: string[] = [];

      for (const row of chain.rows) {
        if (row.CE && row.CE.openInterest > 0) {
          const ratio = row.CE.totalTradedVolume / row.CE.openInterest;
          if (ratio > threshold) {
            unusual.push(`🟡 CE ${row.strikePrice}: Vol/OI = ${ratio.toFixed(2)} (Vol: ${formatOI(row.CE.totalTradedVolume)}, OI: ${formatOI(row.CE.openInterest)})`);
          }
        }
        if (row.PE && row.PE.openInterest > 0) {
          const ratio = row.PE.totalTradedVolume / row.PE.openInterest;
          if (ratio > threshold) {
            unusual.push(`🟡 PE ${row.strikePrice}: Vol/OI = ${ratio.toFixed(2)} (Vol: ${formatOI(row.PE.totalTradedVolume)}, OI: ${formatOI(row.PE.openInterest)})`);
          }
        }
      }

      unusual.sort().reverse();

      const lines = [
        `⚡ Unusual Activity Scanner — ${symbol.toUpperCase()} (threshold: ${threshold})`,
        '',
        unusual.length > 0
          ? unusual.slice(0, 20).join('\n')
          : 'No unusual activity detected at current threshold.',
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MCP RESOURCES
  // ════════════════════════════════════════════════════════════

  server.resource(
    'market-status',
    'market://status',
    async () => {
      const status = getMarketStatusInfo();
      return {
        contents: [{
          uri: 'market://status',
          text: JSON.stringify({ ...status, timestamp: new Date().toISOString() }),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MCP PROMPTS
  // ════════════════════════════════════════════════════════════

  server.prompt(
    'strategy_advisor',
    'Get a personalized options strategy recommendation based on market data and your outlook.',
    {
      symbol: z.string().describe('Symbol to analyze'),
      outlook: z.enum(['bullish', 'bearish', 'neutral', 'volatile']).describe('Your market view'),
      capital: z.string().optional().describe('Available capital in ₹'),
    },
    ({ symbol, outlook, capital }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `I need an options strategy recommendation for ${symbol.toUpperCase()}.`,
            `My outlook is ${outlook}.`,
            capital ? `My available capital is ₹${capital}.` : '',
            '',
            'Please:',
            '1. First get the option chain and spot price using get_option_chain',
            '2. Check PCR and Max Pain using get_pcr and calculate_max_pain',
            '3. Look at the expected move using expected_move',
            '4. Suggest strategies using suggest_strategy',
            '5. Build the best strategy using build_strategy',
            '6. Show the payoff analysis and risk metrics',
            '7. Recommend position sizing if capital is provided',
          ].filter(Boolean).join('\n'),
        },
      }],
    })
  );

  server.prompt(
    'market_analysis',
    'Get a comprehensive market analysis for an Indian F&O symbol.',
    {
      symbol: z.string().describe('Symbol to analyze'),
    },
    ({ symbol }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Give me a comprehensive options analysis for ${symbol.toUpperCase()}.`,
            '',
            'Please analyze:',
            '1. Current spot price and market status (market_overview)',
            '2. Option chain with Greeks (get_option_chain)',
            '3. Support and resistance from OI (highest_oi_strikes)',
            '4. Put-Call Ratio sentiment (get_pcr)',
            '5. Max Pain level (calculate_max_pain)',
            '6. Expected move range (expected_move)',
            '7. IV Smile and skew (iv_smile)',
            '8. OI change patterns (oi_change_analysis)',
            '',
            'Synthesize all data into a clear market view with actionable insights.',
          ].join('\n'),
        },
      }],
    })
  );

  return server;
}
