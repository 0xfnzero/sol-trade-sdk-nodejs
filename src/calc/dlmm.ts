/** Native DLMM exact-in bin walk; plain Q64.64 prices and explicit loaded arrays.
 * Current-epoch transfer fees are applied outside this pure swap engine.
 */
export interface DlmmStaticFee {
  baseFactor: number;
  power: number;
  control: number;
  maximumVolatility: number;
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
}
export interface DlmmVariableFee {
  volatility: number;
  reference: number;
  indexReference: number;
  lastTimestamp: bigint;
}
export interface DlmmBin {
  binId: number;
  amountX: bigint;
  amountY: bigint;
  price: bigint;
  openOrder: bigint;
  processedOrder: bigint;
  askSide: number;
}
export interface DlmmPool {
  activeId: number;
  binStep: number;
  feeMode: number;
  static: DlmmStaticFee;
  variable: DlmmVariableFee;
}
export interface DlmmQuote {
  amountOut: bigint;
  remainingIn: bigint;
  binsCrossed: number;
  complete: boolean;
  missingBinId?: number;
}
export class InsufficientDlmmArrays extends Error {
  constructor(public readonly partial: DlmmQuote) {
    super(`Missing DLMM bin array for bin ${partial.missingBinId}`);
  }
}
const Q64 = 1n << 64n,
  PRECISION = 1000000000n;
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
function uint(v: bigint, bits: number) {
  if (typeof v !== "bigint" || v < 0n || v >= 1n << BigInt(bits))
    throw Error("DLMM unsigned integer outside range");
}
function integer(v: number, lo: number, hi: number) {
  if (!Number.isSafeInteger(v) || v < lo || v > hi)
    throw Error("DLMM integer outside range");
}
export function dlmmSwapExactIn(
  pool: DlmmPool,
  bins: readonly DlmmBin[],
  loadedArrays: readonly number[],
  amount: bigint,
  timestamp: bigint,
  swapForY: boolean,
  supportOrders = true,
  strict = true,
  exhaustive = false,
): DlmmQuote {
  uint(amount, 64);
  uint(timestamp, 63);
  if (
    [swapForY, supportOrders, strict, exhaustive].some(
      (v) => typeof v !== "boolean",
    )
  )
    throw Error("DLMM flags must be boolean");
  const sp = pool.static,
    vp = pool.variable;
  integer(pool.activeId, -443636, 443636);
  integer(pool.binStep, 1, 65535);
  integer(pool.feeMode, 0, 1);
  for (const [v, hi] of [
    [sp.baseFactor, 65535],
    [sp.power, 18],
    [sp.control, 4294967295],
    [sp.maximumVolatility, 4294967295],
    [sp.filterPeriod, 65535],
    [sp.decayPeriod, 65535],
    [sp.reductionFactor, 10000],
    [vp.volatility, 4294967295],
    [vp.reference, 4294967295],
  ])
    integer(v!, 0, hi!);
  integer(vp.indexReference, -2147483648, 2147483647);
  uint(vp.lastTimestamp, 63);
  if (vp.lastTimestamp > timestamp) throw Error("Invalid DLMM fee timestamp");
  const loaded = new Set<number>();
  for (const i of loadedArrays) {
    integer(i, -6338, 6337);
    if (i * 70 > 443636 || (i + 1) * 70 <= -443636 || loaded.has(i))
      throw Error("Invalid/duplicate DLMM array");
    loaded.add(i);
  }
  const byId = new Map<number, DlmmBin>(),
    seen = new Set<number>();
  const liveIds: number[] = [];
  for (const b of bins) {
    integer(b.binId, -443636, 443636);
    if (seen.has(b.binId) || !loaded.has(Math.floor(b.binId / 70)))
      throw Error("Duplicate/unloaded DLMM bin");
    seen.add(b.binId);
    for (const v of [b.amountX, b.amountY, b.openOrder, b.processedOrder])
      uint(v, 64);
    uint(b.price, 128);
    integer(b.askSide, 0, 255);
    if (b.price === 0n) {
      if (b.amountX || b.amountY || b.openOrder || b.processedOrder)
        throw Error("Zero DLMM price with liquidity");
    } else {
      byId.set(b.binId, b);
      const relevant = supportOrders && ((swapForY && b.askSide === 0) || (!swapForY && b.askSide !== 0));
      if ((swapForY ? b.amountY : b.amountX) !== 0n || (relevant && (b.processedOrder !== 0n || b.openOrder !== 0n)))
        liveIds.push(b.binId);
    }
  }
  liveIds.sort((a, b) => a - b);
  let ref = BigInt(vp.reference),
    index = vp.indexReference;
  const elapsed = timestamp - vp.lastTimestamp;
  if (elapsed >= BigInt(sp.filterPeriod)) {
    index = pool.activeId;
    ref =
      elapsed < BigInt(sp.decayPeriod)
        ? (BigInt(vp.volatility) * BigInt(sp.reductionFactor)) / 10000n
        : 0n;
  }
  const feeInput = pool.feeMode === 0 || !swapForY,
    step = swapForY ? -1 : 1;
  const binStep = BigInt(pool.binStep), control = BigInt(sp.control), maximumVolatility = BigInt(sp.maximumVolatility),
    baseRate = BigInt(sp.baseFactor) * binStep * 10n * 10n ** BigInt(sp.power);
  const arrayBoundary = (current: number) => swapForY ? Math.floor(current / 70) * 70 - 1 : (Math.floor(current / 70) + 1) * 70;
  // Never jump across an array boundary without the next loop's loaded check.
  const advanceEmpty = (current: number) => {
    let lo = 0, hi = liveIds.length;
    while (lo < hi) {
      const middle = Math.floor((lo + hi) / 2);
      if (swapForY ? liveIds[middle]! < current : liveIds[middle]! <= current) lo = middle + 1;
      else hi = middle;
    }
    const next = liveIds[swapForY ? lo - 1 : lo];
    return next !== undefined && Math.floor(next / 70) === Math.floor(current / 70) ? next : arrayBoundary(current);
  };
  let current = pool.activeId,
    remaining = amount,
    total = 0n,
    crossed = 0;
  const lo = loaded.size ? Math.min(...loaded) * 70 : 0,
    hi = loaded.size ? Math.max(...loaded) * 70 + 69 : -1;
  while (remaining > 0n && current >= -443636 && current <= 443636) {
    if (!loaded.has(Math.floor(current / 70))) {
      if (exhaustive) {
        if (current < lo || current > hi) break;
        current = arrayBoundary(current);
        continue;
      }
      const partial: DlmmQuote = {
        amountOut: total,
        remainingIn: remaining,
        binsCrossed: crossed,
        complete: false,
        missingBinId: current,
      };
      if (strict) throw new InsufficientDlmmArrays(partial);
      return partial;
    }
    const b = byId.get(current);
    if (!b) {
      current = advanceEmpty(current);
      continue;
    }
    const reserve = swapForY ? b.amountY : b.amountX,
      relevant =
        supportOrders &&
        ((swapForY && b.askSide === 0) || (!swapForY && b.askSide !== 0)),
      tiers = [
        reserve,
        relevant ? b.processedOrder : 0n,
        relevant ? b.openOrder : 0n,
      ];
    if (!tiers.some((r) => r !== 0n)) {
      current = advanceEmpty(current);
      continue;
    }
    const ramped = ref + BigInt(Math.abs(index - current)) * 10000n,
      volatility =
        ramped < maximumVolatility
          ? ramped
          : maximumVolatility,
      variable = ceil(
        (volatility * binStep) ** 2n * control,
        100000000000n,
      ),
      uncapped =
        baseRate + variable,
      rate = uncapped < 100000000n ? uncapped : 100000000n;
    let left = feeInput
        ? remaining - ceil(remaining * rate, PRECISION)
        : remaining,
      used = 0n,
      out = 0n;
    const numerator = swapForY ? Q64 : b.price, denominator = swapForY ? b.price : Q64;
    for (const r of tiers) {
      if (left === 0n) break;
      if (r === 0n) continue;
      const needed = ceil(r * numerator, denominator),
        consumed = left >= needed ? needed : left,
        produced = left >= needed ? r : (left * denominator) / numerator;
      left -= consumed;
      used += consumed;
      out += produced;
    }
    total += feeInput ? out : out - ceil(out * rate, PRECISION);
    if (total >= 1n << 64n) throw Error("DLMM output overflows u64");
    if (left !== 0n) {
      remaining -= feeInput ? ceil(used * PRECISION, PRECISION - rate) : used;
      crossed++;
      current += step;
    } else
      return {
        amountOut: total,
        remainingIn: 0n,
        binsCrossed: crossed + 1,
        complete: true,
      };
  }
  return {
    amountOut: total,
    remainingIn: remaining,
    binsCrossed: crossed + 1,
    complete: true,
  };
}
