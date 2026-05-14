/**
 * Zero-Copy Module for Sol Trade SDK
 * Provides zero-copy buffer operations and serialization.
 */

// ===== Types =====

/**
 * Buffer view with zero-copy semantics
 */
export interface BufferView {
  buffer: ArrayBuffer;
  byteOffset: number;
  byteLength: number;
}

/**
 * Serializable interface for zero-copy operations
 */
export interface ZeroCopySerializable {
  serialize(): Uint8Array;
  deserialize(data: Uint8Array): void;
  serializedSize(): number;
}

/**
 * Buffer pool configuration
 */
export interface BufferPoolConfig {
  /** Buffer size in bytes */
  bufferSize: number;
  /** Number of buffers in pool */
  poolSize: number;
  /** Enable automatic expansion */
  autoExpand: boolean;
  /** Maximum pool size */
  maxPoolSize: number;
}

/**
 * Default buffer pool configuration
 */
export function defaultBufferPoolConfig(): BufferPoolConfig {
  return {
    bufferSize: 4096,
    poolSize: 128,
    autoExpand: true,
    maxPoolSize: 1024,
  };
}

// ===== Zero-Copy Buffer =====

/**
 * Zero-copy buffer with view semantics.
 * Allows multiple views into the same underlying buffer without copying.
 */
export class ZeroCopyBuffer {
  private buffer: ArrayBuffer;
  private view: DataView;
  private uint8View: Uint8Array;
  private offset: number = 0;

