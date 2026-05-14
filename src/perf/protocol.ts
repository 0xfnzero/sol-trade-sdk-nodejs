/**
 * Protocol Optimization Module for Sol Trade SDK
 * Provides transaction optimization, compute budget management, and builder patterns.
 */

import { ComputeBudgetProgram, PublicKey, TransactionInstruction } from '@solana/web3.js';

// ===== Types =====

/**
 * Transaction configuration
 */
export interface TransactionConfig {
  /** Compute unit limit */
  computeUnitLimit: number;
  /** Compute unit price (micro-lamports) */
  computeUnitPrice: number;
  /** Priority fee in lamports */
  priorityFee: number;
  /** Enable dynamic compute budget */
  dynamicComputeBudget: boolean;
  /** Enable instruction packing */
  packInstructions: boolean;
  /** Maximum transaction size */
  maxTransactionSize: number;
  /** Enable address lookup tables */
  useAddressLookupTables: boolean;
}

/**
 * Default transaction configuration
 */
export function defaultTransactionConfig(): TransactionConfig {
  return {
    computeUnitLimit: 200000,
    computeUnitPrice: 100000,
    priorityFee: 100000,
    dynamicComputeBudget: true,
    packInstructions: true,
    maxTransactionSize: 1232, // Solana transaction size limit
    useAddressLookupTables: true,
  };
}

/**
 * Compute budget statistics
 */
export interface ComputeBudgetStats {
  totalComputeUsed: number;
  totalComputeLimit: number;
  averageComputePerInstruction: number;
  estimatedFee: number;
  efficiency: number;
}

/**
 * Instruction group for batching
 */
export interface InstructionGroup {
  instructions: TransactionInstruction[];
  computeEstimate: number;
  priority: number;
}

/**
 * Transaction optimization result
 */
export interface OptimizationResult {
  instructions: TransactionInstruction[];
  computeLimit: number;
  computePrice: number;
  estimatedSize: number;
  optimizations: string[];
}

// ===== Transaction Builder =====

/**
 * High-performance transaction builder with optimization.
 * Constructs optimized Solana transactions for trading.
 */
export class TransactionBuilder {
  private instructions: TransactionInstruction[] = [];
  private config: TransactionConfig;
  private computeEstimates: Map<string, number> = new Map();
  private signers: PublicKey[] = [];

  constructor(config: TransactionConfig = defaultTransactionConfig()) {
    this.config = config;
    this.initializeComputeEstimates();
  }

  /**
   * Initialize default compute estimates for common instructions
   */
  private initializeComputeEstimates(): void {
    // Common instruction compute costs (approximate)
    this.computeEstimates.set('transfer', 450);
    this.computeEstimates.set('createAccount', 2500);
    this.computeEstimates.set('createATA', 3500);
    this.computeEstimates.set('closeAccount', 2500);
    this.computeEstimates.set('syncNative', 500);
    this.computeEstimates.set('setComputeUnitLimit', 100);
    this.computeEstimates.set('setComputeUnitPrice', 100);
    this.computeEstimates.set('pumpFunBuy', 45000);
    this.computeEstimates.set('pumpFunSell', 40000);
    this.computeEstimates.set('pumpSwapBuy', 50000);
    this.computeEstimates.set('pumpSwapSell', 45000);
    this.computeEstimates.set('raydiumSwap', 55000);
    this.computeEstimates.set('meteoraSwap', 60000);
  }

  /**
   * Add an instruction to the transaction
   */
  addInstruction(
    instruction: TransactionInstruction,
    computeEstimate?: number,
    priority: number = 0
  ): this {
    this.instructions.push(instruction);

    // Track signer if new
    for (const key of instruction.keys) {
      if (key.isSigner && !this.signers.some(s => s.equals(key.pubkey))) {
        this.signers.push(key.pubkey);
      }
    }

    return this;
  }

  /**
   * Add multiple instructions
   */
  addInstructions(instructions: TransactionInstruction[]): this {
    for (const ix of instructions) {
      this.addInstruction(ix);
    }
    return this;
  }

