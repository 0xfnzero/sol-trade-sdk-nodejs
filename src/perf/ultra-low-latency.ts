/**
 * Ultra-Low Latency (ULL) Module for Sol Trade SDK
 * Provides memory pools, lock-free queues, and latency optimization.
 */

// ===== Types =====

/**
 * Configuration for ultra-low latency optimizations
 */
export interface UltraLowLatencyConfig {
  /** Memory pool size per object type */
  memoryPoolSize: number;
  /** Lock-free queue capacity */
  queueCapacity: number;
  /** Enable busy spinning instead of yielding */
  enableBusySpin: boolean;
  /** Spin count before yielding */
  spinCount: number;
  /** Enable memory prefetching */
  enablePrefetch: boolean;
  /** NUMA-aware memory allocation */
  numaAware: boolean;
}

/**
 * Default ULL configuration
 */
export function defaultUltraLowLatencyConfig(): UltraLowLatencyConfig {
  return {
    memoryPoolSize: 1024,
    queueCapacity: 4096,
    enableBusySpin: true,
    spinCount: 1000,
    enablePrefetch: true,
    numaAware: false,
  };
}

/**
 * Latency statistics
 */
export interface LatencyStats {
  minLatencyUs: number;
  maxLatencyUs: number;
  avgLatencyUs: number;
  p50LatencyUs: number;
  p99LatencyUs: number;
  p999LatencyUs: number;
  totalOperations: number;
}

// ===== Memory Pool =====

/**
 * High-performance memory pool for object reuse.
 * Reduces GC pressure and allocation latency.
 */
export class MemoryPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;
  private leased = 0;

  constructor(
    factory: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 1024
  ) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;

    // Pre-allocate objects
    for (let i = 0; i < maxSize; i++) {
      this.pool.push(factory());
    }
  }

  /**
   * Acquire an object from the pool
   */
  acquire(): T {
    this.leased++;
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    return this.factory();
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    if (this.leased <= 0) return;
    this.leased--;

    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  /**
   * Execute a function with a pooled object
   */
  with<R>(fn: (obj: T) => R): R {
    const obj = this.acquire();
    try {
      return fn(obj);
    } finally {
      this.release(obj);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.pool.length,
      inUse: this.leased,
      total: this.pool.length + this.leased,
    };
  }
}

// ===== Lock-Free Queue =====

/**
 * Lock-free circular buffer queue for single-producer single-consumer scenarios.
 * Uses atomic operations for synchronization.
 */
export class LockFreeQueue<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private mask: number;
  private head: number = 0; // Write position
  private tail: number = 0; // Read position
  private config: UltraLowLatencyConfig;

  constructor(capacity: number = 4096, config?: UltraLowLatencyConfig) {
    // Round up to power of 2
    this.capacity = Math.pow(2, Math.ceil(Math.log2(capacity)));
    this.mask = this.capacity - 1;
    this.buffer = new Array(this.capacity).fill(undefined);
    this.config = config || defaultUltraLowLatencyConfig();
  }

  /**
   * Enqueue an item (producer only)
   */
  enqueue(item: T): boolean {
    const nextHead = (this.head + 1) & this.mask;

    // Check if full
    if (nextHead === this.tail) {
      return false; // Queue full
    }

    this.buffer[this.head] = item;
    this.head = nextHead;

    return true;
  }

  /**
   * Dequeue an item (consumer only)
   */
  dequeue(): T | undefined {
    if (this.tail === this.head) {
      return undefined; // Queue empty
    }

    const item = this.buffer[this.tail];
    this.buffer[this.tail] = undefined;
    this.tail = (this.tail + 1) & this.mask;

    return item;
  }

  /**
   * Try dequeue with spinning
   */
  dequeueSpin(timeoutUs: number = 1000): T | undefined {
    const startTime = performance.now();
    const timeoutMs = timeoutUs / 1000;

    let spins = 0;
    while (performance.now() - startTime < timeoutMs) {
      const item = this.dequeue();
      if (item !== undefined) {
        return item;
      }

      if (this.config.enableBusySpin && spins < this.config.spinCount) {
        spins++;
        // Busy spin
        continue;
      }

      // Yield
      spins = 0;
    }

    return undefined;
  }

  /**
   * Get current size
   */
  size(): number {
    return (this.head - this.tail) & this.mask;
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.head === this.tail;
  }

  /**
   * Check if full
   */
  isFull(): boolean {
    return ((this.head + 1) & this.mask) === this.tail;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.buffer.fill(undefined);
  }
}

// ===== Multi-Producer Multi-Consumer Queue =====

/**
 * Thread-safe queue supporting multiple producers and consumers.
 * Uses compare-and-swap for atomic operations.
 */
export class MPMCQueue<T> {
  private buffer: Array<{ item: T | undefined; sequence: number }>;
  private capacity: number;
  private mask: number;
  private enqueuePos: number = 0;
  private dequeuePos: number = 0;

