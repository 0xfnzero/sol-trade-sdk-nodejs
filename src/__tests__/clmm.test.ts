import { describe, it, expect } from "vitest";
import vectors from "./fixtures/clmm_rust_5_0_6.json";
import {
  clmmSqrtPriceAtTick,
  clmmTickAtSqrtPrice,
  clmmSwapStep,
  clmmSwapExactIn,
  CLMM_MAX_SQRT_PRICE,
} from "../calc/clmm";
describe("CLMM Rust 5.0.6 golden vectors", () => {
  for (const [i, v] of vectors.entries())
    it(`${i} ${v.case.kind}`, () => {
      const c = v.case;
      const n = (s: string | undefined) => BigInt(s!);
      const run = () => {
        if (c.kind === "tick") {
          const price = clmmSqrtPriceAtTick(c.tick!);
          if (price < CLMM_MAX_SQRT_PRICE)
            expect(clmmTickAtSqrtPrice(price)).toBe(c.tick);
          return { price: String(price) };
        }
        if (c.kind === "step") {
          const r = clmmSwapStep(
            n(c.current),
            n(c.target),
            n(c.liquidity),
            n(c.amount),
            c.fee!,
            c.down!,
          );
          return {
            price: String(r.sqrtPrice),
            input: String(r.amountIn),
            output: String(r.amountOut),
            fee: String(r.fee),
          };
        }
        const ticks = c.ticks!.map((t) => ({
          tick: t.tick,
          liquidityNet: n(t.net),
          liquidityGross: n(t.gross),
          orders: n(t.orders),
          partialOrders: n(t.partial),
        }));
        const before = ticks.map((t) => ({ ...t }));
        const r = clmmSwapExactIn(
          {
            sqrtPrice: n(c.current),
            liquidity: n(c.liquidity),
            tickCurrent: c.tick!,
            tickSpacing: c.spacing!,
            feeRate: c.fee!,
          },
          ticks,
          n(c.amount),
          n(c.limit),
          c.fee_on!,
          Uint8Array.from(c.dynamic!),
          BigInt(c.timestamp!),
          c.down!,
        );
        expect(ticks).toEqual(before);
        return { consumed: String(r.consumed), output: String(r.amountOut) };
      };
      if (v.expected.error !== undefined) expect(run).toThrow();
      else expect(run()).toEqual(v.expected);
    });
});
