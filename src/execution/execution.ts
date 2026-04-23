/**
 * Execution: instruction preprocessing, cache prefetch, branch hints.
 * 执行模块：指令预处理、缓存预取、分支提示。
 *
 * Based on sol-trade-sdk Rust implementation patterns.
 */

import { PublicKey } from '@solana/web3.js';
import {
  SOL_TOKEN_ACCOUNT,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT,
} from '../constants';

// ===== Constants =====

export const BYTES_PER_ACCOUNT = 32;
export const MAX_INSTRUCTIONS_WARN = 64;

// ===== Branch Optimization =====

/**
 * Branch prediction hints.
 * In JS/TS, we can't control branch prediction, but we structure code
 * to match the Rust patterns.
 */
export class BranchOptimizer {
  /**
   * Hint that condition is likely true
   */
  static likely<T>(condition: boolean, value: T, fallback: T): T {
    return condition ? value : fallback;
  }

  /**
   * Hint that condition is likely false
   */
  static unlikely<T>(condition: boolean, value: T, fallback: T): T {
    return condition ? value : fallback;
  }

  /**
   * Prefetch read data into cache (no-op in JS, but pattern preserved)
   */
  static prefetchReadData<T>(data: T): void {
    // Touch the data to potentially load into cache
    // In JS this is a no-op, but the pattern is preserved
  }
}

// ===== Prefetch Helper =====

/**
 * Cache prefetching utilities.
 * Call once on hot-path refs to reduce cache-miss latency.
 */
export class Prefetch {
  /**
   * Prefetch instruction data into cache
   * Accepts any instruction-shaped array (Rust: `Prefetch::instructions`).
   */
  static instructions(instructions: ReadonlyArray<unknown>): void {
    if (instructions.length === 0) return;

    // Touch first, middle, and last instructions
    void instructions[0];
    if (instructions.length > 2) {
      void instructions[Math.floor(instructions.length / 2)];
    }
    if (instructions.length > 1) {
      void instructions[instructions.length - 1];
    }
  }

  /**
   * Prefetch pubkey into cache
   */
  static pubkey(pubkey: Uint8Array): void {
    if (pubkey.length > 0) {
      void pubkey[0];
    }
  }

  /**
   * Prefetch keypair data into cache
   */
  static keypair(keypair: unknown): void {
    // Touch keypair for cache effect
    void keypair;
  }
}

// ===== Memory Operations =====

/**
 * SIMD-accelerated memory operations (where available in JS)
 */
export class MemoryOps {
  /**
   * Optimized memory copy using TypedArray
   */
  static copy(dst: Uint8Array, src: Uint8Array): void {
    dst.set(src);
  }

  /**
   * Optimized memory comparison
   */
  static compare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Create zeroed memory
   */
  static zero(size: number): Uint8Array {
    return new Uint8Array(size);
  }

  /**
   * Fast copy with pre-allocated buffer
   */
  static copyFast(
    dst: Uint8Array,
    dstOffset: number,
    src: Uint8Array
  ): void {
    dst.set(src, dstOffset);
  }
}

// ===== Instruction Types =====

/**
 * Account metadata for instructions
 */
export interface AccountMeta {
  pubkey: Uint8Array;
  isSigner: boolean;
  isWritable: boolean;
}

/**
 * Solana instruction
 */
export interface Instruction {
  programId: Uint8Array;
  accounts: AccountMeta[];
  data: Uint8Array;
}

// ===== Instruction Processor =====

/** Account metas: web3 `TransactionInstruction.keys` or internal `Instruction.accounts`. */
function instructionAccountCount(ix: {
  keys?: readonly unknown[];
  accounts?: readonly unknown[];
}): number {
  if (ix.keys !== undefined) return ix.keys.length;
  if (ix.accounts !== undefined) return ix.accounts.length;
  return 0;
}

/**
 * Handles instruction preprocessing and validation.
 * Based on Rust's InstructionProcessor pattern.
 */
export class InstructionProcessor {
  /**
   * Validate and prepare instructions for execution.
   * Rust: `InstructionProcessor::preprocess` (empty check, prefetch, warn when count exceeds {@link MAX_INSTRUCTIONS_WARN}).
   */
  static preprocess(instructions: ReadonlyArray<unknown>): void {
    if (instructions.length === 0) {
      throw new Error('Instructions empty');
    }

    Prefetch.instructions(instructions);

    if (instructions.length > MAX_INSTRUCTIONS_WARN) {
      console.warn(
        `[sol-trade-sdk] Large instruction count: ${instructions.length}`
      );
    }
  }

