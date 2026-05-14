/**
 * Realtime Tuning Module for Sol Trade SDK
 * Provides realtime configuration, thread priority, and performance tuning.
 */

// ===== Types =====

/**
 * Realtime configuration
 */
export interface RealtimeConfig {
  /** Enable realtime mode */
  enableRealtime: boolean;
  /** Target latency in microseconds */
  targetLatencyUs: number;
  /** CPU core for pinning */
  cpuCore: number;
  /** Thread priority level */
  priority: ThreadPriorityLevel;
  /** Enable busy waiting */
  busyWait: boolean;
  /** Scheduler policy */
  scheduler: SchedulerPolicy;
  /** Memory lock */
  lockMemory: boolean;
}

/**
 * Thread priority levels
 */
export enum ThreadPriorityLevel {
  Idle = 0,
  Lowest = 1,
  Low = 2,
  Normal = 3,
  High = 4,
  Highest = 5,
  Realtime = 6,
}

/**
 * Scheduler policies
 */
export enum SchedulerPolicy {
  /** Normal scheduler */
  Normal = 'normal',
  /** FIFO scheduler */
  FIFO = 'fifo',
  /** Round-robin scheduler */
  RoundRobin = 'rr',
  /** Batch scheduler */
  Batch = 'batch',
  /** Idle scheduler */
  Idle = 'idle',
}

/**
 * Default realtime configuration
 */
export function defaultRealtimeConfig(): RealtimeConfig {
  return {
    enableRealtime: false,
    targetLatencyUs: 100, // 100 microseconds
    cpuCore: -1, // No pinning
    priority: ThreadPriorityLevel.High,
    busyWait: false,
    scheduler: SchedulerPolicy.Normal,
    lockMemory: false,
  };
}

/**
 * Tuning statistics
 */
export interface TuningStats {
  adjustments: number;
  averageLatencyUs: number;
  minLatencyUs: number;
  maxLatencyUs: number;
  violations: number;
  lastAdjustmentTime: number;
}

// ===== Thread Priority =====

/**
 * Thread priority manager for realtime performance.
 * Controls execution priority of trading threads.
 */
export class ThreadPriority {
  private currentPriority: ThreadPriorityLevel = ThreadPriorityLevel.Normal;
  private config: RealtimeConfig;

  constructor(config: RealtimeConfig = defaultRealtimeConfig()) {
    this.config = config;
  }

  /**
   * Set thread priority
   */
  setPriority(priority: ThreadPriorityLevel): boolean {
    // In Node.js, we can't directly set thread priority
    // This is a placeholder for potential native addon integration
    this.currentPriority = priority;

    // Log the priority change
    if (this.config.enableRealtime) {
      console.log(`Thread priority set to: ${ThreadPriorityLevel[priority]}`);
    }

    return true;
  }

  /**
   * Get current priority
   */
  getPriority(): ThreadPriorityLevel {
    return this.currentPriority;
  }

  /**
   * Increase priority by one level
   */
  increasePriority(): boolean {
    if (this.currentPriority < ThreadPriorityLevel.Realtime) {
      return this.setPriority(this.currentPriority + 1);
    }
    return false;
  }

  /**
   * Decrease priority by one level
   */
  decreasePriority(): boolean {
    if (this.currentPriority > ThreadPriorityLevel.Idle) {
      return this.setPriority(this.currentPriority - 1);
    }
    return false;
  }

  /**
   * Set realtime priority
   */
  setRealtime(): boolean {
    return this.setPriority(ThreadPriorityLevel.Realtime);
  }

  /**
   * Set normal priority
   */
  setNormal(): boolean {
    return this.setPriority(ThreadPriorityLevel.Normal);
  }

  /**
   * Check if running at realtime priority
   */
  isRealtime(): boolean {
    return this.currentPriority === ThreadPriorityLevel.Realtime;
  }
}

// ===== Realtime Tuner =====

/**
 * Realtime performance tuner for trading systems.
 * Automatically adjusts system parameters for optimal latency.
 */
export class RealtimeTuner {
  private config: RealtimeConfig;
  private running: boolean = false;
  private tunerInterval: NodeJS.Timeout | null = null;
  private latencies: number[] = [];
  private stats: TuningStats;
  private callbacks: Array<(stats: TuningStats) => void> = [];
  private lastAdjustment: number = 0;
  private adjustmentCooldownMs: number = 1000;

