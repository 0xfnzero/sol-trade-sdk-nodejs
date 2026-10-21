/** Instance-owned bridge identities; supply a fresh snapshot for every prepare call. */
import { PublicKey } from '@solana/web3.js';
import { screenedStockCatalog } from '../stock_catalog';
import { PoolTradeHint } from './subscription_cache';
import { buildPumpSwapTopology, searchPumpSwapTradeWithTopology, type PumpSwapPreparationRequest } from './pumpswap_preparation';
const SOL = 'So11111111111111111111111111111111111111111';
const WSOL = 'So11111111111111111111111111111111111111112';
const normalize = (key: PublicKey) => new PublicKey(key.toBase58() === SOL ? WSOL : key.toBytes());
function canonicalPools(pools: readonly PoolTradeHint[]): PoolTradeHint[] {
  const result = new Map<string, PoolTradeHint>();
  for (const h of pools) {
    const hint = new PoolTradeHint(new PublicKey(h.pool.toBytes()), normalize(h.inputMint), normalize(h.outputMint), h.pumpfunVersion);
    if ([hint.pool, hint.inputMint, hint.outputMint].some(k => k.equals(PublicKey.default)) || hint.inputMint.equals(hint.outputMint))
      throw Error('Invalid bridge identity');
    const previous = result.get(hint.pool.toBase58());
    if (previous && !((previous.inputMint.equals(hint.inputMint) && previous.outputMint.equals(hint.outputMint)) ||
      (previous.inputMint.equals(hint.outputMint) && previous.outputMint.equals(hint.inputMint)))) throw Error('Conflicting bridge identity');
    if (!previous) result.set(hint.pool.toBase58(), hint);
  }
  if (result.size > 128) throw Error('At most 128 bridge pools');
  return [...result.values()];
}
export class PumpSwapRoutingConfig {
  private pools: PoolTradeHint[];
  private topology: ReturnType<typeof buildPumpSwapTopology>;
  bridgeSlippageBps = 100;
  maximumBridgePriceImpactBps = 100;
  maximumConversionHops = 2;
  maximumSearchNodes = 512;
  maximumArrays = 6;
  /** Omit pools for screened defaults; [] explicitly selects custom-only mode. */
  constructor(pools?: readonly PoolTradeHint[]) {
    this.pools = canonicalPools(pools ?? [
      new PoolTradeHint(new PublicKey('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'), new PublicKey(WSOL), new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')),
      ...screenedStockCatalog().pools.map(p => new PoolTradeHint(new PublicKey(p.pool), new PublicKey(p.quote_mint), new PublicKey(p.mint))),
    ]);
    this.topology = buildPumpSwapTopology(this.pools);
  }
  get conversionPools(): readonly PoolTradeHint[] { return this.pools.map(h => new PoolTradeHint(new PublicKey(h.pool.toBytes()), new PublicKey(h.inputMint.toBytes()), new PublicKey(h.outputMint.toBytes()), h.pumpfunVersion)); }
  extendPools(pools: readonly PoolTradeHint[]): void { const merged = canonicalPools([...this.pools, ...pools]); const topology = buildPumpSwapTopology(merged); this.pools = merged; this.topology = topology; }
  prepare(request: PumpSwapPreparationRequest, pool: PublicKey, tokenMint: PublicKey, assetMint: PublicKey) {
    return searchPumpSwapTradeWithTopology({ ...request, maximumArrays: this.maximumArrays }, { pool, tokenMint, assetMint, conversionPools: this.pools,
      maximumConversionHops: this.maximumConversionHops, maximumSearchNodes: this.maximumSearchNodes,
      bridgeSlippageBps: this.bridgeSlippageBps, maximumBridgePriceImpactBps: this.maximumBridgePriceImpactBps }, this.topology);
  }
}
