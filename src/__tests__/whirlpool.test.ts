import { it, expect } from "vitest";
import vectors from "./fixtures/whirlpool_rust_5_0_6.json";
import {
  whirlpoolSqrtPriceAtTick,
  whirlpoolTickAtSqrtPrice,
  whirlpoolSwapExactIn,
} from "../calc/whirlpool";
for (const [i, v] of vectors.entries())
  it(`Whirlpool Rust ${i} ${v.case.kind}`, () => {
    const c = v.case,
      n = (s: string | undefined) => BigInt(s!);
    const run = () => {
      if (c.kind === "tick") {
        const price = whirlpoolSqrtPriceAtTick(c.tick);
        expect(whirlpoolTickAtSqrtPrice(price)).toBe(c.tick);
        return { price: String(price) };
      }
      const a = c.adaptive,
        adaptive = a
          ? {
              filterPeriod: a.filter_period,
              decayPeriod: a.decay_period,
              reductionFactor: a.reduction_factor,
              controlFactor: a.control_factor,
              maximumVolatility: a.maximum_volatility,
              tickGroupSize: a.tick_group_size,
              lastReferenceTimestamp: BigInt(a.last_reference_timestamp),
              lastMajorSwapTimestamp: BigInt(a.last_major_swap_timestamp),
              volatilityReference: a.volatility_reference,
              referenceGroup: a.reference_group,
              volatility: a.volatility,
            }
          : undefined;
      const ticks = c.ticks!.map((t) => ({
        tick: t.tick,
        liquidityNet: n(t.net),
        liquidityGross: 0n,
        orders: 0n,
        partialOrders: 0n,
      }));
      const before = ticks.map((t) => ({ ...t }));
      const r = whirlpoolSwapExactIn(
        {
          sqrtPrice: n(c.current),
          liquidity: n(c.liquidity),
          tickCurrent: c.tick,
          tickSpacing: c.spacing!,
          feeRate: c.fee!,
        },
        ticks,
        c.starts!,
        n(c.amount),
        BigInt(c.timestamp!),
        c.down!,
        adaptive,
      );
      expect(ticks).toEqual(before);
      return {
        consumed: String(r.consumed),
        output: String(r.amountOut),
        fee: String(r.fee),
        minimum_fee: r.minimumFeeRate,
        maximum_fee: r.maximumFeeRate,
      };
    };
    if (v.expected.error !== undefined) expect(run).toThrow();
    else expect(run()).toEqual(v.expected);
  });
