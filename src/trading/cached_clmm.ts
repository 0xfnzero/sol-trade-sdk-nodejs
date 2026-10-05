/** Cache-only native CLMM preparation. No discovery, RPC, signing or sending. */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
import type {
  AccountCacheSnapshot,
  PoolTradeHint,
  CacheReadContext,
} from "./subscription_cache";
import {
  CLMM_MIN_TICK,
  CLMM_MAX_TICK,
  clmmSqrtPriceAtTick,
  clmmSwapExactIn,
  type ClmmTick,
} from "../calc/clmm";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
import { calculateTokenTransferFee } from "../instruction/stonkfun";
import {
  buildRaydiumClmmSwapV2,
  type RaydiumClmmSwapV2Accounts,
} from "../instruction/native_hops";
export const CACHED_CLMM_PROGRAM = new PublicKey(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
);
export interface CachedClmmQuote {
  amountIn: bigint;
  estimatedNetAmountOut: bigint;
  minimumNetAmountOut: bigint;
  minimumAmountOut: bigint;
  stateSlot: bigint;
  epoch: bigint;
  sqrtPriceLimit: bigint;
}
export function prepareCachedClmm(
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
    unixTimestamp >= 1n << 64n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000 ||
    !Number.isInteger(maximumArrays) ||
    maximumArrays < 1 ||
    maximumArrays > 32
  )
    throw Error("Invalid cached CLMM request");
  const d = Buffer.from(snapshot.get(hint.pool, ctx, CACHED_CLMM_PROGRAM).data);
  if (
    d.length < 1544 ||
    d.subarray(0, 8).toString("hex") !== "f7ede3f5d7c3de46" ||
    d[389]! & 16
  )
    throw Error("Invalid or disabled CLMM pool");
  const key = (o: number) => new PublicKey(d.subarray(o, o + 32)),
    wide = (b: Buffer, o: number) =>
      b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);
  hint.matches(key(73), key(105));
  if (unixTimestamp <= d.readBigUInt64LE(1080))
    throw Error("CLMM pool is not open");
  const config = Buffer.from(
      snapshot.get(key(9), ctx, CACHED_CLMM_PROGRAM).data,
    ),
    spacing = d.readUInt16LE(235);
  if (
    config.length < 55 ||
    config.subarray(0, 8).toString("hex") !== "daf42168cbcb2b6f" ||
    !spacing ||
    config.readUInt16LE(51) !== spacing
  )
    throw Error("Invalid CLMM config");
  const mints = [snapshot.get(key(73), ctx), snapshot.get(key(105), ctx)],
    fees = mints.map((a) =>
      tokenTransferFeeForEpoch(a.data, a.owner, ctx.epoch),
    ),
    down = hint.inputMint.equals(key(73)),
    fi = fees[down ? 0 : 1]!,
    fo = fees[down ? 1 : 0]!;
  const netInput = amount - calculateTokenTransferFee(amount, fi);
  if (!netInput) throw Error("CLMM input is zero after transfer fee");
  const pool = {
      sqrtPrice: wide(d, 253),
      liquidity: wide(d, 237),
      tickCurrent: d.readInt32LE(269),
      tickSpacing: spacing,
      feeRate: config.readUInt32LE(47),
    },
    step = 60 * spacing,
    start = Math.floor(pool.tickCurrent / step) * step;
  const ticks: ClmmTick[] = [],
    arrays: PublicKey[] = [];
  let bitmap: PublicKey | undefined;
  let extension: Buffer | undefined;
  const bit = (b: Buffer, o: number, i: number) =>
    Boolean(b[o + Math.floor(i / 8)]! & (1 << (i % 8)));
  for (
    let offset = 0;
    offset <= Math.floor((CLMM_MAX_TICK - CLMM_MIN_TICK) / step) + 1;
    offset++
  ) {
    const next = start + (down ? -offset : offset) * step;
    if (next > CLMM_MAX_TICK || next + step <= CLMM_MIN_TICK) break;
    const index = next / step;
    let initialized: boolean;
    if (index >= -512 && index < 512) initialized = bit(d, 904, index + 512);
    else {
      if (!extension) {
        bitmap = PublicKey.findProgramAddressSync(
          [Buffer.from("pool_tick_array_bitmap_extension"), hint.pool.toBuffer()],
          CACHED_CLMM_PROGRAM,
        )[0];
        extension = Buffer.from(
          snapshot.get(bitmap, ctx, CACHED_CLMM_PROGRAM).data,
        );
        if (
          extension.length < 1832 ||
          extension.subarray(0, 8).toString("hex") !== "3c9624db61808b99" ||
          !extension.subarray(8, 40).equals(hint.pool.toBuffer())
        )
          throw Error("Invalid CLMM bitmap extension");
      }
      const ed = extension;
      const distance = -index - 513,
        pos =
          index >= 512
            ? index - 512
            : Math.floor(distance / 512) * 512 + 511 - (distance % 512);
      if (pos < 0 || pos >= 7168)
        throw Error("CLMM bitmap index outside range");
      initialized = bit(ed, index >= 512 ? 40 : 936, pos);
    }
    if (!initialized) continue;
    const seed = Buffer.alloc(4);
    seed.writeInt32BE(next);
    const address = PublicKey.findProgramAddressSync(
        [Buffer.from("tick_array"), hint.pool.toBuffer(), seed],
        CACHED_CLMM_PROGRAM,
      )[0],
      td = Buffer.from(snapshot.get(address, ctx, CACHED_CLMM_PROGRAM).data);
    if (
      td.length < 10240 ||
      td.subarray(0, 8).toString("hex") !== "c09b55cd31f9812a" ||
      !td.subarray(8, 40).equals(hint.pool.toBuffer()) ||
      td.readInt32LE(40) !== next
    )
      throw Error("Invalid CLMM tick array");
    for (let i = 0; i < 60; i++) {
      const o = 44 + i * 168,
        gross = wide(td, o + 20),
        orders = td.readBigUInt64LE(o + 124),
        partial = td.readBigUInt64LE(o + 132);
      if (gross || orders || partial) {
        const tick = td.readInt32LE(o);
        if (tick !== next + i * spacing)
          throw Error("CLMM tick index mismatch");
        const net = wide(td, o + 4);
        ticks.push({
          tick,
          liquidityNet: net >= 1n << 127n ? net - (1n << 128n) : net,
          liquidityGross: gross,
          orders,
          partialOrders: partial,
        });
      }
    }
    arrays.push(address);
    if (arrays.length > maximumArrays)
      throw Error("CLMM quote exceeds array budget");
    const boundary = down
        ? Math.max(next, CLMM_MIN_TICK)
        : Math.min(next + step - 1, CLMM_MAX_TICK),
      limit = clmmSqrtPriceAtTick(boundary);
    if (down ? limit >= pool.sqrtPrice : limit <= pool.sqrtPrice) continue;
    const result = clmmSwapExactIn(
      pool,
      ticks,
      netInput,
      limit,
      d[390]!,
      d.subarray(1096, 1176),
      unixTimestamp,
      down,
    );
    if (result.consumed === netInput) {
      const net =
          result.amountOut - calculateTokenTransferFee(result.amountOut, fo),
        minimum = (net * BigInt(10000 - slippageBps)) / 10000n;
      if (!minimum) throw Error("CLMM quote has zero protected output");
      const quote: CachedClmmQuote = {
        amountIn: amount,
        estimatedNetAmountOut: net,
        minimumNetAmountOut: minimum,
        minimumAmountOut: minimum,
        stateSlot: ctx.slot,
        epoch: ctx.epoch,
        sqrtPriceLimit: limit,
      };
      const accounts: RaydiumClmmSwapV2Accounts = {
        payer,
        amm_config: key(9),
        pool_state: hint.pool,
        input_token_account: getAssociatedTokenAddressSync(
          hint.inputMint,
          payer,
          true,
          mints[down ? 0 : 1]!.owner,
        ),
        output_token_account: getAssociatedTokenAddressSync(
          hint.outputMint,
          payer,
          true,
          mints[down ? 1 : 0]!.owner,
        ),
        input_vault: key(down ? 137 : 169),
        output_vault: key(down ? 169 : 137),
        observation_state: key(201),
        token_program: TOKEN_PROGRAM_ID,
        token_program_2022: TOKEN_2022_PROGRAM_ID,
        input_vault_mint: hint.inputMint,
        output_vault_mint: hint.outputMint,
        tick_arrays: arrays,
        tick_array_bitmap_extension: bitmap,
      };
      return {
        accounts,
        quote,
        instruction: buildRaydiumClmmSwapV2(accounts, {
          amount,
          other_amount_threshold: minimum,
          sqrt_price_limit: limit,
          amount_specified_is_input: true,
        }),
      };
    }
    if (arrays.length >= maximumArrays)
      throw Error("CLMM quote exceeds array budget");
  }
  throw Error("Insufficient CLMM liquidity in supplied snapshot");
}