  /**
   * Calculate total size for buffer allocation (web3 `keys` or internal `accounts`).
   */
  static calculateSize(
    instructions: ReadonlyArray<{
      data: { length: number };
      keys?: readonly unknown[];
      accounts?: readonly unknown[];
    }>
  ): number {
    let totalSize = 0;
    for (let i = 0; i < instructions.length; i++) {
      if (i + 1 < instructions.length) {
        void instructions[i + 1];
      }
      const ix = instructions[i]!;
      totalSize += ix.data.length;
      totalSize += instructionAccountCount(ix) * BYTES_PER_ACCOUNT;
    }
    return totalSize;
  }
}

// ===== Execution Path Helpers =====

/**
 * Trade direction and execution path utilities
 */
export class ExecutionPath {
  /**
   * Rust `ExecutionPath::is_buy`: input mint is quote-side (SOL / WSOL / USD1 / USDC).
   */
  static isBuy(inputMint: PublicKey): boolean {
    return (
      inputMint.equals(SOL_TOKEN_ACCOUNT) ||
      inputMint.equals(WSOL_TOKEN_ACCOUNT) ||
      inputMint.equals(USD1_TOKEN_ACCOUNT) ||
      inputMint.equals(USDC_TOKEN_ACCOUNT)
    );
  }

  /**
   * Select between fast and slow path
   */
  static select<T>(
    condition: boolean,
    fastPath: () => T,
    slowPath: () => T
  ): T {
    if (condition) {
      return fastPath();
    }
    return slowPath();
  }
}

// ===== Transaction Builder Pool =====

/**
 * Builds transactions with pre-allocated buffers.
 * Based on Rust's zero-allocation pattern.
 */
export class TransactionBuilder {
  private instructions: Instruction[] = [];
  private dataBuffer: Uint8Array;
  private capacity: number;

  constructor(initialSize: number = 10) {
    this.capacity = initialSize;
    this.dataBuffer = new Uint8Array(1024);
    this.reset();
  }

  /**
   * Reset for reuse
   */
  reset(): void {
    this.instructions = [];
    this.dataBuffer.fill(0);
  }

  /**
   * Add instruction
   */
  addInstruction(instr: Instruction): void {
    this.instructions.push(instr);
  }

  /**
   * Build final transaction bytes
   */
  build(payer: Uint8Array, blockhash: Uint8Array): Uint8Array {
    // Calculate total size
    const size = InstructionProcessor.calculateSize(this.instructions);
    const result = new Uint8Array(64 + size); // payer + blockhash + data

    let offset = 0;
    result.set(payer, offset);
    offset += 32;
    result.set(blockhash, offset);
    offset += 32;

    for (const instr of this.instructions) {
      result.set(instr.data, offset);
      offset += instr.data.length;
    }

    return result.slice(0, offset);
  }
}

/**
 * Manages pre-allocated transaction builders.
 * Based on Rust's acquire_builder/release_builder pattern.
 */
export class TransactionBuilderPool {
  private pool: TransactionBuilder[] = [];
  private maxSize: number;
  private builderSize: number;

  constructor(poolSize: number = 10, builderSize: number = 10) {
    this.maxSize = poolSize;
    this.builderSize = builderSize;

    // Pre-populate pool
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(new TransactionBuilder(builderSize));
    }
  }

  /**
   * Get a builder from the pool
   */
  acquire(): TransactionBuilder {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new TransactionBuilder(this.builderSize);
  }

  /**
   * Return a builder to the pool
   */
  release(builder: TransactionBuilder): void {
    builder.reset();
    if (this.pool.length < this.maxSize) {
      this.pool.push(builder);
    }
  }
}

// ===== Ultra Low Latency Stats =====

/**
 * Tracks nanosecond-level latency statistics.
 * Uses Atomics for thread-safety in Worker contexts.
 */
export class UltraLowLatencyStats {
  private stats: {
    eventsProcessed: Int32Array;
    totalLatencyNs: BigInt64Array;
    minLatencyNs: BigInt64Array;
    maxLatencyNs: BigInt64Array;
    subMillisecondEvents: Int32Array;
    ultraFastEvents: Int32Array;
    lightningFastEvents: Int32Array;
  };

  constructor() {
    this.stats = {
      eventsProcessed: new Int32Array(new SharedArrayBuffer(4)),
      totalLatencyNs: new BigInt64Array(new SharedArrayBuffer(8)),
      minLatencyNs: new BigInt64Array(new SharedArrayBuffer(8)),
      maxLatencyNs: new BigInt64Array(new SharedArrayBuffer(8)),
      subMillisecondEvents: new Int32Array(new SharedArrayBuffer(4)),
      ultraFastEvents: new Int32Array(new SharedArrayBuffer(4)),
      lightningFastEvents: new Int32Array(new SharedArrayBuffer(4)),
    };

    // Initialize min to max
    Atomics.store(this.stats.minLatencyNs, 0, BigInt(Number.MAX_SAFE_INTEGER));
  }

  /**
   * Record a latency measurement
   */
  record(latencyNs: bigint): void {
    Atomics.add(this.stats.eventsProcessed, 0, 1);
    Atomics.add(this.stats.totalLatencyNs, 0, latencyNs);

