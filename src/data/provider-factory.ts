// ────────────────────────────────────────────────────────────────────────────
// Provider Factory
//
// Creates the appropriate DataProvider instance based on configuration.
// Falls back to the free NSE provider when no Zerodha credentials are given.
// ────────────────────────────────────────────────────────────────────────────

import type { DataProvider } from './providers/base.provider.js';
import { NSEProvider } from './providers/nse.provider.js';
import { ZerodhaProvider } from './providers/zerodha.provider.js';
import { config } from '../config.js';

/**
 * Minimal config shape expected by the factory.
 * In a real project this would be imported from `../config.js`.
 */
interface ProviderConfig {
  dataProvider?: 'nse' | 'zerodha';
  kiteApiKey?: string;
  kiteApiSecret?: string;
  kiteAccessToken?: string;
}

/**
 * Create and return a DataProvider based on the validated application config.
 *
 * - `DATA_PROVIDER=zerodha` → ZerodhaProvider (requires KITE_API_KEY +
 *   KITE_ACCESS_TOKEN; otherwise falls back to NSE gracefully)
 * - anything else → NSEProvider (free, no credentials needed)
 */
export function createDataProvider(
  overrideConfig?: Partial<ProviderConfig>,
): DataProvider {
  const cfg = {
    dataProvider: config.DATA_PROVIDER,
    kiteApiKey: config.KITE_API_KEY,
    kiteApiSecret: config.KITE_API_SECRET,
    kiteAccessToken: config.KITE_ACCESS_TOKEN,
    ...overrideConfig,
  };

  if (cfg.dataProvider === 'zerodha') {
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

  console.error('[ProviderFactory] Using NSE India provider (free).');
  return new NSEProvider();
}
