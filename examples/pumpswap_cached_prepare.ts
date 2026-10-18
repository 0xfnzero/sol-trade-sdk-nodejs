/** Repeatable offline mainnet capture replay. No wallet funds, network or broadcast. */
import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  AccountCacheSnapshot,
  PoolTradeHint,
} from "../src/trading/subscription_cache";
import { searchPumpSwapTrade } from "../src/trading/pumpswap_preparation";
interface CapturedFixture {
  slot: number;
  epoch: number;
  maximum_slot_age: number;
  unix_timestamp: number;
  accounts: {
    address: string;
    owner: string;
    data_base64: string;
    slot: number;
  }[];
  route_search: {
    pool: string;
    token_mint: string;
    asset_mint: string;
    conversion_pools: {
      pool: string;
      input_mint: string;
      output_mint: string;
    }[];
  };
}
export function replayPumpSwapFixture(
  path = new URL(
    "./fixtures/pumpswap_ttwo_route_accounts.json",
    import.meta.url,
  ),
) {
  const f: CapturedFixture = JSON.parse(readFileSync(path, "utf8"));
  const snapshot = new AccountCacheSnapshot(
    new Map(
      f.accounts.map((a) => [
        a.address,
        {
          owner: new PublicKey(a.owner),
          data: Buffer.from(a.data_base64, "base64"),
          slot: BigInt(a.slot),
          writeVersion: 0n,
        },
      ]),
    ),
  );
  const context = {
    slot: BigInt(f.slot),
    epoch: BigInt(f.epoch),
    maximumSlotAge: BigInt(f.maximum_slot_age),
  };
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(42));
  const s = f.route_search,
    search = {
      pool: new PublicKey(s.pool),
      tokenMint: new PublicKey(s.token_mint),
      assetMint: new PublicKey(s.asset_mint),
      conversionPools: s.conversion_pools.map(
        (h) =>
          new PoolTradeHint(
            new PublicKey(h.pool),
            new PublicKey(h.input_mint),
            new PublicKey(h.output_mint),
          ),
      ),
    };
  const results = (["Buy", "Sell"] as const).map((tradeType) => {
    const request = {
      snapshot,
      context,
      unixTimestamp: BigInt(f.unix_timestamp),
      payer: payer.publicKey,
      amount: tradeType === "Buy" ? 1000000n : 1000000000n,
      tradeType,
      slippageBps: 100,
    };
    const result = searchPumpSwapTrade(request, search);
    const built = result.trade.buildSigned({
      version: 1,
      context,
      recentBlockhash: PublicKey.default.toBase58(),
      signers: [payer],
      nativeInput: tradeType === "Buy",
      nativeOutput: tradeType === "Sell",
      temporaryWsolSeed: "offline-pumpswap-" + tradeType,
      rentLamports: 2039280n,
    });
    return { tradeType, result, built };
  });
  return { snapshot, context, payer, search, results };
}
if (process.argv[1]?.endsWith("pumpswap_cached_prepare.ts")) {
  for (const { tradeType, result, built } of replayPumpSwapFixture().results)
    console.log(
      `${tradeType}: ${result.trade.preview.legs.length} legs, minimum=${result.trade.preview.minimumNetAmountOut}, signed=${built.wire.length} bytes, candidates=${result.routesEvaluated}`,
    );
}
