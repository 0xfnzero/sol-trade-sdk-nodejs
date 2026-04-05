/**
 * Execution Module for Sol Trade SDK
 *
 * Provides optimized execution patterns based on Rust sol-trade-sdk:
 * - Branch optimization hints
 * - Cache prefetching
 * - Memory operations
 * - Instruction processing
 * - Transaction builder pool
 * - Ultra low latency stats
 */

export {
  BYTES_PER_ACCOUNT,
  MAX_INSTRUCTIONS_WARN,
  BranchOptimizer,
  Prefetch,
  MemoryOps,
  InstructionProcessor,
  ExecutionPath,
  TransactionBuilder,
  TransactionBuilderPool,
  UltraLowLatencyStats,
} from './execution';

export type {
  AccountMeta,
  Instruction,
  DexParam,
  PumpFunParams,
  PumpSwapParams,
  RaydiumCpmmParams,
  MeteoraDammV2Params,
  DexParamEnum,
} from './execution';

export {
  isPumpFunParams,
  isPumpSwapParams,
  isRaydiumCpmmParams,
  isMeteoraDammV2Params,
} from './execution';
