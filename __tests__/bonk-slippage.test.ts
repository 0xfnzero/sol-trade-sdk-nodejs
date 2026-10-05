import { describe, expect, it } from "vitest";
import {
  getBonkBuyTokenAmountFromSolAmount,
  getBonkSellSolAmountFromTokenAmount,
} from "../src/calc";

const VIRTUAL_BASE = BigInt("1073025605596382");
const VIRTUAL_QUOTE = BigInt("30000852951");
const MAX_SLIPPAGE = BigInt(9999);

describe("Bonk slippage clamp", () => {
  it("buy at 10000 bps matches clamp cap and stays non-zero", () => {
    const withMax = getBonkBuyTokenAmountFromSolAmount(
      BigInt(1_000_000),
      VIRTUAL_BASE,
      VIRTUAL_QUOTE,
      BigInt(0),
      BigInt(0),
      BigInt(10_000)
    );
    const withCap = getBonkBuyTokenAmountFromSolAmount(
      BigInt(1_000_000),
      VIRTUAL_BASE,
      VIRTUAL_QUOTE,
      BigInt(0),
      BigInt(0),
      MAX_SLIPPAGE
    );
    expect(withMax).toBe(withCap);
    expect(withMax > BigInt(0)).toBe(true);
  });

  it("sell above 10000 bps matches clamp cap and stays non-zero", () => {
    const withOverflow = getBonkSellSolAmountFromTokenAmount(
      BigInt(1_000_000_000),
      VIRTUAL_BASE,
      VIRTUAL_QUOTE,
      BigInt(0),
      BigInt(0),
      BigInt(50_000)
    );
    const withCap = getBonkSellSolAmountFromTokenAmount(
      BigInt(1_000_000_000),
      VIRTUAL_BASE,
      VIRTUAL_QUOTE,
      BigInt(0),
      BigInt(0),
      MAX_SLIPPAGE
    );
    expect(withOverflow).toBe(withCap);
    expect(withOverflow > BigInt(0)).toBe(true);
  });
});
