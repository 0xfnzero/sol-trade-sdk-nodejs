import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
  AccountCacheSnapshot,
} from "../trading/subscription_cache";
const v = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/fixtures/clmm_mainnet_20261002.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
function prepare(value: any, reverse = false, age = 0, budget = 8) {
  const cache = new SubscriptionAccountCache();
  for (const a of value.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  const h = new PoolTradeHint(
    new PublicKey(value.pool),
    new PublicKey(reverse ? value.output_mint : value.input_mint),
    new PublicKey(reverse ? value.input_mint : value.output_mint),
  );
  return cache
    .snapshot()
    .prepareClmm(
      h,
      {
        slot: BigInt(value.read_slot) + BigInt(age),
        epoch: BigInt(value.epoch),
        maximumSlotAge: 0n,
      },
      BigInt(value.unix_timestamp),
      new PublicKey(value.payer),
      10000n,
      100,
      budget,
    );
}
it("reads an empty extended bitmap once across many positions", () => {
  const value = JSON.parse(readFileSync(new URL("./fixtures/clmm_empty_bitmap_review_20261005.json", import.meta.url), "utf8"));
  const original = AccountCacheSnapshot.prototype.get;
  let reads = 0;
  const spy = vi.spyOn(AccountCacheSnapshot.prototype, "get").mockImplementation(function(this: AccountCacheSnapshot, key, context, owner) {
    if (key.toBase58() === value.bitmap) reads++;
    return original.call(this, key, context, owner);
  });
  try {
    expect(() => prepare(value)).toThrow("Insufficient CLMM liquidity");
    expect(reads).toBe(1);
  } finally { spy.mockRestore(); }
});
it.each(["missing", "stale", "owner", "identity"])("preserves extended bitmap %s validation", kind => {
  const value = JSON.parse(readFileSync(new URL("./fixtures/clmm_empty_bitmap_review_20261005.json", import.meta.url), "utf8"));
  const bitmap = value.accounts.find((a: {pubkey: string}) => a.pubkey === value.bitmap);
  if (kind === "missing") value.accounts = value.accounts.filter((a: {pubkey: string}) => a.pubkey !== value.bitmap);
  else if (kind === "stale") bitmap.slot = String(BigInt(value.read_slot) - 1n);
  else if (kind === "owner") bitmap.owner = PublicKey.default.toBase58();
  else { const d = Buffer.from(bitmap.data, "base64"); d[8] = d[8]! ^ 1; bitmap.data = d.toString("base64"); }
  expect(() => prepare(value)).toThrow(kind === "identity" ? "bitmap extension" : kind === "missing" ? "Missing cached" : kind);
});
for (const reverse of [false, true])
  it(`CLMM mainnet replay reverse=${reverse}`, () => {
    const r = prepare(v, reverse);
    expect(String(r.quote.estimatedNetAmountOut)).toBe(
      v.expected[reverse ? "usdc_to_stock" : "stock_to_usdc"],
    );
    expect(r.quote.minimumAmountOut).toBe(
      (r.quote.estimatedNetAmountOut * 99n) / 100n,
    );
    expect(r.accounts.tick_arrays).toHaveLength(1);
  });
for (const kind of [
  "stale",
  "owner",
  "missing_array",
  "pool_identity",
  "tick_index",
  "closed",
  "budget",
])
  it(`CLMM rejects ${kind}`, () => {
    const value = structuredClone(v),
      pool = value.accounts.find((a: any) => a.pubkey === value.pool);
    let age = 0,
      budget = 8;
    if (kind === "stale") age = 1;
    else if (kind === "owner") pool.owner = PublicKey.default.toBase58();
    else if (kind === "closed") pool.data = "";
    else if (kind === "budget") budget = 0;
    else {
      const arrays = value.accounts.filter(
        (a: any) => Buffer.from(a.data, "base64").length === 10240,
      );
      if (kind === "missing_array")
        value.accounts = value.accounts.filter((a: any) => !arrays.includes(a));
      else
        for (const a of arrays) {
          const d = Buffer.from(a.data, "base64");
          if (kind === "pool_identity") d.fill(0, 8, 40);
          else
            for (let i = 0; i < 60; i++) {
              const o = 44 + i * 168;
              if (
                d.subarray(o + 20, o + 36).some((b) => b !== 0) ||
                d.subarray(o + 124, o + 140).some((b) => b !== 0)
              )
                d.writeInt32LE(443636, o);
            }
          a.data = d.toString("base64");
        }
    }
    expect(() => prepare(value, false, age, budget)).toThrow();
  });
