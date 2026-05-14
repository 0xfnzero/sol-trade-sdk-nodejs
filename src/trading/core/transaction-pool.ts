/**
 * Transaction Pool for Sol Trade SDK
 * Manages a pool of pending transactions with priority-based processing.
 */

import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { TradeError, SwqosType, TradeType } from '../../index';
import { SwqosClient } from '../../swqos/clients';
import { ExecutionResult, ExecutionStatus } from './async-executor';

// ===== Types =====

/**
 * Transaction status in the pool
 */
export enum TransactionStatus {
  /** Transaction is queued and waiting */
  Queued = 'Queued',
  /** Transaction is being processed */
  Processing = 'Processing',
  /** Transaction submitted to network */
  Submitted = 'Submitted',
  /** Transaction confirmed on chain */
  Confirmed = 'Confirmed',
  /** Transaction failed */
  Failed = 'Failed',
  /** Transaction was dropped */
  Dropped = 'Dropped',
  /** Transaction expired */
  Expired = 'Expired',
  /** Transaction cancelled by user */
  Cancelled = 'Cancelled',
}

/**
 * Priority level for transactions
 */
export enum PriorityLevel {
  /** Critical priority - process immediately */
  Critical = 0,
  /** High priority - process before normal */
  High = 1,
  /** Normal priority */
  Normal = 2,
  /** Low priority - process when idle */
  Low = 3,
  /** Background priority - lowest */
  Background = 4,
}

/**
 * Configuration for the transaction pool
 */
export interface PoolConfig {
  /** Maximum number of concurrent transactions */
  maxConcurrent: number;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Default priority for new transactions */
  defaultPriority: PriorityLevel;
  /** Whether to enable priority boosting */
  enablePriorityBoost: boolean;
  /** Time before priority boost in milliseconds */
  priorityBoostDelayMs: number;
  /** Maximum time in queue before expiration */
  maxQueueTimeMs: number;
  /** Polling interval for queue processing */
  pollIntervalMs: number;
  /** Whether to auto-start the pool */
  autoStart: boolean;
  /** Callback for transaction status changes */
  onStatusChange?: (tx: PendingTransaction) => void;
  /** Callback for pool statistics updates */
  onStatsUpdate?: (stats: PoolStats) => void;
}

/**
 * Pending transaction in the pool
 */
export interface PendingTransaction {
  /** Unique transaction ID */
  id: string;
  /** Transaction data */
  transaction: Buffer;
  /** Trade type */
  tradeType: TradeType;
  /** Associated SWQOS provider */
  preferredProvider?: SwqosType;
  /** Current status */
  status: TransactionStatus;
  /** Priority level */
  priority: PriorityLevel;
  /** Timestamp when added to pool */
  queuedAt: number;
  /** Timestamp when processing started */
  processingAt?: number;
  /** Timestamp when submitted */
  submittedAt?: number;
  /** Timestamp when confirmed */
  confirmedAt?: number;
  /** Transaction signature (when available) */
  signature?: string;
  /** Error message if failed */
  error?: string;
  /** Number of submission attempts */
  attempts: number;
  /** Maximum allowed attempts */
  maxAttempts: number;
  /** Associated accounts for conflict detection */
  accounts: PublicKey[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  /** Total transactions processed */
  totalProcessed: number;
  /** Total transactions successful */
  totalSuccessful: number;
  /** Total transactions failed */
  totalFailed: number;
  /** Current queue size */
  queueSize: number;
  /** Currently processing count */
  processingCount: number;
  /** Average processing time in milliseconds */
  avgProcessingTimeMs: number;
  /** Average wait time in milliseconds */
  avgWaitTimeMs: number;
  /** Transactions by status */
  byStatus: Record<TransactionStatus, number>;
  /** Current throughput (tx/sec) */
  throughput: number;
}

/**
 * Priority calculation result
 */
export interface PriorityScore {
  /** Calculated priority score (higher = more important) */
  score: number;
  /** Base priority level */
  basePriority: PriorityLevel;
  /** Age bonus (increases with wait time) */
  ageBonus: number;
  /** Custom adjustments */
  adjustments: number;
}

// ===== Default Configurations =====

/**
 * Get default pool configuration
 */
export function defaultPoolConfig(): PoolConfig {
  return {
    maxConcurrent: 5,
    maxQueueSize: 100,
    defaultPriority: PriorityLevel.Normal,
    enablePriorityBoost: true,
    priorityBoostDelayMs: 5000,
    maxQueueTimeMs: 60000,
    pollIntervalMs: 100,
    autoStart: true,
  };
}

/**
 * Get high-throughput pool configuration
 */
export function highThroughputPoolConfig(): PoolConfig {
  return {
    maxConcurrent: 10,
    maxQueueSize: 200,
    defaultPriority: PriorityLevel.Normal,
    enablePriorityBoost: true,
    priorityBoostDelayMs: 2000,
    maxQueueTimeMs: 30000,
    pollIntervalMs: 50,
    autoStart: true,
  };
}

/**
 * Get conservative pool configuration
 */
export function conservativePoolConfig(): PoolConfig {
  return {
    maxConcurrent: 2,
    maxQueueSize: 50,
    defaultPriority: PriorityLevel.Normal,
    enablePriorityBoost: false,
    priorityBoostDelayMs: 10000,
    maxQueueTimeMs: 120000,
    pollIntervalMs: 200,
    autoStart: true,
  };
}

// ===== Priority Calculator =====

/**
 * Calculates priority scores for transactions
 */
export class PriorityCalculator {
  private baseScores: Map<PriorityLevel, number> = new Map([
    [PriorityLevel.Critical, 1000],
    [PriorityLevel.High, 500],
    [PriorityLevel.Normal, 100],
    [PriorityLevel.Low, 50],
    [PriorityLevel.Background, 10],
  ]);

