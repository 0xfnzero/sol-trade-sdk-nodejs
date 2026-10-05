/** Native cache-only Orca quote/preparation from fixed/dynamic tick arrays. */
import { PublicKey } from "@solana/web3.js";
import type {
  AccountCacheSnapshot,
  PoolTradeHint,
  CacheReadContext,
} from "./subscription_cache";
import {
  whirlpoolSwapExactIn,
  type WhirlpoolAdaptiveFee,
} from "../calc/whirlpool";
import { type ClmmTick, CLMM_MIN_TICK, CLMM_MAX_TICK } from "../calc/clmm";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
import { calculateTokenTransferFee } from "../instruction/stonkfun";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
import {
  buildWhirlpoolSwapV2,
  type WhirlpoolSwapV2Accounts,
} from "../instruction/native_hops";
export const CACHED_WHIRLPOOL_PROGRAM = new PublicKey(
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
);
export interface CachedWhirlpoolQuote {
  amountIn: bigint;
  estimatedNetAmountOut: bigint;
  minimumNetAmountOut: bigint;
  minimumAmountOut: bigint;
  stateSlot: bigint;
  epoch: bigint;
  minimumFeeRate: number;
  maximumFeeRate: number;
}
const wide = (d: Buffer, o: number) =>
  d.readBigUInt64LE(o) + (d.readBigUInt64LE(o + 8) << 64n);
