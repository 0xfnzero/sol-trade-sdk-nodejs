import { expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { CandidateRouteGraph } from "../src/trading/route_candidates";
import {
  PoolTradeHint,
  SubscriptionAccountCache,
} from "../src/trading/subscription_cache";
import { SubscriptionReadiness } from "../src/trading/subscription_readiness";
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
it("reuses owned topology after callers change inputs or returned paths", () => {
  const hints = [new PoolTradeHint(key(10), key(1), key(2))],
    graph = new CandidateRouteGraph(hints);
  hints.length = 0;
  const first = [...graph.iterate(key(1), key(2))];
  first[0].length = 0;
  expect(
    [...graph.iterate(key(2), key(1))][0][0].outputMint.equals(key(1)),
  ).toBe(true);
});
it("attested observation keeps actual account version and invalidates on a gap", () => {
  const c = new SubscriptionAccountCache(),
    k = key(1),
    r = new SubscriptionReadiness("fork", [k.toBase58()]);
  c.update(k, {
    owner: key(2),
    data: Uint8Array.of(1),
    slot: 1n,
    writeVersion: 7n,
  });
  expect(() => c.observedSnapshot(r, 100n)).toThrow();
  r.markValidated([k.toBase58()], 0n, "fork");
  const snapshot = c.observedSnapshot(r, 100n),
    ctx = { slot: 100n, epoch: 0n, maximumSlotAge: 0n };
  expect(snapshot.get(k, ctx).slot).toBe(1n);
  expect(snapshot.get(k, ctx).writeVersion).toBe(7n);
  expect(() => c.snapshot().get(k, ctx)).toThrow();
  expect(() => snapshot.get(k, { ...ctx, slot: 99n })).toThrow();
  r.interrupt("gap");
  expect(() => snapshot.get(k, ctx)).toThrow();
});
