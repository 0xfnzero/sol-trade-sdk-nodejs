/**
 * Hot Path Executor for Sol Trade SDK
 *
 * Executes trades with ZERO RPC calls in the hot path.
 * All data must be prefetched before execution.
 *
 * Key principle: Prepare everything, then execute with minimal latency.
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  HotPathState,
  HotPathConfig,
  TradingContext,
  StaleBlockhashError,
  defaultHotPathConfig,
} from './state';
import { SwqosClient } from '../swqos/clients';
import { SwqosType, TradeType } from '../index';

// ===== Types =====

export interface ExecuteOptions {
  parallelSubmit: boolean;
  timeoutMs: number;
  skipBlockhashValidation: boolean;
  maxRetries: number;
}

export function defaultExecuteOptions(): ExecuteOptions {
  return {
    parallelSubmit: true,
    timeoutMs: 10000,
    skipBlockhashValidation: false,
    maxRetries: 3,
  };
}

export interface ExecuteResult {
  signature: string;
  success: boolean;
  error?: string;
  latencyMs: number;
  swqosType?: SwqosType;
  blockhashUsed: string;
}

export interface GasFeeConfig {
  computeUnitLimit: number;
  computeUnitPrice: number;
}

// ===== Metrics =====

export class HotPathMetrics {
  private totalTrades = 0;
  private successTrades = 0;
  private failedTrades = 0;
  private totalLatencyMs = 0;

  record(success: boolean, latencyMs: number): void {
    this.totalTrades++;
    if (success) {
      this.successTrades++;
    } else {
      this.failedTrades++;
    }
    this.totalLatencyMs += latencyMs;
  }

  getStats(): {
    totalTrades: number;
    successTrades: number;
    failedTrades: number;
    avgLatencyMs: number;
  } {
    return {
      totalTrades: this.totalTrades,
      successTrades: this.successTrades,
      failedTrades: this.failedTrades,
      avgLatencyMs: this.totalTrades > 0 ? this.totalLatencyMs / this.totalTrades : 0,
    };
  }
}

// ===== Hot Path Executor =====

/**
 * Executes trades with ZERO RPC calls in the hot path.
 *
 * Usage:
 *   1. Create executor with RPC connection
 *   2. Call start() to begin background prefetching
 *   3. Prefetch required accounts/pools BEFORE trading
 *   4. Build transaction with prefetched blockhash
 *   5. Execute - no RPC calls during this phase
 */
export class HotPathExecutor {
  private state: HotPathState;
  private config: HotPathConfig;
  private connection: Connection;

  // SWQoS clients for transaction submission
  private swqosClients: Map<SwqosType, SwqosClient> = new Map();

  // Metrics
  private metrics = new HotPathMetrics();

  constructor(connection: Connection, config?: Partial<HotPathConfig>) {
    this.config = { ...defaultHotPathConfig(), ...config };
    this.connection = connection;
    this.state = new HotPathState(connection, config);
  }

  /**
   * Add a SWQoS client for transaction submission
   */
  addSwqosClient(client: SwqosClient): void {
    this.swqosClients.set(client.getSwqosType(), client);
  }

  /**
   * Remove a SWQoS client
   */
  removeSwqosClient(swqosType: SwqosType): void {
    this.swqosClients.delete(swqosType);
  }

  /**
   * Get SWQoS client by type
   */
  getSwqosClient(swqosType: SwqosType): SwqosClient | undefined {
    return this.swqosClients.get(swqosType);
  }

  /**
   * Start background prefetching
   */
  async start(): Promise<void> {
    await this.state.start();
  }

  /**
   * Stop background prefetching
   */
  stop(): void {
    this.state.stop();
  }

  /**
   * Get hot path state for external access
   */
  getState(): HotPathState {
    return this.state;
  }

  /**
   * Check if executor is ready for hot path execution
   */
  isReady(): boolean {
    return this.state.isDataFresh() && this.swqosClients.size > 0;
  }

