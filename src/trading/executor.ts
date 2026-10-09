import { performance } from "node:perf_hooks";
/**
 * Trade Executor for Sol Trade SDK
 * Implements core trading execution with parallel SWQOS submissions.
 */

import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Keypair,
  BlockhashWithExpiryBlockHeight,
  Commitment,
} from '@solana/web3.js';
import {
  SwqosClient,
  ClientFactory,
  SwqosClientConfig,
} from '../swqos/clients';
import {
  GasFeeStrategy,
  GasFeeStrategyType,
  SwqosType,
  TradeType,
} from '../common/gas-fee-strategy';

// ===== Types =====

export interface TradeResult {
  signature: string;
  success: boolean;
  error?: string;
  confirmationTimeMs?: number;
}

export interface ExecutorOptions {
  waitConfirmation: boolean;
  maxRetries: number;
  retryDelayMs: number;
  parallelSubmit: boolean;
}

export function defaultExecutorOptions(): ExecutorOptions {
  return {
    waitConfirmation: true,
    maxRetries: 3,
    retryDelayMs: 100,
    parallelSubmit: true,
  };
}

export interface TradeConfig {
  rpcUrl: string;
  swqosConfigs: SwqosClientConfig[];
  gasFeeStrategy?: GasFeeStrategy;
  confirmationTimeoutMs?: number;
  confirmationRetryCount?: number;
  /** RPC commitment for `Connection` (default `confirmed`); align with main `TradeConfig`. */
  commitment?: Commitment;
}

export interface BuildTransactionOptions {
  payer: PublicKey;
  recentBlockhash: string;
  instructions: TransactionInstruction[];
  signers: Keypair[];
  gasConfig?: GasFeeConfig;
}

export interface GasFeeConfig {
  computeUnitLimit: number;
  computeUnitPrice: number;
  priorityFee: number;
}

// ===== Trade Executor =====

export class TradeExecutor {
  private clients: Map<SwqosType, SwqosClient> = new Map();
  private connection: Connection;
  private gasStrategy?: GasFeeStrategy;
  private confirmationTimeout: number;
  private confirmationRetry: number;

  constructor(private config: TradeConfig) {
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment ?? 'confirmed',
    });
    this.gasStrategy = config.gasFeeStrategy;
    this.confirmationTimeout = config.confirmationTimeoutMs || 30000;
    this.confirmationRetry = config.confirmationRetryCount || 30;
    this.initializeClients();
  }

  private initializeClients(): void {
    for (const swqosConfig of this.config.swqosConfigs) {
      const client = ClientFactory.createClient(swqosConfig, this.config.rpcUrl);
      this.clients.set(swqosConfig.type, client);
    }
  }

  addClient(config: SwqosClientConfig): void {
    const client = ClientFactory.createClient(config, this.config.rpcUrl);
    this.clients.set(config.type, client);
  }

  removeClient(swqosType: SwqosType): void {
    this.clients.delete(swqosType);
  }

  getClient(swqosType: SwqosType): SwqosClient | undefined {
    return this.clients.get(swqosType);
  }

  async execute(
    tradeType: TradeType,
    transaction: Buffer,
    opts: ExecutorOptions = defaultExecutorOptions()
  ): Promise<TradeResult> {
    if (this.clients.size === 0) {
      return {
        signature: '',
        success: false,
        error: 'No SWQOS clients configured',
      };
    }

    if (opts.parallelSubmit) {
      return this.executeParallel(tradeType, transaction, opts);
    }
    return this.executeSequential(tradeType, transaction, opts);
  }

  private async executeParallel(
    tradeType: TradeType,
    transaction: Buffer,
    opts: ExecutorOptions
  ): Promise<TradeResult> {
    const promises: Promise<TradeResult>[] = [];

    for (const client of this.clients.values()) {
      promises.push(this.submitToClient(client, tradeType, transaction, opts));
    }

    // Race all submissions - first successful wins
    try {
      const pending = new Map(promises.map((promise, index) => [
        index, promise.then(result => ({ index, result })),
      ]));
      const failures: string[] = [];
      let acknowledged: TradeResult | undefined;
      while (pending.size) {
        const { index, result } = await Promise.race(pending.values());
        pending.delete(index);
        if (result.success) return result;
        if (result.signature) acknowledged ??= result;
        if (result.error) failures.push(result.error);
      }
      if (acknowledged) return acknowledged;
      return {
        signature: '',
        success: false,
        error: failures.length ? `All parallel submissions failed: ${failures.join('; ')}` : 'All parallel submissions failed',
      };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async executeSequential(
    tradeType: TradeType,
    transaction: Buffer,
    opts: ExecutorOptions
  ): Promise<TradeResult> {
    const clients = [...this.clients.values()];
    for (let retry = 0; retry < opts.maxRetries; retry++) {
      for (const client of clients) {
        const result = await this.submitToClient(client, tradeType, transaction, opts);
        if (result.success || result.signature) {
          return result;
        }
      }

      if (retry < opts.maxRetries - 1) {
        await this.sleep(opts.retryDelayMs);
      }
    }

    return {
      signature: '',
      success: false,
      error: `All sequential submissions failed after ${opts.maxRetries} retries`,
    };
  }

  private async submitToClient(
    client: SwqosClient,
    tradeType: TradeType,
    transaction: Buffer,
    opts: ExecutorOptions
  ): Promise<TradeResult> {
    const startTime = Date.now();
    let signature = '';
    try {
      signature = await client.sendTransaction(
        tradeType,
        transaction,
        false
      );

      const result: TradeResult = {
        signature,
        success: true,
        confirmationTimeMs: Date.now() - startTime,
      };

      if (opts.waitConfirmation) {
        const confirmed = await this.waitForConfirmation(signature);
        result.confirmationTimeMs = Date.now() - startTime;
        if (!confirmed) {
          result.success = false;
          result.error = 'Transaction failed to confirm';
        }
      }

      return result;
    } catch (error) {
      return {
        signature,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        confirmationTimeMs: Date.now() - startTime,
      };
    }
  }

  /** Rust `poll_any_transaction_confirmation`: success when err is none and status is confirmed or finalized. */
  private async waitForConfirmation(signature: string): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = this.confirmationTimeout;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        if (status.value) {
          if (status.value.err) {
            return false;
          }
          const cs = status.value.confirmationStatus;
          if (cs === 'confirmed' || cs === 'finalized') {
            return true;
          }
        }
      } catch {
        // Continue polling on error
      }

      await this.sleep(1000);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeMultiple(
    tradeType: TradeType,
    transactions: Buffer[],
    opts: ExecutorOptions = defaultExecutorOptions()
  ): Promise<TradeResult[]> {
    return Promise.all(
      transactions.map(tx => this.execute(tradeType, tx, opts))
    );
  }

  // ===== Gas Fee Management =====

  getGasConfig(
    swqosType: SwqosType,
    tradeType: TradeType,
    strategyType: GasFeeStrategyType
  ): GasFeeConfig {
    if (!this.gasStrategy) {
      return {
        computeUnitLimit: 200000,
        computeUnitPrice: 100000,
        priorityFee: 100000,
      };
    }

    const value = this.gasStrategy.get(swqosType, tradeType, strategyType);
    if (!value) {
      return {
        computeUnitLimit: 200000,
        computeUnitPrice: 100000,
        priorityFee: 100000,
      };
    }

    return {
      computeUnitLimit: value.cuLimit,
      computeUnitPrice: value.cuPrice,
      priorityFee: Math.floor(value.tip * 1_000_000_000), // Convert SOL to lamports
    };
  }

  // ===== Utility Methods =====

  async getLatestBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    return this.connection.getLatestBlockhash();
  }

  getConnection(): Connection {
    return this.connection;
  }
}

