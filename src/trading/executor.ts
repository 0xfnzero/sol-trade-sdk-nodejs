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
  SwqosType,
  TradeType,
  TradeError,
  GasFeeStrategy,
} from '../index';
import {
  SwqosClient,
  ClientFactory,
  SwqosClientConfig,
} from '../swqos/clients';
import { GasFeeStrategyType } from '../common/gas-fee-strategy';

// ===== Types =====

export interface TradeResult {
  signature: string;
  success: boolean;
  error?: string;
  confirmationTimeMs?: number;
}

export interface ExecuteOptions {
  waitConfirmation: boolean;
  maxRetries: number;
  retryDelayMs: number;
  parallelSubmit: boolean;
}

export function defaultExecuteOptions(): ExecuteOptions {
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
    this.connection = new Connection(config.rpcUrl, 'confirmed');
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
    opts: ExecuteOptions = defaultExecuteOptions()
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
    opts: ExecuteOptions
  ): Promise<TradeResult> {
    const promises: Promise<TradeResult>[] = [];

    for (const client of this.clients.values()) {
      promises.push(this.submitToClient(client, tradeType, transaction, opts));
    }

    // Race all submissions - first successful wins
    try {
      const results = await Promise.allSettled(promises);
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          return result.value;
        }
      }
      // All failed
      const lastError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      return {
        signature: '',
        success: false,
        error: lastError?.reason?.toString() || 'All parallel submissions failed',
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
    opts: ExecuteOptions
  ): Promise<TradeResult> {
    for (let retry = 0; retry < opts.maxRetries; retry++) {
      for (const client of this.clients.values()) {
        const result = await this.submitToClient(client, tradeType, transaction, opts);
        if (result.success) {
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
    opts: ExecuteOptions
  ): Promise<TradeResult> {
    const startTime = Date.now();

    try {
      const signature = await client.sendTransaction(
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
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        confirmationTimeMs: Date.now() - startTime,
      };
    }
  }

  private async waitForConfirmation(signature: string): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = this.confirmationTimeout;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        if (status.value) {
          if (status.value.confirmationStatus === 'finalized') {
            return true;
          }
          if (status.value.err) {
            return false;
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
    opts: ExecuteOptions = defaultExecuteOptions()
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
  private lastSubmit: number = 0;

  constructor(private minDelayMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastSubmit;
    
    if (elapsed < this.minDelayMs) {
      await this.sleep(this.minDelayMs - elapsed);
    }
    
    this.lastSubmit = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
