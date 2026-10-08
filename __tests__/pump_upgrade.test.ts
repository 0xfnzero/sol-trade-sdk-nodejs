import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { buildPumpUpgradeInstruction } from "../src/instruction/pump_upgrade";
import {
  quotePumpBuyV3ExactIn,
  quotePumpBuyV3ExactOut,
  PumpV3QuoteState,
} from "../src/calc/pump_v3";
const fixtures = JSON.parse(
  readFileSync("tests/fixtures/pump_upgrade/instructions.json", "utf8"),
);
describe("official Pump upgrade interfaces", () => {
  it("matches all eleven instruction orders, flags, programs, args and bool bytes", () => {
    for (const [name, raw] of Object.entries(fixtures.instructions)) {
      const s = raw as any;
      const accounts: Record<string, PublicKey> = {};
      s.accounts.forEach(
        (a: any, i: number) =>
          (accounts[a.name] = new PublicKey(Buffer.alloc(32, i + 1))),
      );
      const hops =
        name === "pump_amm_multi_hop_swap"
          ? Array.from({ length: 5 }, (_, i) => ({
              pubkey: new PublicKey(Buffer.alloc(32, i + 70)),
              isSigner: false,
              isWritable: i >= 2,
            }))
          : [];
      const ix = buildPumpUpgradeInstruction(
        name,
        accounts,
        s.args ? [7n, 9n] : [],
        s.partial_fill ? true : undefined,
        hops,
      );
      expect(ix.programId.toBase58()).toBe(s.program);
      expect([...ix.data.subarray(0, 8)]).toEqual(s.discriminator);
      expect(
        ix.keys
          .slice(0, s.accounts.length)
          .map((k) => [k.pubkey.toBase58(), k.isWritable, k.isSigner]),
      ).toEqual(
        s.accounts.map((a: any) => [
          accounts[a.name]!.toBase58(),
          !!a.writable,
          !!a.signer,
        ]),
      );
      if (s.args) {
        expect(ix.data.readBigUInt64LE(8)).toBe(7n);
        expect(ix.data.readBigUInt64LE(16)).toBe(9n);
      }
      if (s.partial_fill) expect(ix.data[24]).toBe(1);
      expect(() =>
        buildPumpUpgradeInstruction(
          name,
          {},
          s.args ? [7n, 9n] : [],
          undefined,
          hops,
        ),
      ).toThrow();
    }
  });
  it("matches 240 independent official SDK v3 quote vectors", () => {
    const fixture = JSON.parse(
      readFileSync("tests/fixtures/pump_upgrade/quotes.json", "utf8"),
    );
    for (const c of fixture.cases) {
      const s = Object.fromEntries(
        Object.entries(c.state).map(([k, v]) => [
          k.replace(/_([a-z])/g, (_, x) => x.toUpperCase()),
          BigInt(v as string),
        ]),
      ) as unknown as PumpV3QuoteState;
      const q = (
        c.mode === "out" ? quotePumpBuyV3ExactOut : quotePumpBuyV3ExactIn
      )(s, BigInt(c.amount));
      expect((c.mode === "out" ? q.quoteIn : q.baseOut).toString()).toBe(
        c.expected,
      );
      if (c.mode === "in") expect(q.quoteIn <= BigInt(c.amount)).toBe(true);
    }
  });
  it("rejects incomplete routes and unsupported argument forms", () => {
    expect(() =>
      buildPumpUpgradeInstruction("pump_amm_multi_hop_swap", {}, [1n, 1n]),
    ).toThrow();
    expect(() =>
      buildPumpUpgradeInstruction("pump_buy_v3", {}, [-1n, 1n]),
    ).toThrow();
  });
});

