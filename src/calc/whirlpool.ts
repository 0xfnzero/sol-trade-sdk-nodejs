/** Native Orca integer exact-in traversal with adaptive fee reference/spacing rules. */
import {
  clmmSwapStep,
  type ClmmPool,
  type ClmmTick,
  CLMM_MIN_TICK,
  CLMM_MAX_TICK,
} from "./clmm";
export const WHIRLPOOL_MIN_SQRT_PRICE = 4295048016n,
  WHIRLPOOL_MAX_SQRT_PRICE = 79226673515401279992447579055n;
const U64 = (1n << 64n) - 1n,
  U128 = (1n << 128n) - 1n;
const POSITIVE = [
  79232123823359799118286999567n,
  79236085330515764027303304731n,
  79244008939048815603706035061n,
  79259858533276714757314932305n,
  79291567232598584799939703904n,
  79355022692464371645785046466n,
  79482085999252804386437311141n,
  79736823300114093921829183326n,
  80248749790819932309965073892n,
  81282483887344747381513967011n,
  83390072131320151908154831281n,
  87770609709833776024991924138n,
  97234110755111693312479820773n,
  119332217159966728226237229890n,
  179736315981702064433883588727n,
  407748233172238350107850275304n,
  2098478828474011932436660412517n,
  55581415166113811149459800483533n,
  38992368544603139932233054999993551n,
];
const NEGATIVE = [
  18445821805675392311n,
  18444899583751176498n,
  18443055278223354162n,
  18439367220385604838n,
  18431993317065449817n,
  18417254355718160513n,
  18387811781193591352n,
  18329067761203520168n,
  18212142134806087854n,
  17980523815641551639n,
  17526086738831147013n,
  16651378430235024244n,
  15030750278693429944n,
  12247334978882834399n,
  8131365268884726200n,
  3584323654723342297n,
  696457651847595233n,
  26294789957452057n,
  37481735321082n,
];
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
function uint(n: bigint, maximum = U64) {
  if (typeof n !== "bigint" || n < 0n || n > maximum)
    throw Error("Whirlpool integer outside range");
  return n;
}
const min = (a: bigint, b: bigint) => (a < b ? a : b),
  max = (a: bigint, b: bigint) => (a > b ? a : b);