    // Update min
    let current = Atomics.load(this.stats.minLatencyNs, 0);
    while (latencyNs < current) {
      if (Atomics.compareExchange(this.stats.minLatencyNs, 0, current, latencyNs) === current) {
        break;
      }
      current = Atomics.load(this.stats.minLatencyNs, 0);
    }

    // Update max
    current = Atomics.load(this.stats.maxLatencyNs, 0);
    while (latencyNs > current) {
      if (Atomics.compareExchange(this.stats.maxLatencyNs, 0, current, latencyNs) === current) {
        break;
      }
      current = Atomics.load(this.stats.maxLatencyNs, 0);
    }

    // Classify latency
    if (latencyNs < BigInt(1_000_000)) {
      Atomics.add(this.stats.subMillisecondEvents, 0, 1);
    }
    if (latencyNs < BigInt(100_000)) {
      Atomics.add(this.stats.ultraFastEvents, 0, 1);
    }
    if (latencyNs < BigInt(10_000)) {
      Atomics.add(this.stats.lightningFastEvents, 0, 1);
    }
  }

  /**
   * Get all statistics
   */
  getStats(): {
    eventsProcessed: number;
    totalLatencyNs: bigint;
    minLatencyNs: bigint;
    maxLatencyNs: bigint;
    avgLatencyNs: number;
    subMillisecondEvents: number;
    ultraFastEvents: number;
    lightningFastEvents: number;
  } {
    const eventsProcessed = Atomics.load(this.stats.eventsProcessed, 0);
    const totalLatencyNs = Atomics.load(this.stats.totalLatencyNs, 0);
    const minLatencyNs = Atomics.load(this.stats.minLatencyNs, 0);
    const maxLatencyNs = Atomics.load(this.stats.maxLatencyNs, 0);

    const avgLatencyNs =
      eventsProcessed > 0 ? Number(totalLatencyNs) / eventsProcessed : 0;

    return {
      eventsProcessed,
      totalLatencyNs,
      minLatencyNs: eventsProcessed > 0 ? minLatencyNs : BigInt(0),
      maxLatencyNs,
      avgLatencyNs,
      subMillisecondEvents: Atomics.load(this.stats.subMillisecondEvents, 0),
      ultraFastEvents: Atomics.load(this.stats.ultraFastEvents, 0),
      lightningFastEvents: Atomics.load(this.stats.lightningFastEvents, 0),
    };
  }
}

// ===== DexParamEnum (Zero-cost abstraction pattern) =====

/**
 * Base interface for DEX parameters
 */
export interface DexParam {
  readonly type: string;
}

/**
 * PumpFun protocol parameters
 */
export interface PumpFunParams extends DexParam {
  readonly type: 'PumpFun';
  bondingCurve: Uint8Array;
  associatedBondingCurve: Uint8Array;
  creatorVault: Uint8Array;
  tokenProgram: Uint8Array;
  closeTokenAccountWhenSell?: boolean;
}

/**
 * PumpSwap protocol parameters
 */
export interface PumpSwapParams extends DexParam {
  readonly type: 'PumpSwap';
  pool: Uint8Array;
  baseMint: Uint8Array;
  quoteMint: Uint8Array;
  poolBaseTokenAccount: Uint8Array;
  poolQuoteTokenAccount: Uint8Array;
}

/**
 * Raydium CPMM protocol parameters
 */
export interface RaydiumCpmmParams extends DexParam {
  readonly type: 'RaydiumCpmm';
  poolState: Uint8Array;
  ammConfig: Uint8Array;
  baseMint: Uint8Array;
  quoteMint: Uint8Array;
}

/**
 * Meteora DAMM v2 protocol parameters
 */
export interface MeteoraDammV2Params extends DexParam {
  readonly type: 'MeteoraDammV2';
  pool: Uint8Array;
  tokenAVault: Uint8Array;
  tokenBVault: Uint8Array;
  tokenAMint: Uint8Array;
  tokenBMint: Uint8Array;
}

/**
 * Union type for DEX parameters (zero-cost abstraction like Rust enum)
 */
export type DexParamEnum =
  | PumpFunParams
  | PumpSwapParams
  | RaydiumCpmmParams
  | MeteoraDammV2Params;

/**
 * Type guards for DEX params
 */
export function isPumpFunParams(param: DexParamEnum): param is PumpFunParams {
  return param.type === 'PumpFun';
}

export function isPumpSwapParams(param: DexParamEnum): param is PumpSwapParams {
  return param.type === 'PumpSwap';
}

export function isRaydiumCpmmParams(
  param: DexParamEnum
): param is RaydiumCpmmParams {
  return param.type === 'RaydiumCpmm';
}

export function isMeteoraDammV2Params(
  param: DexParamEnum
): param is MeteoraDammV2Params {
  return param.type === 'MeteoraDammV2';
}
