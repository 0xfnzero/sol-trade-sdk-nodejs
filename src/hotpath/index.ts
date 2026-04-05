/**
 * Hot Path Module for Sol Trade SDK
 *
 * Provides optimized trading execution with ZERO RPC calls in the hot path.
 * All data is prefetched before trading to minimize latency.
 *
 * Key Components:
 * - HotPathState: Manages prefetched blockchain state
 * - HotPathExecutor: Executes trades using cached data only
 * - TradingContext: Context object for a single trade with all required data
 *
 * Usage:
 * ```typescript
 * const executor = new HotPathExecutor(connection);
 * await executor.start();
 *
 * // Prefetch required data BEFORE trading
 * await executor.prefetchAccounts([tokenAccountPubkey]);
 *
 * // Build transaction with cached blockhash
 * const blockhash = executor.getBlockhash();
 * // ... build transaction ...
 *
 * // Execute - NO RPC calls during this phase
 * const result = await executor.execute('buy', txBytes);
 * ```
 */

export {
  // State management
  HotPathConfig,
  HotPathState,
  PrefetchedData,
  AccountState,
  PoolState,
  TradingContext,
  defaultHotPathConfig,
} from './state';

export type {
  ExecuteOptions,
  ExecuteResult,
  GasFeeConfig,
} from './executor';

export {
  // Execution
  HotPathExecutor,
  HotPathMetrics,
  TransactionBuilder,
  defaultExecuteOptions,
  createHotPathExecutor,
} from './executor';

export {
  // Errors
  HotPathError,
  StaleBlockhashError,
  MissingAccountError,
  ContextExpiredError,
} from './state';
