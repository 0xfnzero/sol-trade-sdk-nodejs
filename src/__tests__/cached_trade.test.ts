import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";
import { DexType, TradeExecutorFactory } from "../trading/factory";
import {
  prepareCachedTrade,
  type CachedTradeRequest,
} from "../trading/cached_trade";
import { compileV1Message } from "../serialization/v1";
function request(
  direction = "buy",
  venue = "dlmm",
  signer?: Keypair,
): CachedTradeRequest {
  const v = JSON.parse(
      readFileSync(
        new URL(
          "../../examples/fixtures/" +
            (venue === "dlmm" ? "dlmm_" : "") +
            "sol_route_" +
            direction +
            "_mainnet_20261002.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    c = new SubscriptionAccountCache();
  for (const a of v.accounts)
    c.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  return {
    dexType: "StonkFun",
    tradeType: direction === "buy" ? "Buy" : "Sell",
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
    payer: signer?.publicKey ?? new PublicKey(v.payer),
    amount: BigInt(v.amount),
    recentBlockhash: v.recent_blockhash,
    nativeInput: v.native_input,
    nativeOutput: v.native_output,
    temporaryWsolSeed: v.temporary_wsol_seed,
    rentLamports: BigInt(v.rent_lamports),
  };
}
for (const dexType of ["StonkFun", "LaunchLab", "Bonk"] as const)
  for (const side of ["buy", "sell"])
    it(`rejects mislabeled ${dexType} single-leg ${side}`, () => {
      const r=request(side), anchor=side==="buy"?r.hints!.at(-1)!:r.hints![0]!;
      expect(()=>prepareCachedTrade({...r,dexType,tradeType:side==="buy"?"Sell":"Buy",hints:[anchor],nativeInput:false,nativeOutput:false})).toThrow("anchor direction");
    });
for (const direction of ["buy", "sell"])
  for (const venue of ["dlmm", "whirlpool"])
    it(`factory cache ${direction} ${venue}`, () => {
      const noRpc = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw Error("implicit RPC");
      });
      try {
        const r = request(direction, venue),
          p = TradeExecutorFactory.createCachedExecutor(
            DexType.StonkFun,
          ).prepare(r);
        expect(p.route.legs).toHaveLength(3);
        expect(p.requiredNativeLamports).toBe(
          r.rentLamports! + (r.nativeInput ? r.amount : 0n),
        );
        expect(p.compiled.message.length).toBeGreaterThan(1232);
        expect(p.compiled).toEqual(
          compileV1Message(r.payer, p.instructions, r.recentBlockhash, {
            computeUnitLimit: 300000,
            loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
          }),
        );
        expect(
          prepareCachedTrade({
            ...r,
            v1Config: { computeUnitLimit: undefined },
          }).compiled,
        ).toEqual(p.compiled);
      } finally {
        noRpc.mockRestore();
      }
    });
it("signed V1 raw transport returns submitted, not confirmed; wrong signatures and missing signers fail", async () => {
  const signer = Keypair.fromSeed(new Uint8Array(32).fill(7)),
    r = request("buy", "dlmm", signer),
    executor = TradeExecutorFactory.createCachedExecutor(DexType.StonkFun),
    p = executor.prepare(r);
  const submit = vi.fn(async (wire: Uint8Array, direction: string) => {
    expect(direction).toBe("Buy");
    const signature = wire.slice(
      p.compiled.message.length,
      p.compiled.message.length + 64,
    );
    expect(
      nacl.sign.detached.verify(
        p.compiled.message,
        signature,
        signer.publicKey.toBytes(),
      ),
    ).toBe(true);
    return bs58.encode(signature);
  });
  const receipt = await executor.execute(r, [signer], submit);
  expect(receipt.submitted).toBe(true);
  expect(receipt.confirmed).toBe(false);
  await expect(executor.execute(r, [], submit)).rejects.toThrow(
    "Missing V1 signer",
  );
  expect(submit).toHaveBeenCalledTimes(1);
  await expect(
    executor.execute(r, [signer], async () => "1".repeat(64)),
  ).rejects.toThrow("signature does not match");
});
for (const kind of [
  "protocol",
  "direction",
  "disconnected",
  "stale",
  "native_flags",
  "wrong_factory",
])
  it(`cached factory rejects ${kind}`, () => {
    let r = request();
    if (kind === "protocol") r = { ...r, dexType: "RaydiumClmm" };
    if (kind === "direction") r = { ...r, tradeType: "Create" as any };
    if (kind === "disconnected") r = { ...r, hints: [...r.hints].reverse() };
    if (kind === "stale")
      r = { ...r, context: { ...r.context, slot: r.context.slot + 1n } };
    if (kind === "native_flags") r = { ...r, nativeOutput: true };
    const e = TradeExecutorFactory.createCachedExecutor(
      kind === "wrong_factory" ? DexType.RaydiumClmm : DexType.StonkFun,
    );
    expect(() => e.prepare(r)).toThrow();
  });
it("legacy factories never report successful submission without transport", async () => {
  for (const dex of TradeExecutorFactory.getSupportedDexTypes()) {
    const e = TradeExecutorFactory.createExecutor(dex);
    await expect(e.executeBuy({})).rejects.toThrow("TradeExecutionRequest");
    await expect(e.executeSell({})).rejects.toThrow("TradeExecutionRequest");
  }
});

const tipAccount = new PublicKey(
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
);
for (const direction of ["buy", "sell"]) {
  it(`cached ${direction} includes explicit SOL tip before business instructions`, () => {
    const noRpc = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw Error("implicit RPC");
    });
    try {
      const r = request(direction),
        base = prepareCachedTrade(r);
      const p = prepareCachedTrade({ ...r, tipAccount, tipLamports: 5000n });
      expect(p.instructions[0]).toEqual(
        SystemProgram.transfer({
          fromPubkey: r.payer,
          toPubkey: tipAccount,
          lamports: 5000n,
        }),
      );
      expect(p.instructions.slice(1)).toEqual(base.instructions);
      expect(p.route).toEqual(base.route);
      expect(p.requiredNativeLamports).toBe(
        base.requiredNativeLamports + 5000n,
      );
      expect(p.compiled.accountKeys.some((k) => k.equals(tipAccount))).toBe(
        true,
      );
    } finally {
      noRpc.mockRestore();
    }
  });
}
it.each([
  { tipLamports: 5000n },
  { tipAccount },
  { tipAccount, tipLamports: -1n },
  { tipAccount, tipLamports: 1n << 64n },
  { tipAccount, tipLamports: (1n << 64n) - 1n },
  { tipAccount: PublicKey.default, tipLamports: 1n },
  { tipAccount, tipLamports: 1 as any },
])("rejects missing, zero, invalid and overflowing tip %#", (fields) => {
  expect(() => prepareCachedTrade({ ...request(), ...fields })).toThrow();
});
it("rejects tip to payer and preserves non-native WSOL route with a SOL tip", () => {
  const r = request();
  expect(() =>
    prepareCachedTrade({ ...r, tipAccount: r.payer, tipLamports: 1n }),
  ).toThrow();
  const plain = { ...r, nativeInput: false, nativeOutput: false };
  const p = prepareCachedTrade({ ...plain, tipAccount, tipLamports: 5000n });
  expect(p.requiredNativeLamports).toBe(5000n);
  expect(p.instructions.slice(1)).toEqual(
    prepareCachedTrade(plain).instructions,
  );
});

