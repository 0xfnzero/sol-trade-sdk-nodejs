import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL("../../examples/fixtures/" + name + ".json", import.meta.url),
      "utf8",
    ),
  );
const fixture = load("dlmm_mainnet_20261002");
function prepare(v: any, reverse = false, age = 0, budget = 6) {
  const cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  return cache.snapshot().prepareDlmm(
    new PoolTradeHint(
      new PublicKey(v.pool),
      new PublicKey(reverse ? v.output_mint : v.input_mint),
      new PublicKey(reverse ? v.input_mint : v.output_mint),
    ),
    {
      slot: BigInt(v.read_slot) + BigInt(age),
      epoch: BigInt(v.epoch),
      maximumSlotAge: 0n,
    },
    BigInt(v.unix_timestamp),
    new PublicKey(v.payer),
    BigInt(v.amount),
    100,
    budget,
  );
}
for (const reverse of [false, true])
  it(`DLMM cache reverse=${reverse}`, () => {
    const v = structuredClone(fixture);
    v.amount = reverse ? "1000000" : "10000";
    const r = prepare(v, reverse);
    expect(String(r.quote.estimatedNetAmountOut)).toBe(
      v.expected[reverse ? "wsol_to_usdc" : "usdc_to_wsol"],
    );
    expect(r.accounts.bin_arrays.length).toBeGreaterThan(0);
    expect(r.instruction.data.subarray(0, 8).toString("hex")).toBe(
      "414b3f4ceb5b5b88",
    );
  });
for (const kind of [
  "stale",
  "owner",
  "missing",
  "pool_identity",
  "zero_price",
  "closed",
  "budget",
  "future_time",
  "mode",
  "power",
  "activation",
  "function",
])
  it(`DLMM cache rejects ${kind}`, () => {
    const v = structuredClone(fixture);
    v.accounts = v.accounts.filter((a: any) => {
      let d = Buffer.from(a.data, "base64");
      if (a.pubkey === v.pool) {
        if (kind === "owner") a.owner = PublicKey.default.toBase58();
        if (kind === "future_time")
          d.writeBigUInt64LE(BigInt(v.unix_timestamp) + 1n, 56);
        if (kind === "mode") d[36] = 2;
        if (kind === "power") d[34] = 19;
        if (kind === "function") d[35] = 3;
        if (kind === "activation") {
          d[86] = 0;
          d.writeBigUInt64LE(BigInt(v.read_slot) + 1n, 816);
        }
        if (kind === "closed") d = Buffer.alloc(0);
      }
      if (d.subarray(0, 8).toString("hex") === "5c8e5cdc059446b5") {
        if (kind === "missing") return false;
        if (kind === "pool_identity") d.fill(0, 24, 56);
        if (kind === "zero_price") {
          d.writeBigUInt64LE(1n, 56);
          d.fill(0, 72, 88);
        }
      }
      a.data = d.toString("base64");
      return true;
    });
    expect(() =>
      prepare(v, false, kind === "stale" ? 1 : 0, kind === "budget" ? 0 : 8),
    ).toThrow();
  });
for (const v of JSON.parse(
  readFileSync(
    new URL("./fixtures/dlmm_bitmap_synthetic.json", import.meta.url),
    "utf8",
  ),
))
  it(`DLMM extended bitmap ${v.input_mint}`, () => {
    const r = prepare(v);
    expect(r.quote.estimatedNetAmountOut).toBe(10000n);
    expect(r.accounts.bin_arrays.map((a) => a.toBase58())).toEqual([
      v.expected_array,
    ]);
    expect(r.accounts.bitmap_extension!.toBase58()).toBe(v.expected_bitmap);
    const b = structuredClone(v);
    b.accounts.find((a: any) => a.pubkey === v.expected_bitmap).data = "";
    expect(() => prepare(b)).toThrow();
  });
