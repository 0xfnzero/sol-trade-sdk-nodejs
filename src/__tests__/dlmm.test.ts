import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dlmmSwapExactIn,
  InsufficientDlmmArrays,
  type DlmmPool,
  type DlmmBin,
} from "../calc/dlmm";
const cases = JSON.parse(
  readFileSync(
    new URL("./fixtures/dlmm_rust_5_0_6.json", import.meta.url),
    "utf8",
  ),
);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, a) => a.toUpperCase());
const fields = (v: any) =>
  Object.fromEntries(
    Object.entries(v).map(([k, v]) => [
      camel(k),
      typeof v === "string" ? BigInt(v) : v,
    ]),
  );
function args(
  c: any,
): [
  DlmmPool,
  DlmmBin[],
  number[],
  bigint,
  bigint,
  boolean,
  boolean,
  boolean,
  boolean,
] {
  return [
    {
      activeId: c.active_id,
      binStep: c.bin_step,
      feeMode: c.fee_mode,
      static: fields(c.static) as any,
      variable: fields(c.variable) as any,
    },
    c.bins.map(fields),
    c.loaded_arrays,
    BigInt(c.amount),
    BigInt(c.timestamp),
    c.down,
    c.orders,
    true,
    c.exhaustive,
  ];
}
cases.forEach((c: any, i: number) =>
  it(`DLMM Rust ${i}`, () => {
    let q,
      error = false;
    try {
      q = dlmmSwapExactIn(...args(c));
    } catch (e) {
      if (!(e instanceof InsufficientDlmmArrays)) throw e;
      q = e.partial;
      error = true;
    }
    expect({
      amount_out: String(q.amountOut),
      remaining_in: String(q.remainingIn),
      bins_crossed: q.binsCrossed,
      complete: q.complete,
      missing_bin_id: q.missingBinId ?? null,
      error,
    }).toEqual(c.expected);
  }),
);
for (const kind of [
  "duplicate_array",
  "unloaded",
  "negative_amount",
  "future_time",
  "zero_price",
  "duplicate_bin",
  "invalid_flag",
])
  it(`DLMM rejects ${kind}`, () => {
    const a = args(cases.find((c: any) => c.bins.length));
    if (kind === "duplicate_array") a[2] = [...a[2], a[2][0]!];
    if (kind === "unloaded") a[2] = [];
    if (kind === "negative_amount") a[3] = -1n;
    if (kind === "future_time") a[4] = 0n;
    if (kind === "zero_price") a[1] = [{ ...a[1][0]!, amountX: 1n, price: 0n }];
    if (kind === "duplicate_bin") a[1] = [...a[1], a[1][0]!];
    if (kind === "invalid_flag") a[5] = 1 as any;
    expect(() => dlmmSwapExactIn(...a)).toThrow();
  });
