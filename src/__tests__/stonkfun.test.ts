import {BONK_AUTHORITY} from '../instruction/bonk_builder';
import { it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  buildStonkFunCurveExactIn,
  buildLaunchLabCurveExactIn,
  calculateTokenTransferFee,
  type StonkFunCurveAccounts,
  quoteLaunchLabExactIn,
  decodeStonkFunCurve,
  STONKFUN_PROGRAM,
  type LaunchLabQuoteState,
} from "../instruction/stonkfun";
import golden from "./fixtures/launchlab_rust_5_0_6.json";
const fee = (p: any) => ({
  basisPoints: p.basis_points,
  maximumFee: BigInt(p.maximum_fee),
});
for (const c of golden.cases) {
  const s = c.state;
  const state: LaunchLabQuoteState = {
    virtualBase: BigInt(s.virtual_base),
    virtualQuote: BigInt(s.virtual_quote),
    realBase: BigInt(s.real_base),
    realQuote: BigInt(s.real_quote),
    totalBaseSell: BigInt(s.total_base_sell),
    curveType: s.curve_type,
    tradeFeeRate: BigInt(s.trade_fee_rate),
    platformFeeRate: BigInt(s.platform_fee_rate),
    creatorFeeRate: BigInt(s.creator_fee_rate),
    baseTransferFee: fee(s.base_transfer_fee),
    quoteTransferFee: fee(s.quote_transfer_fee),
  };
  it(c.name + " current buy and sell match released Rust", () => {
    for (const buy of [true, false]) {
      const want = buy ? c.buy : c.sell;
      expect(
        quoteLaunchLabExactIn(state, BigInt(c.amount), buy, c.slippage_bps),
      ).toEqual({
        amountIn: BigInt(want.amount_in),
        minimumAmountOut: BigInt(want.minimum_amount_out),
      });
    }
  });
}
it("uses stock quote and Token2022 ATA; refuses foreign config/stale curve", () => {
  const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n)),
    config = new PublicKey("6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt"),
    token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    token2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  const data = Buffer.alloc(429);
  Buffer.from("f7ede3f5d7c3de46", "hex").copy(data);
  pk(1).toBuffer().copy(data, 141);
  config.toBuffer().copy(data, 173);
  for (const [n, o] of [
    [2, 205],
    [3, 237],
    [4, 269],
    [5, 301],
    [6, 333],
  ])
    pk(n!).toBuffer().copy(data, o);
  const global = Buffer.alloc(35);
  Buffer.from("95089ccaa0fcb0d9", "hex").copy(global);
  global.writeBigUInt64LE(2500n, 27);
  const platform = Buffer.alloc(728);
  Buffer.from("a04e8000f853e6a0", "hex").copy(platform);
  platform.writeBigUInt64LE(7000n, 104);
  platform.writeBigUInt64LE(3000n, 720);
  const p = { pubkey: pk(7), owner: STONKFUN_PROGRAM, data },
    g = { pubkey: pk(1), owner: STONKFUN_PROGRAM, data: global },
    f = { pubkey: config, owner: STONKFUN_PROGRAM, data: platform };
  const decoded = decodeStonkFunCurve(
    p,
    g,
    f,
    token,
    token2022,
    { basisPoints: 0, maximumFee: 0n },
    { basisPoints: 0, maximumFee: 0n },
  );
  for (const buy of [true, false]) {
    const ix = buildStonkFunCurveExactIn(
      decoded.accounts,
      pk(8),
      100n,
      5n,
      buy,
    );
    expect(ix.keys).toHaveLength(18);
    expect(ix.keys[10]!.pubkey.equals(pk(3))).toBe(true);
    expect(ix.keys[12]!.pubkey.equals(token2022)).toBe(true);
    expect(ix.data.readBigUInt64LE(8)).toBe(100n);
    expect(
      ix.keys[6]!.pubkey.equals(
        PublicKey.findProgramAddressSync(
          [pk(8).toBuffer(), token2022.toBuffer(), pk(3).toBuffer()],
          new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        )[0],
      ),
    ).toBe(true);
  }
  expect(() =>
    decodeStonkFunCurve(
      { ...p, owner: pk(9) },
      g,
      f,
      token,
      token2022,
      { basisPoints: 0, maximumFee: 0n },
      { basisPoints: 0, maximumFee: 0n },
    ),
  ).toThrow("owner");
  data[17] = 1;
  expect(() =>
    decodeStonkFunCurve(
      p,
      g,
      f,
      token,
      token2022,
      { basisPoints: 0, maximumFee: 0n },
      { basisPoints: 0, maximumFee: 0n },
    ),
  ).toThrow("not trading");
});

it('shared LaunchLab authority matches the on-chain authority',()=>expect(BONK_AUTHORITY.toBase58()).toBe('WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh'));

it.each([0, 1, "false", null])("rejects untyped direction %j", (direction) => {
  const p: LaunchLabQuoteState = {
    virtualBase: 1000000n, virtualQuote: 2000000n, realBase: 0n,
    realQuote: 0n, totalBaseSell: 0n, curveType: 0, tradeFeeRate: 2500n,
    platformFeeRate: 0n, creatorFeeRate: 0n,
    baseTransferFee: {basisPoints: 0, maximumFee: 0n},
    quoteTransferFee: {basisPoints: 0, maximumFee: 0n},
  };
  const buy = direction as unknown as boolean;
  expect(() => quoteLaunchLabExactIn(p, 100n, buy)).toThrow("direction");
  expect(() => buildLaunchLabCurveExactIn(null as unknown as StonkFunCurveAccounts, PublicKey.default, 100n, 1n, buy)).toThrow("direction");
  expect(() => calculateTokenTransferFee(100n, {basisPoints: 100, maximumFee: 100n}, buy)).toThrow("direction");
});