  constructor(private config: PoolConfig) {}

  /**
   * Calculate priority score for a transaction
   */
  calculate(tx: PendingTransaction): PriorityScore {
    const now = Date.now();
    const ageMs = now - tx.queuedAt;
    const baseScore = this.baseScores.get(tx.priority) || 100;

    let ageBonus = 0;
    if (this.config.enablePriorityBoost && ageMs > this.config.priorityBoostDelayMs) {
      ageBonus = Math.min(
        Math.floor((ageMs - this.config.priorityBoostDelayMs) / 1000) * 10,
        200 // Max age bonus
      );
    }

    const adjustments = this.calculateAdjustments(tx);
    const score = baseScore + ageBonus + adjustments;

    return {
      score,
      basePriority: tx.priority,
      ageBonus,
      adjustments,
    };
  }

  /**
   * Compare two transactions by priority
   */
  compare(tx1: PendingTransaction, tx2: PendingTransaction): number {
    const score1 = this.calculate(tx1).score;
    const score2 = this.calculate(tx2).score;
    return score2 - score1; // Higher score first
  }

  private calculateAdjustments(tx: PendingTransaction): number {
    let adjustments = 0;

    // Boost for retried transactions
    if (tx.attempts > 0) {
      adjustments += tx.attempts * 5;
    }

    // Boost for transactions nearing expiration
    const ageMs = Date.now() - tx.queuedAt;
    const timeRemaining = this.config.maxQueueTimeMs - ageMs;
    if (timeRemaining < 10000) {
      adjustments += 50;
    }

    return adjustments;
  }
}

// ===== Transaction Pool =====

/**
 * Manages a pool of transactions with priority-based processing
 */
export class TransactionPool {
  private queue: PendingTransaction[] = [];
  private processing: Map<string, PendingTransaction> = new Map();
  private completed: Map<string, PendingTransaction> = new Map();
  private calculator: PriorityCalculator;
  private clients: Map<SwqosType, SwqosClient> = new Map();
  private connection: Connection;
  private isRunning: boolean = false;
  private pollInterval?: NodeJS.Timeout;
  private stats: PoolStats;
  private processingTimes: number[] = [];
  private waitTimes: number[] = [];

  constructor(
    private rpcUrl: string,
    private config: PoolConfig = defaultPoolConfig()
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.calculator = new PriorityCalculator(config);
    this.stats = this.initializeStats();

    if (config.autoStart) {
      this.start();
    }
  }

  /**
   * Add a client to the pool
   */
  addClient(client: SwqosClient): void {
    this.clients.set(client.getSwqosType(), client);
  }

  /**
   * Remove a client from the pool
   */
  removeClient(type: SwqosType): void {
    this.clients.delete(type);
  }

