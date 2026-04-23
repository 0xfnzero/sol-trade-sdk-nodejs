/**
 * Async Trade Executor for Sol Trade SDK
 * Implements asynchronous trade execution with configurable submission modes.
 */

import { Connection, Transaction, Commitment } from '@solana/web3.js';
import { TradeError, SwqosType, TradeType } from '../../index';
import { SwqosClient } from '../../swqos/clients';

// ===== Types =====

/**
 * Submission mode for transaction execution
 */
export enum SubmitMode {
  /** Submit to single fastest provider */
  Single = 'Single',
  /** Submit to multiple providers in parallel */
  Parallel = 'Parallel',
  /** Submit with fallback providers */
  Fallback = 'Fallback',
  /** Submit with redundancy for high availability */
  Redundant = 'Redundant',
}

/**
 * Execution status for tracking transaction state
 */
export enum ExecutionStatus {
  /** Initial pending state */
  Pending = 'Pending',
  /** Transaction submitted to provider */
  Submitted = 'Submitted',
  /** Transaction confirmed on chain */
  Confirmed = 'Confirmed',
  /** Transaction finalized */
  Finalized = 'Finalized',
  /** Transaction failed */
  Failed = 'Failed',
  /** Transaction timed out */
  TimedOut = 'TimedOut',
  /** Transaction cancelled */
  Cancelled = 'Cancelled',
}

/**
 * Configuration for async trade execution
 */
export interface ExecutionConfig {
  /** Submission mode */
  submitMode: SubmitMode;
  /** Whether to wait for confirmation */
  waitConfirmation: boolean;
  /**
   * Commitment level for confirmation polling.
   * `finalized` waits for finalized only; any other value follows Rust
   * `poll_any_transaction_confirmation` (confirmed or finalized, not processed-only).
   */
  commitment: Commitment;
  /** Maximum number of retries */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Timeout for execution in milliseconds */
  timeoutMs: number;
  /** Whether to abort on first success */
  abortOnSuccess: boolean;
  /** Priority providers to use (empty = all) */
  priorityProviders: SwqosType[];
  /** Callback for status updates */
  onStatusUpdate?: (status: ExecutionStatus, result?: ExecutionResult) => void;
  /** Callback for progress updates */
  onProgress?: (progress: ExecutionProgress) => void;
}

/**
 * Execution progress information
 */
export interface ExecutionProgress {
  /** Current attempt number */
  attempt: number;
  /** Total attempts allowed */
  totalAttempts: number;
  /** Current provider being used */
  currentProvider?: SwqosType;
  /** Number of providers tried */
  providersTried: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated time remaining in milliseconds */
  estimatedRemainingMs?: number;
}

/**
 * Result of trade execution
 */
export interface ExecutionResult {
  /** Transaction signature */
  signature: string;
  /** Execution success status */
  success: boolean;
  /** Final execution status */
  status: ExecutionStatus;
  /** Error message if failed */
  error?: string;
  /** Provider that succeeded (if any) */
  provider?: SwqosType;
  /** Number of attempts made */
  attempts: number;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Time to confirmation in milliseconds */
  confirmationTimeMs?: number;
  /** Slot when transaction was confirmed */
  slot?: number;
  /** Blockhash used for transaction */
  blockhash?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal execution state
 */
interface ExecutionState {
  id: string;
  startTime: number;
  attempts: number;
  providersTried: Set<SwqosType>;
  currentStatus: ExecutionStatus;
  abortController: AbortController;
}

// ===== Default Configurations =====

/**
 * Get default execution configuration
 */
export function defaultExecutionConfig(): ExecutionConfig {
  return {
    submitMode: SubmitMode.Parallel,
    waitConfirmation: true,
    commitment: 'confirmed',
    maxRetries: 3,
    retryDelayMs: 100,
    timeoutMs: 60000,
    abortOnSuccess: true,
    priorityProviders: [],
  };
}

/**
 * Get execution config for high-frequency trading
 */
export function hftExecutionConfig(): ExecutionConfig {
  return {
    submitMode: SubmitMode.Parallel,
    waitConfirmation: false,
    commitment: 'processed',
    maxRetries: 1,
    retryDelayMs: 50,
    timeoutMs: 10000,
    abortOnSuccess: true,
    priorityProviders: [SwqosType.Jito, SwqosType.Bloxroute],
  };
}

/**
 * Get execution config for reliable execution
 */
export function reliableExecutionConfig(): ExecutionConfig {
  return {
    submitMode: SubmitMode.Fallback,
    waitConfirmation: true,
    commitment: 'finalized',
    maxRetries: 5,
    retryDelayMs: 500,
    timeoutMs: 120000,
    abortOnSuccess: true,
    priorityProviders: [],
  };
}

// ===== Async Trade Executor =====

/**
 * Async trade executor with multiple submission modes
 */
export class AsyncTradeExecutor {
  private clients: Map<SwqosType, SwqosClient> = new Map();
  private connection: Connection;
  private activeExecutions: Map<string, ExecutionState> = new Map();

