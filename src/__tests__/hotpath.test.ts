/**
 * Comprehensive tests for Hot Path modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Connection,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import {
  HotPathConfig,
  HotPathState,
  HotPathExecutor,
  HotPathMetrics,
  TradingContext,
  defaultHotPathConfig,
  StaleBlockhashError,
  MissingAccountError,
  createHotPathExecutor,
} from '../hotpath';

// ===== Mocks =====

const mockConnection = {
  getLatestBlockhash: vi.fn(),
  getMultipleAccountsInfo: vi.fn(),
  getSignatureStatus: vi.fn(),
};

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => mockConnection),
  PublicKey: vi.fn((key: string) => ({ toBase58: () => key })),
  Keypair: vi.fn(),
}));

// ===== HotPathConfig Tests =====

describe('HotPathConfig', () => {
  it('should have default values', () => {
    const config = defaultHotPathConfig();
    expect(config.blockhashRefreshIntervalMs).toBe(2000);
    expect(config.cacheTtlMs).toBe(5000);
    expect(config.enablePrefetch).toBe(true);
  });

  it('should allow custom values', () => {
    const config: HotPathConfig = {
      blockhashRefreshIntervalMs: 1000,
      cacheTtlMs: 3000,
      enablePrefetch: false,
      prefetchTimeoutMs: 3000,
    };
    expect(config.blockhashRefreshIntervalMs).toBe(1000);
    expect(config.cacheTtlMs).toBe(3000);
    expect(config.enablePrefetch).toBe(false);
  });
});

// ===== HotPathState Tests =====

describe('HotPathState', () => {
  let state: HotPathState;
  const connection = new Connection('http://localhost');

  beforeEach(() => {
    vi.clearAllMocks();
    state = new HotPathState(connection, {
      enablePrefetch: false,
    });
  });

  afterEach(() => {
    state.stop();
  });

  it('should return null when no blockhash is cached', () => {
    const result = state.getBlockhash();
    expect(result).toBeNull();
  });

  it('should return blockhash when cached', async () => {
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create state with prefetch enabled
    const stateWithPrefetch = new HotPathState(connection, {
      enablePrefetch: true,
    });

    await stateWithPrefetch.start();

    // Wait for initial prefetch
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = stateWithPrefetch.getBlockhash();
    expect(result).not.toBeNull();
    expect(result?.blockhash).toBe('test_blockhash');

    stateWithPrefetch.stop();
  });

  it('should detect stale data', () => {
    // Data is not fresh when nothing has been fetched
    expect(state.isDataFresh()).toBe(false);
  });

  it('should prefetch accounts', async () => {
    mockConnection.getMultipleAccountsInfo.mockResolvedValueOnce([
      {
        data: Buffer.from('test_data'),
        lamports: 1000000n,
        owner: { toBase58: () => 'owner' },
        executable: false,
        rentEpoch: 0,
      },
    ]);

    await state.prefetchAccounts(['pubkey1']);

    const account = state.getAccount('pubkey1');
    expect(account).not.toBeNull();
    expect(account?.data.toString()).toBe('test_data');
  });

  it('should update and retrieve account state', () => {
    const accountState = {
      pubkey: 'test_pubkey',
      data: Buffer.from('test_data'),
      lamports: 1000000n,
      owner: 'owner',
      executable: false,
      rentEpoch: 0,
      slot: 100,
      fetchedAt: Date.now(),
    };

    state.updateAccount('test_pubkey', accountState);

    const retrieved = state.getAccount('test_pubkey');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.lamports).toBe(1000000n);
  });

  it('should return null for stale account', () => {
    const accountState = {
      pubkey: 'stale_pubkey',
      data: Buffer.from('data'),
      lamports: 0n,
      owner: '',
      executable: false,
      rentEpoch: 0,
      slot: 0,
      fetchedAt: Date.now() - 10000, // 10 seconds ago
    };

    state.updateAccount('stale_pubkey', accountState);

    const retrieved = state.getAccount('stale_pubkey');
    expect(retrieved).toBeNull();
  });

  it('should return metrics', () => {
    const metrics = state.getMetrics();
    expect(metrics).toHaveProperty('prefetchCount');
    expect(metrics).toHaveProperty('prefetchErrors');
    expect(metrics).toHaveProperty('accountsCached');
  });
});

// ===== TradingContext Tests =====

describe('TradingContext', () => {
  let state: HotPathState;
  const connection = new Connection('http://localhost');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    state?.stop();
  });

  it('should create context with cached blockhash', async () => {
    // Set up cached blockhash
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create state with prefetch enabled
    state = new HotPathState(connection, { enablePrefetch: true });
    await state.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new TradingContext(state, 'payer_pubkey');
    expect(context.blockhash).toBe('test_blockhash');
    expect(context.lastValidBlockHeight).toBe(100);
    expect(context.payer).toBe('payer_pubkey');
  });

  it('should throw error for stale blockhash', () => {
    // Create state without prefetch - no blockhash available
    const stateNoPrefetch = new HotPathState(connection, { enablePrefetch: false });
    expect(() => {
      new TradingContext(stateNoPrefetch, 'payer_pubkey');
    }).toThrow(StaleBlockhashError);
  });

  it('should add account to context', async () => {
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create state with prefetch enabled
    state = new HotPathState(connection, { enablePrefetch: true });
    await state.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new TradingContext(state, 'payer');

    // Add account to state
    state.updateAccount('token_account', {
      pubkey: 'token_account',
      data: Buffer.from('data'),
      lamports: 1000n,
      owner: 'owner',
      executable: false,
      rentEpoch: 0,
      slot: 0,
      fetchedAt: Date.now(),
    });

    const added = context.addAccount('token_account', state);
    expect(added).toBe(true);
    expect(context.accountStates.has('token_account')).toBe(true);
  });

  it('should calculate age correctly', async () => {
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create state with prefetch enabled
    state = new HotPathState(connection, { enablePrefetch: true });
    await state.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new TradingContext(state, 'payer');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(context.age()).toBeGreaterThanOrEqual(100);
  });

  it('should check validity', async () => {
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create state with prefetch enabled
    state = new HotPathState(connection, { enablePrefetch: true });
    await state.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new TradingContext(state, 'payer');

    expect(context.isValid(5000)).toBe(true);
  });
});

// ===== HotPathMetrics Tests =====

describe('HotPathMetrics', () => {
  let metrics: HotPathMetrics;

  beforeEach(() => {
    metrics = new HotPathMetrics();
  });

  it('should record successful trades', () => {
    metrics.record(true, 100);

    const stats = metrics.getStats();
    expect(stats.totalTrades).toBe(1);
    expect(stats.successTrades).toBe(1);
    expect(stats.failedTrades).toBe(0);
  });

  it('should record failed trades', () => {
    metrics.record(false, 50);

    const stats = metrics.getStats();
    expect(stats.totalTrades).toBe(1);
    expect(stats.failedTrades).toBe(1);
  });

  it('should calculate average latency', () => {
    metrics.record(true, 100);
    metrics.record(true, 200);

    const stats = metrics.getStats();
    expect(stats.avgLatencyMs).toBe(150);
  });

  it('should return zero average for no trades', () => {
    const stats = metrics.getStats();
    expect(stats.avgLatencyMs).toBe(0);
  });
});

// ===== HotPathExecutor Tests =====

describe('HotPathExecutor', () => {
  let executor: HotPathExecutor;
  const connection = new Connection('http://localhost');

  const mockSwqosClient = {
    getSwqosType: () => 'jito' as const,
    sendTransaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new HotPathExecutor(connection, {
      enablePrefetch: false,
    });
  });

  afterEach(() => {
    executor.stop();
  });

  it('should add SWQoS client', () => {
    executor.addSwqosClient(mockSwqosClient as any);
    expect(executor.getSwqosClient('jito')).toBeDefined();
  });

  it('should remove SWQoS client', () => {
    executor.addSwqosClient(mockSwqosClient as any);
    executor.removeSwqosClient('jito');
    expect(executor.getSwqosClient('jito')).toBeUndefined();
  });

  it('should check readiness', () => {
    expect(executor.isReady()).toBe(false); // No blockhash, no clients
  });

  it('should return metrics', () => {
    const metrics = executor.getMetrics();
    expect(metrics).toHaveProperty('totalTrades');
  });

  it('should fail execution with no clients', async () => {
    mockConnection.getLatestBlockhash.mockResolvedValueOnce({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    // Create executor with prefetch enabled to get blockhash
    const executorWithPrefetch = new HotPathExecutor(connection, {
      enablePrefetch: true,
    });
    await executorWithPrefetch.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await executorWithPrefetch.execute('buy' as any, Buffer.from('tx'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('No SWQoS clients');

    executorWithPrefetch.stop();
  });

  it('should fail execution with stale blockhash', async () => {
    executor.addSwqosClient(mockSwqosClient as any);

    const result = await executor.execute('buy' as any, Buffer.from('tx'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Stale blockhash');
  });
});

// ===== createHotPathExecutor Tests =====

describe('createHotPathExecutor', () => {
  it('should create executor with default config', () => {
    const connection = new Connection('http://localhost');
    const executor = createHotPathExecutor(connection);
    expect(executor).toBeDefined();
    expect(executor).toBeInstanceOf(HotPathExecutor);
  });

  it('should create executor with custom config', () => {
    const connection = new Connection('http://localhost');
    const executor = createHotPathExecutor(connection, [], {
      blockhashRefreshIntervalMs: 1000,
    });
    expect(executor).toBeDefined();
  });

  it('should create executor with SWQoS clients', () => {
    const connection = new Connection('http://localhost');
    const mockClient = {
      getSwqosType: () => 'jito' as const,
    };

    const executor = createHotPathExecutor(connection, [mockClient as any]);
    expect(executor.getSwqosClient('jito')).toBeDefined();
  });
});

// ===== Error Tests =====

describe('Errors', () => {
  it('should create StaleBlockhashError', () => {
    const error = new StaleBlockhashError('test message');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StaleBlockhashError');
    expect(error.message).toBe('test message');
  });

  it('should create MissingAccountError', () => {
    const error = new MissingAccountError('account not found');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MissingAccountError');
  });
});

// ===== Concurrent Access Tests =====

describe('Concurrent Access', () => {
  it('should handle concurrent account updates', async () => {
    const connection = new Connection('http://localhost');
    const state = new HotPathState(connection, { enablePrefetch: false });

    const promises = Array.from({ length: 100 }, (_, i) => {
      return Promise.resolve().then(() => {
        state.updateAccount(`pubkey_${i}`, {
          pubkey: `pubkey_${i}`,
          data: Buffer.from(`data_${i}`),
          lamports: BigInt(i),
          owner: 'owner',
          executable: false,
          rentEpoch: 0,
          slot: 0,
          fetchedAt: Date.now(),
        });
      });
    });

    await Promise.all(promises);

    const metrics = state.getMetrics();
    expect(metrics.accountsCached).toBe(100);
  });

  it('should handle concurrent context creation', async () => {
    const connection = new Connection('http://localhost');
    const state = new HotPathState(connection, { enablePrefetch: true });

    mockConnection.getLatestBlockhash.mockResolvedValue({
      blockhash: 'test_blockhash',
      lastValidBlockHeight: 100,
    });

    await state.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const promises = Array.from({ length: 10 }, () => {
      return new TradingContext(state, 'payer');
    });

    expect(promises.length).toBe(10);
    for (const ctx of promises) {
      expect(ctx.blockhash).toBe('test_blockhash');
    }
  });
});