  /**
   * Wait until executor is ready
   */
  async waitForReady(
    checkIntervalMs: number = 100,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (this.isReady()) {
        return true;
      }
      await this.sleep(checkIntervalMs);
    }
    return false;
  }

  /**
   * Prefetch accounts - call BEFORE hot path execution
   */
  async prefetchAccounts(pubkeys: string[]): Promise<void> {
    await this.state.prefetchAccounts(pubkeys);
  }

  /**
   * Create trading context with prefetched data - NO RPC
   */
  createTradingContext(payer: string): TradingContext {
    return new TradingContext(this.state, payer);
  }

  /**
   * Execute a pre-signed transaction - NO RPC CALLS
   *
   * Transaction must already be signed with valid blockhash.
   * All state should be prefetched before calling this.
   */
  async execute(
    tradeType: TradeType,
    transactionBytes: Buffer,
    opts: ExecuteOptions = defaultExecuteOptions()
  ): Promise<ExecuteResult> {
    const startTime = Date.now();

    // Validate blockhash is fresh (no RPC, just check cache age)
    if (!opts.skipBlockhashValidation && !this.state.isDataFresh()) {
      return {
        signature: '',
        success: false,
        error: 'Stale blockhash - prefetch required',
        latencyMs: 0,
        blockhashUsed: '',
      };
    }

    // Get current blockhash for tracking
    const blockhashData = this.state.getBlockhash();
    const blockhashUsed = blockhashData?.blockhash || '';

    // Get clients
    const clients = Array.from(this.swqosClients.values());
    if (clients.length === 0) {
      return {
        signature: '',
        success: false,
        error: 'No SWQoS clients configured',
        latencyMs: 0,
        blockhashUsed,
      };
    }

    // Submit transaction
    let result: ExecuteResult;
    if (opts.parallelSubmit && clients.length > 1) {
      result = await this.executeParallel(tradeType, transactionBytes, clients, opts);
    } else {
      result = await this.executeSequential(tradeType, transactionBytes, clients, opts);
    }

    result.latencyMs = Date.now() - startTime;
    result.blockhashUsed = blockhashUsed;

    // Update metrics
    this.metrics.record(result.success, result.latencyMs);

    return result;
  }

  /**
   * Submit to all SWQoS clients in parallel - NO RPC
   */
  private async executeParallel(
    tradeType: TradeType,
    txBytes: Buffer,
    clients: SwqosClient[],
    opts: ExecuteOptions
  ): Promise<ExecuteResult> {
    const submitToClient = async (client: SwqosClient): Promise<ExecuteResult> => {
      try {
        const signature = await Promise.race([
          client.sendTransaction(tradeType, txBytes, false),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), opts.timeoutMs)
          ),
        ]);
        return {
          signature,
          success: true,
          swqosType: client.getSwqosType(),
          latencyMs: 0,
          blockhashUsed: '',
        };
      } catch (error) {
        return {
          signature: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          swqosType: client.getSwqosType(),
          latencyMs: 0,
          blockhashUsed: '',
        };
      }
    };

    // Race all submissions - first success wins
    const promises = clients.map(submitToClient);

    try {
      // Use Promise.any for first-success-wins
      const result = await Promise.any(promises);
      return result;
    } catch {
      // All failed - aggregate errors
      const results = await Promise.allSettled(promises);
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason);
      return {
        signature: '',
        success: false,
        error: `All parallel submissions failed: ${errors.join(', ')}`,
        latencyMs: 0,
        blockhashUsed: '',
      };
    }
  }

  /**
   * Submit to SWQoS clients sequentially - NO RPC
   */
  private async executeSequential(
    tradeType: TradeType,
    txBytes: Buffer,
    clients: SwqosClient[],
    opts: ExecuteOptions
  ): Promise<ExecuteResult> {
    let lastError = 'No clients available';

    for (let retry = 0; retry < opts.maxRetries; retry++) {
      for (const client of clients) {
        try {
          const signature = await Promise.race([
            client.sendTransaction(tradeType, txBytes, false),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), opts.timeoutMs)
            ),
          ]);
          return {
            signature,
            success: true,
            swqosType: client.getSwqosType(),
            latencyMs: 0,
            blockhashUsed: '',
          };
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    }

    return {
      signature: '',
      success: false,
      error: `All sequential submissions failed after ${opts.maxRetries} retries: ${lastError}`,
      latencyMs: 0,
      blockhashUsed: '',
    };
  }

  /**
   * Execute multiple transactions in parallel
   */
  async executeMultiple(
    tradeType: TradeType,
    transactions: Buffer[],
    opts: ExecuteOptions = defaultExecuteOptions()
  ): Promise<ExecuteResult[]> {
    return Promise.all((transactions).map((tx) => this.execute(tradeType, tx, opts)));
  }

  /**
   * Get cached blockhash - NO RPC CALL
   * Use this to build transactions before execution
   */
  getBlockhash(): { blockhash: string; lastValidBlockHeight: number } | null {
    return this.state.getBlockhash();
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ReturnType<HotPathMetrics['getStats']> {
    return this.metrics.getStats();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===== Transaction Builder Helper =====

/**
 * Builds transactions using prefetched data - NO RPC CALLS
 *
 * Use this to construct transactions before hot path execution.
 */
export class TransactionBuilder {
  constructor(private executor: HotPathExecutor) {}

  /**
   * Build a transaction using prefetched blockhash - NO RPC
   */
  async buildTransaction(
    payer: PublicKey,
    instructions: TransactionInstruction[],
    signers: any[], // Keypair[]
    gasConfig?: GasFeeConfig
  ): Promise<Transaction | null> {
    // Get blockhash from cache
    const blockhashData = this.executor.getBlockhash();
    if (!blockhashData) {
      throw new StaleBlockhashError('Stale blockhash - prefetch required');
    }

    // Build transaction
    const tx = new Transaction();

    // Add compute budget instructions if gas config provided
    if (gasConfig) {
      // Add compute budget instructions
      // These would use the compute budget program
    }

    // Add main instructions
    tx.add(...instructions);

    // Set blockhash and payer
    tx.recentBlockhash = blockhashData.blockhash;
    tx.feePayer = payer;

    // Sign transaction
    tx.sign(...signers);

    return tx;
  }
}

// ===== Convenience Factory =====

/**
 * Create a hot path executor with default configuration.
 *
 * Usage:
 *   const executor = createHotPathExecutor(
 *     connection,
 *     [jitoClient, bloxrouteClient]
 *   );
 *   await executor.start();
 *
 *   // Prefetch required data
 *   await executor.prefetchAccounts([tokenAccountPubkey]);
 *
 *   // Now ready for hot path execution
 *   const result = await executor.execute('buy', txBytes);
 */
export function createHotPathExecutor(
  connection: Connection,
  swqosClients?: SwqosClient[],
  config?: Partial<HotPathConfig>
): HotPathExecutor {
  const executor = new HotPathExecutor(connection, config);

  if (swqosClients) {
    for (const client of swqosClients) {
      executor.addSwqosClient(client);
    }
  }

  return executor;
}
