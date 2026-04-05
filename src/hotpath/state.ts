/**
 * Hot Path State Management for Sol Trade SDK
 *
 * Manages prefetched blockchain state for zero-latency trading execution.
 * NO RPC calls are made during trading - all data is prefetched.
 *
 * Key principle: Prepare everything before the trade, execute with minimal latency.
 */

import { Connection, PublicKey } from '@solana/web3.js';

// ===== Types =====

export interface HotPathConfig {
  blockhashRefreshIntervalMs: number;
  cacheTtlMs: number;
  enablePrefetch: boolean;
  prefetchTimeoutMs: number;
}

export function defaultHotPathConfig(): HotPathConfig {
  return {
    blockhashRefreshIntervalMs: 2000,
    cacheTtlMs: 5000,
    enablePrefetch: true,
    prefetchTimeoutMs: 5000,
  };
}

export interface PrefetchedData {
  blockhash: string;
  lastValidBlockHeight: number;
  slot: number;
  fetchedAt: number; // timestamp
}

export interface AccountState {
  pubkey: string;
  data: Buffer;
  lamports: bigint;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  slot: number;
  fetchedAt: number;
}

export interface PoolState {
  poolAddress: string;
  poolType: 'pumpfun' | 'pumpswap' | 'raydium' | 'meteora';
  mintA: string;
  mintB: string;
  vaultA: string;
  vaultB: string;
  reserveA: bigint;
  reserveB: bigint;
  feeRate: number;
  fetchedAt: number;
  rawData?: Buffer;
}

// ===== Helper Functions =====

function isDataFresh(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt <= ttlMs;
}

// ===== Hot Path State =====

export class HotPathState {
  private config: HotPathConfig;
  private connection: Connection;

  // Prefetched data
  private currentData: PrefetchedData | null = null;
  private accounts: Map<string, AccountState> = new Map();
  private pools: Map<string, PoolState> = new Map();

  // Background prefetch control
  private prefetchTimer?: ReturnType<typeof setInterval>;
  private isRunning: boolean = false;

  // Callbacks
  private onBlockhashUpdateCallback?: (
    blockhash: string,
    lastValidBlockHeight: number
  ) => void;

  // Metrics
  private metrics = {
    prefetchCount: 0,
    prefetchErrors: 0,
    lastPrefetchTime: 0,
  };

  constructor(connection: Connection, config?: Partial<HotPathConfig>) {
    this.config = { ...defaultHotPathConfig(), ...config };
    this.connection = connection;
  }

  /**
   * Start background prefetching
   * Call this BEFORE any hot path execution
   */
  async start(): Promise<void> {
    if (!this.config.enablePrefetch) {
      return;
    }

    // Initial synchronous prefetch
    await this.prefetchBlockhash();

    // Start background loop
    this.isRunning = true;
    this.prefetchTimer = setInterval(
      () => this.prefetchBlockhash().catch(() => {}),
      this.config.blockhashRefreshIntervalMs
    );
  }

  /**
   * Stop background prefetching
   */
  stop(): void {
    this.isRunning = false;
    if (this.prefetchTimer) {
      clearInterval(this.prefetchTimer);
      this.prefetchTimer = undefined;
    }
  }

  /**
   * Check if prefetching is active
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Prefetch latest blockhash - RPC call happens here (background only)
   */
  private async prefetchBlockhash(): Promise<void> {
    try {
      const result = await Promise.race([
        this.connection.getLatestBlockhash('processed'),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout')),
            this.config.prefetchTimeoutMs
          )
        ),
      ]);

      this.currentData = {
        blockhash: result.blockhash,
        lastValidBlockHeight: result.lastValidBlockHeight,
        slot: 0, // Not directly available
        fetchedAt: Date.now(),
      };

      this.metrics.prefetchCount++;
      this.metrics.lastPrefetchTime = Date.now();

