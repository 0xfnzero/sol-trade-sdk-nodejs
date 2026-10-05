import { describe, expect, it } from 'vitest';
import {
  buyBaseInputInternalWithFees,
  buyQuoteInputInternalWithFees,
  effectiveQuoteReserves,
  pumpSwapFeeBasisPoints,
  sellBaseInputInternalWithFees,
  sellQuoteInputInternalWithFees,
} from '../calc';

describe('PumpSwap virtual quote reserves', () => {
  it('supports signed reserves and rejects invalid effective sums', () => {
    expect(effectiveQuoteReserves(1_000n, 250n)).toBe(1_250n);
    expect(effectiveQuoteReserves(1_000n, -250n)).toBe(750n);
    expect(effectiveQuoteReserves(1_000n, -1_000n)).toBe(0n);
    expect(() => effectiveQuoteReserves(1_000n, -1_001n)).toThrow(
      'Invalid effective quote reserves'
    );
    expect(() => effectiveQuoteReserves((1n << 64n) - 1n, 1n)).toThrow(
      'Invalid effective quote reserves'
    );
    expect(() => effectiveQuoteReserves(-1n, 0n)).toThrow('Invalid u64 quote vault balance');
    expect(() => effectiveQuoteReserves(1n, 1n << 127n)).toThrow('Invalid signed i128');
    expect(() => effectiveQuoteReserves(1n, -(1n << 127n) - 1n)).toThrow(
      'Invalid signed i128'
    );
  });

  it('matches the Rust SDK integer quote vectors', () => {
    const fees = pumpSwapFeeBasisPoints(20n, 5n, 30n);
    const baseReserve = 800_000_000_000_000n;
    const quoteReserve = 100_000_000_000n;
    const virtualQuoteReserves = 5_000_000_000n;
    const slippage = 125n;

    expect(buyBaseInputInternalWithFees(
      123_456_789_000n,
      slippage,
      baseReserve,
      quoteReserve,
      virtualQuoteReserves,
      fees
    )).toEqual({
      internalQuoteAmount: 16_206_205n,
      uiQuote: 16_295_341n,
      maxQuote: 16_499_032n,
    });
    expect(buyQuoteInputInternalWithFees(
      1_500_000_000n,
      slippage,
      baseReserve,
      quoteReserve,
      virtualQuoteReserves,
      fees
    )).toEqual({
      internalQuoteWithoutFees: 1_491_795_125n,
      base: 11_206_836_149_304n,
      maxQuote: 1_518_750_000n,
    });
    expect(sellBaseInputInternalWithFees(
      123_456_789_000n,
      slippage,
      baseReserve,
      quoteReserve,
      virtualQuoteReserves,
      fees
    )).toEqual({
      internalQuoteAmountOut: 16_201_203n,
      uiQuote: 16_112_095n,
      minQuote: 15_910_694n,
    });
    expect(sellQuoteInputInternalWithFees(
      500_000_000n,
      slippage,
      baseReserve,
      quoteReserve,
      virtualQuoteReserves,
      fees
    )).toEqual({
      internalRawQuote: 502_765_209n,
      base: 3_849_022_110_532n,
      minQuote: 493_750_000n,
    });
  });

  it('does not quote sell output beyond the real quote vault', () => {
    const fees = pumpSwapFeeBasisPoints(0n, 0n, 0n);
    expect(() => sellBaseInputInternalWithFees(1_000_000n, 0n, 1n, 1n, 1_000_000n, fees))
      .toThrow('Insufficient real quote reserves');
  });
});

// A negative offset must behave exactly like a smaller vault in all four modes.
describe('negative virtual reserves in every quote mode', () => {
  const modes = [buyBaseInputInternalWithFees, buyQuoteInputInternalWithFees,
    sellBaseInputInternalWithFees, sellQuoteInputInternalWithFees];
  for (const quote of modes) {
    it(quote.name, () => {
      const fees = pumpSwapFeeBasisPoints(20n, 5n, 30n);
      expect(quote(10_000n, 125n, 1_000_000n, 1_000_000n, -500_000n, fees))
        .toEqual(quote(10_000n, 125n, 1_000_000n, 500_000n, 0n, fees));
      expect(() => quote(10_000n, 125n, 1_000_000n, 1_000_000n, -1_000_000n, fees))
        .toThrow('Invalid effective quote reserves');
    });
  }
});
