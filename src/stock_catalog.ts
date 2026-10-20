/** Historical identities shared with the Rust SDKs. No live eligibility or price claims. */
import bundledCatalog from "./stock_token_catalog.json";
export const STOCK_DEX_PROGRAMS = {
  raydium_clmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  raydium_cpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  orca_whirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  meteora_dlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
} as const;
export type StockDexType = keyof typeof STOCK_DEX_PROGRAMS;
export interface StockToken {
  mint: string;
  symbol: string;
  decimals: number;
  catalog_source: string;
}
export interface StockPool {
  pool: string;
  mint: string;
  quote_mint: string;
  dex_type: StockDexType;
  catalog_fee_snapshot?: Record<string, unknown> | null;
  nominal_snapshot_fee_bps?: number | null;
  liquid_side_reserve_usd?: number;
  preferred?: boolean;
}
export interface StockTokenCatalog {
  tokens: StockToken[];
  pools: StockPool[];
}
export function screenedStockCatalog(): StockTokenCatalog {
  return structuredClone(bundledCatalog) as StockTokenCatalog;
}
export function preferredStockPool(
  catalog: StockTokenCatalog,
  mint: string,
): StockPool | undefined {
  return catalog.pools.find((pool) => pool.mint === mint);
}
const protocolDex: Readonly<Record<string, StockDexType>> = {
  RaydiumClmm: "raydium_clmm",
  RaydiumCpmm: "raydium_cpmm",
  OrcaWhirlpool: "orca_whirlpool",
  MeteoraDlmm: "meteora_dlmm",
};
export interface StockRouteLeg {
  pool: string;
  program: string;
  protocol: string;
  input_mint: string | null;
  output_mint: string | null;
}
/** Returns independent verified legs, never invents a connected route from their order. */
export function stockConversionLegs<T extends StockRouteLeg>(
  catalog: StockTokenCatalog,
  route: { succeeded: boolean; legs: readonly T[] },
): T[] {
  if (!route.succeeded) return [];
  const pools = new Map(catalog.pools.map((pool) => [pool.pool, pool]));
  return route.legs.filter((leg) => {
    const pool = pools.get(leg.pool),
      dex = protocolDex[leg.protocol];
    return (
      pool &&
      dex === pool.dex_type &&
      leg.program === STOCK_DEX_PROGRAMS[dex] &&
      ((leg.input_mint === pool.mint && leg.output_mint === pool.quote_mint) ||
        (leg.output_mint === pool.mint && leg.input_mint === pool.quote_mint))
    );
  });
}