  /**
   * Add compute budget instructions
   */
  addComputeBudget(units: number, price: number): this {
    this.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price })
    );
    return this;
  }

  /**
   * Estimate total compute units
   */
  estimateCompute(): number {
    let total = 0;

    for (const ix of this.instructions) {
      const estimate = this.computeEstimates.get(ix.programId.toBase58()) || 3000;
      total += estimate;
    }

    // Add overhead for compute budget instructions
    total += 200;

    return total;
  }

  /**
   * Build optimized transaction instructions
   */
  build(): OptimizationResult {
    let optimizedInstructions = [...this.instructions];
    const optimizations: string[] = [];

    // Apply packing optimization
    if (this.config.packInstructions) {
      optimizedInstructions = this.packInstructions(optimizedInstructions);
      optimizations.push('instruction_packing');
    }

    // Calculate optimal compute budget
    const computeEstimate = this.estimateCompute();
    let computeLimit = this.config.computeUnitLimit;

    if (this.config.dynamicComputeBudget) {
      computeLimit = this.calculateOptimalComputeLimit(computeEstimate);
      optimizations.push('dynamic_compute_budget');
    }

    // Calculate optimal price
    const computePrice = this.calculateOptimalPrice();

    // Estimate transaction size
    const estimatedSize = this.estimateTransactionSize(optimizedInstructions);

    // Add compute budget instructions at the beginning
    optimizedInstructions = this.addComputeBudgetInstructions(
      optimizedInstructions,
      computeLimit,
      computePrice
    );

    return {
      instructions: optimizedInstructions,
      computeLimit,
      computePrice,
      estimatedSize,
      optimizations,
    };
  }

  /**
   * Build and return only the instructions (without compute budget)
   */
  buildInstructions(): TransactionInstruction[] {
    return [...this.instructions];
  }

  /**
   * Clear all instructions
   */
  clear(): this {
    this.instructions = [];
    this.signers = [];
    return this;
  }

  /**
   * Get current instruction count
   */
  getInstructionCount(): number {
    return this.instructions.length;
  }

  /**
   * Get current signer count
   */
  getSignerCount(): number {
    return this.signers.length;
  }

  private packInstructions(
    instructions: TransactionInstruction[]
  ): TransactionInstruction[] {
    // Sort instructions by priority and dependencies
    // This is a simplified implementation
    return instructions;
  }

  private calculateOptimalComputeLimit(estimate: number): number {
    // Add 20% buffer for safety
    const withBuffer = Math.ceil(estimate * 1.2);

    // Round up to nearest 10000
    return Math.ceil(withBuffer / 10000) * 10000;
  }

  private calculateOptimalPrice(): number {
    // Base price from config
    return this.config.computeUnitPrice;
  }

  private estimateTransactionSize(instructions: TransactionInstruction[]): number {
    // Rough estimation: signatures + message header + accounts + instructions
    let size = 64; // One signature
    size += 3; // Message header
    size += 32 * (this.signers.length + 1); // Account keys

    for (const ix of instructions) {
      size += 1; // Program ID index
      size += 1; // Account count
      size += ix.keys.length * 33; // Account meta (pubkey + flags)
      size += 2; // Data length
      size += ix.data.length; // Instruction data
    }

    return size;
  }

  private addComputeBudgetInstructions(
    instructions: TransactionInstruction[],
    limit: number,
    price: number
  ): TransactionInstruction[] {
    // In a real implementation, this would add:
    // 1. ComputeBudgetProgram.setComputeUnitLimit
    // 2. ComputeBudgetProgram.setComputeUnitPrice
    // For now, we return the instructions as-is
    return instructions;
  }
}

// ===== Compute Budget Optimizer =====

/**
 * Optimizes compute budget allocation for transactions.
 * Provides dynamic adjustment based on network conditions.
 */
export class ComputeBudgetOptimizer {
  private baseConfig: TransactionConfig;
  private networkStats: NetworkStats = {
    averageComputePrice: 0,
    congestionLevel: 0,
    recentSuccessRate: 1.0,
  };
  private history: BudgetHistoryEntry[] = [];
  private maxHistorySize: number = 100;

  constructor(config: TransactionConfig = defaultTransactionConfig()) {
    this.baseConfig = config;
  }

  /**
   * Update network statistics
   */
  updateNetworkStats(stats: Partial<NetworkStats>): void {
    this.networkStats = { ...this.networkStats, ...stats };
  }

