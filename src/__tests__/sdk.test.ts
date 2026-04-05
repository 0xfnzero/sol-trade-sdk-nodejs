/**
 * Tests for Sol Trade SDK - TypeScript
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GasFeeStrategy,
  GasFeeStrategyType,
  createGasFeeStrategy,
  SwqosType,
  TradeType,
} from '../index';
import {
  computeFee,
  ceilDiv,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
} from '../calc';

describe('GasFeeStrategy', () => {
  let strategy: GasFeeStrategy;

  beforeEach(() => {
    strategy = new GasFeeStrategy();
  });

  it('should create a gas fee strategy', () => {
    expect(strategy).toBeDefined();
  });

  it('should set and get a strategy', () => {
    strategy.set(
      SwqosType.Jito,
      TradeType.Buy,
      GasFeeStrategyType.Normal,
      200000,
      100000,
      0.001
    );

    const value = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(value).toBeDefined();
    expect(value?.cuLimit).toBe(200000);
    expect(value?.cuPrice).toBe(100000);
    expect(value?.tip).toBe(0.001);
  });

  it('should set global fee strategy', () => {
    const globalStrategy = createGasFeeStrategy();

    // Set global fee strategy first
    globalStrategy.setGlobalFeeStrategy(
      200000, 200000,  // buy/sell CU limit
      100000, 100000,  // buy/sell CU price
      100000, 100000   // buy/sell tip
    );

    // Check that strategies are set for common SWQOS types
    const jitoValue = globalStrategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(jitoValue).toBeDefined();
    expect(jitoValue?.cuLimit).toBe(200000);
  });

  it('should update buy tip for all strategies', () => {
    strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal, 200000, 100000, 0.001);
    strategy.set(SwqosType.Jito, TradeType.Sell, GasFeeStrategyType.Normal, 200000, 100000, 0.002);

    strategy.updateBuyTip(0.005);

    const buyValue = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    const sellValue = strategy.get(SwqosType.Jito, TradeType.Sell, GasFeeStrategyType.Normal);

    expect(buyValue?.tip).toBe(0.005);
    expect(sellValue?.tip).toBe(0.002);
  });

  it('should delete a strategy', () => {
    strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal, 200000, 100000, 0.001);
    strategy.delete(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);

    const value = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(value).toBeUndefined();
  });

  it('should resolve conflicts when setting Normal strategy', () => {
    // Set high/low strategies first
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice,
      200000, 100000, 0.0005
    );
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.HighTipLowCuPrice,
      200000, 100000, 0.002
    );

    // Set Normal strategy (should remove high/low)
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal,
      200000, 100000, 0.001
    );

    const low = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice);
    const high = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.HighTipLowCuPrice);
    const normal = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);

    expect(low).toBeUndefined();
    expect(high).toBeUndefined();
    expect(normal).toBeDefined();
  });
});

describe('Calculations', () => {
  it('should compute fee correctly', () => {
    const fee = computeFee(1000000n, 100n, 10000n); // 1%
    expect(fee).toBe(10000n);
  });

  it('should perform ceiling division', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(11n, 3n)).toBe(4n);
  });

  it('should calculate with slippage for buy', () => {
    const result = calculateWithSlippageBuy(1000n, 100n); // 1% slippage
    expect(result).toBe(1010n);
  });

  it('should calculate with slippage for sell', () => {
    const result = calculateWithSlippageSell(1000n, 100n); // 1% slippage
    expect(result).toBe(990n);
  });

  it('should calculate PumpFun buy output', () => {
    const tokens = getBuyTokenAmountFromSolAmount(
      1000000n, // 0.001 SOL
      30000000000n,
      1073000000000000n,
      false,
      793000000000000n
    );
    expect(tokens > 0n).toBe(true);
  });

  it('should calculate PumpFun sell output', () => {
    const sol = getSellSolAmountFromTokenAmount(
      1000000000n, // 1 million tokens
      30000000000n,
      1073000000000000n,
      1000000000n
    );
    expect(sol > 0n).toBe(true);
  });
});