export function decodeWhirlpoolTicks(
  data: Uint8Array,
  pool: PublicKey,
  start: number,
  spacing: number,
): ClmmTick[] {
  if (
    !Number.isInteger(spacing) ||
    spacing < 1 ||
    spacing > 65535 ||
    !Number.isInteger(start) ||
    start % (88 * spacing)
  )
    throw Error("Invalid Whirlpool tick array start/spacing");
  const d = Buffer.from(data),
    fixed = d.subarray(0, 8).toString("hex") === "4561bdbe6e0742bb",
    dynamic = d.subarray(0, 8).toString("hex") === "11d8f68ee1c7da38";
  if (!fixed && !dynamic) throw Error("Unknown Whirlpool array discriminator");
  const offset = fixed ? 9956 : 12;
  if (
    d.length < offset + 32 ||
    d.length < 12 ||
    d.readInt32LE(8) !== start ||
    !d.subarray(offset, offset + 32).equals(pool.toBuffer())
  )
    throw Error("Whirlpool array identity mismatch");
  const ticks: ClmmTick[] = [];
  let o = fixed ? 12 : 60;
  for (let i = 0; i < 88; i++) {
    if (o >= d.length || d[o]! > 1)
      throw Error("Invalid or truncated Whirlpool tick tag");
    const initialized = d[o] === 1;
    o++;
    if (
      dynamic &&
      Boolean(d[44 + Math.floor(i / 8)]! & (1 << i % 8)) !== initialized
    )
      throw Error("Whirlpool tick bitmap mismatch");
    if (fixed || initialized) {
      if (o + 112 > d.length) throw Error("Truncated Whirlpool tick");
      if (initialized) {
        const tick = start + i * spacing;
        if (tick < CLMM_MIN_TICK || tick > CLMM_MAX_TICK)
          throw Error("Whirlpool initialized tick outside range");
        const net = wide(d, o);
        ticks.push({
          tick,
          liquidityNet: net >= 1n << 127n ? net - (1n << 128n) : net,
          liquidityGross: wide(d, o + 16),
          orders: 0n,
          partialOrders: 0n,
        });
      }
      o += 112;
    }
  }
  return ticks;
}
export function prepareCachedWhirlpool(
  snapshot: AccountCacheSnapshot,
  hint: PoolTradeHint,
  ctx: CacheReadContext,
  unixTimestamp: bigint,
  payer: PublicKey,
  amount: bigint,
  slippageBps = 0,
  maximumArrays = 6,
) {
  if (
    typeof amount !== "bigint" ||
    amount <= 0n ||
    amount >= 1n << 64n ||
    typeof unixTimestamp !== "bigint" ||
    unixTimestamp < 0n ||
    unixTimestamp >= 1n << 64n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000 ||
    !Number.isInteger(maximumArrays) ||
    maximumArrays < 1 ||
    maximumArrays > 32
  )
    throw Error("Invalid cached Whirlpool request");
  const d = Buffer.from(
    snapshot.get(hint.pool, ctx, CACHED_WHIRLPOOL_PROGRAM).data,
  );
  if (d.length < 653 || d.subarray(0, 8).toString("hex") !== "3f95d10ce1806309")
    throw Error("Invalid Whirlpool pool");
  const key = (o: number) => new PublicKey(d.subarray(o, o + 32));
  hint.matches(key(101), key(181));
  const spacing = d.readUInt16LE(41);
  if (!spacing) throw Error("Whirlpool spacing is zero");
  const mints = [snapshot.get(key(101), ctx), snapshot.get(key(181), ctx)],
    fees = mints.map((a) =>
      tokenTransferFeeForEpoch(a.data, a.owner, ctx.epoch),
    ),
    down = hint.inputMint.equals(key(101)),
    fi = fees[down ? 0 : 1]!,
    fo = fees[down ? 1 : 0]!,
    netInput = amount - calculateTokenTransferFee(amount, fi);
  if (!netInput) throw Error("Whirlpool input is zero after transfer fee");
  const pool = {
    sqrtPrice: wide(d, 65),
    liquidity: wide(d, 49),
    tickCurrent: d.readInt32LE(81),
    tickSpacing: spacing,
    feeRate: d.readUInt16LE(45),
  };
  let adaptive: WhirlpoolAdaptiveFee | undefined;
  if (d.readUInt16LE(43) !== spacing) {
    const oracle = PublicKey.findProgramAddressSync(
        [Buffer.from("oracle"), hint.pool.toBuffer()],
        CACHED_WHIRLPOOL_PROGRAM,
      )[0],
      od = Buffer.from(
        snapshot.get(oracle, ctx, CACHED_WHIRLPOOL_PROGRAM).data,
      );
    if (
      od.length < 110 ||
      od.subarray(0, 8).toString("hex") !== "8bc283b38cb3e5f4" ||
      !od.subarray(8, 40).equals(hint.pool.toBuffer())
    )
      throw Error("Invalid Whirlpool oracle");
    if (unixTimestamp < od.readBigUInt64LE(40))
      throw Error("Whirlpool trade is not enabled");
    adaptive = {
      filterPeriod: od.readUInt16LE(48),
      decayPeriod: od.readUInt16LE(50),
      reductionFactor: od.readUInt16LE(52),
      controlFactor: od.readUInt32LE(54),
      maximumVolatility: od.readUInt32LE(58),
      tickGroupSize: od.readUInt16LE(62),
      lastReferenceTimestamp: od.readBigUInt64LE(82),
      lastMajorSwapTimestamp: od.readBigUInt64LE(90),
      volatilityReference: od.readUInt32LE(98),
      referenceGroup: od.readInt32LE(102),
      volatility: od.readUInt32LE(106),
    };
  }
  const step = 88 * spacing,
    shifted = pool.tickCurrent + (down ? 0 : spacing),
    start = Math.floor(shifted / step) * step,
    arrays: PublicKey[] = [],
    starts: number[] = [],
    ticks: ClmmTick[] = [];
  for (let i = 0; i < Math.min(maximumArrays, 6); i++) {
    const st = start + (down ? -i : i) * step;
    if (st > CLMM_MAX_TICK || st + step <= CLMM_MIN_TICK) break;
    const address = PublicKey.findProgramAddressSync(
        [
          Buffer.from("tick_array"),
          hint.pool.toBuffer(),
          Buffer.from(String(st)),
        ],
        CACHED_WHIRLPOOL_PROGRAM,
      )[0],
      td = snapshot.get(address, ctx, CACHED_WHIRLPOOL_PROGRAM).data;
    ticks.push(...decodeWhirlpoolTicks(td, hint.pool, st, spacing));
    starts.push(st);
    arrays.push(address);
    let result;
    try {
      result = whirlpoolSwapExactIn(
        pool,
        ticks,
        starts,
        netInput,
        unixTimestamp,
        down,
        adaptive,
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes("requires more tick arrays"))
        continue;
      throw e;
    }
    if (result.consumed !== netInput) continue;
    const net =
        result.amountOut - calculateTokenTransferFee(result.amountOut, fo),
      minimum = (net * BigInt(10000 - slippageBps)) / 10000n;
    if (!minimum) throw Error("Whirlpool quote has zero protected output");
    const quote: CachedWhirlpoolQuote = {
      amountIn: amount,
      estimatedNetAmountOut: net,
      minimumNetAmountOut: minimum,
      minimumAmountOut: minimum,
      stateSlot: ctx.slot,
      epoch: ctx.epoch,
      minimumFeeRate: result.minimumFeeRate,
      maximumFeeRate: result.maximumFeeRate,
    };
    while (arrays.length < 3) arrays.push(arrays[arrays.length - 1]!);
    const accounts: WhirlpoolSwapV2Accounts = {
      token_program_a: mints[0]!.owner,
      token_program_b: mints[1]!.owner,
      token_authority: payer,
      whirlpool: hint.pool,
      mint_a: key(101),
      mint_b: key(181),
      owner_a: getAssociatedTokenAddressSync(
        key(101),
        payer,
        true,
        mints[0]!.owner,
      ),
      vault_a: key(133),
      owner_b: getAssociatedTokenAddressSync(
        key(181),
        payer,
        true,
        mints[1]!.owner,
      ),
      vault_b: key(213),
      tick_arrays: arrays,
    };
    return {
      accounts,
      quote,
      instruction: buildWhirlpoolSwapV2(accounts, {
        amount,
        other_amount_threshold: minimum,
        sqrt_price_limit: 0n,
        amount_specified_is_input: true,
        a_to_b: down,
      }),
    };
  }
  throw Error("Whirlpool quote exceeds loaded array budget");
}
