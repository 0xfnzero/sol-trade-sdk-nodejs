/** Native Raydium CLMM integer math. No RPC or Rust runtime. */
export const CLMM_MIN_TICK = -443636,
  CLMM_MAX_TICK = 443636;
export const CLMM_MIN_SQRT_PRICE = 4295048016n,
  CLMM_MAX_SQRT_PRICE = 79226673521066979257578248091n;
const Q64 = 1n << 64n,
  U64 = Q64 - 1n,
  U128 = (1n << 128n) - 1n;
const FACTORS = [
  0xfffcb933bd6fb800n,
  0xfff97272373d4000n,
  0xfff2e50f5f657000n,
  0xffe5caca7e10f000n,
  0xffcb9843d60f7000n,
  0xff973b41fa98e800n,
  0xff2ea16466c9b000n,
  0xfe5dee046a9a3800n,
  0xfcbe86c7900bb000n,
  0xf987a7253ac65800n,
  0xf3392b0822bb6000n,
  0xe7159475a2caf000n,
  0xd097f3bdfd2f2000n,
  0xa9f746462d9f8000n,
  0x70d869a156f31c00n,
  0x31be135f97ed3200n,
  0x9aa508b5b85a500n,
  0x5d6af8dedc582cn,
  0x2216e584f5fan,
];
function uint(v: bigint, maximum = U64): bigint {
  if (typeof v !== "bigint" || v < 0n || v > maximum)
    throw Error("CLMM unsigned integer outside range");
  return v;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d,
  min = (a: bigint, b: bigint) => (a < b ? a : b),
  max = (a: bigint, b: bigint) => (a > b ? a : b);
export function clmmSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < CLMM_MIN_TICK || tick > CLMM_MAX_TICK)
    throw Error("CLMM tick outside range");
  let ratio = Q64;
  for (let b = 0; b < FACTORS.length; b++)
    if (Math.abs(tick) & (1 << b)) ratio = (ratio * FACTORS[b]!) >> 64n;
  return tick > 0 ? U128 / ratio : ratio;
}
export function clmmTickAtSqrtPrice(price: bigint): number {
  uint(price, U128);
  if (price < CLMM_MIN_SQRT_PRICE || price >= CLMM_MAX_SQRT_PRICE)
    throw Error("CLMM price outside range");
  let lo = CLMM_MIN_TICK,
    hi = CLMM_MAX_TICK;
  while (lo < hi) {
    const m = Math.floor((lo + hi + 1) / 2);
    if (clmmSqrtPriceAtTick(m) <= price) lo = m;
    else hi = m - 1;
  }
  return lo;
}
function delta(a: bigint, b: bigint, l: bigint, token0: boolean, up: boolean) {
  const low = min(a, b),
    high = max(a, b);
  if (low <= 0n) throw Error("CLMM zero sqrt price");
  const n = l * (high - low) * (token0 ? Q64 : 1n),
    d = token0 ? high * low : Q64;
  return up ? ceil(n, d) : n / d;
}
export interface ClmmSwapStep {
  sqrtPrice: bigint;
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
}
export function clmmSwapStep(
  current: bigint,
  target: bigint,
  liquidity: bigint,
  remaining: bigint,
  feeRate: number,
  down: boolean,
): ClmmSwapStep {
  uint(current, U128);
  uint(target, U128);
  uint(liquidity, U128);
  uint(remaining);
  if (
    !Number.isInteger(feeRate) ||
    feeRate < 0 ||
    feeRate >= 1000000 ||
    typeof down !== "boolean" ||
    current <= 0n ||
    target <= 0n ||
    (down ? target > current : target < current)
  )
    throw Error("Invalid CLMM step");
  const rate = BigInt(feeRate),
    net = (remaining * (1000000n - rate)) / 1000000n,
    needed = delta(current, target, liquidity, down, true);
  let next: bigint;
  if (needed <= net) next = target;
  else if (liquidity === 0n) throw Error("CLMM zero liquidity");
  else
    next = down
      ? ceil((liquidity << 64n) * current, (liquidity << 64n) + net * current)
      : current + (net << 64n) / liquidity;
  const amountIn =
      next === target ? needed : delta(current, next, liquidity, down, true),
    amountOut = delta(current, next, liquidity, !down, false),
    fee =
      next !== target
        ? remaining - amountIn
        : ceil(amountIn * rate, 1000000n - rate);
  return {
    sqrtPrice: uint(next, U128),
    amountIn: uint(amountIn),
    amountOut: uint(amountOut),
    fee: uint(fee),
  };
}
export interface ClmmTick {
  tick: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
  orders: bigint;
  partialOrders: bigint;
}
export interface ClmmPool {
  sqrtPrice: bigint;
  liquidity: bigint;
  tickCurrent: number;
  tickSpacing: number;
  feeRate: number;
}
export interface ClmmSwapResult {
  consumed: bigint;
  amountOut: bigint;
  sqrtPrice: bigint;
  tickCurrent: number;
  liquidity: bigint;
}
export function clmmSwapExactIn(
  pool: ClmmPool,
  ticks: readonly ClmmTick[],
  amount: bigint,
  limit: bigint,
  feeOn: number,
  dynamic: Uint8Array,
  timestamp: bigint,
  down: boolean,
): ClmmSwapResult {
  uint(amount);
  uint(timestamp);
  uint(pool.liquidity, U128);
  uint(pool.sqrtPrice, U128);
  uint(limit, U128);
  if (
    pool.sqrtPrice < CLMM_MIN_SQRT_PRICE ||
    pool.sqrtPrice > CLMM_MAX_SQRT_PRICE ||
    !Number.isInteger(pool.tickCurrent) ||
    pool.tickCurrent < CLMM_MIN_TICK ||
    pool.tickCurrent > CLMM_MAX_TICK ||
    !Number.isInteger(pool.tickSpacing) ||
    pool.tickSpacing < 1 ||
    pool.tickSpacing > 65535 ||
    !Number.isInteger(pool.feeRate) ||
    pool.feeRate < 0 ||
    pool.feeRate >= 1000000 ||
    ![0, 1, 2].includes(feeOn)
  )
    throw Error("Invalid CLMM pool");
  if (
    typeof down !== "boolean" ||
    limit < CLMM_MIN_SQRT_PRICE ||
    limit > CLMM_MAX_SQRT_PRICE ||
    (down ? limit >= pool.sqrtPrice : limit <= pool.sqrtPrice)
  )
    throw Error("Invalid CLMM limit");
  if (!(dynamic instanceof Uint8Array) || dynamic.length !== 80)
    throw Error("Invalid CLMM dynamic bytes");
  const d = Buffer.from(dynamic);
  const number = (o: number, n: number, signed = false) =>
    n === 2 ? d.readUInt16LE(o) : signed ? d.readInt32LE(o) : d.readUInt32LE(o);
  const inputFee =
      feeOn === 0 || (feeOn === 1 && down) || (feeOn === 2 && !down),
    enabled = d.some((v) => v !== 0);
  let group = Math.floor(pool.tickCurrent / pool.tickSpacing),
    reference = number(14, 4, true),
    volatilityReference = number(18, 4),
    volatility = number(22, 4);
  const maximum = number(10, 4),
    control = number(6, 4);
  if (enabled) {
    if (
      number(0, 2) <= 0 ||
      number(2, 2) <= number(0, 2) ||
      number(4, 2) < 1 ||
      number(4, 2) >= 10000 ||
      control < 1 ||
      control >= 100000 ||
      maximum * pool.tickSpacing > 0xffffffff
    )
      throw Error("Invalid CLMM dynamic fee params");
    const last = d.readBigUInt64LE(26),
      elapsed = timestamp > last ? timestamp - last : 0n;
    if (elapsed >= BigInt(number(0, 2))) {
      reference = group;
      volatilityReference =
        elapsed < BigInt(number(2, 2))
          ? Math.floor((volatility * number(4, 2)) / 10000)
          : 0;
    }
  }
  if (new Set(ticks.map((t) => t.tick)).size !== ticks.length)
    throw Error("Duplicate CLMM tick");
  for (const t of ticks) {
    if (
      !Number.isInteger(t.tick) ||
      t.tick < CLMM_MIN_TICK ||
      t.tick > CLMM_MAX_TICK ||
      t.tick % pool.tickSpacing ||
      typeof t.liquidityNet !== "bigint" ||
      t.liquidityNet < -(1n << 127n) ||
      t.liquidityNet >= 1n << 127n
    )
      throw Error("Invalid CLMM tick");
    uint(t.liquidityGross, U128);
  }
  const orders = ticks.map((t) => uint(uint(t.orders) + uint(t.partialOrders)));
  let current = pool.sqrtPrice,
    tick = pool.tickCurrent,
    liquidity = pool.liquidity,
    remaining = amount,
    output = 0n;
  const result = () => ({
    consumed: amount - remaining,
    amountOut: output,
    sqrtPrice: current,
    tickCurrent: tick,
    liquidity,
  });
  for (let iter = 0; iter < 8192; iter++) {
    if (remaining === 0n || current === limit) return result();
    let index: number | undefined;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i]!;
      if (
        (t.liquidityGross > 0n || orders[i]! > 0n) &&
        (down ? t.tick <= tick : t.tick > tick) &&
        (index === undefined ||
          (down ? t.tick > ticks[index]!.tick : t.tick < ticks[index]!.tick))
      )
        index = i;
    }
    const nextTick =
        index === undefined
          ? down
            ? CLMM_MIN_TICK
            : CLMM_MAX_TICK
          : ticks[index]!.tick,
      nextPrice = clmmSqrtPriceAtTick(nextTick),
      target = down ? max(nextPrice, limit) : min(nextPrice, limit);
    let fee = pool.feeRate,
      skipped = true,
      bound = target;
    if (enabled) {
      volatility = Math.min(
        volatilityReference + Math.abs(reference - group) * 10000,
        maximum,
      );
      const crossed = BigInt(volatility) * BigInt(pool.tickSpacing);
      fee = Number(
        min(
          BigInt(fee) +
            ceil(BigInt(control) * crossed * crossed, 10000000000000n),
          100000n,
        ),
      );
      skipped = liquidity === 0n || volatility === maximum;
      if (!skipped) {
        const boundary = Math.max(
            CLMM_MIN_TICK,
            Math.min(
              CLMM_MAX_TICK,
              (down ? group : group + 1) * pool.tickSpacing,
            ),
          ),
          price = clmmSqrtPriceAtTick(boundary);
        bound = down ? max(target, price) : min(target, price);
      }
    }
    const old = current;
    if (current !== bound) {
      const step = clmmSwapStep(
        current,
        bound,
        liquidity,
        remaining,
        inputFee ? fee : 0,
        down,
      );
      remaining = uint(remaining - step.amountIn - (inputFee ? step.fee : 0n));
      output = uint(
        output +
          step.amountOut -
          (inputFee ? 0n : ceil(step.amountOut * BigInt(fee), 1000000n)),
      );
      current = step.sqrtPrice;
    }
    if (current === nextPrice) {
      if (index === undefined) break;
      const t = ticks[index]!;
      if (orders[index]! > 0n && remaining > 0n) {
        const square = current * current,
          price =
            (square >> 64n) + (!down && (square & (Q64 - 1n)) !== 0n ? 1n : 0n);
        if (price === 0n) throw Error("CLMM zero order price");
        let feeAmount = inputFee ? ceil(remaining * BigInt(fee), 1000000n) : 0n;
        const available = remaining - feeAmount,
          matched = down
            ? (available * price) / Q64
            : (available * Q64) / price,
          gross = min(matched, orders[index]!);
        let consumed: bigint;
        if (matched > orders[index]!) {
          consumed = uint(
            down ? ceil(gross * Q64, price) : ceil(gross * price, Q64),
          );
          feeAmount = inputFee
            ? ceil(consumed * BigInt(fee), 1000000n - BigInt(fee))
            : 0n;
        } else consumed = available;
        remaining = uint(remaining - uint(consumed + feeAmount));
        orders[index] = orders[index]! - gross;
        output = uint(
          output +
            gross -
            (inputFee ? 0n : ceil(gross * BigInt(fee), 1000000n)),
        );
      }
      if (t.liquidityGross > 0n && orders[index] === 0n)
        liquidity = uint(
          liquidity + (down ? -t.liquidityNet : t.liquidityNet),
          U128,
        );
      tick =
        (down && orders[index] === 0n) || (!down && orders[index]! > 0n)
          ? nextTick - 1
          : nextTick;
    } else if (current !== old) tick = clmmTickAtSqrtPrice(current);
    if (enabled) {
      if (skipped) {
        const boundaryTick = current === nextPrice ? nextTick : tick;
        group = Math.floor(boundaryTick / pool.tickSpacing);
        if (!down && boundaryTick % pool.tickSpacing === 0) group--;
      }
      group += down ? -1 : 1;
    }
  }
  if (remaining > 0n && current !== limit)
    throw Error("CLMM quote iteration budget exhausted");
  return result();
}
