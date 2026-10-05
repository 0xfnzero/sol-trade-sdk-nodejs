import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";
import { whirlpoolTickAtSqrtPrice } from "../calc/whirlpool";
const load = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL("../../examples/fixtures/" + name + ".json", import.meta.url),
      "utf8",
    ),
  );
const fixture = load("whirlpool_mainnet_20261002");
function prepare(v: any, reverse = false, age = 0, budget = 6) {
  const cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  return cache
    .snapshot()
    .prepareWhirlpool(
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
function dynamic(d: Buffer) {
  const b = Buffer.alloc(60);
  Buffer.from([17, 216, 246, 142, 225, 199, 218, 56]).copy(b);
  d.copy(b, 8, 8, 12);
  d.copy(b, 12, 9956, 9988);
  const parts = [b];
  for (let i = 0; i < 88; i++) {
    const o = 12 + i * 113,
      tag = d[o]!;
    parts.push(Buffer.from([tag]));
    if (tag) {
      b[44 + Math.floor(i / 8)]! |= 1 << i % 8;
      parts.push(d.subarray(o + 1, o + 113));
    }
  }
  return Buffer.concat(parts);
}
for (const reverse of [false, true])
  for (const layout of ["fixed", "dynamic"])
    it(`Whirlpool ${layout} reverse=${reverse}`, () => {
      const v = structuredClone(fixture);
      v.amount = reverse ? "1000000" : "10000";
      if (layout === "dynamic")
        for (const a of v.accounts) {
          const d = Buffer.from(a.data, "base64");
          if (d.subarray(0, 8).toString("hex") === "4561bdbe6e0742bb")
            a.data = dynamic(d).toString("base64");
        }
      const r = prepare(v, reverse);
      expect(String(r.quote.estimatedNetAmountOut)).toBe(
        v.expected[reverse ? "wsol_to_usdc" : "usdc_to_wsol"],
      );
      expect(r.accounts.tick_arrays).toHaveLength(3);
      expect(
        r.accounts.tick_arrays[0]!.equals(r.accounts.tick_arrays[2]!),
      ).toBe(true);
    });
for (const c of load("whirlpool_execution_replays_20261002"))
  it(`Whirlpool event preprice ${c.name}`, () => {
    const v = structuredClone(fixture),
      a = v.accounts.find((a: any) => a.pubkey === v.pool),
      d = Buffer.from(a.data, "base64"),
      p = BigInt(c.pre_sqrt_price);
    d.writeBigUInt64LE(p & ((1n << 64n) - 1n), 65);
    d.writeBigUInt64LE(p >> 64n, 73);
    d.writeInt32LE(whirlpoolTickAtSqrtPrice(p), 81);
    a.data = d.toString("base64");
    v.amount = c.amount_in;
    expect(String(prepare(v, c.down).quote.estimatedNetAmountOut)).toBe(
      c.actual_output,
    );
  });
for (const kind of [
  "stale",
  "owner",
  "missing",
  "pool_identity",
  "tag",
  "bitmap",
  "closed",
  "budget",
])
  it(`Whirlpool rejects ${kind}`, () => {
    const v = structuredClone(fixture);
    v.accounts = v.accounts.filter((a: any) => {
      let d = Buffer.from(a.data, "base64");
      if (a.pubkey === v.pool) {
        if (kind === "owner") a.owner = PublicKey.default.toBase58();
        if (kind === "closed") d = Buffer.alloc(0);
      }
      if (d.subarray(0, 8).toString("hex") === "4561bdbe6e0742bb") {
        if (kind === "missing") return false;
        if (kind === "pool_identity") d.fill(0, 9956, 9988);
        if (kind === "tag") d[12] = 2;
        if (kind === "bitmap") {
          d = dynamic(d);
          d[44]! ^= 1;
        }
      }
      a.data = d.toString("base64");
      return true;
    });
    expect(() =>
      prepare(v, false, kind === "stale" ? 1 : 0, kind === "budget" ? 0 : 6),
    ).toThrow();
  });