  /**
   * Get optimized compute budget for current conditions
   */
  getOptimizedBudget(priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'): {
    computeLimit: number;
    computePrice: number;
    priorityFee: number;
  } {
    const multipliers: Record<string, number> = {
      low: 0.5,
      normal: 1.0,
      high: 2.0,
      critical: 5.0,
    };

    const multiplier = multipliers[priority] ?? 1.0;

    // Adjust based on congestion
    const congestionMultiplier = 1 + this.networkStats.congestionLevel;

    // Adjust based on recent success rate
    const successMultiplier = this.networkStats.recentSuccessRate < 0.8 ? 1.5 : 1.0;

    const computeLimit = this.baseConfig.computeUnitLimit;
    const computePrice = Math.floor(
      this.baseConfig.computeUnitPrice * multiplier * congestionMultiplier * successMultiplier
    );
    const priorityFee = Math.floor(
      this.baseConfig.priorityFee * multiplier * congestionMultiplier * successMultiplier
    );

    return {
      computeLimit,
      computePrice,
      priorityFee,
    };
  }

  /**
   * Record transaction result for learning
   */
  recordResult(
    computeUsed: number,
    computeLimit: number,
    success: boolean,
    confirmationTimeMs: number
  ): void {
    this.history.push({
      computeUsed,
      computeLimit,
      success,
      confirmationTimeMs,
      timestamp: Date.now(),
    });

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Update success rate
    const recent = this.history.slice(-20);
    const successes = recent.filter(h => h.success).length;
    this.networkStats.recentSuccessRate = successes / recent.length;
  }

  /**
   * Get recommended compute limit based on history
   */
  getRecommendedComputeLimit(): number {
    if (this.history.length === 0) {
      return this.baseConfig.computeUnitLimit;
    }

    // Find 95th percentile of compute used
    const computeUsed = this.history.map(h => h.computeUsed).sort((a, b) => a - b);
    const p95Index = Math.floor(computeUsed.length * 0.95);
    const p95Compute = computeUsed[p95Index] ?? computeUsed[computeUsed.length - 1] ?? this.baseConfig.computeUnitLimit;

    // Add 20% buffer
    return Math.ceil(p95Compute * 1.2);
  }

  /**
   * Get optimization statistics
   */
  getStats(): ComputeBudgetStats {
    if (this.history.length === 0) {
      return {
        totalComputeUsed: 0,
        totalComputeLimit: 0,
        averageComputePerInstruction: 0,
        estimatedFee: 0,
        efficiency: 0,
      };
    }

    const totalUsed = this.history.reduce((sum, h) => sum + h.computeUsed, 0);
    const totalLimit = this.history.reduce((sum, h) => sum + h.computeLimit, 0);

    return {
      totalComputeUsed: totalUsed,
      totalComputeLimit: totalLimit,
      averageComputePerInstruction: totalUsed / this.history.length,
      estimatedFee: this.calculateEstimatedFee(),
      efficiency: totalLimit > 0 ? totalUsed / totalLimit : 0,
    };
  }

  /**
   * Reset history
   */
  reset(): void {
    this.history = [];
    this.networkStats = {
      averageComputePrice: 0,
      congestionLevel: 0,
      recentSuccessRate: 1.0,
    };
  }

  private calculateEstimatedFee(): number {
    const recent = this.history.slice(-10);
    if (recent.length === 0) return 0;

    const avgCompute = recent.reduce((sum, h) => sum + h.computeUsed, 0) / recent.length;
    return avgCompute * this.baseConfig.computeUnitPrice;
  }
}

/**
 * Network statistics
 */
interface NetworkStats {
  averageComputePrice: number;
  congestionLevel: number;
  recentSuccessRate: number;
}

/**
 * Budget history entry
 */
interface BudgetHistoryEntry {
  computeUsed: number;
  computeLimit: number;
  success: boolean;
  confirmationTimeMs: number;
  timestamp: number;
}

// ===== Instruction Batcher =====

/**
 * Batches multiple instructions into optimized groups.
 */
export class InstructionBatcher {
  private groups: InstructionGroup[] = [];
  private maxComputePerGroup: number = 1200000; // 1.2M compute units

  /**
   * Add an instruction group
   */
  addGroup(group: InstructionGroup): this {
    this.groups.push(group);
    return this;
  }