export function whirlpoolSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < CLMM_MIN_TICK || tick > CLMM_MAX_TICK)
    throw Error("Whirlpool tick outside range");
  const positive = tick >= 0,
    shift = positive ? 96n : 64n,
    factors = positive ? POSITIVE : NEGATIVE;
  let ratio = 1n << shift;
  for (let b = 0; b < factors.length; b++)
    if (Math.abs(tick) & (1 << b)) ratio = (ratio * factors[b]!) >> shift;
  return positive ? ratio >> 32n : ratio;
}
export function whirlpoolTickAtSqrtPrice(price: bigint): number {
  uint(price, U128);
  if (price < WHIRLPOOL_MIN_SQRT_PRICE || price > WHIRLPOOL_MAX_SQRT_PRICE)
    throw Error("Whirlpool price outside range");
  let lo = CLMM_MIN_TICK,
    hi = CLMM_MAX_TICK;
  while (lo < hi) {
    const m = Math.floor((lo + hi + 1) / 2);
    if (whirlpoolSqrtPriceAtTick(m) <= price) lo = m;
    else hi = m - 1;
  }
  return lo;
}
export interface WhirlpoolAdaptiveFee {
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
  controlFactor: number;
  maximumVolatility: number;
  tickGroupSize: number;
  lastReferenceTimestamp: bigint;
  lastMajorSwapTimestamp: bigint;
  volatilityReference: number;
  referenceGroup: number;
  volatility: number;
}
export interface WhirlpoolSwapResult {
  consumed: bigint;
  amountOut: bigint;
  fee: bigint;
  minimumFeeRate: number;
  maximumFeeRate: number;
  sqrtPrice: bigint;
  tickCurrent: number;
  liquidity: bigint;
}
export function whirlpoolSwapExactIn(
  pool: ClmmPool,
  ticks: readonly ClmmTick[],
  arrayStarts: readonly number[],
  amount: bigint,
  timestamp: bigint,
  down: boolean,
  adaptive?: WhirlpoolAdaptiveFee,
  limit = 0n,
): WhirlpoolSwapResult {
  uint(amount);
  uint(timestamp);
  uint(pool.sqrtPrice, U128);
  uint(pool.liquidity, U128);
  if (
    !amount ||
    typeof down !== "boolean" ||
    !Number.isInteger(pool.tickSpacing) ||
    pool.tickSpacing < 1 ||
    pool.tickSpacing > 65535 ||
    !Number.isInteger(pool.feeRate) ||
    pool.feeRate < 0 ||
    pool.feeRate > 65535 ||
    !Number.isInteger(pool.tickCurrent) ||
    pool.tickCurrent < CLMM_MIN_TICK ||
    pool.tickCurrent > CLMM_MAX_TICK ||
    pool.sqrtPrice < WHIRLPOOL_MIN_SQRT_PRICE ||
    pool.sqrtPrice > WHIRLPOOL_MAX_SQRT_PRICE
  )
    throw Error("Invalid Whirlpool pool/input");
  const starts = [...arrayStarts].sort((a, b) => a - b),
    step = 88 * pool.tickSpacing;
  if (
    starts.length < 1 ||
    starts.length > 6 ||
    starts.some((s) => !Number.isInteger(s) || s % step !== 0 || s > CLMM_MAX_TICK || s + step <= CLMM_MIN_TICK) ||
    starts.slice(1).some((s, i) => s - starts[i]! !== step)
  )
    throw Error("Invalid Whirlpool tick array sequence");
  const lower = Math.max(starts[0]!, CLMM_MIN_TICK),
    upper = Math.min(starts[starts.length - 1]! + step - 1, CLMM_MAX_TICK);
  uint(limit, U128);
  limit = limit || (down ? WHIRLPOOL_MIN_SQRT_PRICE : WHIRLPOOL_MAX_SQRT_PRICE);
  if (
    limit < WHIRLPOOL_MIN_SQRT_PRICE ||
    limit > WHIRLPOOL_MAX_SQRT_PRICE ||
    (down ? limit >= pool.sqrtPrice : limit <= pool.sqrtPrice)
  )
    throw Error("Invalid Whirlpool price limit");
  for (const t of ticks)
    if (
      !Number.isInteger(t.tick) ||
      t.tick < lower ||
      t.tick > upper ||
      t.tick % pool.tickSpacing ||
      typeof t.liquidityNet !== "bigint" ||
      t.liquidityNet < -(1n << 127n) ||
      t.liquidityNet >= 1n << 127n
    )
      throw Error("Invalid Whirlpool tick");
  const orderedTicks = ticks.every((t, i) => i === 0 || ticks[i - 1]!.tick < t.tick)
    ? ticks : [...ticks].sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < orderedTicks.length; i++)
    if (orderedTicks[i - 1]!.tick === orderedTicks[i]!.tick)
      throw Error("Duplicate Whirlpool tick");
  let cachedIndex: number | undefined, cachedPrice = 0n;
  let group = 0,
    reference = 0,
    volatilityReference = 0,
    maximum = 0,
    control = 0,
    groupSize = 1,
    lowerGroup: number | undefined,
    upperGroup: number | undefined;
  if (adaptive) {
    const a = adaptive;
    for (const v of [
      a.filterPeriod,
      a.decayPeriod,
      a.reductionFactor,
      a.tickGroupSize,
    ])
      if (!Number.isInteger(v) || v < 0 || v > 65535)
        throw Error("Invalid Whirlpool adaptive fee");
    for (const v of [
      a.controlFactor,
      a.maximumVolatility,
      a.volatilityReference,
      a.volatility,
    ])
      if (!Number.isInteger(v) || v < 0 || v > 0xffffffff)
        throw Error("Invalid Whirlpool adaptive fee");
    uint(a.lastReferenceTimestamp);
    uint(a.lastMajorSwapTimestamp);
    if (
      !a.tickGroupSize ||
      a.reductionFactor > 10000 ||
      a.volatilityReference > a.maximumVolatility ||
      a.maximumVolatility * a.tickGroupSize > 0xffffffff ||
      !Number.isInteger(a.referenceGroup) ||
      a.referenceGroup < -(2 ** 31) ||
      a.referenceGroup >= 2 ** 31
    )
      throw Error("Invalid Whirlpool adaptive fee");
    const last = max(a.lastReferenceTimestamp, a.lastMajorSwapTimestamp);
    if (timestamp < last)
      throw Error("Whirlpool timestamp predates adaptive reference");
    groupSize = a.tickGroupSize;
    group = Math.floor(pool.tickCurrent / groupSize);
    reference = a.referenceGroup;
    volatilityReference = a.volatilityReference;
    maximum = a.maximumVolatility;
    control = a.controlFactor;
    if (
      timestamp - a.lastReferenceTimestamp > 3600n ||
      timestamp - last >= BigInt(a.decayPeriod)
    ) {
      reference = group;
      volatilityReference = 0;
    } else if (timestamp - last >= BigInt(a.filterPeriod)) {
      reference = group;
      volatilityReference = Math.floor(
        (a.volatility * a.reductionFactor) / 10000,
      );
    }
    if (volatilityReference > maximum)
      throw Error("Invalid Whirlpool volatility reference");
    const distance = Math.ceil((maximum - volatilityReference) / 10000);
    if ((reference - distance) * groupSize > CLMM_MIN_TICK)
      lowerGroup = reference - distance;
    if ((reference + distance + 1) * groupSize < CLMM_MAX_TICK)
      upperGroup = reference + distance;
  }
  let current = pool.sqrtPrice,
    tick = pool.tickCurrent,
    liquidity = pool.liquidity,
    remaining = amount,
    output = 0n,
    fees = 0n,
    minimumFee = pool.feeRate,
    maximumFee = pool.feeRate,
    first = true;
  for (let iter = 0; iter < 8192; iter++) {
    if (remaining === 0n || current === limit)
      return {
        consumed: amount - remaining,
        amountOut: output,
        fee: fees,
        minimumFeeRate: minimumFee,
        maximumFeeRate: maximumFee,
        sqrtPrice: current,
        tickCurrent: tick,
        liquidity,
      };
    if (down ? tick < lower : tick >= upper)
      throw Error("Whirlpool quote requires more tick arrays");
    let lo = 0, hi = orderedTicks.length;
    while (lo < hi) {
      const middle = Math.floor((lo + hi) / 2);
      if (orderedTicks[middle]!.tick <= tick) lo = middle + 1;
      else hi = middle;
    }
    const next = orderedTicks[down ? lo - 1 : lo];
    const nextIndex = next ? next.tick : down ? lower : upper;
    if (nextIndex !== cachedIndex) {
      cachedIndex = nextIndex;
      cachedPrice = whirlpoolSqrtPriceAtTick(nextIndex);
    }
    const nextPrice = cachedPrice,
      target = down ? max(nextPrice, limit) : min(nextPrice, limit);
    let fee = pool.feeRate,
      bound = target,
      skipped = false;
    if (adaptive) {
      const volatility = Math.min(
          volatilityReference + Math.abs(reference - group) * 10000,
          maximum,
        ),
        crossed = BigInt(volatility) * BigInt(groupSize);
      fee = Math.min(
        fee +
          Number(
            min(
              ceil(BigInt(control) * crossed * crossed, 10000000000000n),
              100000n,
            ),
          ),
        100000,
      );
      skipped = !control || liquidity === 0n;
      if (!skipped && lowerGroup !== undefined && group < lowerGroup) {
        skipped = true;
        bound = down
          ? target
          : min(target, whirlpoolSqrtPriceAtTick(lowerGroup * groupSize));
      } else if (!skipped && upperGroup !== undefined && group > upperGroup) {
        skipped = true;
        bound = down
          ? max(target, whirlpoolSqrtPriceAtTick((upperGroup + 1) * groupSize))
          : target;
      } else if (!skipped) {
        const boundary = Math.max(
            CLMM_MIN_TICK,
            Math.min(CLMM_MAX_TICK, (down ? group : group + 1) * groupSize),
          ),
          price = whirlpoolSqrtPriceAtTick(boundary);
        bound = down ? max(target, price) : min(target, price);
      }
    }
    minimumFee = first ? fee : Math.min(minimumFee, fee);
    maximumFee = first ? fee : Math.max(maximumFee, fee);
    first = false;
    const old = current,
      r = clmmSwapStep(current, bound, liquidity, remaining, fee, down);
    remaining = uint(remaining - r.amountIn - r.fee);
    output = uint(output + r.amountOut);
    fees = uint(fees + r.fee);
    current = r.sqrtPrice;
    if (current === nextPrice) {
      if (next)
        liquidity = uint(
          liquidity + (down ? -next.liquidityNet : next.liquidityNet),
          U128,
        );
      tick = down ? nextIndex - 1 : nextIndex;
    } else if (current !== old) tick = whirlpoolTickAtSqrtPrice(current);
    if (adaptive) {
      if (skipped) {
        const ti =
            current === nextPrice
              ? nextIndex
              : whirlpoolTickAtSqrtPrice(current),
          onBoundary =
            ti % groupSize === 0 && current === whirlpoolSqrtPriceAtTick(ti),
          lastGroup =
            Math.floor(ti / groupSize) - (!down && onBoundary ? 1 : 0);
        if (down ? lastGroup < group : lastGroup > group) group = lastGroup;
      }
      group += down ? -1 : 1;
    }
  }
  throw Error("Whirlpool quote iteration budget exhausted");
}
