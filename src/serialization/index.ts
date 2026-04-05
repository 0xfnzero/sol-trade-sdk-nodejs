/**
 * Serialization Module for Sol Trade SDK
 *
 * Provides optimized transaction serialization based on Rust sol-trade-sdk:
 * - Zero-allocation buffer pooling
 * - Base58/Base64 encoding
 * - Pooled buffer guards
 */

export {
  // Constants
  SERIALIZER_POOL_SIZE,
  SERIALIZER_BUFFER_SIZE,
  SERIALIZER_PREWARM_BUFFERS,
  // Base58
  encodeBase58,
  decodeBase58,
  // Transaction encoding
  TransactionEncoding,
  // Serializer
  ZeroAllocSerializer,
  Base64Encoder,
  PooledTxBufferGuard,
  // Functions
  serializeTransactionSync,
  serializeTransactionBatchSync,
  getSerializerStats,
} from './serialization';
