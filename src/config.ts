/**
 * @module config
 * @description Zod-validated application configuration loaded from environment variables.
 *
 * All configuration is read from `process.env` at import time and validated
 * against a strict Zod schema. Invalid or missing values cause an immediate,
 * descriptive error so misconfigurations are caught at startup — not at runtime.
 *
 * **Important:** This module must never use `console.log` — all diagnostic
 * output goes to `console.error` to protect the MCP stdio transport.
 */

import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── .env loading (git-ignored local secrets) ──────────────────────────────
// Populate process.env from a local `.env` file (if present) WITHOUT overriding
// variables already set by the host (e.g. the Claude Desktop `env` block).
// Skipped under test runners so unit tests are unaffected.
function loadDotEnvFile(): void {
  if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') return;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore malformed .env
  }
}

loadDotEnvFile();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Zod schema for the full application configuration. */
const ConfigSchema = z.object({
  /**
   * Which market data provider to use.
   * - `"nse"` — scrapes public NSE India endpoints (free, no credentials).
   * - `"zerodha"` — uses the Kite Connect REST API (needs API key + token).
   * - `"upstox"` — uses the Upstox v2 REST API (free for customers; needs
   *   API key + secret + a one-time access token). Broker-backed market data
   *   with NSE scraping as automatic fallback for the reports brokers don't
   *   expose (FII/DII, IPO, corporate actions, block deals, VIX, …).
   * - `"angel"` — uses the Angel One SmartAPI (free for customers). Config is
   *   scaffolded; the provider implementation is added as the next step.
   */
  DATA_PROVIDER: z
    .enum(['nse', 'zerodha', 'upstox', 'angel'])
    .default('nse')
    .describe('Market data provider'),

  /**
   * Kite Connect API key — required only when `DATA_PROVIDER` is `"zerodha"`.
   * Obtain from https://developers.kite.trade/.
   */
  KITE_API_KEY: z
    .string()
    .optional()
    .describe('Zerodha Kite API key'),

  /**
   * Kite Connect API secret — required only when `DATA_PROVIDER` is `"zerodha"`.
   */
  KITE_API_SECRET: z
    .string()
    .optional()
    .describe('Zerodha Kite API secret'),

  /**
   * Kite Connect session access token — required only when `DATA_PROVIDER`
   * is `"zerodha"`. Needs to be refreshed daily via the Kite login flow.
   */
  KITE_ACCESS_TOKEN: z
    .string()
    .optional()
    .describe('Zerodha Kite access token'),

  /**
   * Upstox v2 API key (App API key) — required when `DATA_PROVIDER` is
   * `"upstox"`. Create an app at https://developer.upstox.com/.
   */
  UPSTOX_API_KEY: z
    .string()
    .optional()
    .describe('Upstox API key'),

  /**
   * Upstox v2 API secret — required when `DATA_PROVIDER` is `"upstox"`.
   */
  UPSTOX_API_SECRET: z
    .string()
    .optional()
    .describe('Upstox API secret'),

  /**
   * Upstox v2 access token — required when `DATA_PROVIDER` is `"upstox"`.
   * Minted once via the OAuth login flow and stored in `.upstox-token.json`
   * (git-ignored). If absent, set it here or place it in that file.
   * Upstox tokens are valid for ~24 h and must be re-minted daily.
   */
  UPSTOX_ACCESS_TOKEN: z
    .string()
    .optional()
    .describe('Upstox access token'),

  /**
   * Angel One SmartAPI API key — scaffolded for the planned Angel provider.
   */
  ANGEL_API_KEY: z
    .string()
    .optional()
    .describe('Angel One SmartAPI key'),

  /**
   * Angel One client ID (the login user ID) — scaffolded for the planned
   * Angel provider.
   */
  ANGEL_CLIENT_ID: z
    .string()
    .optional()
    .describe('Angel One client ID'),

  /**
   * Angel One client PIN — scaffolded for the planned Angel provider.
   */
  ANGEL_CLIENT_PIN: z
    .string()
    .optional()
    .describe('Angel One client PIN'),

  /**
   * How long (in seconds) to cache real-time market data (quotes, option
   * chains) before re-fetching from the provider.
   *
   * @default 5
   */
  CACHE_TTL_SECONDS: z
    .coerce.number()
    .int()
    .min(1)
    .max(300)
    .default(5)
    .describe('Cache TTL for real-time data in seconds'),

  /**
   * How long (in hours) to cache the instrument master list.
   * The NSE instrument dump is regenerated once a day, so 12 h is a safe default.
   *
   * @default 12
   */
  INSTRUMENT_CACHE_TTL_HOURS: z
    .coerce.number()
    .min(1)
    .max(168)
    .default(12)
    .describe('Cache TTL for the instrument master file in hours'),

  /**
   * Annual risk-free interest rate used in Black-Scholes pricing and Greeks
   * calculations. The default of 0.07 (7 %) reflects the yield on Indian
   * 10-year government bonds as of 2025.
   *
   * @default 0.07
   */
  RISK_FREE_RATE: z
    .coerce.number()
    .min(0)
    .max(1)
    .default(0.07)
    .describe('Risk-free interest rate (annualised)'),

  /**
   * Minimum log level written to stderr.
   *
   * @default "info"
   */
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logging verbosity'),
});

