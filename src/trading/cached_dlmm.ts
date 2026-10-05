/** Cache-only native DLMM preparation, including bitmap-certified empty intervals. */
import { PublicKey } from "@solana/web3.js";
import type {
  AccountCacheSnapshot,
  PoolTradeHint,
  CacheReadContext,
} from "./subscription_cache";
import {
  dlmmSwapExactIn,
  InsufficientDlmmArrays,
  type DlmmPool,
  type DlmmBin,
} from "../calc/dlmm";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
import { calculateTokenTransferFee } from "../instruction/stonkfun";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
import {
  buildMeteoraDlmmSwap2,
  type MeteoraDlmmSwap2Accounts,
} from "../instruction/native_hops";
const DLMM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
export const CACHED_DLMM_PROGRAM = DLMM;
export interface CachedDlmmQuote {
  amountIn: bigint;
  estimatedNetAmountOut: bigint;
  minimumNetAmountOut: bigint;
  minimumAmountOut: bigint;
  stateSlot: bigint;
  epoch: bigint;
  binsCrossed: number;
}
const wide = (d: Buffer, o: number) =>
  d.readBigUInt64LE(o) + (d.readBigUInt64LE(o + 8) << 64n);
export function decodeDlmmBins(
  data: Uint8Array,
  pool: PublicKey,
  index: number,
): DlmmBin[] {
  const d = Buffer.from(data);
  if (
    !Number.isSafeInteger(index) ||
    index < -6338 ||
    index > 6337 ||
    d.length < 10136 ||
    d.subarray(0, 8).toString("hex") !== "5c8e5cdc059446b5" ||
    d.readBigInt64LE(8) !== BigInt(index) ||
    !d.subarray(24, 56).equals(pool.toBuffer())
  )
    throw Error("Invalid DLMM bin array identity");
  const result: DlmmBin[] = [];
  for (let i = 0; i < 70; i++) {
    const o = 56 + i * 144,
      amountX = d.readBigUInt64LE(o),
      amountY = d.readBigUInt64LE(o + 8),
      price = wide(d, o + 16),
      openOrder = d.readBigUInt64LE(o + 112),
      processedOrder = d.readBigUInt64LE(o + 128);
    if (!price) {
      if (amountX || amountY || openOrder || processedOrder)
        throw Error("Zero DLMM bin price with liquidity");
      continue;
    }
    const binId = index * 70 + i;
    if (binId < -443636 || binId > 443636)
      throw Error("DLMM bin outside range");
    result.push({
      binId,
      amountX,
      amountY,
      price,
      openOrder,
      processedOrder,
      askSide: d[o + 140]!,
    });
  }
  return result;
}
export function prepareCachedDlmm(
  snapshot: AccountCacheSnapshot,
  hint: PoolTradeHint,
  ctx: CacheReadContext,
  unixTimestamp: bigint,
  payer: PublicKey,
  amount: bigint,
  slippageBps = 0,
  maximumArrays = 8,
) {
  if (
    typeof amount !== "bigint" ||
    amount <= 0n ||
    amount >= 1n << 64n ||
    typeof unixTimestamp !== "bigint" ||
    unixTimestamp < 0n ||
    unixTimestamp >= 1n << 63n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000 ||
    !Number.isInteger(maximumArrays) ||
    maximumArrays < 1 ||
    maximumArrays > 32
  )
    throw Error("Invalid cached DLMM request");
  const d = Buffer.from(snapshot.get(hint.pool, ctx, DLMM).data);
  if (
    d.length < 904 ||
    d.subarray(0, 8).toString("hex") !== "210b3162b565b10d" ||
    d[82] !== 0
  )
    throw Error("Disabled or invalid DLMM pool");
  const key = (o: number) => new PublicKey(d.subarray(o, o + 32));
  hint.matches(key(88), key(120));
  if (
    d[86]! > 1 ||
    (d[86] === 0 ? ctx.slot : unixTimestamp) < d.readBigUInt64LE(816)
  )
    throw Error("DLMM not activated");
  if (d[35]! > 2) throw Error("Unknown DLMM function type");
  const orders =
    d[35] === 2 ||
    (d[35] === 0 &&
      key(264).equals(PublicKey.default) &&
      key(408).equals(PublicKey.default));
  const state: DlmmPool = {
    activeId: d.readInt32LE(76),
    binStep: d.readUInt16LE(80),
    feeMode: d[36]!,
    static: {
      baseFactor: d.readUInt16LE(8),
      power: d[34]!,
      control: d.readUInt32LE(16),
      maximumVolatility: d.readUInt32LE(20),
      filterPeriod: d.readUInt16LE(10),
      decayPeriod: d.readUInt16LE(12),
      reductionFactor: d.readUInt16LE(14),
    },
    variable: {
      volatility: d.readUInt32LE(40),
      reference: d.readUInt32LE(44),
      indexReference: d.readInt32LE(48),
      lastTimestamp: d.readBigInt64LE(56),
    },
  };
  const mints = [snapshot.get(key(88), ctx), snapshot.get(key(120), ctx)],
    fees = mints.map((a) =>
      tokenTransferFeeForEpoch(a.data, a.owner, ctx.epoch),
    ),
    down = hint.inputMint.equals(key(88)),
    fi = fees[down ? 0 : 1]!,
    fo = fees[down ? 1 : 0]!,
    netInput = amount - calculateTokenTransferFee(amount, fi);
  if (!netInput) throw Error("Zero DLMM input after transfer fee");
  const arrays: PublicKey[] = [],
    loaded: number[] = [],
    bins: DlmmBin[] = [];
  let bitmap: PublicKey | undefined, extension: Buffer | undefined;
  for (let offset = 0; offset < 12676; offset++) {
    const index = Math.floor(state.activeId / 70) + (down ? -offset : offset);
    if (index * 70 > 443636 || (index + 1) * 70 <= -443636) break;
    let initialized: boolean;
    if (index >= -512 && index < 512)
      initialized = Boolean(
        d[584 + Math.floor((index + 512) / 8)]! & (1 << ((index + 512) % 8)),
      );
    else {
      if (!extension) {
        bitmap = PublicKey.findProgramAddressSync(
          [Buffer.from("bitmap"), hint.pool.toBuffer()],
          DLMM,
        )[0];
        extension = Buffer.from(snapshot.get(bitmap, ctx, DLMM).data);
        if (
          extension.length < 1576 ||
          extension.subarray(0, 8).toString("hex") !== "506f7c7137ed1205" ||
          !extension.subarray(8, 40).equals(hint.pool.toBuffer())
        )
          throw Error("DLMM bitmap identity mismatch");
      }
      const pos = index >= 512 ? index - 512 : -index - 513;
      if (pos < 0 || pos >= 6144)
        throw Error("DLMM bitmap index outside range");
      initialized = Boolean(
        extension[(index >= 512 ? 40 : 808) + Math.floor(pos / 8)]! &
        (1 << (pos % 8)),
      );
    }
    loaded.push(index);
    if (initialized) {
      const seed = Buffer.alloc(8);
      seed.writeBigInt64LE(BigInt(index));
      const address = PublicKey.findProgramAddressSync(
        [Buffer.from("bin_array"), hint.pool.toBuffer(), seed],
        DLMM,
      )[0];
      bins.push(
        ...decodeDlmmBins(
          snapshot.get(address, ctx, DLMM).data,
          hint.pool,
          index,
        ),
      );
      arrays.push(address);
    }
    // Empty bitmap-certified positions add no liquidity; quote after a new array.
    if (!initialized) continue;
    let r;
    try {
      r = dlmmSwapExactIn(
        state,
        bins,
        loaded,
        netInput,
        unixTimestamp,
        down,
        orders,
      );
    } catch (e) {
      if (!(e instanceof InsufficientDlmmArrays)) throw e;
    }
    if (r?.complete && r.remainingIn === 0n && arrays.length) {
      const net = r.amountOut - calculateTokenTransferFee(r.amountOut, fo),
        minimum = (net * BigInt(10000 - slippageBps)) / 10000n;
      if (!minimum) throw Error("Zero protected DLMM output");
      const quote: CachedDlmmQuote = {
        amountIn: amount,
        estimatedNetAmountOut: net,
        minimumNetAmountOut: minimum,
        minimumAmountOut: minimum,
        stateSlot: ctx.slot,
        epoch: ctx.epoch,
        binsCrossed: r.binsCrossed,
      };
      const accounts: MeteoraDlmmSwap2Accounts = {
        lb_pair: hint.pool,
        reserve_x: key(152),
        reserve_y: key(184),
        user_token_in: getAssociatedTokenAddressSync(
          hint.inputMint,
          payer,
          true,
          mints[down ? 0 : 1]!.owner,
        ),
        user_token_out: getAssociatedTokenAddressSync(
          hint.outputMint,
          payer,
          true,
          mints[down ? 1 : 0]!.owner,
        ),
        token_x_mint: key(88),
        token_y_mint: key(120),
        oracle: key(552),
        user: payer,
        token_x_program: mints[0]!.owner,
        token_y_program: mints[1]!.owner,
        bin_arrays: arrays,
        bitmap_extension: bitmap,
      };
      return {
        accounts,
        quote,
        instruction: buildMeteoraDlmmSwap2(accounts, amount, minimum),
      };
    }
    if (arrays.length >= maximumArrays)
      throw Error("DLMM quote exceeds array budget");
  }
  throw Error("Insufficient DLMM liquidity in supplied snapshot");
}
