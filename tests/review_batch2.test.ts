import { it, expect, vi } from "vitest";
import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../src/trading/subscription_cache";
import { tokenTransferFeeForEpoch } from "../src/instruction/token_mint_state";
import {
  buildRaydiumClmmSwapV2,
  buildWhirlpoolSwapV2,
} from "../src/instruction/native_hops";
import {
  SubscriptionHandle,
  SubscriptionManager,
  SubscriptionState,
} from "../src/common/subscription-handle";
for (const kind of ["clmm", "dlmm"])
  it(`${kind} discovers initialized array beyond 2048 empty positions`, () => {
    const v = JSON.parse(
        fs.readFileSync(
          new URL(`./batch2_sparse_${kind}.json`, import.meta.url),
          "utf8",
        ),
      ),
      c = new SubscriptionAccountCache();
    for (const a of v.accounts)
      c.update(new PublicKey(a.pubkey), {
        owner: new PublicKey(a.owner),
        data: Buffer.from(a.data, "base64"),
        slot: 100n,
        writeVersion: 1n,
      });
    const h = new PoolTradeHint(
      new PublicKey(v.pool),
      new PublicKey(v.input_mint),
      new PublicKey(v.output_mint),
    );
    const call = () =>
      c
        .snapshot()
        [kind === "clmm" ? "prepareClmm" : "prepareDlmm"](
          h,
          { slot: 100n, epoch: 0n, maximumSlotAge: 0n },
          1000n,
          new PublicKey(v.payer),
          100n,
          100,
          8,
        );
    expect(call).toThrow(v.expected_missing);
  });
it("mint epoch requires exact bigint", () => {
  const d = Buffer.alloc(82);
  d[45] = 1;
  expect(() =>
    tokenTransferFeeForEpoch(
      d,
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      1 as any,
    ),
  ).toThrow(/Epoch/);
});
it("CLMM rejects explicit mismatched bitmap and non-boolean swap mode", () => {
  const k = PublicKey.default,
    a: any = {
      pool_state: k,
      tick_arrays: [k],
      tick_array_bitmap_extension: k,
    };
  expect(() =>
    buildRaydiumClmmSwapV2(a, {
      amount: 1n,
      other_amount_threshold: 1n,
      sqrt_price_limit: 0n,
      amount_specified_is_input: true,
    }),
  ).toThrow(/bitmap/);
});
it("concurrent unsubscribe invokes transport once", async () => {
  let done!: () => void;
  const fn = vi.fn(() => new Promise<void>((r) => (done = r)));
  const h = new SubscriptionHandle("slot", {}, fn);
  h.setState(SubscriptionState.Active);
  const a = h.unsubscribe(),
    b = h.unsubscribe();
  expect(fn).toHaveBeenCalledTimes(1);
  done();
  await Promise.all([a, b]);
  expect(h.isClosed()).toBe(true);
});
it("same-key replacements retain one backend listener and ignore closed callbacks", async () => {
  const listeners = new Map<number, Function>();
  let next = 0;
  const connection: any = {
    onAccountChange: vi.fn((_k: any, cb: any) => {
      listeners.set(++next, cb);
      return next;
    }),
    removeAccountChangeListener: vi.fn(async (id: number) => {
      listeners.delete(id);
    }),
  };
  const manager = new SubscriptionManager(connection),
    cb = vi.fn(),
    config = { publicKey: PublicKey.default };
  const old = await manager.subscribeAccount(config, cb),
    stale = listeners.get(old.getSubscriptionId()!)!;
  const [a, b] = await Promise.all([
    manager.subscribeAccount(config, cb),
    manager.subscribeAccount(config, cb),
  ]);
  expect(listeners.size).toBe(1);
  expect(a.isClosed()).toBe(true);
  expect(b.isActive()).toBe(true);
  stale({}, {});
  expect(cb).not.toHaveBeenCalled();
  await manager.unsubscribeAll();
  expect(listeners.size).toBe(0);
});
it("slot/root expose their actual types and signature completion closes handle", async () => {
  let signatureCallback!: Function;
  const c: any = {
    onSlotChange: () => 1,
    onRootChange: () => 2,
    onSignature: (_s: any, cb: any) => {
      signatureCallback = cb;
      return 3;
    },
    removeSignatureListener: vi.fn(),
  };
  const m = new SubscriptionManager(c);
  expect((await m.subscribeSlot(() => {})).getType()).toBe("slot");
  expect((await m.subscribeRoot(() => {})).getType()).toBe("root");
  const h = await m.subscribeSignature({ signature: "x" }, () => {});
  signatureCallback({}, {});
  expect(h.isClosed()).toBe(true);
  await h.unsubscribe();
  expect(c.removeSignatureListener).not.toHaveBeenCalled();
});
it("CPMM preparation rejects zero protection and wrong vault authority", () => {
  const v = JSON.parse(
      fs.readFileSync(new URL("./batch2_cpmm.json", import.meta.url), "utf8"),
    ),
    c = new SubscriptionAccountCache();
  for (const a of v.accounts)
    c.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: 100n,
      writeVersion: 1n,
    });
  const h = new PoolTradeHint(
      new PublicKey(v.pool),
      new PublicKey(v.input_mint),
      new PublicKey(v.output_mint),
    ),
    ctx = { slot: 100n, epoch: 0n, maximumSlotAge: 0n },
    payer = new PublicKey(v.payer);
  expect(() => c.snapshot().prepareCpmm(h, ctx, 1000n, payer, 1n, 100)).toThrow(
    /zero protected/,
  );
  expect(
    c.snapshot().prepareCpmm(h, ctx, 1000n, payer, 10000n, 100).quote
      .minimumAmountOut,
  ).toBeGreaterThan(0n);
  const vault = c.snapshot().get(new PublicKey(v.vault), ctx);
  Buffer.from(vault.data).fill(0, 32, 64);
  const bad = Buffer.from(vault.data);
  bad.fill(0, 32, 64);
  c.update(new PublicKey(v.vault), { ...vault, data: bad, writeVersion: 2n });
  expect(() => c.snapshot().cpmm(h, ctx, 1000n)).toThrow(/vault/);
});

it("native hop mode and Whirlpool direction must be booleans", () => {
  const k = PublicKey.default,
    a: any = {
      payer: k,
      amm_config: k,
      pool_state: k,
      input_token_account: k,
      output_token_account: k,
      input_vault: k,
      output_vault: k,
      observation_state: k,
      token_program: k,
      token_program_2022: k,
      input_vault_mint: k,
      output_vault_mint: k,
      tick_arrays: [k],
    };
  expect(() =>
    buildRaydiumClmmSwapV2(a, {
      amount: 1n,
      other_amount_threshold: 1n,
      sqrt_price_limit: 0n,
      amount_specified_is_input: 2 as any,
    }),
  ).toThrow(/boolean/);
  expect(() =>
    buildWhirlpoolSwapV2({ tick_arrays: [k, k, k] } as any, {
      amount: 1n,
      other_amount_threshold: 1n,
      sqrt_price_limit: 0n,
      amount_specified_is_input: true,
      a_to_b: 2 as any,
    }),
  ).toThrow(/boolean/);
});
