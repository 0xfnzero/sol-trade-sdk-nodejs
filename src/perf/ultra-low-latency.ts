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
  /** Compatibility setting; in-process queues never busy-spin the event loop. */
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
    enableBusySpin: false,
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
 * In-process circular queue. Calls are serialized by the JS event loop;
 * this object is not a shared-memory queue between worker threads.
 */
export class LockFreeQueue<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private mask: number;
  private head: number = 0; // Write position
  private tail: number = 0; // Read position
  private waiters = new Set<{ finish: (item: T | undefined) => void }>();

  constructor(capacity: number = 4096, _config?: UltraLowLatencyConfig) {
    if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 0x40000000) {
      throw new RangeError('capacity must be an integer between 2 and 2^30');
    }
    // Round up to power of 2
    this.capacity = Math.pow(2, Math.ceil(Math.log2(capacity)));
    this.mask = this.capacity - 1;
    this.buffer = new Array(this.capacity).fill(undefined);
  }

  /**
   * Enqueue an item (producer only)
   */
  enqueue(item: T): boolean {
    if (this.waiters.size > 0) {
      const waiter = this.waiters.values().next().value!;
      waiter.finish(item);
      return true;
    }
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
   * Compatibility alias for a nonblocking dequeue. JS producers cannot progress
   * while this thread spins. Use dequeueWait when waiting for future arrivals.
   * @deprecated Use dequeue() or dequeueWait(timeoutUs).
   */
  dequeueSpin(_timeoutUs: number = 1000): T | undefined {
    return this.dequeue();
  }

  /** Wait without blocking the producer. Resolves undefined on timeout/abort/clear.
   * Timers use the runtime's millisecond resolution, not a microsecond deadline.
   * Pending consumers are bounded by queue capacity and served in FIFO order.
   */
  dequeueWait(timeoutUs: number = 1000, signal?: AbortSignal): Promise<T | undefined> {
    if (!Number.isFinite(timeoutUs) || timeoutUs < 0) {
      return Promise.reject(new RangeError('timeoutUs must be finite and nonnegative'));
    }
    if (signal?.aborted) return Promise.resolve(undefined);
    const item = this.dequeue();
    if (item !== undefined || timeoutUs === 0) return Promise.resolve(item);
    if (this.waiters.size >= this.capacity - 1) {
      return Promise.reject(new Error('Too many pending queue consumers'));
    }
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = { finish: (value: T | undefined) => {
        if (!this.waiters.delete(waiter)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(value);
      } };
      const abort = () => waiter.finish(undefined);
      this.waiters.add(waiter);
      signal?.addEventListener('abort', abort, { once: true });
      // The timer's maximum delay is a signed 32-bit millisecond value.
      timer = setTimeout(abort, Math.min(2_147_483_647, Math.max(1, Math.ceil(timeoutUs / 1000))));
    });
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
    for (const waiter of this.waiters) waiter.finish(undefined);
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
  private latencies: Float64Array;
  private count = 0;
  private nextSample = 0;
  private cachedStats?: LatencyStats;
  private maxSamples: number;
  private config: UltraLowLatencyConfig;
  private optimizationCallbacks: Array<() => void> = [];

  constructor(maxSamples: number = 10000, config?: UltraLowLatencyConfig) {
    if (!Number.isSafeInteger(maxSamples) || maxSamples <= 0) {
      throw new RangeError('maxSamples must be a positive safe integer');
    }
    this.maxSamples = maxSamples;
    this.latencies = new Float64Array(maxSamples);
    this.config = config || defaultUltraLowLatencyConfig();
  }

  /**
   * Record a latency measurement
   */
  recordLatency(latencyUs: number): void {
    this.latencies[this.nextSample] = latencyUs;
    this.nextSample = (this.nextSample + 1) % this.maxSamples;
    if (this.count < this.maxSamples) this.count++;
    this.cachedStats = undefined;
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
   * Compute exact window statistics on demand, outside the trading callback.
   * Recording is O(1); unchanged-window reads reuse the previous result.
   */
  getStats(): LatencyStats {
    if (this.cachedStats) return { ...this.cachedStats };
    if (this.count === 0) {
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

    const n = this.count;
    const values = this.latencies.slice(0, n);
    let min = Infinity, max = -Infinity, sum = 0, finite = true;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      finite &&= Number.isFinite(value);
    }
    // Preserve the previous comparator behavior for unusual non-finite inputs.
    // Ordinary measurements use selection rather than sorting the entire window.
    let fallback: number[] | undefined;
    if (!finite) {
      const ordered = this.count === this.maxSamples
        ? [...this.latencies.subarray(this.nextSample), ...this.latencies.subarray(0, this.nextSample)]
        : [...values];
      fallback = ordered.sort((a, b) => a - b);
      min = fallback[0]!;
      max = fallback[n - 1]!;
    }
    const quantile = (index: number) => fallback ? fallback[index]! : selectQuantile(values, index);
    this.cachedStats = {
      minLatencyUs: min,
      maxLatencyUs: max,
      avgLatencyUs: sum / n,
      p50LatencyUs: quantile(Math.floor(n * 0.5)),
      p99LatencyUs: quantile(Math.floor(n * 0.99)),
      p999LatencyUs: quantile(Math.floor(n * 0.999)),
      totalOperations: n,
    };
    return { ...this.cachedStats };
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
    this.count = 0;
    this.nextSample = 0;
    this.cachedStats = undefined;
  }
}

/** Iterative selection with a bounded partition budget and numeric-sort fallback. */
function selectQuantile(values: Float64Array, index: number): number {
  let left = 0, right = values.length - 1;
  let budget = 2 * Math.ceil(Math.log2(values.length + 1));
  while (left < right) {
    if (--budget < 0) {
      values.subarray(left, right + 1).sort();
      return values[index]!;
    }
    const middle = left + ((right - left) >> 1);
    const a = values[left]!, b = values[middle]!, c = values[right]!;
    const pivot = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    let i = left, j = right;
    while (i <= j) {
      while (values[i]! < pivot) i++;
      while (values[j]! > pivot) j--;
      if (i <= j) {
        const tmp = values[i]!; values[i] = values[j]!; values[j] = tmp;
        i++; j--;
      }
    }
    if (index <= j) right = j;
    else if (index >= i) left = i;
    else return values[index]!;
  }
  return values[index]!;
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