// ===== Rate Limiter =====

export class RateLimiter {
  private lastSubmit = Number.NEGATIVE_INFINITY;
  private tail: Promise<void> = Promise.resolve();

  constructor(private minDelayMs: number) {
    if (!Number.isFinite(minDelayMs) || minDelayMs < 0) {
      throw new RangeError('minDelayMs must be finite and nonnegative');
    }
  }

  wait(): Promise<void> {
    // Reserve a place synchronously. Measuring after the previous release also
    // preserves spacing when delayed timers wake in the same event-loop turn.
    const ready = this.tail.then(async () => {
      let remaining = this.minDelayMs - (performance.now() - this.lastSubmit);
      while (remaining > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, Math.ceil(remaining)));
        remaining = this.minDelayMs - (performance.now() - this.lastSubmit);
      }
      this.lastSubmit = performance.now();
    });
    this.tail = ready.catch(() => {});
    return ready;
  }
}

// ===== Metrics Collector =====

export class MetricsCollector {
  private totalTrades: number = 0;
  private successTrades: number = 0;
  private failedTrades: number = 0;
  private totalLatency: number = 0;

  recordTrade(success: boolean, latencyMs: number): void {
    this.totalTrades++;
    if (success) {
      this.successTrades++;
    } else {
      this.failedTrades++;
    }
    this.totalLatency += latencyMs;
  }

  getStats(): { total: number; success: number; failed: number; avgLatencyMs: number } {
    return {
      total: this.totalTrades,
      success: this.successTrades,
      failed: this.failedTrades,
      avgLatencyMs: this.totalTrades > 0 ? this.totalLatency / this.totalTrades : 0,
    };
  }
}

// ===== Convenience Functions =====

export function createTradeExecutor(
  rpcUrl: string,
  swqosTypes: SwqosType[],
  apiKeys?: Map<SwqosType, string>
): TradeExecutor {
  const swqosConfigs: SwqosClientConfig[] = swqosTypes.map(type => ({
    type,
    apiKey: apiKeys?.get(type),
  }));

  return new TradeExecutor({
    rpcUrl,
    swqosConfigs,
  });
}