  constructor(config: RealtimeConfig = defaultRealtimeConfig()) {
    this.config = config;
    this.stats = {
      adjustments: 0,
      averageLatencyUs: 0,
      minLatencyUs: Infinity,
      maxLatencyUs: 0,
      violations: 0,
      lastAdjustmentTime: 0,
    };
  }

  /**
   * Start the realtime tuner
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Apply initial configuration
    this.applyConfiguration();

    // Start monitoring loop
    this.tunerInterval = setInterval(() => {
      this.tune();
    }, 100); // 100ms tuning interval

    console.log('Realtime tuner started');
  }

  /**
   * Stop the realtime tuner
   */
  stop(): void {
    this.running = false;

    if (this.tunerInterval) {
      clearInterval(this.tunerInterval);
      this.tunerInterval = null;
    }

    console.log('Realtime tuner stopped');
  }

  /**
   * Record a latency measurement
   */
  recordLatency(latencyUs: number): void {
    this.latencies.push(latencyUs);

    // Keep last 1000 measurements
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }

    // Check for violation
    if (latencyUs > this.config.targetLatencyUs) {
      this.stats.violations++;
    }

    // Update stats
    this.stats.minLatencyUs = Math.min(this.stats.minLatencyUs, latencyUs);
    this.stats.maxLatencyUs = Math.max(this.stats.maxLatencyUs, latencyUs);
  }

  /**
   * Get current tuning statistics
   */
  getStats(): TuningStats {
    if (this.latencies.length > 0) {
      this.stats.averageLatencyUs =
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    }
    return { ...this.stats };
  }

  /**
   * Register a callback for tuning events
   */
  onTune(callback: (stats: TuningStats) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.latencies = [];
    this.stats = {
      adjustments: 0,
      averageLatencyUs: 0,
      minLatencyUs: Infinity,
      maxLatencyUs: 0,
      violations: 0,
      lastAdjustmentTime: 0,
    };
  }

  private applyConfiguration(): void {
    // Set thread priority
    const priority = new ThreadPriority(this.config);
    priority.setPriority(this.config.priority);

    // Log configuration
    console.log('Realtime configuration applied:', {
      targetLatencyUs: this.config.targetLatencyUs,
      cpuCore: this.config.cpuCore,
      priority: ThreadPriorityLevel[this.config.priority],
      busyWait: this.config.busyWait,
    });
  }

  private tune(): void {
    if (!this.running) return;

    const now = Date.now();
    if (now - this.lastAdjustment < this.adjustmentCooldownMs) {
      return;
    }

    // Calculate current average latency
    if (this.latencies.length === 0) return;

    const avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    this.stats.averageLatencyUs = avgLatency;

    // Check if tuning is needed
    const violationRate = this.stats.violations / this.latencies.length;

    if (violationRate > 0.1) {
      // More than 10% violations, need adjustment
      this.adjustForLowerLatency();
      this.stats.adjustments++;
      this.stats.lastAdjustmentTime = now;
      this.lastAdjustment = now;
    }

    // Notify callbacks
    for (const callback of this.callbacks) {
      try {
        callback(this.getStats());
      } catch (error) {
        console.error('Tuning callback error:', error);
      }
    }
  }

  private adjustForLowerLatency(): void {
    // In a real implementation, this would adjust:
    // - CPU frequency governor
    // - Process priority
    // - Memory allocation strategy
    // - Network interrupt coalescing
    // - etc.

    console.log('Adjusting for lower latency...');
  }
}

// ===== Busy Wait Utilities =====

/**
 * Busy wait for a precise amount of time.
 * More accurate than setTimeout for short durations.
 */
export function busyWait(microseconds: number): void {
  const start = process.hrtime.bigint();
  const target = start + BigInt(microseconds) * BigInt(1000);

  while (process.hrtime.bigint() < target) {
    // Busy wait
  }
}

/**
 * Spin lock with timeout
 */
export function spinLock(condition: () => boolean, timeoutUs: number): boolean {
  const start = process.hrtime.bigint();
  const timeoutNs = BigInt(timeoutUs) * BigInt(1000);

  while (!condition()) {
    if (process.hrtime.bigint() - start > timeoutNs) {
      return false; // Timeout
    }
  }

  return true;
}

// ===== Latency Monitor =====

/**
 * Latency monitoring for realtime systems
 */
export class LatencyMonitor {
  private measurements: number[] = [];
  private maxMeasurements: number;
  private histogram: Map<number, number> = new Map();
  private bucketSize: number;