  /**
   * Submit a transaction to the pool
   */
  async submit(
    transaction: Buffer,
    tradeType: TradeType,
    options: {
      priority?: PriorityLevel;
      preferredProvider?: SwqosType;
      maxAttempts?: number;
      accounts?: PublicKey[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new TradeError(429, 'Transaction pool queue is full');
    }

    const id = this.generateTransactionId();
    const pendingTx: PendingTransaction = {
      id,
      transaction,
      tradeType,
      preferredProvider: options.preferredProvider,
      status: TransactionStatus.Queued,
      priority: options.priority ?? this.config.defaultPriority,
      queuedAt: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      accounts: options.accounts ?? [],
      metadata: options.metadata,
    };

    this.queue.push(pendingTx);
    this.sortQueue();
    this.updateStats();

    return id;
  }

  /**
   * Get transaction by ID
   */
  getTransaction(id: string): PendingTransaction | undefined {
    // Check queue
    const queued = this.queue.find(tx => tx.id === id);
    if (queued) return queued;

    // Check processing
    const processing = this.processing.get(id);
    if (processing) return processing;

    // Check completed
    return this.completed.get(id);
  }

  /**
   * Cancel a pending transaction
   */
  cancel(id: string): boolean {
    // Try to remove from queue
    const index = this.queue.findIndex(tx => tx.id === id);
    if (index !== -1) {
      const tx = this.queue.splice(index, 1)[0]!;
      tx.status = TransactionStatus.Cancelled;
      this.completed.set(id, tx);
      this.notifyStatusChange(tx);
      return true;
    }

    // Cannot cancel if already processing
    return false;
  }

  /**
   * Start the transaction pool processing
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.pollInterval = setInterval(() => {
      this.processQueue();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the transaction pool processing
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  /**
   * Check if pool is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Get all queued transactions
   */
  getQueue(): PendingTransaction[] {
    return [...this.queue];
  }

  /**
   * Get all processing transactions
   */
  getProcessing(): PendingTransaction[] {
    return Array.from(this.processing.values());
  }

  /**
   * Clear completed transactions older than specified age
   */
  clearCompleted(maxAgeMs: number = 300000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [id, tx] of this.completed) {
      const completedTime = tx.confirmedAt || tx.submittedAt || tx.processingAt;
      if (completedTime && completedTime < cutoff) {
        this.completed.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Wait for a transaction to complete
   */
  async waitForTransaction(
    id: string,
    timeoutMs: number = 60000
  ): Promise<PendingTransaction> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const tx = this.getTransaction(id);
      if (!tx) {
        throw new TradeError(404, `Transaction ${id} not found`);
      }

      if (this.isTerminalStatus(tx.status)) {
        return tx;
      }

      await this.sleep(100);
    }

    throw new TradeError(408, `Timeout waiting for transaction ${id}`);
  }

  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    // Remove expired transactions
    this.removeExpired();

    // Process available slots
    while (
      this.processing.size < this.config.maxConcurrent &&
      this.queue.length > 0
    ) {
      const tx = this.queue.shift();
      if (!tx) break;

      this.processTransaction(tx);
    }

    this.updateStats();
  }

  private async processTransaction(tx: PendingTransaction): Promise<void> {
    tx.status = TransactionStatus.Processing;
    tx.processingAt = Date.now();
    this.processing.set(tx.id, tx);
    this.notifyStatusChange(tx);

    try {
      const result = await this.submitTransaction(tx);

      if (result.success) {
        tx.status = TransactionStatus.Confirmed;
        tx.signature = result.signature;
        tx.confirmedAt = Date.now();
        this.stats.totalSuccessful++;
      } else {
        tx.attempts++;
        if (tx.attempts >= tx.maxAttempts) {
          tx.status = TransactionStatus.Failed;
          tx.error = result.error;
          this.stats.totalFailed++;
        } else {
          // Re-queue for retry
          tx.status = TransactionStatus.Queued;
          this.queue.push(tx);
          this.sortQueue();
        }
      }
    } catch (error) {
      tx.attempts++;
      if (tx.attempts >= tx.maxAttempts) {
        tx.status = TransactionStatus.Failed;
        tx.error = error instanceof Error ? error.message : 'Unknown error';
        this.stats.totalFailed++;
      } else {
        tx.status = TransactionStatus.Queued;
        this.queue.push(tx);
        this.sortQueue();
      }
    }

    if (this.isTerminalStatus(tx.status)) {
      this.processing.delete(tx.id);
      this.completed.set(tx.id, tx);
      this.stats.totalProcessed++;

      // Track processing time
      if (tx.processingAt && tx.confirmedAt) {
        this.processingTimes.push(tx.confirmedAt - tx.processingAt);
        if (this.processingTimes.length > 100) {
          this.processingTimes.shift();
        }
      }

      // Track wait time
      if (tx.processingAt) {
        this.waitTimes.push(tx.processingAt - tx.queuedAt);
        if (this.waitTimes.length > 100) {
          this.waitTimes.shift();
        }
      }
    }

    this.notifyStatusChange(tx);
  }