  constructor(
    private rpcUrl: string,
    clients: SwqosClient[] = []
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    for (const client of clients) {
      this.clients.set(client.getSwqosType(), client);
    }
  }

  /**
   * Add a SWQOS client
   */
  addClient(client: SwqosClient): void {
    this.clients.set(client.getSwqosType(), client);
  }

  /**
   * Remove a SWQOS client
   */
  removeClient(type: SwqosType): void {
    this.clients.delete(type);
  }

  /**
   * Get all registered clients
   */
  getClients(): Map<SwqosType, SwqosClient> {
    return new Map(this.clients);
  }

  /**
   * Execute a trade asynchronously
   */
  async execute(
    tradeType: TradeType,
    transaction: Buffer,
    config: Partial<ExecutionConfig> = {}
  ): Promise<ExecutionResult> {
    const fullConfig = { ...defaultExecutionConfig(), ...config };
    const executionId = this.generateExecutionId();

    const state: ExecutionState = {
      id: executionId,
      startTime: Date.now(),
      attempts: 0,
      providersTried: new Set(),
      currentStatus: ExecutionStatus.Pending,
      abortController: new AbortController(),
    };

    this.activeExecutions.set(executionId, state);

    try {
      this.updateStatus(state, ExecutionStatus.Pending, fullConfig);

      const result = await this.executeWithTimeout(
        tradeType,
        transaction,
        fullConfig,
        state
      );

      return result;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Cancel an active execution
   */
  cancel(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (state) {
      state.abortController.abort();
      this.updateStatus(state, ExecutionStatus.Cancelled);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active executions
   */
  cancelAll(): number {
    let count = 0;
    for (const [id, state] of this.activeExecutions) {
      state.abortController.abort();
      this.updateStatus(state, ExecutionStatus.Cancelled);
      count++;
    }
    return count;
  }

  /**
   * Get active execution count
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  private async executeWithTimeout(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.updateStatus(state, ExecutionStatus.TimedOut, config);
        resolve(this.createTimeoutResult(state));
      }, config.timeoutMs);

      this.executeInternal(tradeType, transaction, config, state)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async executeInternal(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    switch (config.submitMode) {
      case SubmitMode.Single:
        return this.executeSingle(tradeType, transaction, config, state);
      case SubmitMode.Parallel:
        return this.executeParallel(tradeType, transaction, config, state);
      case SubmitMode.Fallback:
        return this.executeFallback(tradeType, transaction, config, state);
      case SubmitMode.Redundant:
        return this.executeRedundant(tradeType, transaction, config, state);
      default:
        throw new TradeError(400, `Unknown submit mode: ${config.submitMode}`);
    }
  }

  private async executeSingle(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    const providers = this.getOrderedProviders(config.priorityProviders);
    const provider = providers[0];

    if (!provider) {
      return this.createErrorResult(state, 'No providers available');
    }

    return this.executeWithRetry(tradeType, transaction, config, state, provider);
  }

  private async executeParallel(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    const providers = this.getOrderedProviders(config.priorityProviders);

    if (providers.length === 0) {
      return this.createErrorResult(state, 'No providers available');
    }

    const promises = providers.map(provider =>
      this.executeWithProvider(tradeType, transaction, config, state, provider)
        .catch(error => ({ success: false, error, provider: provider.getSwqosType() } as ExecutionResult))
    );

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        return result.value;
      }
    }

    // All failed, return first error
    const firstError = results.find(r => r.status === 'fulfilled');
    if (firstError && firstError.status === 'fulfilled') {
      return firstError.value;
    }

    return this.createErrorResult(state, 'All parallel submissions failed');
  }

  private async executeFallback(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    const providers = this.getOrderedProviders(config.priorityProviders);

    for (const provider of providers) {
      const result = await this.executeWithProvider(
        tradeType,
        transaction,
        config,
        state,
        provider
      );

      if (result.success) {
        return result;
      }

      if (config.retryDelayMs > 0) {
        await this.sleep(config.retryDelayMs);
      }
    }

    return this.createErrorResult(state, 'All fallback providers failed');
  }

  private async executeRedundant(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState
  ): Promise<ExecutionResult> {
    // Similar to parallel but continues even after first success for redundancy
    const providers = this.getOrderedProviders(config.priorityProviders);
    const minSuccesses = Math.min(2, providers.length);

    const promises = providers.map(provider =>
      this.executeWithProvider(tradeType, transaction, config, state, provider)
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter(
      r => r.status === 'fulfilled' && r.value.success
    );

    if (successes.length >= minSuccesses) {
      // Return the fastest successful result
      const firstSuccess = successes[0];
      if (firstSuccess.status === 'fulfilled') {
        return {
          ...firstSuccess.value,
          metadata: {
            ...firstSuccess.value.metadata,
            redundantSubmissions: successes.length,
          },
        };
      }
    }

    return this.createErrorResult(
      state,
      `Redundant execution failed: ${successes.length}/${minSuccesses} successes`
    );
  }

  private async executeWithRetry(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState,
    provider: SwqosClient
  ): Promise<ExecutionResult> {
    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      state.attempts = attempt + 1;

      this.reportProgress(state, config, provider.getSwqosType());

      const result = await this.executeWithProvider(
        tradeType,
        transaction,
        config,
        state,
        provider
      );

      if (result.success) {
        return result;
      }

      if (attempt < config.maxRetries - 1 && config.retryDelayMs > 0) {
        await this.sleep(config.retryDelayMs * Math.pow(2, attempt)); // Exponential backoff
      }
    }

    return this.createErrorResult(
      state,
      `Failed after ${config.maxRetries} retries`
    );
  }

  private async executeWithProvider(
    tradeType: TradeType,
    transaction: Buffer,
    config: ExecutionConfig,
    state: ExecutionState,
    provider: SwqosClient
  ): Promise<ExecutionResult> {
    const providerType = provider.getSwqosType();
    state.providersTried.add(providerType);

    try {
      this.updateStatus(state, ExecutionStatus.Submitted, config);

      const signature = await provider.sendTransaction(
        tradeType,
        transaction,
        false
      );

      let confirmationTimeMs: number | undefined;

      if (config.waitConfirmation) {
        this.updateStatus(state, ExecutionStatus.Confirmed, config);
        const confirmed = await this.waitForConfirmation(
          signature,
          config.commitment
        );
        confirmationTimeMs = Date.now() - state.startTime;

        if (!confirmed) {
          return this.createErrorResult(state, 'Transaction failed to confirm', providerType);
        }

        this.updateStatus(state, ExecutionStatus.Finalized, config);
      }

      return {
        signature,
        success: true,
        status: config.waitConfirmation ? ExecutionStatus.Finalized : ExecutionStatus.Submitted,
        provider: providerType,
        attempts: state.attempts,
        executionTimeMs: Date.now() - state.startTime,
        confirmationTimeMs,
      };
    } catch (error) {
      return this.createErrorResult(
        state,
        error instanceof Error ? error.message : 'Unknown error',
        providerType
      );
    }
  }

  private async waitForConfirmation(
    signature: string,
    commitment: Commitment
  ): Promise<boolean> {
    const timeoutMs = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        if (status.value) {
          if (status.value.err) {
            return false;
          }
          const cs = status.value.confirmationStatus;
          if (commitment === 'finalized') {
            if (cs === 'finalized') return true;
          } else {
            // Rust `poll_any_transaction_confirmation`: Confirmed | Finalized only
            if (cs === 'confirmed' || cs === 'finalized') return true;
          }
        }
      } catch {
        // Continue polling
      }
      await this.sleep(500);
    }

    return false;
  }

  private getOrderedProviders(priorityProviders: SwqosType[]): SwqosClient[] {
    const providers: SwqosClient[] = [];

    // Add priority providers first
    for (const type of priorityProviders) {
      const client = this.clients.get(type);
      if (client) {
        providers.push(client);
      }
    }

    // Add remaining providers
    for (const [type, client] of this.clients) {
      if (!priorityProviders.includes(type)) {
        providers.push(client);
      }
    }

    return providers;
  }

  private updateStatus(
    state: ExecutionState,
    status: ExecutionStatus,
    config?: ExecutionConfig,
    result?: ExecutionResult
  ): void {
    state.currentStatus = status;
    if (config?.onStatusUpdate) {
      config.onStatusUpdate(status, result);
    }
  }

  private reportProgress(
    state: ExecutionState,
    config: ExecutionConfig,
    currentProvider?: SwqosType
  ): void {
    if (config.onProgress) {
      const elapsedMs = Date.now() - state.startTime;
      const progress: ExecutionProgress = {
        attempt: state.attempts,
        totalAttempts: config.maxRetries,
        currentProvider,
        providersTried: state.providersTried.size,
        elapsedMs,
        estimatedRemainingMs: this.estimateRemainingTime(state, config),
      };
      config.onProgress(progress);
    }
  }

  private estimateRemainingTime(state: ExecutionState, config: ExecutionConfig): number | undefined {
    if (state.attempts === 0) {
      return undefined;
    }

    const elapsedMs = Date.now() - state.startTime;
    const avgTimePerAttempt = elapsedMs / state.attempts;
    const remainingAttempts = config.maxRetries - state.attempts;

    return Math.ceil(avgTimePerAttempt * remainingAttempts);
  }

  private createErrorResult(
    state: ExecutionState,
    error: string,
    provider?: SwqosType
  ): ExecutionResult {
    return {
      signature: '',
      success: false,
      status: ExecutionStatus.Failed,
      error,
      provider,
      attempts: state.attempts,
      executionTimeMs: Date.now() - state.startTime,
    };
  }

  private createTimeoutResult(state: ExecutionState): ExecutionResult {
    return {
      signature: '',
      success: false,
      status: ExecutionStatus.TimedOut,
      error: 'Execution timed out',
      attempts: state.attempts,
      executionTimeMs: Date.now() - state.startTime,
    };
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== Convenience Functions =====

/**
 * Create an async trade executor with default configuration
 */
export function createAsyncExecutor(
  rpcUrl: string,
  clients: SwqosClient[] = []
): AsyncTradeExecutor {
  return new AsyncTradeExecutor(rpcUrl, clients);
}

/**
 * Execute a single trade with minimal configuration
 */
export async function executeTrade(
  rpcUrl: string,
  tradeType: TradeType,
  transaction: Buffer,
  clients: SwqosClient[],
  config?: Partial<ExecutionConfig>
): Promise<ExecutionResult> {
  const executor = new AsyncTradeExecutor(rpcUrl, clients);
  return executor.execute(tradeType, transaction, config);
}
