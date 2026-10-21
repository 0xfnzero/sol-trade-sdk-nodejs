/** Offline replay using all default bridge identities. No RPC or broadcast; fixture setup signs with an ephemeral key. */
import { PumpSwapRoutingConfig } from '../src';
import { replayPumpSwapFixture } from './pumpswap_cached_prepare';
export function replayGlobalRouting() {
  const f = replayPumpSwapFixture();
  const config = new PumpSwapRoutingConfig();
  config.extendPools(f.search.conversionPools); // Already present: deduplicates.
  return ['Buy', 'Sell'].map(direction => {
    const tradeType = direction as 'Buy' | 'Sell';
    return config.prepare({ snapshot:f.snapshot, context:f.context, unixTimestamp:1792302906n,
      payer:f.payer.publicKey, amount: tradeType === 'Buy' ? 1000000n : 1000000000n, tradeType },
      f.search.pool, f.search.tokenMint, f.search.assetMint);
  });
}
if (process.argv[1]?.endsWith('pumpswap_global_routing.ts'))
  for (const result of replayGlobalRouting()) console.log(result.trade.minimumNetAmountOut.toString());