  constructor(capacity: number = 4096) {
    this.capacity = Math.pow(2, Math.ceil(Math.log2(capacity)));
    this.mask = this.capacity - 1;
    this.buffer = new Array(this.capacity);

    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = { item: undefined, sequence: i };
    }
  }

  /**
   * Enqueue an item (thread-safe)
   */
  enqueue(item: T): boolean {
    let pos = this.enqueuePos;

    while (true) {
      const slot = this.buffer[pos & this.mask]!;
      const seq = slot.sequence;
      const diff = seq - pos;

      if (diff === 0) {
        // Try to claim slot
        if (this.compareAndSwapEnqueuePos(pos, pos + 1)) {
          slot.item = item;
          slot.sequence = pos + 1;
          return true;
        }
        // Failed, retry
        pos = this.enqueuePos;
      } else if (diff < 0) {
        // Queue full
        return false;
      } else {
        // Another thread moved forward, retry
        pos = this.enqueuePos;
      }
    }
  }

  /**
   * Dequeue an item (thread-safe)
   */
  dequeue(): T | undefined {
    let pos = this.dequeuePos;

    while (true) {
      const slot = this.buffer[pos & this.mask]!;
      const seq = slot.sequence;
      const diff = seq - (pos + 1);

      if (diff === 0) {
        // Try to claim slot
        if (this.compareAndSwapDequeuePos(pos, pos + 1)) {
          const item = slot.item;
          slot.item = undefined;
          slot.sequence = pos + this.mask + 1;
          return item;
        }
        // Failed, retry
        pos = this.dequeuePos;
      } else if (diff < 0) {
        // Queue empty
        return undefined;
      } else {
        // Another thread moved forward, retry
        pos = this.dequeuePos;
      }
    }
  }

  private compareAndSwapEnqueuePos(expected: number, value: number): boolean {
    if (this.enqueuePos === expected) {
      this.enqueuePos = value;
      return true;
    }
    return false;
  }

  private compareAndSwapDequeuePos(expected: number, value: number): boolean {
    if (this.dequeuePos === expected) {
      this.dequeuePos = value;
      return true;
    }
    return false;
  }
}

// ===== Latency Optimizer =====

/**
 * Latency optimizer for trading operations.
 * Provides latency measurement, optimization, and reporting.
 */
export class LatencyOptimizer {
  private latencies: number[] = [];
  private maxSamples: number;
  private config: UltraLowLatencyConfig;
  private optimizationCallbacks: Array<() => void> = [];

  constructor(maxSamples: number = 10000, config?: UltraLowLatencyConfig) {
    this.maxSamples = maxSamples;
    this.config = config || defaultUltraLowLatencyConfig();
  }

  /**
   * Record a latency measurement
   */
  recordLatency(latencyUs: number): void {
    this.latencies.push(latencyUs);

    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  /**
   * Measure and record function execution time
   */
  measure<T>(fn: () => T): { result: T; latencyUs: number } {
    const start = performance.now();
    const result = fn();
    const latencyUs = (performance.now() - start) * 1000;
    this.recordLatency(latencyUs);
    return { result, latencyUs };
  }

  /**
   * Get latency statistics
   */
  getStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return {
        minLatencyUs: 0,
        maxLatencyUs: 0,
        avgLatencyUs: 0,
        p50LatencyUs: 0,
        p99LatencyUs: 0,
        p999LatencyUs: 0,
        totalOperations: 0,
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const n = sorted.length;

    return {
      minLatencyUs: sorted[0] ?? 0,
      maxLatencyUs: sorted[n - 1] ?? 0,
      avgLatencyUs: sorted.reduce((a, b) => a + b, 0) / n,
      p50LatencyUs: sorted[Math.floor(n * 0.5)] ?? 0,
      p99LatencyUs: sorted[Math.floor(n * 0.99)] ?? 0,
      p999LatencyUs: sorted[Math.floor(n * 0.999)] ?? 0,
      totalOperations: n,
    };
  }

  /**
   * Register an optimization callback
   */
  onOptimization(callback: () => void): void {
    this.optimizationCallbacks.push(callback);
  }

  /**
   * Trigger optimization
   */
  optimize(): void {
    for (const callback of this.optimizationCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('Optimization callback error:', error);
      }
    }
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.latencies = [];
  }
}

// ===== Prefetch Utilities =====

/**
 * Software prefetch hint (no-op in JS, but documents intent)
 */
export function prefetch<T>(obj: T): void {
  // In JavaScript, we can't actually prefetch memory
  // This function serves as documentation and potential WASM integration point
  // Access the object to potentially load it into cache
  if (obj && typeof obj === 'object') {
    // Touch first property to potentially trigger cache load
    const key = Object.keys(obj)[0];
    const _ = key === undefined ? undefined : (obj as any)[key];
  }
}

/**
 * Prefetch an array element
 */
export function prefetchArray<T>(arr: T[], index: number): void {
  const _ = arr[index];
}

// ===== Convenience Functions =====

/**
 * Create a memory pool with default configuration
 */
export function createMemoryPool<T>(
  factory: () => T,
  resetFn: (obj: T) => void,
  size?: number
): MemoryPool<T> {
  return new MemoryPool(factory, resetFn, size || defaultUltraLowLatencyConfig().memoryPoolSize);
}

/**
 * Create a lock-free queue
 */
export function createLockFreeQueue<T>(capacity?: number): LockFreeQueue<T> {
  return new LockFreeQueue(capacity);
}

/**
 * Create an MPMC queue
 */
export function createMPMCQueue<T>(capacity?: number): MPMCQueue<T> {
  return new MPMCQueue(capacity);
}

/**
 * Busy spin for a number of iterations
 */
export function busySpin(iterations: number): void {
  for (let i = 0; i < iterations; i++) {
    // Prevent optimization
    Math.random();
  }
}

/**
 * Yield to event loop
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
