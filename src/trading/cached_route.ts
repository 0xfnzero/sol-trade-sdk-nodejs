import {PUMPSWAP_PROGRAM} from "../instruction/pumpswap";
import {PUMPFUN_PROGRAM_ID} from '../instruction/pumpfun_builder';
import {prepareCachedPumpFunRouteLeg} from './cached_pumpfun';
import { CACHED_AMM_V4_PROGRAM } from "./cached_amm_v4";
/** Independent buy/sell route. Each leg spends only the preceding protected net credit.
 * Fixed input sizing can leave intermediate balances, reported explicitly.
 */
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type {
  AccountCacheSnapshot,
  PoolTradeHint,
  CacheReadContext,
} from "./subscription_cache";
import { CACHED_DLMM_PROGRAM } from "./cached_dlmm";
import { CACHED_WHIRLPOOL_PROGRAM } from "./cached_whirlpool";
import { CACHED_CLMM_PROGRAM } from "./cached_clmm";
import { CACHED_CPMM_PROGRAM } from "../instruction/cached_cpmm";
import {
  STONKFUN_PROGRAM,
  quoteLaunchLabExactIn,
  buildLaunchLabCurveExactIn,
} from "../instruction/stonkfun";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "../common/spl-token";
export interface CachedRouteLeg {
  hint: PoolTradeHint;
  amountIn: bigint;
  estimatedNetAmountOut: bigint | null;
  minimumNetAmountOut: bigint;
  instruction: TransactionInstruction;
}
export interface PreparedCachedRoute {
  legs: readonly CachedRouteLeg[];
  setupInstructions: readonly TransactionInstruction[];
  swapInstructions: readonly TransactionInstruction[];
  minimumNetAmountOut: bigint;
  estimatedIntermediateResiduals: readonly {
    mint: PublicKey;
    amount: bigint;
  }[];
}
export function prepareCachedRoute(
  snapshot: AccountCacheSnapshot,
  hints: readonly PoolTradeHint[],
  ctx: CacheReadContext,
  unixTimestamp: bigint,
  payer: PublicKey,
  amount: bigint,
  slippageBps = 100,
  maximumArrays = 8,
  allowPumpFunNativeSettlement = false,
): PreparedCachedRoute {
  if (
    typeof amount !== "bigint" ||
    amount <= 0n ||
    amount >= 1n << 64n ||
    typeof unixTimestamp !== "bigint" ||
    unixTimestamp < 0n ||
    unixTimestamp >= 1n << 64n ||
    hints.length < 1 ||
    hints.length > 5 ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000 ||
    !Number.isInteger(maximumArrays) ||
    maximumArrays < 1 ||
    maximumArrays > 32
  )
    throw Error("Invalid cached route request");
  if (new Set(hints.map((h) => h.pool.toBase58())).size !== hints.length)
    throw Error("Route reuses a pool and would require changed-state quoting");
  const mints = [hints[0]!.inputMint, ...hints.map((h) => h.outputMint)];
  if (new Set(mints.map((m) => m.toBase58())).size !== mints.length)
    throw Error("Route contains an asset cycle");
  for (let i = 1; i < hints.length; i++)
    if (!hints[i - 1]!.outputMint.equals(hints[i]!.inputMint))
      throw Error("Disconnected route");
  const legs: CachedRouteLeg[] = [];
  let spend = amount;
  for (const hint of hints) {
    const program = snapshot.get(hint.pool, ctx).owner;
    let used: bigint,
      estimated: bigint,
      minimum: bigint,
      instruction: TransactionInstruction;
    if (program.equals(PUMPSWAP_PROGRAM)) {
      const r=snapshot.preparePumpSwap(hint,ctx,payer,spend,slippageBps);
      used=r.quote.amountIn;estimated=r.quote.amountOut;minimum=r.quote.minimumAmountOut;instruction=r.instruction;
    } else if (program.equals(CACHED_AMM_V4_PROGRAM)) {
      const r = snapshot.prepareAmmV4(
        hint,
        ctx,
        unixTimestamp,
        payer,
        spend,
        slippageBps,
      );
      used = r.quote.amountIn;
      estimated = r.quote.amountOut;
      minimum = r.quote.minimumAmountOut;
      instruction = r.instruction;
    } else if (program.equals(CACHED_CLMM_PROGRAM)) {
      const r = snapshot.prepareClmm(
        hint,
        ctx,
        unixTimestamp,
        payer,
        spend,
        slippageBps,
        maximumArrays,
      );
      used = r.quote.amountIn;
      estimated = r.quote.estimatedNetAmountOut;
      minimum = r.quote.minimumNetAmountOut;
      instruction = r.instruction;
    } else if (program.equals(CACHED_WHIRLPOOL_PROGRAM)) {
      const r = snapshot.prepareWhirlpool(
        hint,
        ctx,
        unixTimestamp,
        payer,
        spend,
        slippageBps,
        maximumArrays,
      );
      used = r.quote.amountIn;
      estimated = r.quote.estimatedNetAmountOut;
      minimum = r.quote.minimumNetAmountOut;
      instruction = r.instruction;
    } else if (program.equals(CACHED_DLMM_PROGRAM)) {
      const r = snapshot.prepareDlmm(
        hint,
        ctx,
        unixTimestamp,
        payer,
        spend,
        slippageBps,
        maximumArrays,
      );
      used = r.quote.amountIn;
      estimated = r.quote.estimatedNetAmountOut;
      minimum = r.quote.minimumNetAmountOut;
      instruction = r.instruction;
    } else if (program.equals(PUMPFUN_PROGRAM_ID)) {
      const r=prepareCachedPumpFunRouteLeg(snapshot,hint,ctx,payer,spend,slippageBps,allowPumpFunNativeSettlement);
      used=r.quote.amountIn;estimated=r.quote.estimatedNetAmountOut;minimum=r.quote.minimumNetAmountOut;instruction=r.instruction;
    } else if (program.equals(CACHED_CPMM_PROGRAM)) {
      const r = snapshot.prepareCpmm(
        hint,
        ctx,
        unixTimestamp,
        payer,
        spend,
        slippageBps,
      );
      used = r.quote.amountIn;
      estimated = r.quote.amountOut;
      minimum = r.quote.minimumAmountOut;
      instruction = r.instruction;
    } else if (program.equals(STONKFUN_PROGRAM)) {
      const { accounts, state } = snapshot.launchlabCurve(hint, ctx),
        q = quoteLaunchLabExactIn(
          state,
          spend,
          hint.inputMint.equals(accounts.quoteMint),
          slippageBps,
        );
      used = q.amountIn;
      estimated = quoteLaunchLabExactIn(
        state,
        spend,
        hint.inputMint.equals(accounts.quoteMint),
        0,
      ).minimumAmountOut;
      minimum = q.minimumAmountOut;
      instruction = buildLaunchLabCurveExactIn(
        accounts,
        payer,
        used,
        minimum,
        hint.inputMint.equals(accounts.quoteMint),
      );
    } else
      throw Error("Pool protocol has no native cached quote implementation");
    if (used <= 0n || used > spend || minimum === 0n)
      throw Error("Route has zero output or overconsumes input");
    legs.push({
      hint,
      amountIn: used,
      estimatedNetAmountOut: estimated,
      minimumNetAmountOut: minimum,
      instruction,
    });
    spend = minimum;
  }
  const setupInstructions = mints.map((m) => {
    const program = snapshot.get(m, ctx).owner;
    return createAssociatedTokenAccountIdempotentInstruction(
      payer,
      getAssociatedTokenAddressSync(m, payer, true, program),
      payer,
      m,
      program,
    );
  });
  return {
    legs,
    setupInstructions,
    swapInstructions: legs.map((l) => l.instruction),
    minimumNetAmountOut: spend,
    estimatedIntermediateResiduals: legs.slice(0, -1).map((l, i) => ({
      mint: l.hint.outputMint,
      amount: l.estimatedNetAmountOut! - legs[i + 1]!.amountIn,
    })),
  };
}