  constructor(maxMeasurements: number = 10000, bucketSize: number = 10) {
    this.maxMeasurements = maxMeasurements;
    this.bucketSize = bucketSize;
  }

  /**
   * Record a latency measurement
   */
  record(latencyUs: number): void {
    this.measurements.push(latencyUs);

    if (this.measurements.length > this.maxMeasurements) {
      this.measurements.shift();
    }

    // Update histogram
    const bucket = Math.floor(latencyUs / this.bucketSize) * this.bucketSize;
    const count = this.histogram.get(bucket) || 0;
    this.histogram.set(bucket, count + 1);
  }

  /**
   * Get percentile latency
   */
  getPercentile(percentile: number): number {
    if (this.measurements.length === 0) return 0;

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)] ?? 0;
  }

  /**
   * Get average latency
   */
  getAverage(): number {
    if (this.measurements.length === 0) return 0;
    return this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
  }

  /**
   * Get minimum latency
   */
  getMin(): number {
    if (this.measurements.length === 0) return 0;
    return Math.min(...this.measurements);
  }

  /**
   * Get maximum latency
   */
  getMax(): number {
    if (this.measurements.length === 0) return 0;
    return Math.max(...this.measurements);
  }

  /**
   * Get histogram
   */
  getHistogram(): Map<number, number> {
    return new Map(this.histogram);
  }

  /**
   * Reset all measurements
   */
  reset(): void {
    this.measurements = [];
    this.histogram.clear();
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    p999: number;
  } {
    return {
      count: this.measurements.length,
      min: this.getMin(),
      max: this.getMax(),
      avg: this.getAverage(),
      p50: this.getPercentile(50),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
      p999: this.getPercentile(99.9),
    };
  }
}

// ===== Performance Governor =====

/**
 * Performance governor for trading systems
 */
export class PerformanceGovernor {
  private targetThroughput: number = 0;
  private currentThroughput: number = 0;
  private adjustments: number = 0;

  /**
   * Set target throughput (operations per second)
   */
  setTargetThroughput(opsPerSecond: number): void {
    this.targetThroughput = opsPerSecond;
  }

  /**
   * Report actual throughput
   */
  reportThroughput(opsPerSecond: number): void {
    this.currentThroughput = opsPerSecond;
  }

  /**
   * Get recommended batch size
   */
  getRecommendedBatchSize(): number {
    if (this.targetThroughput === 0) return 1;

    const ratio = this.currentThroughput / this.targetThroughput;

    if (ratio < 0.5) {
      return 1; // Underperforming, reduce batch size
    } else if (ratio > 1.5) {
      return 10; // Overperforming, increase batch size
    }

    return 5; // Optimal range
  }

  /**
   * Get adjustment count
   */
  getAdjustments(): number {
    return this.adjustments;
  }
}

// ===== Convenience Functions =====

/**
 * Create a realtime tuner
 */
export function createRealtimeTuner(config?: Partial<RealtimeConfig>): RealtimeTuner {
  const fullConfig = { ...defaultRealtimeConfig(), ...config };
  return new RealtimeTuner(fullConfig);
}

/**
 * Create a thread priority manager
 */
export function createThreadPriority(config?: Partial<RealtimeConfig>): ThreadPriority {
  const fullConfig = { ...defaultRealtimeConfig(), ...config };
  return new ThreadPriority(fullConfig);
}

/**
 * Create a latency monitor
 */
export function createLatencyMonitor(
  maxMeasurements?: number,
  bucketSize?: number
): LatencyMonitor {
  return new LatencyMonitor(maxMeasurements, bucketSize);
}

/**
 * Create a performance governor
 */
export function createPerformanceGovernor(): PerformanceGovernor {
  return new PerformanceGovernor();
}

/**
 * Measure function execution time
 */
export function measureTime<T>(fn: () => T): { result: T; elapsedUs: number } {
  const start = process.hrtime.bigint();
  const result = fn();
  const elapsed = Number(process.hrtime.bigint() - start) / 1000; // Convert to microseconds
  return { result, elapsedUs: elapsed };
}

/**
 * Create a high-resolution timer
 */
export function createTimer(): {
  start: () => void;
  elapsed: () => number;
  reset: () => void;
} {
  let startTime: bigint = BigInt(0);

  return {
    start: () => {
      startTime = process.hrtime.bigint();
    },
    elapsed: () => {
      return Number(process.hrtime.bigint() - startTime) / 1000; // microseconds
    },
    reset: () => {
      startTime = process.hrtime.bigint();
    },
  };
}
