// ────────────────────────────────────────────────────────────────────────────
// Provider Factory
//
// Creates the appropriate DataProvider instance based on configuration.
//
// Selection logic (DATA_PROVIDER env var):
//   • "upstox"  → UpstoxProvider (broker market data + automatic NSE scraping
//                 fallback for the reports brokers don't expose). Requires
//                 UPSTOX_API_KEY + UPSTOX_API_SECRET + UPSTOX_ACCESS_TOKEN.
//   • "zerodha" → ZerodhaProvider (requires Kite API key + access token).
//   • "angel"   → scaffolded; provider not built yet, falls back to NSE.
//   • anything else / missing creds → NSEProvider (free, no credentials).
//
// The broker providers each receive an NSEProvider instance as a *fallback
// delegate* so that the NSE-only reports (FII/DII, IPO, corporate actions,
// block deals, VIX, pre-market, 52-week, breadth, F&O analytics) keep working
// even when a broker is the primary source.
// ────────────────────────────────────────────────────────────────────────────

import type { DataProvider } from './providers/base.provider.js';
import { NSEProvider } from './providers/nse.provider.js';
import { ZerodhaProvider } from './providers/zerodha.provider.js';
import { UpstoxProvider } from './providers/upstox.provider.js';
import { config } from '../config.js';

/**
 * Minimal config shape expected by the factory. In a real project this would
 * be imported from `../config.js`.
 */
interface ProviderConfig {
  dataProvider?: 'nse' | 'zerodha' | 'upstox' | 'angel';
  kiteApiKey?: string;
  kiteApiSecret?: string;
  kiteAccessToken?: string;
  upstoxApiKey?: string;
  upstoxApiSecret?: string;
  upstoxAccessToken?: string;
}

/**
 * Create and return a DataProvider based on the validated application config.
 *
 * Broker providers are wrapped with an NSE fallback so all 20 features remain
 * available regardless of which provider is primary. If a broker is selected
 * but its credentials are missing, we log a clear warning and fall back to NSE
 * instead of crashing.
 */
export function createDataProvider(
  overrideConfig?: Partial<ProviderConfig>,
): DataProvider {
  const cfg = {
    dataProvider: config.DATA_PROVIDER,
    kiteApiKey: config.KITE_API_KEY,
    kiteApiSecret: config.KITE_API_SECRET,
    kiteAccessToken: config.KITE_ACCESS_TOKEN,
    upstoxApiKey: config.UPSTOX_API_KEY,
    upstoxApiSecret: config.UPSTOX_API_SECRET,
    upstoxAccessToken: config.UPSTOX_ACCESS_TOKEN,
    ...overrideConfig,
  };

  switch (cfg.dataProvider) {
    case 'upstox': {
      if (!cfg.upstoxApiKey || !cfg.upstoxApiSecret) {
        console.error(
          '[ProviderFactory] DATA_PROVIDER is "upstox" but UPSTOX_API_KEY / ' +
            'UPSTOX_API_SECRET are missing — falling back to NSE provider.',
        );
        return new NSEProvider();
      }
      console.error('[ProviderFactory] Using Upstox (v2) provider + NSE fallback.');
      return new UpstoxProvider(
        cfg.upstoxApiKey,
        cfg.upstoxApiSecret,
        cfg.upstoxAccessToken ?? '',
      );
    }

    case 'zerodha': {
      if (!cfg.kiteApiKey || !cfg.kiteAccessToken) {
        console.error(
          '[ProviderFactory] DATA_PROVIDER is "zerodha" but KITE_API_KEY / ' +
            'KITE_ACCESS_TOKEN are missing — falling back to NSE provider.',
        );
        return new NSEProvider();
      }
      console.error('[ProviderFactory] Using Zerodha (Kite Connect) provider.');
      return new ZerodhaProvider(
        cfg.kiteApiKey,
        cfg.kiteApiSecret ?? '',
        cfg.kiteAccessToken,
      );
    }

    case 'angel':
      console.error(
        '[ProviderFactory] Angel One provider is not implemented yet — ' +
          'falling back to NSE provider.',
      );
      return new NSEProvider();

    default:
      console.error('[ProviderFactory] Using NSE India provider (free).');
      return new NSEProvider();
  }
}
