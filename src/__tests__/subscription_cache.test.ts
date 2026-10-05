import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "node:fs";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
  CacheReadContext,
} from "../trading/subscription_cache";
const token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const key = () => Keypair.generate().publicKey;
const ctx: CacheReadContext = { slot: 100n, epoch: 1047n, maximumSlotAge: 0n };
const a = (data: string, slot = 100n, writeVersion = 1n) => ({
  owner: token,
  data: Buffer.from(data),
  slot,
  writeVersion,
});
function fixture() {
  const data = JSON.parse(
    fs.readFileSync(
      "examples/fixtures/stonkfun_curve_mainnet_20261002.json",
      "utf8",
    ),
  );
  const cache = new SubscriptionAccountCache();
  for (const name of [
    "pool",
    "global",
    "platform",
    "base_mint",
    "quote_mint",
  ]) {
    const d = data[name];
    cache.update(new PublicKey(d.pubkey), {
      owner: new PublicKey(d.owner),
      data: Buffer.from(d.data, "base64"),
      slot: 100n,
      writeVersion: 1n,
    });
  }
  return {
    cache,
    data,
    hint: new PoolTradeHint(
      new PublicKey(data.pool.pubkey),
      new PublicKey(data.base_mint.pubkey),
      new PublicKey(data.quote_mint.pubkey),
    ),
  };
}
describe("ordered native subscription cache", () => {
  it("owns bytes, rejects stale/replay and atomically rejects conflicting batch", () => {
    let cache = new SubscriptionAccountCache();
    const
      k = key(),
      other = key(),
      value = a("one");
    expect(cache.update(k, value)).toBe(true);
    value.data[0] = 0;
    let frozen = cache.snapshot();
    expect(cache.update(k, a("one"))).toBe(false);
    expect(cache.update(k, a("old", 99n, 999n))).toBe(false);
    expect(() =>
      cache.updateMany([
        [other, a("new")],
        [k, a("conflict")],
      ]),
    ).toThrow(/Conflicting/);
    expect(() => cache.snapshot().get(other, ctx)).toThrow(/Conflicting/);
    expect(() => frozen.get(k, ctx)).toThrow(/Conflicting/);
    expect(() => cache.update(k, a("two",100n,2n))).toThrow(/Conflicting/);
    cache = new SubscriptionAccountCache();cache.update(k,a("one"));frozen=cache.snapshot();
    expect(cache.update(k, a("two", 100n, 2n))).toBe(true);
    const returned = frozen.get(k, ctx);
    returned.data[0] = 0;
    expect(Buffer.from(frozen.get(k, ctx).data).toString()).toBe("one");
    expect(Buffer.from(cache.snapshot().get(k, ctx).data).toString()).toBe(
      "two",
    );
    expect(() => cache.snapshot().get(k, { ...ctx, slot: 99n })).toThrow(
      /future or stale/,
    );
    expect(() =>
      cache.snapshot().get(k, { ...ctx, slot: 102n, maximumSlotAge: 1n }),
    ).toThrow(/future or stale/);
    expect(() => cache.snapshot().get(k, ctx, key())).toThrow(/owner/);
  });
  it("keeps parser closure tombstone and validates numeric slot", () => {
    const cache = new SubscriptionAccountCache(),
      k = key();
    const e = {
      metadata: { slot: 100 },
      write_version: 1n,
      account: {
        pubkey: k.toBase58(),
        owner: token.toBase58(),
        data: Buffer.from("old"),
        lamports: 0n,
      },
    };
    cache.updateFromParser(e);
    expect(cache.update(k, a("resurrect", 99n, 999n))).toBe(false);
    expect(() => cache.snapshot().get(k, ctx)).toThrow(/closed/);
    expect(() =>
      cache.updateFromParser({
        ...e,
        metadata: { slot: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).toThrow(/Unsafe/);
  });
  it("prepares both directions from real current fees with a new payer and amount", () => {
    const { cache, hint } = fixture(),
      payer = key();
    const sell = cache
      .snapshot()
      .prepareStonkFunCurve(hint, ctx, payer, 1000000000n, 100);
    expect(sell.quote.minimumAmountOut).toBe(1374n);
    expect(sell.instruction.keys[0]!.pubkey.equals(payer)).toBe(true);
    const buy = cache
      .snapshot()
      .prepareStonkFunCurve(
        new PoolTradeHint(hint.pool, hint.outputMint, hint.inputMint),
        ctx,
        payer,
        10000n,
        100,
      );
    expect(buy.quote.minimumAmountOut).toBe(6817301666n);
    expect(() =>
      cache
        .snapshot()
        .stonkfunCurve(
          new PoolTradeHint(hint.pool, key(), hint.outputMint),
          ctx,
        ),
    ).toThrow(/identity/);
    cache.update(hint.outputMint, a("", 101n));
    expect(() =>
      cache
        .snapshot()
        .stonkfunCurve(hint, { ...ctx, slot: 101n, maximumSlotAge: 1n }),
    ).toThrow(/closed/);
  });
  it("adapts identities only and rejects wrong protocol/program and unresolved mints", () => {
    const { hint, data } = fixture();
    const leg = {
      protocol: "LaunchLab",
      program: data.pool.owner,
      pool: hint.pool.toBase58(),
      input_mint: hint.inputMint.toBase58(),
      output_mint: hint.outputMint.toBase58(),
      specified_amount: 999999999999n,
      trader: "ignore",
    };
    expect(PoolTradeHint.fromRouteLeg(leg).pool.equals(hint.pool)).toBe(true);
    expect(() =>
      PoolTradeHint.fromRouteLeg({ ...leg, program: token.toBase58() }),
    ).toThrow(/protocol/);
    expect(() =>
      PoolTradeHint.fromRouteLeg({ ...leg, input_mint: null }),
    ).toThrow(/unresolved/);
  });
});
import golden from "./fixtures/cpmm_rust_5_0_6.json";
import {
  CACHED_CPMM_PROGRAM,
  quoteCachedCpmmExactIn,
  type CachedCpmmState,
} from "../instruction/cached_cpmm";
describe("cached CPMM", () => {
  it("matches 36 released Rust fee/direction/rounding vectors", () => {
    for (const c of golden.cases) {
      const fee = {
        basisPoints: c.fee_basis_points,
        maximumFee: BigInt(c.maximum_fee),
      };
      const p: CachedCpmmState = {
        pool: key(),
        config: key(),
        baseMint: key(),
        quoteMint: key(),
        baseVault: key(),
        quoteVault: key(),
        baseTokenProgram: token,
        quoteTokenProgram: token,
        observation: key(),
        baseReserve: 1000000n,
        quoteReserve: 2000000n,
        tradeFeeRate: 2500n,
        protocolFeeRate: 120000n,
        fundFeeRate: 40000n,
        creatorFeeRate: 10000n,
        creatorFeeOn: c.creator_fee_on,
        enableCreatorFee: c.enabled,
        baseTransferFee: fee,
        quoteTransferFee: fee,
        openTime: 0n,
      };
      const q = quoteCachedCpmmExactIn(
        p,
        BigInt(c.amount),
        c.base_in,
        c.slippage_bps,
      );
      expect([q.amountOut, q.minimumAmountOut, q.tradeFee]).toEqual(
        [c.amount_out, c.minimum_amount_out, c.trade_fee].map(BigInt),
      );
    }
  });
  it("rejects untyped fee state while retaining disabled u64 creator rates", () => {
    const p: CachedCpmmState = {
      pool: key(), config: key(), baseMint: key(), quoteMint: key(),
      baseVault: key(), quoteVault: key(), baseTokenProgram: token,
      quoteTokenProgram: token, observation: key(), baseReserve: 1000000n,
      quoteReserve: 2000000n, tradeFeeRate: 2500n, protocolFeeRate: 120000n,
      fundFeeRate: 40000n, creatorFeeRate: 10000n, creatorFeeOn: 0,
      enableCreatorFee: false, baseTransferFee: {basisPoints: 0, maximumFee: 0n},
      quoteTransferFee: {basisPoints: 0, maximumFee: 0n}, openTime: 0n,
    };
    for (const [field, value] of [
      ["enableCreatorFee", 1], ["enableCreatorFee", "false"],
      ["enableCreatorFee", null], ["creatorFeeOn", true], ["creatorFeeOn", "1"],
      ["creatorFeeRate", -1n], ["creatorFeeRate", 1n << 64n],
      ["creatorFeeRate", true], ["creatorFeeRate", "0"],
    ] as const) {
      expect(() => quoteCachedCpmmExactIn({...p, [field]: value} as unknown as CachedCpmmState, 100n, true)).toThrow();
    }
    expect(quoteCachedCpmmExactIn({...p, creatorFeeRate: (1n << 64n) - 1n}, 100n, true)).toEqual(quoteCachedCpmmExactIn(p, 100n, true));
  });
  it("subtracts accrued fees and checks opening, status, vault identity and reserve underflow", () => {
    const cache = new SubscriptionAccountCache(),
      pool = key(),
      config = key(),
      base = key(),
      quote = key(),
      bv = key(),
      qv = key(),
      obs = key();
    const d = Buffer.alloc(637);
    Buffer.from("f7ede3f5d7c3de46", "hex").copy(d);
    for (const [offset, k] of [
      [8, config],
      [72, bv],
      [104, qv],
      [168, base],
      [200, quote],
      [232, token],
      [264, token],
      [296, obs],
    ] as const)
      k.toBuffer().copy(d, offset);
    for (const [offset, n] of [
      [341, 10n],
      [357, 20n],
      [397, 5n],
      [373, 100n],
    ] as const)
      d.writeBigUInt64LE(n, offset);
    d[389] = 2;
    d[390] = 1;
    const f = Buffer.alloc(236);
    Buffer.from("daf42168cbcb2b6f", "hex").copy(f);
    for (const [offset, n] of [
      [12, 4321n],
      [20, 12345n],
      [28, 54321n],
      [108, 987n],
    ] as const)
      f.writeBigUInt64LE(n, offset);
    cache.update(pool, { ...a(""), owner: CACHED_CPMM_PROGRAM, data: d });
    cache.update(config, { ...a(""), owner: CACHED_CPMM_PROGRAM, data: f });
    for (const [vault, mint, amount] of [
      [bv, base, 1000n],
      [qv, quote, 2000n],
    ] as const) {
      const v = Buffer.alloc(165),
        m = Buffer.alloc(82);
      mint.toBuffer().copy(v);
      new PublicKey("GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL")
        .toBuffer()
        .copy(v, 32);
      v.writeBigUInt64LE(amount, 64);
      v[108] = 1;
      m[45] = 1;
      cache.update(vault, { ...a(""), data: v });
      cache.update(mint, { ...a(""), data: m });
    }
    const hint = new PoolTradeHint(pool, quote, base),
      p = cache.snapshot().cpmm(hint, ctx, 100n);
    expect([
      p.baseReserve,
      p.quoteReserve,
      p.tradeFeeRate,
      p.creatorFeeRate,
      p.creatorFeeOn,
    ]).toEqual([965n, 2000n, 4321n, 987n, 2]);
    expect(
      cache
        .snapshot()
        .prepareCpmm(hint, ctx, 100n, key(), 100n, 100)
        .instruction.keys[10]!.pubkey.equals(quote),
    ).toBe(true);
    expect(() => cache.snapshot().cpmm(hint, ctx, 99n)).toThrow(/not open/);
    d[329] = 4;
    cache.update(pool, {
      ...a("", 100n, 2n),
      owner: CACHED_CPMM_PROGRAM,
      data: d,
    });
    expect(() => cache.snapshot().cpmm(hint, ctx, 100n)).toThrow(/disabled/);
    d[329] = 0;
    cache.update(pool, {
      ...a("", 100n, 3n),
      owner: CACHED_CPMM_PROGRAM,
      data: d,
    });
    const bad = Buffer.alloc(165);
    base.toBuffer().copy(bad);
    new PublicKey("GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL")
      .toBuffer()
      .copy(bad, 32);
    bad[108] = 1;
    cache.update(bv, { ...a("", 100n, 2n), data: bad });
    expect(() => cache.snapshot().cpmm(hint, ctx, 100n)).toThrow(/u64/);
  });
});
it("native CPMM quote matches six mainnet simulation outputs after actual reserve and token-fee updates", () => {
  const saved = JSON.parse(
      fs.readFileSync("examples/fixtures/cpmm_mainnet_20261002.json", "utf8"),
    ),
    cache = new SubscriptionAccountCache();
  for (const n of [
    "pool",
    "config",
    "base_mint",
    "quote_mint",
    "base_vault",
    "quote_vault",
  ]) {
    const a = saved[n];
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: 0n,
    });
  }
  const hint = new PoolTradeHint(
    new PublicKey(saved.pool.pubkey),
    new PublicKey(saved.base_mint.pubkey),
    new PublicKey(saved.quote_mint.pubkey),
  );
  const state = cache.snapshot().cpmm(
    hint,
    {
      slot: BigInt(saved.read_slot),
      epoch: BigInt(saved.epoch),
      maximumSlotAge: 32n,
    },
    BigInt(saved.unix_timestamp),
  );
  const evidence = JSON.parse(
    fs.readFileSync(
      "examples/fixtures/cpmm_mainnet_simulations_20261002.json",
      "utf8",
    ),
  );
  for (const c of evidence.cases) {
    const buy = c.side === "buy",
      i = BigInt(c.input_reserve_at_simulation),
      o = BigInt(c.output_reserve_at_simulation);
    const atSimulation = {
      ...state,
      baseReserve: buy ? i : o,
      quoteReserve: buy ? o : i,
    };
    expect(
      quoteCachedCpmmExactIn(
        atSimulation,
        buy ? 1000000n : 1000000000n,
        buy,
        100,
      ).amountOut,
    ).toBe(BigInt(c.actual_net_output));
  }
});
