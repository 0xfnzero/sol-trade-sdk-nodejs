/** Rust oracle and real AMM v4 V2 execution evidence. */
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";
import {
  CachedAmmV4State,
  quoteCachedAmmV4ExactIn,
  CACHED_AMM_V4_PROGRAM,
} from "../trading/cached_amm_v4";
import { prepareCachedTrade } from "../trading/cached_trade";
import { decodeAmmInfo } from "../instruction/raydium_amm_v4_builder";
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const load = (name = "buy") =>
  read("../../examples/fixtures/amm_v4_" + name + "_mainnet_20261002.json");
function snapshot(v: any) {
  const c = new SubscriptionAccountCache();
  for (const a of v.accounts)
    c.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  return c.snapshot();
}
const hints = (v: any) =>
  v.legs.map(
    (h: any) =>
      new PoolTradeHint(
        new PublicKey(h.pool),
        new PublicKey(h.input_mint),
        new PublicKey(h.output_mint),
      ),
  );
const context = (v: any) => ({
  slot: BigInt(v.read_slot),
  epoch: BigInt(v.epoch),
  maximumSlotAge: 0n,
});
function state(v: any): CachedAmmV4State {
  const k = PublicKey.default;
  return {
    pool: k,
    coinMint: k,
    pcMint: k,
    coinVault: k,
    pcVault: k,
    coinReserve: BigInt(v.coin_reserve),
    pcReserve: BigInt(v.pc_reserve),
    swapFeeNumerator: BigInt(v.numerator ?? 25),
    swapFeeDenominator: BigInt(v.denominator ?? 10000),
  };
}
for (const [index, v] of read("./fixtures/amm_v4_rust_5_0_6.json").entries())
  it("Rust actual fee quote " + index, () => {
    const q = quoteCachedAmmV4ExactIn(
      state(v),
      BigInt(v.amount),
      v.coin_in,
      v.slippage_bps,
    );
    expect([q.amountOut, q.minimumAmountOut, q.swapFee]).toEqual(
      [v.out, v.min, v.fee].map(BigInt),
    );
  });
for (const [index, v] of read(
  "./fixtures/amm_v4_execution_replays_20261002.json",
).entries())
  it("onchain execution reprice " + index, () =>
    expect(
      quoteCachedAmmV4ExactIn(state(v), BigInt(v.amount), v.coin_in).amountOut,
    ).toBe(BigInt(v.out)),
  );
for (const name of ["buy", "sell", "route_buy", "route_sell"])
  it("cached factory mainnet " + name, () => {
    const v = load(name),
      p = prepareCachedTrade({
        dexType: v.dex_type,
        tradeType: v.trade_type,
        snapshot: snapshot(v),
        hints: hints(v),
        context: context(v),
        unixTimestamp: BigInt(v.unix_timestamp),
        payer: new PublicKey(v.payer),
        amount: BigInt(v.amount),
        recentBlockhash: v.recent_blockhash,
        nativeInput: v.native_input,
        nativeOutput: v.native_output,
        temporaryWsolSeed: v.temporary_wsol_seed,
        rentLamports: BigInt(v.rent_lamports),
      });
    expect(p.route.minimumNetAmountOut).toBe(
      BigInt(v.expected.minimum_amount_out),
    );
    const ix = p.route.swapInstructions.find((ix) =>
      ix.programId.equals(CACHED_AMM_V4_PROGRAM),
    )!;
    expect(ix.keys.length).toBe(8);
    expect(ix.data[0]).toBe(16);
    expect(ix.keys[7]).toMatchObject({ isSigner: true, isWritable: false });
    expect(p.compiled.message.length + p.compiled.requiredSignatures * 64).toBe(
      v.expected.wire_bytes,
    );
  });
it("decoder retains full u128 counters and real account offsets", () => {
  const v = load(),
    a = v.accounts.find(
      (a: any) => a.owner === CACHED_AMM_V4_PROGRAM.toBase58(),
    ),
    d = Buffer.from(a.data, "base64"),
    counters = [0, 1, 2, 3].map((i) => (1n << 100n) + BigInt(i));
  for (const [i, o] of [256, 272, 296, 312].entries()) {
    d.writeBigUInt64LE(counters[i]! & ((1n << 64n) - 1n), o);
    d.writeBigUInt64LE(counters[i]! >> 64n, o + 8);
  }
  const p = decodeAmmInfo(d)!;
  expect([
    p.output.swapCoinInAmount,
    p.output.swapPcOutAmount,
    p.output.swapPcInAmount,
    p.output.swapCoinOutAmount,
  ]).toEqual(counters);
  expect(p.tokenCoin.toBuffer()).toEqual(d.subarray(336, 368));
  expect(p.coinMint.toBuffer()).toEqual(d.subarray(400, 432));
});
for (const kind of [
  "disabled",
  "future_open",
  "fee",
  "pnl",
  "nonce",
  "vault_owner",
  "vault_mint",
  "frozen",
  "decimals",
  "stale",
  "missing",
])
  it("rejects " + kind, () => {
    const v = load(),
      a = v.accounts.find((a: any) => a.pubkey === v.legs[0].pool),
      d = Buffer.from(a.data, "base64"),
      vault = new PublicKey(d.subarray(336, 368)).toBase58(),
      mint = new PublicKey(d.subarray(400, 432)).toBase58();
    if (kind === "disabled") d.writeBigUInt64LE(2n, 0);
    if (kind === "future_open") {
      d.writeBigUInt64LE(7n, 0);
      d.writeBigUInt64LE(BigInt(v.unix_timestamp) + 1n, 224);
    }
    if (kind === "fee") d.writeBigUInt64LE(0n, 184);
    if (kind === "pnl") d.writeBigUInt64LE((1n << 64n) - 1n, 192);
    if (kind === "nonce") d.writeBigUInt64LE(256n, 8);
    a.data = d.toString("base64");
    for (const a of v.accounts) {
      const raw = Buffer.from(a.data, "base64");
      if (a.pubkey === vault) {
        if (kind === "vault_owner") raw.fill(0, 32, 64);
        if (kind === "vault_mint") raw.fill(0, 0, 32);
        if (kind === "frozen") raw[108] = 2;
      }
      if (a.pubkey === mint && kind === "decimals") raw[44] = 255;
      a.data = raw.toString("base64");
    }
    if (kind === "missing")
      v.accounts = v.accounts.filter((a: any) => a.pubkey !== vault);
    const ctx = context(v);
    if (kind === "stale") ctx.slot++;
    expect(() =>
      snapshot(v).prepareAmmV4(
        hints(v)[0],
        ctx,
        BigInt(v.unix_timestamp),
        new PublicKey(v.payer),
        10000n,
        100,
      ),
    ).toThrow();
  });