      if (this.onBlockhashUpdateCallback) {
        this.onBlockhashUpdateCallback(
          this.currentData.blockhash,
          this.currentData.lastValidBlockHeight
        );
      }
    } catch (error) {
      this.metrics.prefetchErrors++;
      throw error;
    }
  }

  /**
   * Get current cached blockhash - NO RPC CALL
   */
  getBlockhash(): { blockhash: string; lastValidBlockHeight: number } | null {
    if (
      !this.currentData ||
      !isDataFresh(this.currentData.fetchedAt, this.config.cacheTtlMs)
    ) {
      return null;
    }
    return {
      blockhash: this.currentData.blockhash,
      lastValidBlockHeight: this.currentData.lastValidBlockHeight,
    };
  }

  /**
   * Check if prefetched data is still valid
   */
  isDataFresh(): boolean {
    return (
      this.currentData !== null &&
      isDataFresh(this.currentData.fetchedAt, this.config.cacheTtlMs)
    );
  }

  /**
   * Get all prefetched data
   */
  getPrefetchedData(): PrefetchedData | null {
    return this.currentData;
  }

  /**
   * Set callback for blockhash updates
   */
  onBlockhashUpdate(
    callback: (blockhash: string, lastValidBlockHeight: number) => void
  ): void {
    this.onBlockhashUpdateCallback = callback;
  }

  // ===== Account State Management =====

  /**
   * Update account state in cache
   */
  updateAccount(pubkey: string, state: AccountState): void {
    this.accounts.set(pubkey, state);
  }

  /**
   * Get account state from cache - NO RPC CALL
   */
  getAccount(pubkey: string): AccountState | null {
    const state = this.accounts.get(pubkey);
    if (state && isDataFresh(state.fetchedAt, this.config.cacheTtlMs)) {
      return state;
    }
    return null;
  }

  /**
   * Get multiple account states - NO RPC CALL
   */
  getAccounts(pubkeys: string[]): Map<string, AccountState> {
    const result = new Map<string, AccountState>();
    for (const pubkey of pubkeys) {
      const state = this.getAccount(pubkey);
      if (state) {
        result.set(pubkey, state);
      }
    }
    return result;
  }

  /**
   * Prefetch accounts - RPC call happens here (before trading)
   * Call this BEFORE entering the hot path
   */
  async prefetchAccounts(pubkeys: string[]): Promise<void> {
    if (pubkeys.length === 0) return;

    try {
      const keys = pubkeys.map((p) => new PublicKey(p));
      const result = await Promise.race([
        this.connection.getMultipleAccountsInfo(keys, 'processed'),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout')),
            this.config.prefetchTimeoutMs
          )
        ),
      ]);

      for (let i = 0; i < pubkeys.length; i++) {
        const account = result[i];
        if (account) {
          this.updateAccount(pubkeys[i], {
            pubkey: pubkeys[i],
            data: account.data,
            lamports: account.lamports,
            owner: account.owner.toBase58(),
            executable: account.executable,
            rentEpoch: account.rentEpoch,
            slot: 0,
            fetchedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      this.metrics.prefetchErrors++;
      throw error;
    }
  }

  // ===== Pool State Management =====

  /**
   * Update pool state in cache
   */
  updatePool(poolAddress: string, state: PoolState): void {
    this.pools.set(poolAddress, state);
  }

  /**
   * Get pool state from cache - NO RPC CALL
   */
  getPool(poolAddress: string): PoolState | null {
    const state = this.pools.get(poolAddress);
    if (state && isDataFresh(state.fetchedAt, this.config.cacheTtlMs)) {
      return state;
    }
    return null;
  }

  // ===== Metrics =====

  getMetrics(): {
    prefetchCount: number;
    prefetchErrors: number;
    lastPrefetchTime: number;
    accountsCached: number;
    poolsCached: number;
    dataFresh: boolean;
  } {
    return {
      ...this.metrics,
      accountsCached: this.accounts.size,
      poolsCached: this.pools.size,
      dataFresh: this.isDataFresh(),
    };
  }
}

// ===== Trading Context =====

/**
 * Trading context with all prefetched data needed for a trade.
 * Created BEFORE hot path execution, contains all necessary state.
 * NO RPC calls during trade execution.
 */
export class TradingContext {
  public readonly payer: string;
  public readonly blockhash: string;
  public readonly lastValidBlockHeight: number;
  public readonly createdAt: number;

  public readonly accountStates: Map<string, AccountState> = new Map();
  public readonly poolStates: Map<string, PoolState> = new Map();

  constructor(hotPathState: HotPathState, payer: string) {
    this.payer = payer;
    this.createdAt = Date.now();

    const blockhashData = hotPathState.getBlockhash();
    if (!blockhashData) {
      throw new StaleBlockhashError('Stale or missing blockhash - prefetch required');
    }

    this.blockhash = blockhashData.blockhash;
    this.lastValidBlockHeight = blockhashData.lastValidBlockHeight;
  }

  /**
   * Add account state from cache
   */
  addAccount(pubkey: string, hotPathState: HotPathState): boolean {
    const state = hotPathState.getAccount(pubkey);
    if (state) {
      this.accountStates.set(pubkey, state);
      return true;
    }
    return false;
  }

  /**
   * Add pool state from cache
   */
  addPool(poolAddress: string, hotPathState: HotPathState): boolean {
    const state = hotPathState.getPool(poolAddress);
    if (state) {
      this.poolStates.set(poolAddress, state);
      return true;
    }
    return false;
  }

  /**
   * Get age of context in milliseconds
   */
  age(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Check if context is still valid
   */
  isValid(maxAgeMs: number = 5000): boolean {
    return this.age() <= maxAgeMs;
  }

  /**
   * Get token account data from context
   */
  getTokenAccountData(pubkey: string): Buffer | undefined {
    return this.accountStates.get(pubkey)?.data;
  }
}

// ===== Errors =====

export class HotPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HotPathError';
  }
}

export class StaleBlockhashError extends HotPathError {
  constructor(message: string = 'Blockhash is stale or not available') {
    super(message);
    this.name = 'StaleBlockhashError';
  }
}

export class MissingAccountError extends HotPathError {
  constructor(message: string = 'Required account not in cache') {
    super(message);
    this.name = 'MissingAccountError';
  }
}

export class ContextExpiredError extends HotPathError {
  constructor(message: string = 'Trading context has expired') {
    super(message);
    this.name = 'ContextExpiredError';
  }
}
