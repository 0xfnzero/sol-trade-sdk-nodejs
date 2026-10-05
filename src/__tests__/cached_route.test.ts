import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";
const load = (d: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../examples/fixtures/route_${d}_mainnet_20261002.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
function prepare(v: any, age = 0) {
  const cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  const hints = v.legs.map(
    (h: any) =>
      new PoolTradeHint(
        new PublicKey(h.pool),
        new PublicKey(h.input_mint),
        new PublicKey(h.output_mint),
      ),
  );
  return cache
    .snapshot()
    .prepareRoute(
      hints,
      {
        slot: BigInt(v.read_slot) + BigInt(age),
        epoch: BigInt(v.epoch),
        maximumSlotAge: 0n,
      },
      BigInt(v.unix_timestamp),
      new PublicKey(v.payer),
      BigInt(v.amount),
      v.slippage_bps,
      v.maximum_arrays,
    );
}
for (const d of ["buy", "sell"])
  it(`mainnet ${d} route`, () => {
    const v = load(d),
      r = prepare(v);
    expect(String(r.minimumNetAmountOut)).toBe(v.expected.minimum_amount_out);
    expect(r.setupInstructions).toHaveLength(3);
    expect(r.swapInstructions).toHaveLength(2);
    expect(
      r.legs.map((l) => ({
        amount_in: String(l.amountIn),
        amount_out: String(l.estimatedNetAmountOut),
        minimum_amount_out: String(l.minimumNetAmountOut),
      })),
    ).toEqual(v.expected.legs);
    expect(r.legs[1]!.amountIn <= r.legs[0]!.minimumNetAmountOut).toBe(true);
    expect(String(r.estimatedIntermediateResiduals[0]!.amount)).toBe(
      v.expected.intermediate_residuals[0].amount,
    );
  });
for (const kind of [
  "disconnected",
  "reused",
  "cycle",
  "stale",
  "unsupported",
  "zero",
  "slippage",
])
  it(`route rejects ${kind}`, () => {
    const v = load("buy");
    let age = 0;
    if (kind === "disconnected") v.legs[1].input_mint = v.legs[0].input_mint;
    else if (kind === "reused") v.legs[1].pool = v.legs[0].pool;
    else if (kind === "cycle") v.legs[1].output_mint = v.legs[0].input_mint;
    else if (kind === "stale") age = 1;
    else if (kind === "unsupported")
      v.accounts.find((a: any) => a.pubkey === v.legs[0].pool).owner =
        PublicKey.default.toBase58();
    else if (kind === "zero") v.amount = "0";
    else v.slippage_bps = 10000;
    expect(() => prepare(v, age)).toThrow();
  });
