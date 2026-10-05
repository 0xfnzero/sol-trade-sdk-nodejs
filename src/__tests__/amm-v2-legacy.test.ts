import { PublicKey } from "@solana/web3.js";
import { describe, it, expect } from "vitest";
import {
  buildRaydiumAmmV4BuyInstructions as buy,
  buildRaydiumAmmV4SellInstructions as sell,
} from "../instruction/raydium_amm_v4_builder";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from "../common/spl-token";
const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const payer = pk(99),
  p = {
    amm: pk(1),
    coinMint: pk(2),
    pcMint: pk(3),
    tokenCoin: pk(4),
    tokenPc: pk(5),
    coinReserve: 10000n,
    pcReserve: 20000n,
    swapFeeNumerator: 1n,
    swapFeeDenominator: 3n,
  };
describe("legacy AMM entry uses native V2", () => {
  it.each([true, false])(
    "stock pairs and actual ceil fee, coin input %s",
    (coinIn) => {
      const input = coinIn ? p.coinMint : p.pcMint,
        output = coinIn ? p.pcMint : p.coinMint;
      const b = buy({
        payer,
        inputMint: input,
        outputMint: output,
        inputAmount: 1001n,
        slippageBasisPoints: 100n,
        protocolParams: p,
        createInputMintAta: false,
        createOutputMintAta: false,
      })[0];
      const s = sell({
        payer,
        inputMint: input,
        outputMint: output,
        inputAmount: 1001n,
        slippageBasisPoints: 100n,
        protocolParams: p,
        createOutputMintAta: false,
      })[0];
      const expected =
        ((((coinIn ? 20000n : 10000n) * 667n) /
          ((coinIn ? 10000n : 20000n) + 667n)) *
          9900n) /
        10000n;
      expect(b.data).toEqual(s.data);
      expect(b.data[0]).toBe(16);
      expect(b.data.readBigUInt64LE(9)).toBe(expected);
      expect(b.keys).toHaveLength(8);
      expect(b.keys[5].pubkey).toEqual(
        getAssociatedTokenAddressSync(input, payer, true, TOKEN_PROGRAM_ID),
      );
      expect(b.keys[7].isWritable).toBe(false);
    },
  );
  it("chooses requested output in a WSOL/USDC pool and validates input", () => {
    const q = {
      ...p,
      coinMint: NATIVE_MINT,
      pcMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    };
    const args = {
      payer,
      outputMint: q.coinMint,
      inputAmount: 1001n,
      protocolParams: q,
      createInputMintAta: false,
      createOutputMintAta: false,
    };
    expect(buy(args)[0].keys[5].pubkey).toEqual(
      getAssociatedTokenAddressSync(q.pcMint, payer, true, TOKEN_PROGRAM_ID),
    );
    expect(() => buy({ ...args, inputMint: q.coinMint })).toThrow(/inputMint/);
  });
  it("exact output uses tag17/max input/exact output without market accounts", () => {
    const ix = buy({
      payer,
      outputMint: p.pcMint,
      inputAmount: 1001n,
      fixedOutputAmount: 42n,
      protocolParams: p,
      createInputMintAta: false,
      createOutputMintAta: false,
    })[0];
    expect(ix.data[0]).toBe(17);
    expect(ix.data.readBigUInt64LE(1)).toBe(1001n);
    expect(ix.data.readBigUInt64LE(9)).toBe(42n);
  });
  it("uses idempotent ATA creation for existing input and output accounts", () => {
    const ixs = buy({
      payer,
      outputMint: p.pcMint,
      inputAmount: 1001n,
      protocolParams: p,
    });
    expect(ixs[0].data).toEqual(Buffer.from([1]));
    expect(ixs[1].data).toEqual(Buffer.from([1]));
    const sells = sell({
      payer,
      inputMint: p.coinMint,
      inputAmount: 1001n,
      protocolParams: p,
    });
    expect(sells[0].data).toEqual(Buffer.from([1]));
  });
  it("rejects zero amount and invalid fee", () => {
    const args = {
      payer,
      outputMint: p.pcMint,
      inputAmount: 0n,
      protocolParams: p,
    };
    expect(() => buy(args)).toThrow();
    expect(() =>
      buy({
        ...args,
        inputAmount: 1n,
        protocolParams: { ...p, swapFeeDenominator: 0n },
      }),
    ).toThrow();
  });
});
