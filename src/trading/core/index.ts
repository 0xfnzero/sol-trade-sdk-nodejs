/**
 * Trading Core Module for Sol Trade SDK
 * Core trading infrastructure with async execution, transaction pooling,
 * confirmation monitoring, and retry handling.
 */

// ===== Async Executor =====
export {
  AsyncTradeExecutor,
  SubmitMode,
  ExecutionStatus,
  defaultExecutionConfig,
  hftExecutionConfig,
  reliableExecutionConfig,
  createAsyncExecutor,
  executeTrade,
} from './async-executor';
export type {
  ExecutionConfig,
  ExecutionProgress,
  ExecutionResult,
} from './async-executor';

// ===== Transaction Pool =====
export {
  TransactionPool,
  TransactionStatus,
  PriorityLevel,
  PriorityCalculator,
  defaultPoolConfig,
  highThroughputPoolConfig,
  conservativePoolConfig,
  createTransactionPool,
  submitToPool,
} from './transaction-pool';
export type {
  PoolConfig,
  PoolStats,
  PendingTransaction,
  PriorityScore,
} from './transaction-pool';

// ===== Confirmation Monitor =====
export {
  ConfirmationMonitor,
  ConfirmationStatus,
  defaultConfirmationConfig,
  fastConfirmationConfig,
  reliableConfirmationConfig,
  createConfirmationMonitor,
  waitForConfirmation,
  isConfirmed,
} from './confirmation-monitor';
export type {
  ConfirmationConfig,
  ConfirmationProgress,
  ConfirmationResult,
  TransactionError,
} from './confirmation-monitor';

// ===== Retry Handler =====
export {
  RetryHandler,
  RetryStrategy,
  CircuitBreaker,
  CircuitState,
  ExponentialBackoff,
  defaultRetryConfig,
  aggressiveRetryConfig,
  conservativeRetryConfig,
  defaultCircuitBreakerConfig,
  createRetryHandler,
  withRetry,
  withCircuitBreaker,
  calculateBackoff,
} from './retry-handler';
export type {
  RetryConfig,
  RetryResult,
  CircuitBreakerConfig,
  CircuitStats,
} from './retry-handler';
