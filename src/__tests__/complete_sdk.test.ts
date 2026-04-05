/**
 * Comprehensive Test Suite for Sol Trade SDK - TypeScript
 * Tests all modules with performance benchmarks.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import all modules
import {
  GasFeeStrategy,
  GasFeeStrategyType,
  createGasFeeStrategy,
  SwqosType,
  TradeType,
} from '../index';

import {
  LRUCache,
  TTLCache,
  ShardedCache,
  blockhashCache,
  accountCache,
  priceCache,
} from '../cache/cache';

import {
  WorkerPool,
  RateLimiter,
  MultiRateLimiter,
  ConnectionPool,
  ObjectPool,
} from '../pool/pool';

import {
  computeFee,
  ceilDiv,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
} from '../calc';

// ===== Gas Fee Strategy Tests =====

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
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice,
      200000, 100000, 0.0005
    );
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal,
      200000, 100000, 0.001
    );

    const low = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice);
    const normal = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);

    expect(low).toBeUndefined();
    expect(normal).toBeDefined();
  });
});

// ===== Cache Tests =====

describe('LRUCache', () => {
  it('should set and get values', () => {
    const cache = new LRUCache<string, number>(3, 60000);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('should evict LRU entries', () => {
    const cache = new LRUCache<string, number>(2, 60000);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // Should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('should track statistics', () => {
    const cache = new LRUCache<string, number>(10, 60000);

    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('b'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });
});

describe('TTLCache', () => {
  it('should expire entries', async () => {
    const cache = new TTLCache<string, number>(100); // 100ms

    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('ShardedCache', () => {
  it('should distribute keys across shards', () => {
    const cache = new ShardedCache<string, number>(4, 100, 60000);

    for (let i = 0; i < 10; i++) {
      cache.set(`key_${i}`, i);
    }

    for (let i = 0; i < 10; i++) {
      expect(cache.get(`key_${i}`)).toBe(i);
    }
  });
});

// ===== Pool Tests =====

describe('WorkerPool', () => {
  it('should execute tasks', async () => {
    const pool = new WorkerPool(4);

    const result = await pool.submit(async () => 42);
    expect(result).toBe(42);

    const stats = pool.getStats();
    expect(stats.tasksCompleted).toBe(1);
  });

  it('should execute batch tasks', async () => {
    const pool = new WorkerPool(4);

    const tasks = [1, 2, 3, 4, 5].map(n => async () => n * 2);
    const results = await pool.submitBatch(tasks);

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('RateLimiter', () => {
  it('should allow burst', () => {
    const limiter = new RateLimiter(100, 10);

    // Should allow burst
    for (let i = 0; i < 10; i++) {
      expect(limiter.allow()).toBe(true);
    }

    // Should be rate limited
    expect(limiter.allow()).toBe(false);
  });
});

describe('MultiRateLimiter', () => {
  it('should have separate limits per key', () => {
    const limiter = new MultiRateLimiter(10, 5);

    // Exhaust key1
    for (let i = 0; i < 5; i++) {
      limiter.allow('key1');
    }

    expect(limiter.allow('key1')).toBe(false);
    expect(limiter.allow('key2')).toBe(true);
  });
});

// ===== Calculation Tests =====

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
    const result = calculateWithSlippageBuy(1000n, 100n); // 1%
    expect(result).toBe(1010n);
  });

  it('should calculate with slippage for sell', () => {
    const result = calculateWithSlippageSell(1000n, 100n); // 1%
    expect(result).toBe(990n);
  });

  it('should calculate PumpFun buy output', () => {
    const tokens = getBuyTokenAmountFromSolAmount(
      1000000n, // 0.001 SOL
      30000000000n,
      1073000000000000n,
      false, // hasCreator
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

// ===== Performance Benchmarks =====

describe('Performance Benchmarks', () => {
  it('LRU cache should be fast', () => {
    const cache = new LRUCache<string, number>(10000, 60000);

    // Set performance
    const setStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      cache.set(`key_${i}`, i);
    }
    const setTime = performance.now() - setStart;

    // Get performance
    const getStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      cache.get(`key_${i}`);
    }
    const getTime = performance.now() - getStart;

    console.log(`\nLRU Cache - Set: ${setTime.toFixed(2)}ms, Get: ${getTime.toFixed(2)}ms`);

    expect(setTime).toBeLessThan(500); // Under 500ms for 10k ops
    expect(getTime).toBeLessThan(500);
  });

  it('Calculations should be fast', () => {
    const start = performance.now();
    for (let i = 0; i < 100000; i++) {
      getBuyTokenAmountFromSolAmount(
        1000000n,
        30000000000n,
        1073000000000000n,
        false,
        793000000000000n
      );
    }
    const elapsed = performance.now() - start;

    console.log(`\nCalculations - 100k ops: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(1000); // Under 1 second
  });

  it('Gas strategy should be fast', () => {
    const strategy = new GasFeeStrategy();

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      strategy.set(
        SwqosType.Jito,
        TradeType.Buy,
        GasFeeStrategyType.Normal,
        200000,
        100000,
        0.001
      );
      strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    }
    const elapsed = performance.now() - start;

    console.log(`\nGas Strategy - 10k set/get: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(500);
  });
});
