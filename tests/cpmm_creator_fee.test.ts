import { it, expect } from "vitest";
import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import * as f from "../src/instruction/cpmm_creator_fee";
import { SubscriptionAccountCache } from "../src/trading/subscription_cache";
import { RAYDIUM_CPMM_PROGRAM_ID as program } from "../src/instruction/raydium_cpmm_builder";
const cases = JSON.parse(
  fs.readFileSync("tests/fixtures/cpmm_creator_fee_rust_5_0_7.json", "utf8"),
);
const pk = (s: string) => new PublicKey(s);
for (const c of cases)
  it(`${c.name} ${c.permissionless} Rust mainnet account/payout parity`, () => {
    const pool = f.decodeCpmmCollectionPool(
        Buffer.from(c.accounts[0].data_base64, "base64"),
      ),
      config = f.decodeCpmmAmmConfig(
        Buffer.from(c.accounts[1].data_base64, "base64"),
      );
    const share = c.accounts[2]
      ? {
          owner: pk(c.accounts[2].owner),
          data: Buffer.from(c.accounts[2].data_base64, "base64"),
          lamports: c.accounts[2].lamports,
        }
      : null;
    expect(config.creatorFeeShareRate).toBe(BigInt(c.config_share_rate));
    expect(config.padding.length).toBe(14);
    expect(
      f.getCreatorFeeSharePda(pool.poolCreator, pool.ammConfig).toBase58(),
    ).toBe(c.share_pda);
    const rate = f.resolveCreatorFeeShareRate(
      config,
      pool.poolCreator,
      pool.ammConfig,
      share,
    );
    expect(rate).toBe(BigInt(c.share_rate));
    const ix = c.permissionless
      ? f.collectCreatorFeePermissionless(pk(c.payer), pk(c.pool), pool)
      : f.collectCreatorFee(pk(c.pool), pool);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual(
      c.instruction.accounts,
    );
    expect(ix.data.toString("base64")).toBe(c.instruction.data_base64);
    expect(ix.programId.toBase58()).toBe(c.instruction.program_id);
    expect(ix.keys.map((k) => k.isSigner)).toEqual(
      ix.keys.map((_, i) => i === 0),
    );
    expect(ix.keys.map((k) => k.isWritable)).toEqual(
      ix.keys.map((_, i) =>
        [0, c.permissionless ? 3 : 2, 4, 5, 8, 9].includes(i),
      ),
    );
    for (const check of c.checks)
      expect(f.splitCreatorFee(BigInt(check.gross), rate)).toEqual([
        BigInt(check.creator_before_transfer_fee),
        BigInt(check.protocol_share),
      ]);
    const cache = new SubscriptionAccountCache(),
      ctx = { slot: 100n, epoch: 0n, maximumSlotAge: 5n };
    for (let i = 0; i < 3; i++) {
      const a = c.accounts[i];
      cache.update(a ? pk(a.pubkey) : pk(c.share_pda), {
        owner: a ? pk(a.owner) : PublicKey.default,
        data: a ? Buffer.from(a.data_base64, "base64") : Buffer.alloc(0),
        slot: 100n,
        writeVersion: 1n,
      });
    }
    const payer = c.permissionless ? pk(c.payer) : undefined,
      snapshot = cache.snapshot(),
      prepared = f.prepareCpmmCreatorFeeCollection(
        snapshot,
        pk(c.pool),
        ctx,
        payer,
      );
    expect(prepared.shareRate).toBe(rate);
    f.validateCpmmCreatorFeeCollection(
      snapshot,
      prepared,
      { ...ctx, slot: 101n },
      payer,
    );
    expect(() =>
      f.validateCpmmCreatorFeeCollection(
        snapshot,
        { ...prepared, creatorPayoutToken0: prepared.creatorPayoutToken0 + 1n },
        ctx,
        payer,
      ),
    ).toThrow();
    expect(() =>
      f.validateCpmmCreatorFeeCollection(
        snapshot,
        prepared,
        { ...ctx, slot: 99n },
        payer,
      ),
    ).toThrow();
    expect(() =>
      f.validateCpmmCreatorFeeCollection(
        snapshot,
        { ...prepared, shareRate: prepared.shareRate.toString() } as any,
        ctx,
        payer,
      ),
    ).toThrow();
    cache.update(pk(c.share_pda), {
      owner: share?.owner ?? PublicKey.default,
      data: share?.data ?? Buffer.alloc(0),
      slot: 100n,
      writeVersion: 2n,
    });
    expect(() =>
      f.validateCpmmCreatorFeeCollection(
        cache.snapshot(),
        prepared,
        ctx,
        payer,
      ),
    ).toThrow();
    expect(() =>
      f.prepareCpmmCreatorFeeCollection(
        snapshot,
        pk(c.pool),
        { ...ctx, slot: 106n },
        payer,
      ),
    ).toThrow();
  });