  private async submitTransaction(tx: PendingTransaction): Promise<ExecutionResult> {
    const providers = this.getProviders(tx.preferredProvider);

    for (const provider of providers) {
      try {
        tx.status = TransactionStatus.Submitted;
        tx.submittedAt = Date.now();
        this.notifyStatusChange(tx);

        const signature = await provider.sendTransaction(
          tx.tradeType,
          tx.transaction,
          false
        );

        return {
          signature,
          success: true,
          status: ExecutionStatus.Confirmed,
          provider: provider.getSwqosType(),
          attempts: tx.attempts + 1,
          executionTimeMs: Date.now() - tx.queuedAt,
        };
      } catch (error) {
        // Try next provider
        continue;
      }
    }

    return {
      signature: '',
      success: false,
      status: ExecutionStatus.Failed,
      error: 'All providers failed',
      attempts: tx.attempts + 1,
      executionTimeMs: Date.now() - tx.queuedAt,
    };
  }

  private getProviders(preferred?: SwqosType): SwqosClient[] {
    const providers: SwqosClient[] = [];

    if (preferred) {
      const preferredClient = this.clients.get(preferred);
      if (preferredClient) {
        providers.push(preferredClient);
      }
    }

    // Add remaining providers
    for (const [type, client] of this.clients) {
      if (type !== preferred) {
        providers.push(client);
      }
    }

    return providers;
  }

  private removeExpired(): void {
    const now = Date.now();
    const expired: PendingTransaction[] = [];

    this.queue = this.queue.filter(tx => {
      if (now - tx.queuedAt > this.config.maxQueueTimeMs) {
        tx.status = TransactionStatus.Expired;
        expired.push(tx);
        return false;
      }
      return true;
    });

    for (const tx of expired) {
      this.completed.set(tx.id, tx);
      this.notifyStatusChange(tx);
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => this.calculator.compare(a, b));
  }

  private isTerminalStatus(status: TransactionStatus): boolean {
    return [
      TransactionStatus.Confirmed,
      TransactionStatus.Failed,
      TransactionStatus.Dropped,
      TransactionStatus.Expired,
      TransactionStatus.Cancelled,
    ].includes(status);
  }

  private initializeStats(): PoolStats {
    return {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      queueSize: 0,
      processingCount: 0,
      avgProcessingTimeMs: 0,
      avgWaitTimeMs: 0,
      byStatus: {
        [TransactionStatus.Queued]: 0,
        [TransactionStatus.Processing]: 0,
        [TransactionStatus.Submitted]: 0,
        [TransactionStatus.Confirmed]: 0,
        [TransactionStatus.Failed]: 0,
        [TransactionStatus.Dropped]: 0,
        [TransactionStatus.Expired]: 0,
        [TransactionStatus.Cancelled]: 0,
      },
      throughput: 0,
    };
  }

  private updateStats(): void {
    // Calculate averages
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0;

    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;

    // Count by status
    const byStatus: Record<TransactionStatus, number> = { ...this.stats.byStatus };
    for (const status of Object.values(TransactionStatus)) {
      byStatus[status] = 0;
    }

    for (const tx of this.queue) {
      byStatus[tx.status]++;
    }
    for (const tx of this.processing.values()) {
      byStatus[tx.status]++;
    }

    this.stats = {
      ...this.stats,
      queueSize: this.queue.length,
      processingCount: this.processing.size,
      avgProcessingTimeMs: Math.round(avgProcessingTime),
      avgWaitTimeMs: Math.round(avgWaitTime),
      byStatus,
      throughput: this.calculateThroughput(),
    };

    if (this.config.onStatsUpdate) {
      this.config.onStatsUpdate(this.stats);
    }
  }

  private calculateThroughput(): number {
    // Simple throughput calculation based on recent completions
    const recentTimeWindow = 60000; // 1 minute
    const cutoff = Date.now() - recentTimeWindow;

    let recentCompletions = 0;
    for (const tx of this.completed.values()) {
      if (tx.confirmedAt && tx.confirmedAt > cutoff) {
        recentCompletions++;
      }
    }

    return Math.round((recentCompletions / recentTimeWindow) * 1000) / 1000;
  }

  private notifyStatusChange(tx: PendingTransaction): void {
    if (this.config.onStatusChange) {
      this.config.onStatusChange(tx);
    }
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== Convenience Functions =====

/**
 * Create a new transaction pool
 */
export function createTransactionPool(
  rpcUrl: string,
  config?: Partial<PoolConfig>
): TransactionPool {
  return new TransactionPool(rpcUrl, { ...defaultPoolConfig(), ...config });
}

/**
 * Submit a single transaction to a pool
 */
export async function submitToPool(
  pool: TransactionPool,
  transaction: Buffer,
  tradeType: TradeType,
  options?: {
    priority?: PriorityLevel;
    preferredProvider?: SwqosType;
  }
): Promise<string> {
  return pool.submit(transaction, tradeType, options);
}
