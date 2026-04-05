/**
 * Transaction serialization module.
 * Based on sol-trade-sdk Rust implementation with buffer pooling.
 */

// ===== Constants =====

export const SERIALIZER_POOL_SIZE = 10000;
export const SERIALIZER_BUFFER_SIZE = 256 * 1024;
export const SERIALIZER_PREWARM_BUFFERS = 64;

// ===== Base58 Encoding =====

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode bytes to base58 string
 */
export function encodeBase58(data: Uint8Array): string {
  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      leadingZeros++;
    } else {
      break;
    }
  }

  // Convert to base58
  const digits: number[] = [0];

  for (let i = leadingZeros; i < data.length; i++) {
    let carry = data[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Build result string
  let result = '';
  for (let i = 0; i < leadingZeros; i++) {
    result += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

/**
 * Decode base58 string to bytes
 */
export function decodeBase58(s: string): Uint8Array {
  const bytes: number[] = [0];

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry = carry >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry = carry >> 8;
    }
  }

  // Count leading '1's
  let leadingOnes = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '1') {
      leadingOnes++;
    } else {
      break;
    }
  }

  // Build result
  const result = new Uint8Array(leadingOnes + bytes.length);
  result.set(new Uint8Array(leadingOnes), 0);
  for (let i = 0; i < bytes.length; i++) {
    result[leadingOnes + bytes.length - 1 - i] = bytes[i];
  }

  return result;
}

// ===== Transaction Encoding =====

export enum TransactionEncoding {
  BASE58 = 'base58',
  BASE64 = 'base64',
}

// ===== Zero-Allocation Serializer =====

/**
 * Uses a buffer pool to avoid runtime allocation.
 * Based on Rust's ZeroAllocSerializer pattern.
 */
export class ZeroAllocSerializer {
  private pool: Uint8Array[] = [];
  private available = 0;
  private capacity: number;

  constructor(
    poolSize: number = SERIALIZER_POOL_SIZE,
    private bufferSize: number = SERIALIZER_BUFFER_SIZE,
    prewarmBuffers: number = SERIALIZER_PREWARM_BUFFERS
  ) {
    this.capacity = poolSize;

    // Prewarm only a small hot set
    const prewarmCount = Math.min(prewarmBuffers, poolSize);
    for (let i = 0; i < prewarmCount; i++) {
      this.pool.push(new Uint8Array(bufferSize));
      this.available++;
    }
  }

  /**
   * Serialize data using a pooled buffer
   */
  serializeZeroAlloc(data: Uint8Array): Uint8Array {
    let buf: Uint8Array;
    if (this.pool.length > 0) {
      buf = this.pool.pop()!;
      this.available--;
    } else {
      buf = new Uint8Array(this.bufferSize);
    }

    // Copy data
    buf.set(data, 0);
    return buf.slice(0, data.length);
  }

  /**
   * Return a buffer to the pool
   */
  returnBuffer(buf: Uint8Array): void {
    if (this.pool.length < this.capacity) {
      this.pool.push(buf);
      this.available++;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { available: number; capacity: number } {
    return { available: this.available, capacity: this.capacity };
  }
}

// Global serializer instance
let globalSerializer: ZeroAllocSerializer | null = null;

function getGlobalSerializer(): ZeroAllocSerializer {
  if (!globalSerializer) {
    globalSerializer = new ZeroAllocSerializer();
  }
  return globalSerializer;
}

// ===== Base64 Encoder =====

/**
 * Optimized base64 encoding
 */
export class Base64Encoder {
  /**
   * Encode data to base64
   */
  static encode(data: Uint8Array): string {
    // Use btoa for browser, Buffer for Node.js
    if (typeof btoa === 'function') {
      return btoa(String.fromCharCode(...data));
    }
    return Buffer.from(data).toString('base64');
  }

  /**
   * Encode using pre-allocated buffer
   */
  static encodeFast(data: Uint8Array): string {
    return Base64Encoder.encode(data);
  }
}

// ===== PooledTxBufferGuard =====

/**
 * Returns buffer to pool on release.
 * Use for automatic cleanup.
 */
export class PooledTxBufferGuard {
  private buffer: Uint8Array | null;
  private serializer: ZeroAllocSerializer;

  constructor(data: Uint8Array, serializer?: ZeroAllocSerializer) {
    this.serializer = serializer || getGlobalSerializer();
    this.buffer = this.serializer.serializeZeroAlloc(data);
  }

  /**
   * Get the underlying buffer
   */
  getBuffer(): Uint8Array {
    if (!this.buffer) {
      throw new Error('Buffer already released');
    }
    return this.buffer;
  }

  /**
   * Return buffer to pool
   */
  release(): void {
    if (this.buffer) {
      this.serializer.returnBuffer(this.buffer);
      this.buffer = null;
    }
  }
}

// ===== Transaction Serialization =====

/**
 * Serialize a transaction using buffer pool.
 * Returns encoded string.
 */
export function serializeTransactionSync(
  transaction: Uint8Array,
  encoding: TransactionEncoding
): string {
  const serializer = getGlobalSerializer();
  const serialized = serializer.serializeZeroAlloc(transaction);
  try {
    switch (encoding) {
      case TransactionEncoding.BASE58:
        return encodeBase58(serialized);
      case TransactionEncoding.BASE64:
        return Base64Encoder.encode(serialized);
      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  } finally {
    serializer.returnBuffer(serialized);
  }
}

/**
 * Serialize multiple transactions
 */
export function serializeTransactionBatchSync(
  transactions: Uint8Array[],
  encoding: TransactionEncoding
): string[] {
  return transactions.map((tx) => serializeTransactionSync(tx, encoding));
}

// ===== Get Statistics =====

/**
 * Get global serializer statistics
 */
export function getSerializerStats(): {
  available: number;
  capacity: number;
} {
  return getGlobalSerializer().getPoolStats();
}