import createFixture from "../tests/fixtures/pump_upgrade/create.json";
import { buildPumpCreateV2Instruction } from "../src/instruction/pump_create_v2";
import {
  derivePumpV3Accounts,
  derivePumpMultiHopAccounts,
  derivePumpCoinQuoteCreateAccounts,
  PumpMultiHop,
} from "../src/instruction/pump_compact_accounts";
it("matches official Anchor create_v2 encoding with UTF-8 and tuple options", () => {
  const accounts = Object.fromEntries(
    createFixture.accounts.map((a, i) => [
      a.name,
      new PublicKey(Buffer.alloc(32, i + 1)),
    ]),
  );
  const ix = buildPumpCreateV2Instruction(accounts, {
    name: "测试",
    symbol: "Q",
    uri: "https://example.com/q",
    creator: new PublicKey(Buffer.alloc(32, 9)),
    creatorFeeBps: 25n,
    holderReward: true,
  });
  expect(ix.data.toString("hex")).toBe(createFixture.data);
  expect(ix.keys).toHaveLength(16);
  createFixture.accounts.forEach((a, i) => {
    expect(ix.keys[i]!.isSigner).toBe(a.signer);
    expect(ix.keys[i]!.isWritable).toBe(a.writable);
  });
});
it("validates nested curve route, cashback endpoint and continuity", () => {
  const user = new PublicKey(Buffer.alloc(32, 1)),
    a = new PublicKey(Buffer.alloc(32, 2)),
    b = new PublicKey(Buffer.alloc(32, 3)),
    wsol = new PublicKey("So11111111111111111111111111111111111111112"),
    token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const hop = (baseMint: PublicKey, quoteMint: PublicKey): PumpMultiHop => {
    const p = derivePumpV3Accounts({
      user,
      baseMint,
      quoteMint,
      baseTokenProgram: token,
      quoteTokenProgram: token,
      buybackRecipient: user,
    });
    return {
      venue: "curve",
      baseMint,
      quoteMint,
      address: p.bonding_curve!,
      baseVault: p.associated_base_bonding_curve!,
      quoteVault: p.associated_quote_bonding_curve!,
      baseTokenProgram: token,
      quoteTokenProgram: token,
      mayhem: false,
      cashback: false,
    };
  };
  const hops = [hop(a, wsol), hop(b, a)];
  expect(derivePumpCoinQuoteCreateAccounts(b, hops[0]!, 0, 1, [])).toHaveLength(
    5,
  );
  expect(() =>
    derivePumpCoinQuoteCreateAccounts(b, hops[0]!, 1, 1, []),
  ).toThrow("CurveDepthExceeded");
  const result = derivePumpMultiHopAccounts(user, wsol, b, user, hops);
  expect(result.remaining).toHaveLength(10);
  expect(result.accounts.buyback_fee_recipient).not.toEqual(user);
  expect(() =>
    derivePumpMultiHopAccounts(user, wsol, b, user, [hops[1]!, hops[0]!]),
  ).toThrow("Discontinuous");
  expect(() =>
    derivePumpMultiHopAccounts(user, wsol, b, user, [
      hops[0]!,
      { ...hops[1]!, cashback: true },
    ]),
  ).toThrow("Cashback");
  expect(() =>
    derivePumpMultiHopAccounts(user, wsol, b, user, [
      { ...hops[0]!, mayhem: true },
      hops[1]!,
    ]),
  ).toThrow();
});

import controlFixture from "../tests/fixtures/pump_upgrade/quote_control.json";
import { decodePumpQuoteControl } from "../src/instruction/pump_create_v2";
import { pumpCoinInitialQuoteReserves } from "../src/calc/pump_v3";
it("decodes official QuoteControl header and validates child initial reserves", () => {
  const b = Buffer.from(controlFixture.data, "hex"),
    c = decodePumpQuoteControl(b);
  expect(c.admin.toString()).toBe(controlFixture.admin);
  expect(c.reservesAdmin.toString()).toBe(controlFixture.reservesAdmin);
  expect(c.mints[0]!.mint.toString()).toBe(controlFixture.mint);
  expect(c.mints[0]!.initialVirtualQuoteReserves).toBe(321n);
  expect(() => decodePumpQuoteControl(b.subarray(0, -1))).toThrow();
  expect(
    pumpCoinInitialQuoteReserves(123n, 1000n, 10n, 1000n, 100n, 2000n, 0, 1),
  ).toBe(12300n);
  expect(() =>
    pumpCoinInitialQuoteReserves(123n, 1000n, 10n, 1000n, 100n, 100n, 0, 1),
  ).toThrow("QuoteReservesOutOfRange");
});

it("builds the six instructions successfully simulated on current mainnet", () => {
  const f = JSON.parse(
    readFileSync(
      "tests/fixtures/pump_upgrade/simulated_instructions.json",
      "utf8",
    ),
  );
  for (const c of f.cases) {
    const ix = buildPumpUpgradeInstruction(
      c.name,
      Object.fromEntries(
        Object.entries(c.accounts).map(([k, v]) => [
          k,
          new PublicKey(v as string),
        ]),
      ),
      c.args.map((n: string) => BigInt(n)),
    );
    expect(ix.programId.toBase58()).toBe(c.program);
    expect(ix.data.toString("hex")).toBe(c.data);
    expect(
      ix.keys.map((a) => ({
        pubkey: a.pubkey.toBase58(),
        signer: a.isSigner,
        writable: a.isWritable,
      })),
    ).toEqual(c.metas);
  }
});