  constructor(size: number = 4096) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
  }

  /**
   * Create from existing buffer (zero-copy)
   */
  static from(buffer: ArrayBuffer): ZeroCopyBuffer {
    const zc = new ZeroCopyBuffer(0);
    zc.buffer = buffer;
    zc.view = new DataView(buffer);
    zc.uint8View = new Uint8Array(buffer);
    return zc;
  }

  /**
   * Create a view into this buffer without copying
   */
  slice(start: number, end: number): Uint8Array {
    return new Uint8Array(this.buffer, start, end - start);
  }

  /**
   * Get current write offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Set write offset
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Get buffer capacity
   */
  capacity(): number {
    return this.buffer.byteLength;
  }

  /**
   * Write Uint8 at current offset
   */
  writeUint8(value: number): void {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  /**
   * Write Uint16 at current offset (little-endian)
   */
  writeUint16(value: number): void {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  /**
   * Write Uint32 at current offset (little-endian)
   */
  writeUint32(value: number): void {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  /**
   * Write BigUint64 at current offset (little-endian)
   */
  writeUint64(value: bigint): void {
    this.view.setBigUint64(this.offset, value, true);
    this.offset += 8;
  }

  /**
   * Write bytes at current offset
   */
  writeBytes(bytes: Uint8Array): void {
    this.uint8View.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Read Uint8 at offset
   */
  readUint8(offset: number): number {
    return this.view.getUint8(offset);
  }

  /**
   * Read Uint16 at offset (little-endian)
   */
  readUint16(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  /**
   * Read Uint32 at offset (little-endian)
   */
  readUint32(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  /**
   * Read BigUint64 at offset (little-endian)
   */
  readUint64(offset: number): bigint {
    return this.view.getBigUint64(offset, true);
  }

  /**
   * Read bytes at offset
   */
  readBytes(offset: number, length: number): Uint8Array {
    return new Uint8Array(this.buffer, offset, length);
  }

  /**
   * Get the underlying ArrayBuffer
   */
  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  /**
   * Get as Uint8Array (full buffer)
   */
  asUint8Array(): Uint8Array {
    return this.uint8View;
  }

  /**
   * Get used portion as Uint8Array (zero-copy view)
   */
  asUsedUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  /**
   * Reset offset to beginning
   */
  reset(): void {
    this.offset = 0;
  }

  /**
   * Ensure capacity (creates new buffer if needed, copies data)
   */
  ensureCapacity(minCapacity: number): void {
    if (this.buffer.byteLength >= minCapacity) {
      return;
    }

    const newCapacity = Math.max(minCapacity, this.buffer.byteLength * 2);
    const newBuffer = new ArrayBuffer(newCapacity);
    const newUint8 = new Uint8Array(newBuffer);
    newUint8.set(this.uint8View);

    this.buffer = newBuffer;
    this.view = new DataView(newBuffer);
    this.uint8View = newUint8;
  }
}

// ===== Buffer Pool =====

/**
 * High-performance buffer pool for zero-copy operations.
 * Reduces allocation overhead by reusing buffers.
 */
export class BufferPool {
  private pool: ArrayBuffer[] = [];
  private inUse: Set<ArrayBuffer> = new Set();
  private config: BufferPoolConfig;

  constructor(config: BufferPoolConfig = defaultBufferPoolConfig()) {
    this.config = config;

    // Pre-allocate buffers
    for (let i = 0; i < config.poolSize; i++) {
      this.pool.push(new ArrayBuffer(config.bufferSize));
    }
  }

  /**
   * Acquire a buffer from the pool
   */
  acquire(): ArrayBuffer {
    if (this.pool.length > 0) {
      const buffer = this.pool.pop()!;
      this.inUse.add(buffer);
      return buffer;
    }

    if (this.config.autoExpand && this.pool.length + this.inUse.size < this.config.maxPoolSize) {
      const buffer = new ArrayBuffer(this.config.bufferSize);
      this.inUse.add(buffer);
      return buffer;
    }

    throw new Error('Buffer pool exhausted');
  }

  /**
   * Acquire a ZeroCopyBuffer wrapper
   */
  acquireZeroCopyBuffer(): ZeroCopyBuffer {
    const buffer = this.acquire();
    return ZeroCopyBuffer.from(buffer);
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: ArrayBuffer): void {
    if (!this.inUse.has(buffer)) {
      return;
    }

    this.inUse.delete(buffer);

    if (this.pool.length < this.config.maxPoolSize) {
      this.pool.push(buffer);
    }
  }

  /**
   * Execute a function with a pooled buffer
   */
  with<T>(fn: (buffer: ArrayBuffer) => T): T {
    const buffer = this.acquire();
    try {
      return fn(buffer);
    } finally {
      this.release(buffer);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.pool.length,
      inUse: this.inUse.size,
      total: this.pool.length + this.inUse.size,
    };
  }

  /**
   * Clear all buffers
   */
  clear(): void {
    this.pool = [];
    this.inUse.clear();
  }
}

// ===== Zero-Copy Serializer =====

/**
 * High-performance serializer with zero-copy semantics.
 * Minimizes memory copies during serialization/deserialization.
 */
export class ZeroCopySerializer {
  private buffer: ZeroCopyBuffer;
  private textEncoder: InstanceType<typeof TextEncoder>;
  private textDecoder: InstanceType<typeof TextDecoder>;

  constructor(initialSize: number = 4096) {
    this.buffer = new ZeroCopyBuffer(initialSize);
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
  }

  /**
   * Serialize a string (length-prefixed)
   */
  writeString(value: string): void {
    const bytes = this.textEncoder.encode(value);
    this.buffer.writeUint32(bytes.length);
    this.buffer.writeBytes(bytes);
  }

  /**
   * Serialize a PublicKey (32 bytes)
   */
  writePublicKey(bytes: Uint8Array): void {
    if (bytes.length !== 32) {
      throw new Error('PublicKey must be 32 bytes');
    }
    this.buffer.writeBytes(bytes);
  }

  /**
   * Serialize a BigInt (8 bytes)
   */
  writeBigInt(value: bigint): void {
    this.buffer.writeUint64(value);
  }

  /**
   * Serialize a number (4 bytes)
   */
  writeNumber(value: number): void {
    this.buffer.writeUint32(value);
  }

  /**
   * Serialize a boolean (1 byte)
   */
  writeBoolean(value: boolean): void {
    this.buffer.writeUint8(value ? 1 : 0);
  }

  /**
   * Serialize bytes with length prefix
   */
  writeByteArray(bytes: Uint8Array): void {
    this.buffer.writeUint32(bytes.length);
    this.buffer.writeBytes(bytes);
  }

  /**
   * Deserialize a string
   */
  readString(offset: number): { value: string; nextOffset: number } {
    const length = this.buffer.readUint32(offset);
    const bytes = this.buffer.readBytes(offset + 4, length);
    const value = this.textDecoder.decode(bytes);
    return { value, nextOffset: offset + 4 + length };
  }

  /**
   * Deserialize a PublicKey
   */
  readPublicKey(offset: number): { value: Uint8Array; nextOffset: number } {
    const value = this.buffer.readBytes(offset, 32);
    return { value, nextOffset: offset + 32 };
  }

  /**
   * Deserialize a BigInt
   */
  readBigInt(offset: number): { value: bigint; nextOffset: number } {
    const value = this.buffer.readUint64(offset);
    return { value, nextOffset: offset + 8 };
  }

  /**
   * Deserialize a number
   */
  readNumber(offset: number): { value: number; nextOffset: number } {
    const value = this.buffer.readUint32(offset);
    return { value, nextOffset: offset + 4 };
  }

  /**
   * Deserialize a boolean
   */
  readBoolean(offset: number): { value: boolean; nextOffset: number } {
    const value = this.buffer.readUint8(offset) !== 0;
    return { value, nextOffset: offset + 1 };
  }

  /**
   * Deserialize a byte array
   */
  readByteArray(offset: number): { value: Uint8Array; nextOffset: number } {
    const length = this.buffer.readUint32(offset);
    const value = this.buffer.readBytes(offset + 4, length);
    return { value, nextOffset: offset + 4 + length };
  }

  /**
   * Get serialized data as Uint8Array (zero-copy view)
   */
  getData(): Uint8Array {
    return this.buffer.asUsedUint8Array();
  }

  /**
   * Reset for reuse
   */
  reset(): void {
    this.buffer.reset();
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.buffer.getOffset();
  }
}

// ===== Fixed-Size Buffer Views =====

/**
 * Fixed-size view into a buffer for predictable memory layout.
 * Useful for structures with known sizes.
 */
export class FixedBufferView {
  private buffer: ArrayBuffer;
  private view: DataView;
  private uint8View: Uint8Array;
  private baseOffset: number;

  constructor(buffer: ArrayBuffer, offset: number, size: number) {
    this.buffer = buffer;
    this.view = new DataView(buffer, offset, size);
    this.uint8View = new Uint8Array(buffer, offset, size);
    this.baseOffset = offset;
  }

  /**
   * Get Uint8 at relative offset
   */
  getUint8(offset: number): number {
    return this.view.getUint8(offset);
  }

  /**
   * Set Uint8 at relative offset
   */
  setUint8(offset: number, value: number): void {
    this.view.setUint8(offset, value);
  }

  /**
   * Get Uint32 at relative offset
   */
  getUint32(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  /**
   * Set Uint32 at relative offset
   */
  setUint32(offset: number, value: number): void {
    this.view.setUint32(offset, value, true);
  }

  /**
   * Get BigUint64 at relative offset
   */
  getUint64(offset: number): bigint {
    return this.view.getBigUint64(offset, true);
  }

  /**
   * Set BigUint64 at relative offset
   */
  setUint64(offset: number, value: bigint): void {
    this.view.setBigUint64(offset, value, true);
  }

  /**
   * Get bytes at relative offset
   */
  getBytes(offset: number, length: number): Uint8Array {
    return new Uint8Array(this.buffer, this.baseOffset + offset, length);
  }

  /**
   * Set bytes at relative offset
   */
  setBytes(offset: number, bytes: Uint8Array): void {
    this.uint8View.set(bytes, offset);
  }

  /**
   * Get the underlying ArrayBuffer
   */
  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  /**
   * Get the base offset
   */
  getBaseOffset(): number {
    return this.baseOffset;
  }
}

// ===== Convenience Functions =====

/**
 * Create a buffer pool with default configuration
 */
export function createBufferPool(config?: Partial<BufferPoolConfig>): BufferPool {
  const fullConfig = { ...defaultBufferPoolConfig(), ...config };
  return new BufferPool(fullConfig);
}

/**
 * Create a zero-copy buffer
 */
export function createZeroCopyBuffer(size?: number): ZeroCopyBuffer {
  return new ZeroCopyBuffer(size);
}

/**
 * Create a zero-copy serializer
 */
export function createSerializer(initialSize?: number): ZeroCopySerializer {
  return new ZeroCopySerializer(initialSize);
}

/**
 * Copy bytes without allocation (if possible)
 */
export function copyBytes(src: Uint8Array, dst: Uint8Array, dstOffset: number = 0): void {
  dst.set(src, dstOffset);
}

/**
 * Create a zero-copy view of a buffer
 */
export function createView(buffer: ArrayBuffer, offset: number, length: number): Uint8Array {
  return new Uint8Array(buffer, offset, length);
}
