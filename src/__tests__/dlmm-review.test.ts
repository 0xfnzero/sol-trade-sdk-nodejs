import { it, expect } from "vitest";
import vectors from "./fixtures/dlmm_review_reference_20261005.json";
import { dlmmSwapExactIn, InsufficientDlmmArrays } from "../calc/dlmm";

for (const c of vectors) it(`sparse previous native reference ${c.name}`, () => {
  const s = c.static, v = c.variable;
  const pool = {activeId: c.active_id, binStep: c.bin_step, feeMode: c.fee_mode,
    static: {baseFactor: s.base_factor, power: s.power, control: s.control, maximumVolatility: s.maximum_volatility, filterPeriod: s.filter_period, decayPeriod: s.decay_period, reductionFactor: s.reduction_factor},
    variable: {volatility: v.volatility, reference: v.reference, indexReference: v.index_reference, lastTimestamp: BigInt(v.last_timestamp)},
  };
  const original = c.bins.map(b => ({binId: b.bin_id, amountX: BigInt(b.amount_x), amountY: BigInt(b.amount_y), price: BigInt(b.price), openOrder: BigInt(b.open_order), processedOrder: BigInt(b.processed_order), askSide: b.ask_side}));
  for (const bins of [original, [...original].sort((a, b) => a.binId - b.binId), [...original].reverse()]) {
    const before = bins.map(b => ({...b}));
    let q, error = false;
    try {
      q = dlmmSwapExactIn(pool, bins, c.loaded_arrays, BigInt(c.amount), BigInt(c.timestamp), c.down, c.orders, c.strict, c.exhaustive);
    } catch (e) {
      if (!(e instanceof InsufficientDlmmArrays)) throw e;
      q = e.partial; error = true;
    }
    expect({amount_out: String(q.amountOut), remaining_in: String(q.remainingIn), bins_crossed: q.binsCrossed, complete: q.complete, missing_bin_id: q.missingBinId ?? null, error}).toEqual(c.expected);
    expect(bins).toEqual(before);
  }
});