// ---------------------------------------------------------------------------
// Refinement — cross-field validation
// ---------------------------------------------------------------------------

// Cross-field requirements for the Zerodha provider are enforced in
// provider-factory.ts, which falls back to NSE gracefully instead of crashing.
const RefinedConfigSchema = ConfigSchema.superRefine(() => {});

// ---------------------------------------------------------------------------
// Type export
// ---------------------------------------------------------------------------

/** Fully validated application configuration object. */
export type AppConfig = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Parse and validate configuration from the current `process.env`.
 *
 * @returns A frozen, fully-typed {@link AppConfig} object.
 * @throws {ZodError} When one or more environment variables are invalid.
 */
export function loadConfig(): AppConfig {
  const result = RefinedConfigSchema.safeParse({
    DATA_PROVIDER: process.env['DATA_PROVIDER'],
    KITE_API_KEY: process.env['KITE_API_KEY'],
    KITE_API_SECRET: process.env['KITE_API_SECRET'],
    KITE_ACCESS_TOKEN: process.env['KITE_ACCESS_TOKEN'],
    UPSTOX_API_KEY: process.env['UPSTOX_API_KEY'],
    UPSTOX_API_SECRET: process.env['UPSTOX_API_SECRET'],
    UPSTOX_ACCESS_TOKEN: process.env['UPSTOX_ACCESS_TOKEN'],
    ANGEL_API_KEY: process.env['ANGEL_API_KEY'],
    ANGEL_CLIENT_ID: process.env['ANGEL_CLIENT_ID'],
    ANGEL_CLIENT_PIN: process.env['ANGEL_CLIENT_PIN'],
    CACHE_TTL_SECONDS: process.env['CACHE_TTL_SECONDS'],
    INSTRUMENT_CACHE_TTL_HOURS: process.env['INSTRUMENT_CACHE_TTL_HOURS'],
    RISK_FREE_RATE: process.env['RISK_FREE_RATE'],
    LOG_LEVEL: process.env['LOG_LEVEL'],
  });

  if (!result.success) {
    // Pretty-print validation errors to stderr so the operator can fix them.
    const messages = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `[indian-option-mcp] ❌ Invalid configuration:\n${messages}`,
    );
    throw result.error;
  }

  return Object.freeze(result.data);
}

// ---------------------------------------------------------------------------
// Singleton — eagerly validated at import time
// ---------------------------------------------------------------------------

/**
 * The application-wide configuration singleton.
 *
 * Accessing this constant triggers immediate validation so misconfigurations
 * surface at startup rather than at some unpredictable later point.
 *
 * @example
 * ```ts
 * import { config } from './config.js';
 * console.error(`Using ${config.DATA_PROVIDER} provider`);
 * ```
 */
export const config: AppConfig = loadConfig();