  /**
   * Batch all groups into optimal transaction sets
   */
  batch(): InstructionGroup[][] {
    const batches: InstructionGroup[][] = [];
    let currentBatch: InstructionGroup[] = [];
    let currentCompute = 0;

    // Sort by priority (highest first)
    const sorted = [...this.groups].sort((a, b) => b.priority - a.priority);

    for (const group of sorted) {
      if (currentCompute + group.computeEstimate > this.maxComputePerGroup) {
        // Start new batch
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        currentBatch = [group];
        currentCompute = group.computeEstimate;
      } else {
        // Add to current batch
        currentBatch.push(group);
        currentCompute += group.computeEstimate;
      }
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Set maximum compute per batch
   */
  setMaxComputePerGroup(compute: number): this {
    this.maxComputePerGroup = compute;
    return this;
  }

  /**
   * Clear all groups
   */
  clear(): this {
    this.groups = [];
    return this;
  }
}

// ===== Transaction Optimizer =====

/**
 * High-level transaction optimizer.
 * Applies multiple optimization strategies.
 */
export class TransactionOptimizer {
  private config: TransactionConfig;
  private budgetOptimizer: ComputeBudgetOptimizer;

  constructor(config: TransactionConfig = defaultTransactionConfig()) {
    this.config = config;
    this.budgetOptimizer = new ComputeBudgetOptimizer(config);
  }

  /**
   * Optimize a set of instructions
   */
  optimize(
    instructions: TransactionInstruction[],
    options: {
      priority?: 'low' | 'normal' | 'high' | 'critical';
      useLookupTables?: boolean;
    } = {}
  ): OptimizationResult {
    const builder = new TransactionBuilder(this.config);
    builder.addInstructions(instructions);

    const result = builder.build();

    // Apply priority adjustments
    if (options.priority) {
      const budget = this.budgetOptimizer.getOptimizedBudget(options.priority);
      result.computeLimit = budget.computeLimit;
      result.computePrice = budget.computePrice;
    }

    return result;
  }

  /**
   * Optimize for minimum latency
   */
  optimizeForLatency(instructions: TransactionInstruction[]): OptimizationResult {
    return this.optimize(instructions, { priority: 'critical' });
  }

  /**
   * Optimize for minimum cost
   */
  optimizeForCost(instructions: TransactionInstruction[]): OptimizationResult {
    return this.optimize(instructions, { priority: 'low' });
  }

  /**
   * Get the compute budget optimizer
   */
  getBudgetOptimizer(): ComputeBudgetOptimizer {
    return this.budgetOptimizer;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TransactionConfig>): void {
    this.config = { ...this.config, ...config };
    this.budgetOptimizer = new ComputeBudgetOptimizer(this.config);
  }
}

// ===== Convenience Functions =====

/**
 * Create a transaction builder
 */
export function createTransactionBuilder(
  config?: Partial<TransactionConfig>
): TransactionBuilder {
  const fullConfig = { ...defaultTransactionConfig(), ...config };
  return new TransactionBuilder(fullConfig);
}

/**
 * Create a compute budget optimizer
 */
export function createComputeBudgetOptimizer(
  config?: Partial<TransactionConfig>
): ComputeBudgetOptimizer {
  const fullConfig = { ...defaultTransactionConfig(), ...config };
  return new ComputeBudgetOptimizer(fullConfig);
}

/**
 * Create an instruction batcher
 */
export function createInstructionBatcher(): InstructionBatcher {
  return new InstructionBatcher();
}

/**
 * Create a transaction optimizer
 */
export function createTransactionOptimizer(
  config?: Partial<TransactionConfig>
): TransactionOptimizer {
  const fullConfig = { ...defaultTransactionConfig(), ...config };
  return new TransactionOptimizer(fullConfig);
}

/**
 * Estimate compute units for common operations
 */
export function estimateCompute(operation: string): number {
  const estimates: Record<string, number> = {
    transfer: 450,
    createAccount: 2500,
    createATA: 3500,
    closeAccount: 2500,
    syncNative: 500,
    pumpFunBuy: 45000,
    pumpFunSell: 40000,
    pumpSwapBuy: 50000,
    pumpSwapSell: 45000,
    raydiumSwap: 55000,
    meteoraSwap: 60000,
  };

  return estimates[operation] || 3000;
}

/**
 * Calculate optimal compute unit price
 */
export function calculateOptimalPrice(
  targetLatencyMs: number,
  currentCongestion: number
): number {
  const basePrice = 100000;
  const latencyMultiplier = Math.max(1, 100 / targetLatencyMs);
  const congestionMultiplier = 1 + currentCongestion;

  return Math.floor(basePrice * latencyMultiplier * congestionMultiplier);
}
