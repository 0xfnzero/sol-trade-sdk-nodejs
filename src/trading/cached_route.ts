import {quoteCachedClmm} from './cached_clmm';
import {quoteCachedDlmm} from './cached_dlmm';
import {quoteCachedWhirlpool} from './cached_whirlpool';
import {quoteCachedPumpSwap} from './cached_pumpswap';
import {quoteCachedAmmV4ExactIn} from './cached_amm_v4';
import {quoteCachedCpmmExactIn} from '../instruction/cached_cpmm';
import {cachedPumpFun, quoteCachedPumpFunExactIn} from './cached_pumpfun';
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
export interface BridgeLimits {
  anchorPool: PublicKey;
  slippageBps: number;
  maximumPriceImpactBps: number;
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
  bridgeLimits?: BridgeLimits,
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
  if (bridgeLimits && [bridgeLimits.slippageBps, bridgeLimits.maximumPriceImpactBps]
      .some(v => !Number.isInteger(v) || v < 0 || v >= 10000))
    throw Error("Invalid bridge limits");
  const targetSlippage = slippageBps;
  const legs: CachedRouteLeg[] = [];
  let spend = amount;
  for (const hint of hints) {
    const bridge = bridgeLimits && !hint.pool.equals(bridgeLimits.anchorPool);
    slippageBps = bridge ? bridgeLimits!.slippageBps : targetSlippage;
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
    if (bridge) {
      const probeAmount = spend / 100n > 0n ? spend / 100n : 1n;
      const probe = quoteCachedRouteLeg(snapshot, hint, ctx, unixTimestamp, payer, probeAmount, maximumArrays);
      const reference = probe.estimatedNetAmountOut;
      if (!reference || used !== spend || probe.amountIn !== probeAmount ||
          estimated * probeAmount * 10000n < reference * spend * BigInt(10000 - bridgeLimits!.maximumPriceImpactBps))
        throw Error("Bridge price impact exceeds limit or probe is unusable");
    }
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

/** Quote a probe without constructing swap instructions or token accounts. */
function quoteCachedRouteLeg(snapshot: AccountCacheSnapshot, hint: PoolTradeHint, ctx: CacheReadContext,
  unixTimestamp: bigint, payer: PublicKey, amount: bigint, maximumArrays: number) {
  const program = snapshot.get(hint.pool, ctx).owner;
  let amountIn: bigint, estimatedNetAmountOut: bigint;
  if (program.equals(CACHED_CLMM_PROGRAM) || program.equals(CACHED_DLMM_PROGRAM) || program.equals(CACHED_WHIRLPOOL_PROGRAM)) {
    const calculate = program.equals(CACHED_CLMM_PROGRAM) ? quoteCachedClmm : program.equals(CACHED_DLMM_PROGRAM) ? quoteCachedDlmm : quoteCachedWhirlpool;
    const q = calculate(snapshot, hint, ctx, unixTimestamp, payer, amount, 0, maximumArrays);
    return {amountIn: q.amountIn, estimatedNetAmountOut: q.estimatedNetAmountOut};
  }
  if (program.equals(PUMPSWAP_PROGRAM)) {
    const q = quoteCachedPumpSwap(snapshot,hint,ctx,payer,amount); amountIn=q.amountIn; estimatedNetAmountOut=q.amountOut;
  } else if (program.equals(CACHED_AMM_V4_PROGRAM)) {
    const state = snapshot.ammV4(hint,ctx,unixTimestamp), q=quoteCachedAmmV4ExactIn(state,amount,hint.inputMint.equals(state.coinMint));
    amountIn=q.amountIn; estimatedNetAmountOut=q.amountOut;
  } else if (program.equals(CACHED_CPMM_PROGRAM)) {
    const state=snapshot.cpmm(hint,ctx,unixTimestamp), q=quoteCachedCpmmExactIn(state,amount,hint.inputMint.equals(state.baseMint));
    amountIn=q.amountIn; estimatedNetAmountOut=q.amountOut;
  } else if (program.equals(PUMPFUN_PROGRAM_ID)) {
    const state=cachedPumpFun(snapshot,hint,ctx);
    if (state.quote.equals(new PublicKey('So11111111111111111111111111111111111111112'))) throw Error('PumpFun native quote requires cached trade settlement');
    const q=quoteCachedPumpFunExactIn(state,amount,hint.inputMint.equals(state.quote));
    amountIn=q.amountIn; estimatedNetAmountOut=q.estimatedNetAmountOut;
  } else if (program.equals(STONKFUN_PROGRAM)) {
    const {accounts,state}=snapshot.launchlabCurve(hint,ctx), q=quoteLaunchLabExactIn(state,amount,hint.inputMint.equals(accounts.quoteMint),0);
    amountIn=q.amountIn; estimatedNetAmountOut=q.minimumAmountOut;
  } else throw Error('Pool protocol has no native cached quote implementation');
  return {amountIn,estimatedNetAmountOut};
}