for (const direction of ["buy","sell"]) for (const venue of ["dlmm","whirlpool"]) {
 it(`candidate route equals explicit ${direction} ${venue}`,()=>{
  const r=request(direction,venue), explicit=prepareCachedTrade(r), hints=r.hints!;
  const automatic=prepareCachedTrade({...r,hints:[],candidates:[...hints].reverse(),inputMint:hints[0].inputMint,outputMint:hints.at(-1)!.outputMint});
  expect(automatic.compiled).toEqual(explicit.compiled);
  expect(automatic.route).toEqual(explicit.route);
  expect(prepareCachedTrade({...r,candidates:[],inputMint:PublicKey.default}).compiled).toEqual(explicit.compiled);
 });
 it(`unified factory submits independent ${direction} ${venue}`,async()=>{
  const signer=Keypair.fromSeed(new Uint8Array(32).fill(7)),r=request(direction,venue,signer), prepared=prepareCachedTrade(r);
  const submit=vi.fn(async(wire:Uint8Array)=>{
   expect(Array.from(wire.slice(0,prepared.compiled.message.length))).toEqual(Array.from(prepared.compiled.message));
   return bs58.encode(wire.slice(prepared.compiled.message.length,prepared.compiled.message.length+64));
  });
  const executor=TradeExecutorFactory.createExecutor(DexType.StonkFun), envelope={request:r,signers:[signer],submit};
  const result=await (direction==="buy"?executor.executeBuy(envelope):executor.executeSell(envelope));
  expect(result.success).toBe(true); expect(result.submitted).toBe(true);expect(result.confirmed).toBe(false);expect(submit).toHaveBeenCalledTimes(1);
  await expect(direction==="buy"?executor.executeSell(envelope):executor.executeBuy(envelope)).rejects.toThrow("direction mismatch");
  expect(submit).toHaveBeenCalledTimes(1);
 });
}
