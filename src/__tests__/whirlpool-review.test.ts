import { it, expect } from "vitest";
import vectors from "./fixtures/whirlpool_review_reference_20261005.json";
import { whirlpoolSwapExactIn, whirlpoolSqrtPriceAtTick } from "../calc/whirlpool";

for (const v of vectors) for (const order of ["shuffled", "ascending", "descending"]) {
  it(`full-state previous native reference ${v.name} ${order}`, () => {
    const p = v.pool, a = v.adaptive;
    const pool = {sqrtPrice: BigInt(p.price), liquidity: BigInt(p.liquidity), tickCurrent: p.tick, tickSpacing: p.spacing, feeRate: p.fee};
    const ticks = v.ticks.map(t => ({tick: t.tick, liquidityNet: BigInt(t.net), liquidityGross: 10n, orders: 0n, partialOrders: 0n}));
    if (order !== "shuffled") ticks.sort((x, y) => order === "ascending" ? x.tick - y.tick : y.tick - x.tick);
    const before = ticks.map(t => ({...t}));
    const result = whirlpoolSwapExactIn(pool, ticks, v.starts, BigInt(v.amount), BigInt(v.timestamp), v.down, a ? {
      filterPeriod: a.filter_period, decayPeriod: a.decay_period, reductionFactor: a.reduction_factor,
      controlFactor: a.control_factor, maximumVolatility: a.maximum_volatility, tickGroupSize: a.tick_group_size,
      lastReferenceTimestamp: BigInt(a.last_reference_timestamp), lastMajorSwapTimestamp: BigInt(a.last_major_swap_timestamp),
      volatilityReference: a.volatility_reference, referenceGroup: a.reference_group, volatility: a.volatility,
    } : undefined, BigInt(v.limit));
    expect({consumed: String(result.consumed), amount_out: String(result.amountOut), fee: String(result.fee),
      minimum_fee_rate: String(result.minimumFeeRate), maximum_fee_rate: String(result.maximumFeeRate),
      sqrt_price: String(result.sqrtPrice), tick_current: String(result.tickCurrent), liquidity: String(result.liquidity),
    }).toEqual(v.expected);
    expect(ticks).toEqual(before);
  });
}
const pool = {sqrtPrice: whirlpoolSqrtPriceAtTick(0), liquidity: 1000000n, tickCurrent: 0, tickSpacing: 1, feeRate: 3000};
it.each([-443784, 443696, -2147483616, 2147483616])("rejects out-of-range array %i", start => {
  expect(() => whirlpoolSwapExactIn(pool, [], [start], 100n, 105n, true)).toThrow("array sequence");
});
it.each([false, 0, null])("rejects untyped zero price limit %j", limit => {
  expect(() => whirlpoolSwapExactIn(pool, [], [-88, 0], 100n, 105n, true, undefined, limit as unknown as bigint)).toThrow();
});
it("rejects duplicate ticks after sorting", () => {
  const ticks = [2, 0, 2].map(tick => ({tick, liquidityNet: 0n, liquidityGross: 10n, orders: 0n, partialOrders: 0n}));
  expect(() => whirlpoolSwapExactIn(pool, ticks, [-88, 0], 100n, 105n, true)).toThrow("Duplicate");
});
it.each([[-443635, -443696, true], [443635, 443608, false]] as const)("accepts partial boundary array at %i", (tick, start, down) => {
  expect(whirlpoolSwapExactIn({...pool, sqrtPrice: whirlpoolSqrtPriceAtTick(tick), tickCurrent: tick, liquidity: 0n}, [], [start], 100n, 105n, down).consumed).toBe(0n);
});
