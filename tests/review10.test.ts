import { it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { compileV1Message, signV1Transaction } from "../src/serialization/v1";
it("V1 signing rejects stale or forged compiled signer metadata", () => {
  const payer = Keypair.generate(),
    c = compileV1Message(payer.publicKey, [], PublicKey.default.toBase58());
  expect(signV1Transaction(c, [payer])).toHaveLength(c.message.length + 64);
  expect(() => signV1Transaction({ ...c, requiredSignatures: 0 }, [])).toThrow(
    /metadata/,
  );
  const message = Uint8Array.from(c.message);
  message[42] ^= 1;
  expect(() => signV1Transaction({ ...c, message }, [payer])).toThrow(
    /metadata/,
  );
  const header = Uint8Array.from(c.message);
  header[1] = 2;
  expect(() => signV1Transaction({ ...c, message: header }, [payer])).toThrow(
    /metadata/,
  );
});
import { AccountCacheSnapshot } from "../src/trading/subscription_cache";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../src/trading/subscription_cache";
import {
  prepareCachedTrade,
  type CachedTradeRequest,
} from "../src/trading/cached_trade";
import fs from "node:fs";
import {
  createCachedWireSubmit,
  signatureFromSerializedTransaction,
} from "../src/swqos/clients";
const submitCases = JSON.parse(
  fs.readFileSync(
    new URL("./review10_bad_submit.json", import.meta.url),
    "utf8",
  ),
);
for (const c of submitCases)
  it(`submit validation ${c.name}`, () => {
    const check = () =>
      signatureFromSerializedTransaction(Buffer.from(c.wire, "base64"));
    if (c.valid) expect(check).not.toThrow();
    else expect(check).toThrow();
  });
it("cached transport rejects wrong returned signature", async () => {
  const submit = createCachedWireSubmit({
    sendTransaction: async () => "wrong",
  } as any);
  await expect(
    submit(Buffer.from(submitCases[0].wire, "base64"), "Buy"),
  ).rejects.toThrow(/signature/);
});
function genericRequest(): CachedTradeRequest {
  const v = JSON.parse(
    fs.readFileSync(
      new URL(
        "../examples/fixtures/review10_launchlab_generic.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const c = new SubscriptionAccountCache();
  for (const a of v.accounts)
    c.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  return {
    dexType: "LaunchLab",
    tradeType: "Buy",
    snapshot: c.snapshot(),
    hints: v.legs.map(
      (h: any) =>
        new PoolTradeHint(
          new PublicKey(h.pool),
          new PublicKey(h.input_mint),
          new PublicKey(h.output_mint),
        ),
    ),
    context: {
      slot: BigInt(v.read_slot),
      epoch: BigInt(v.epoch),
      maximumSlotAge: 0n,
    },
    unixTimestamp: BigInt(v.unix_timestamp),
    payer: new PublicKey(v.payer),
    amount: BigInt(v.amount),
    recentBlockhash: v.recent_blockhash,
  };
}
for (const dex of ["LaunchLab", "Bonk"] as const)
  it(`generic cached ${dex} accepts its own validated platform`, () => {
    const r = genericRequest();
    expect(prepareCachedTrade({ ...r, dexType: dex }).route.legs).toHaveLength(
      3,
    );
  });
it("StonkFun attribution remains strict for another platform", () => {
  expect(() =>
    prepareCachedTrade({ ...genericRequest(), dexType: "StonkFun" }),
  ).toThrow(/identity/);
});
it("snapshot direct construction rejects invalid cached versions", () => {
  const key = PublicKey.default;
  for (const [slot, writeVersion] of [
    [-1n, 0n],
    [0n, -1n],
    [1n << 64n, 0n],
  ])
    expect(
      () =>
        new AccountCacheSnapshot(
          new Map([
            [
              key.toBase58(),
              { owner: key, data: Buffer.from([1]), slot, writeVersion },
            ],
          ]),
        ),
    ).toThrow(/u64/);
});
