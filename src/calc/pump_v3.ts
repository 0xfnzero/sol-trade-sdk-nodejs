/** Compact Pump v3 quotes, including the completing buy's synthetic pool leg.
 * Fee rates must be resolved from current curve/global/fee-config state.
 * migrationFee is zero for non-SOL pairs; curveBaseBalance is the actual vault balance.
 */
export interface PumpV3QuoteState {
  virtualBase: bigint;
  virtualQuote: bigint;
  remainingBase: bigint;
  realQuote: bigint;
  curveBaseBalance: bigint;
  migrationFee: bigint;
  protocolBps: bigint;
  creatorBps: bigint;
  complete?: boolean;
  mayhem?: boolean;
}
export interface PumpV3Quote {
  curveBase: bigint;
  curveQuote: bigint;
  poolBase: bigint;
  poolQuote: bigint;
  protocolFee: bigint;
  creatorFee: bigint;
  baseOut: bigint;
  quoteIn: bigint;
}
const MAX = (1n << 64n) - 1n;
function validate(s: PumpV3QuoteState, amount: bigint): void {
  for (const n of [
    s.virtualBase,
    s.virtualQuote,
    s.remainingBase,
    s.realQuote,
    s.curveBaseBalance,
    s.migrationFee,
    s.protocolBps,
    s.creatorBps,
    amount,
  ])
    if (typeof n !== "bigint" || n < 0n || n > MAX)
      throw new Error("Expected u64 state and amount");
  if (s.complete) throw new Error("BondingCurveComplete");
  if (
    s.virtualBase <= s.remainingBase ||
    s.virtualQuote === 0n ||
    s.protocolBps + s.creatorBps > 10000n
  )
    throw new Error("Invalid curve reserves or fee rates");
}
const fee = (n: bigint, bps: bigint) => (n * bps + 9999n) / 10000n;
function net(b: bigint, s: PumpV3QuoteState): bigint {
  const n = (b * 10000n) / (10000n + s.protocolBps + s.creatorBps);
  const c = n + fee(n, s.protocolBps) + fee(n, s.creatorBps);
  return n - (c > b ? c - b : 0n);
}
const curveCost = (n: bigint, s: PumpV3QuoteState) =>
  n === 0n ? 0n : (n * s.virtualQuote) / (s.virtualBase - n) + 1n;
function pool(s: PumpV3QuoteState, cq: bigint): [bigint, bigint] {
  const b = s.curveBaseBalance - s.remainingBase,
    q = s.realQuote + cq - s.migrationFee;
  if (b <= 0n || q <= 0n)
    throw new Error("Empty pool-to-be; fetch actual curve base vault balance");
  return [b, q];
}
function result(
  cb: bigint,
  cq: bigint,
  pb: bigint,
  pq: bigint,
  s: PumpV3QuoteState,
): PumpV3Quote {
  const protocolFee = fee(cq, s.protocolBps) + fee(pq, s.protocolBps),
    creatorFee = fee(cq, s.creatorBps) + fee(pq, s.creatorBps);
  const baseOut = cb + pb,
    quoteIn = cq + pq + protocolFee + creatorFee;
  if (baseOut > MAX || quoteIn > MAX) throw new Error("Quote exceeds u64");
  return {
    curveBase: cb,
    curveQuote: cq,
    poolBase: pb,
    poolQuote: pq,
    protocolFee,
    creatorFee,
    baseOut,
    quoteIn,
  };
}
export function quotePumpBuyV3ExactOut(
  s: PumpV3QuoteState,
  amount: bigint,
  partialFill = false,
): PumpV3Quote {
  validate(s, amount);
  const cb = amount < s.remainingBase ? amount : s.remainingBase,
    cq = curveCost(cb, s);
  if (amount <= s.remainingBase) return result(cb, cq, 0n, 0n, s);
  if (s.mayhem) {
    if (!partialFill) throw new Error("NotEnoughTokensToBuy");
    return result(cb, cq, 0n, 0n, s);
  }
  const [b, q] = pool(s, cq),
    pb = amount - cb;
  if (pb >= b) throw new Error("NotEnoughTokensToBuy");
  return result(cb, cq, pb, (q * pb + b - pb - 1n) / (b - pb), s);
}
export function quotePumpBuyV3ExactIn(
  s: PumpV3QuoteState,
  budget: bigint,
): PumpV3Quote {
  validate(s, budget);
  const n = net(budget, s);
  if (n <= 1n) return result(0n, 0n, 0n, 0n, s);
  const tokens = ((n - 1n) * s.virtualBase) / (s.virtualQuote + n - 1n),
    cb = tokens < s.remainingBase ? tokens : s.remainingBase,
    cq = curveCost(cb, s);
  if (tokens <= s.remainingBase || s.mayhem) return result(cb, cq, 0n, 0n, s);
  const left = budget - cq - fee(cq, s.protocolBps) - fee(cq, s.creatorBps);
  if (left <= 0n || net(left, s) <= 1n) return result(cb, cq, 0n, 0n, s);
  const [b, q] = pool(s, cq),
    leg = net(left, s),
    pb = ((leg - 1n) * b) / (q + leg - 1n);
  return pb === 0n ? result(cb, cq, 0n, 0n, s) : result(cb, cq, pb, leg, s);
}

/** Initial quote reserves for a child coin. For a migrated Q use actual base vault
 * and quote vault + signed virtual reserves. For depth>0 use Q's stored initial seed. */
export function pumpCoinInitialQuoteReserves(
  seed: bigint,
  quoteBase: bigint,
  effectiveQuote: bigint,
  initialBase: bigint,
  initialReal: bigint,
  quoteSupply: bigint,
  depth: number,
  maxDepth: number,
): bigint {
  if (
    [seed, quoteBase, initialBase, initialReal, quoteSupply].some(
      (n) => n < 0n || n > MAX,
    ) ||
    effectiveQuote <= 0n ||
    initialBase <= initialReal ||
    !Number.isInteger(depth) ||
    !Number.isInteger(maxDepth) ||
    depth < 0 ||
    depth >= maxDepth
  )
    throw new Error("Invalid Pump quote state or CurveDepthExceeded");
  const reserves = (seed * quoteBase) / effectiveQuote;
  if (
    reserves < 1n ||
    reserves > MAX ||
    (reserves * initialReal) / (initialBase - initialReal) > quoteSupply
  )
    throw new Error("QuoteReservesOutOfRange");
  return reserves;
}