it("integer boundaries and strict share fallback", () => {
  expect(f.splitCreatorFee(0xffffffffffffffffn, 1000000n)).toEqual([
    0n,
    0xffffffffffffffffn,
  ]);
  expect(f.splitCreatorFee(1n, 50000n)).toEqual([1n, 0n]);
  for (const n of [-1n, 1000001n])
    expect(() => f.splitCreatorFee(1n, n)).toThrow();
  expect(() => f.splitCreatorFee(1n << 64n, 0n)).toThrow();
  const c = cases.find((x: any) => x.name === "override"),
    config = f.decodeCpmmAmmConfig(
      Buffer.from(c.accounts[1].data_base64, "base64"),
    ),
    pool = f.decodeCpmmCollectionPool(
      Buffer.from(c.accounts[0].data_base64, "base64"),
    ),
    data = Buffer.from(c.accounts[2].data_base64, "base64");
  expect(
    f.resolveCreatorFeeShareRate(config, pool.poolCreator, pool.ammConfig, {
      owner: program,
      data,
      lamports: 0,
    }),
  ).toBe(config.creatorFeeShareRate);
  expect(
    f.resolveCreatorFeeShareRate(config, pool.poolCreator, pool.ammConfig, {
      owner: PublicKey.default,
      data: Buffer.from([1]),
      lamports: 1,
    }),
  ).toBe(config.creatorFeeShareRate);
  expect(() =>
    f.resolveCreatorFeeShareRate(config, pool.poolCreator, pool.ammConfig, {
      owner: program,
      data: data.subarray(0, 144),
      lamports: 1,
    }),
  ).toThrow();
  expect(() =>
    f.resolveCreatorFeeShareRate(config, PublicKey.default, pool.ammConfig, {
      owner: program,
      data,
      lamports: 1,
    }),
  ).toThrow();
  data.writeBigUInt64LE(0n, 73);
  expect(
    f.resolveCreatorFeeShareRate(config, pool.poolCreator, pool.ammConfig, {
      owner: program,
      data,
      lamports: 1,
    }),
  ).toBe(0n);
  data.writeBigUInt64LE(1000001n, 73);
  expect(() =>
    f.resolveCreatorFeeShareRate(config, pool.poolCreator, pool.ammConfig, {
      owner: program,
      data,
      lamports: 1,
    }),
  ).toThrow();
  for (const [decode, raw, size] of [
    [
      f.decodeCpmmAmmConfig,
      Buffer.from(c.accounts[1].data_base64, "base64"),
      236,
    ],
    [
      f.decodeCpmmCollectionPool,
      Buffer.from(c.accounts[0].data_base64, "base64"),
      637,
    ],
    [f.decodeCpmmCreatorFeeShare, data, 145],
  ] as const) {
    expect(() => decode(raw.subarray(0, size - 1))).toThrow();
    const b = Buffer.from(raw);
    b[0] ^= 1;
    expect(() => decode(b)).toThrow();
  }
  const cache = new SubscriptionAccountCache();
  for (const a of c.accounts.slice(0, 2))
    cache.update(pk(a.pubkey), {
      owner: pk(a.owner),
      data: Buffer.from(a.data_base64, "base64"),
      slot: 100n,
      writeVersion: 1n,
    });
  expect(() =>
    f.prepareCpmmCreatorFeeCollection(cache.snapshot(), pk(c.pool), {
      slot: 100n,
      epoch: 0n,
      maximumSlotAge: 0n,
    }),
  ).toThrow(/Missing/);
});
it("RPC fetch uses one snapshot and propagates errors", async () => {
  const c = cases[0],
    pool = f.decodeCpmmCollectionPool(
      Buffer.from(c.accounts[0].data_base64, "base64"),
    );
  let calls = 0;
  const rpc = {
    getMultipleAccountsInfoAndContext: async (
      keys: PublicKey[],
      commitment: string,
    ) => {
      calls++;
      expect(keys.map((k) => k.toBase58())).toEqual([
        pool.ammConfig.toBase58(),
        c.share_pda,
      ]);
      expect(commitment).toBe("confirmed");
      return {
        value: c.accounts.slice(1, 3).map((a: any) =>
          a
            ? {
                owner: pk(a.owner),
                data: Buffer.from(a.data_base64, "base64"),
                lamports: a.lamports,
              }
            : null,
        ),
      };
    },
  };
  expect(
    await f.fetchCreatorFeeShareRate(
      rpc as any,
      pool.poolCreator,
      pool.ammConfig,
    ),
  ).toBe(BigInt(c.share_rate));
  expect(calls).toBe(1);
  await expect(
    f.fetchCreatorFeeShareRate(
      {
        getMultipleAccountsInfoAndContext: async () => {
          throw Error("network");
        },
      } as any,
      pool.poolCreator,
      pool.ammConfig,
    ),
  ).rejects.toThrow("network");
});
it("rejects protocol counter overflow before building", () => {
  const c = cases[0],
    cache = new SubscriptionAccountCache();
  for (const a of c.accounts) {
    const key = a ? pk(a.pubkey) : pk(c.share_pda),
      data = a ? Buffer.from(a.data_base64, "base64") : Buffer.alloc(0);
    if (key.toBase58() === c.pool)
      data.writeBigUInt64LE(0xffffffffffffffffn, 341);
    cache.update(key, {
      owner: a ? pk(a.owner) : PublicKey.default,
      data,
      slot: 100n,
      writeVersion: 1n,
    });
  }
  expect(() =>
    f.prepareCpmmCreatorFeeCollection(cache.snapshot(), pk(c.pool), {
      slot: 100n,
      epoch: 0n,
      maximumSlotAge: 0n,
    }),
  ).toThrow(/u64/);
});
