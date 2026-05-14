/**
 * Fast timing utilities for Sol Trade SDK
 * Provides high-precision timing functions and latency measurement tools.
 */

import { PerformanceObserver } from 'perf_hooks';
import type { PerformanceEntry } from 'perf_hooks';

// ===== Time Unit Conversion Functions =====

const NS_PER_MS = BigInt(1_000_000);
const NS_PER_US = BigInt(1_000);

/**
 * Get current timestamp in nanoseconds
 * Uses process.hrtime.bigint() in Node.js, falls back to Date.now() * 1_000_000
 */
export function nowNs(): bigint {
  if (typeof process !== 'undefined' && process.hrtime) {
    return process.hrtime.bigint();
  }
  return BigInt(Date.now()) * NS_PER_MS;
}

/**
 * Get current timestamp in microseconds
 */
export function nowUs(): bigint {
  if (typeof process !== 'undefined' && process.hrtime) {
    return process.hrtime.bigint() / NS_PER_US;
  }
  return BigInt(Date.now()) * BigInt(1_000);
}

/**
 * Get current timestamp in milliseconds
 */
export function nowMs(): number {
  return Date.now();
}

// ===== Timer Class =====

/**
 * High-precision timer for measuring elapsed time
 */
export class Timer {
  private startTime: bigint;
  private endTime?: bigint;
  private running: boolean = true;

  constructor() {
    this.startTime = nowNs();
  }

  /**
   * Start or restart the timer
   */
  start(): void {
    this.startTime = nowNs();
    this.running = true;
    this.endTime = undefined;
  }

  /**
   * Stop the timer and return elapsed time in nanoseconds
   */
  stop(): bigint {
    if (this.running) {
      this.endTime = nowNs();
      this.running = false;
    }
    return this.elapsedNs();
  }

  /**
   * Get elapsed time in nanoseconds without stopping
   */
  elapsedNs(): bigint {
    const end = this.running ? nowNs() : this.endTime!;
    return end - this.startTime;
  }

  /**
   * Get elapsed time in microseconds without stopping
   */
  elapsedUs(): bigint {
    return this.elapsedNs() / NS_PER_US;
  }

  /**
   * Get elapsed time in milliseconds without stopping
   */
  elapsedMs(): number {
    return Number(this.elapsedNs()) / 1_000_000;
  }

  /**
   * Check if timer is still running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = nowNs();
    this.endTime = undefined;
    this.running = true;
  }
}

// ===== Timing Context =====

/**
 * Timing context for tracking multiple timing points
 */
export interface TimingPoint {
  name: string;
  timestamp: bigint;
  elapsedFromStart: bigint;
  elapsedFromPrevious: bigint;
}

/**
 * Context for collecting timing measurements
 */
export class TimingContext {
  private points: TimingPoint[] = [];
  private startTime: bigint;
  private lastTime: bigint;
  private name: string;

  constructor(name: string = 'default') {
    this.name = name;
    this.startTime = nowNs();
    this.lastTime = this.startTime;
  }

  /**
   * Mark a timing point
   */
  mark(pointName: string): void {
    const now = nowNs();
    this.points.push({
      name: pointName,
      timestamp: now,
      elapsedFromStart: now - this.startTime,
      elapsedFromPrevious: now - this.lastTime,
    });
    this.lastTime = now;
  }

  /**
   * Get all timing points
   */
  getPoints(): TimingPoint[] {
    return [...this.points];
  }

  /**
   * Get total elapsed time in nanoseconds
   */
  totalElapsedNs(): bigint {
    return nowNs() - this.startTime;
  }

  /**
   * Get total elapsed time in microseconds
   */
  totalElapsedUs(): bigint {
    return this.totalElapsedNs() / NS_PER_US;
  }

  /**
   * Get total elapsed time in milliseconds
   */
  totalElapsedMs(): number {
    return Number(this.totalElapsedNs()) / 1_000_000;
  }

  /**
   * Get timing report as a formatted string
   */
  getReport(): string {
    const lines: string[] = [`Timing Report: ${this.name}`];
    lines.push('='.repeat(50));

    for (const point of this.points) {
      lines.push(
        `${point.name.padEnd(30)}: ${this.formatNs(point.elapsedFromStart)} (Δ ${this.formatNs(point.elapsedFromPrevious)})`
      );
    }

    lines.push('-'.repeat(50));
    lines.push(`Total: ${this.formatNs(this.totalElapsedNs())}`);

    return lines.join('\n');
  }

  /**
   * Reset the context
   */
  reset(): void {
    this.points = [];
    this.startTime = nowNs();
    this.lastTime = this.startTime;
  }

  /**
   * Format nanoseconds to human-readable string
   */
  private formatNs(ns: bigint): string {
    if (ns >= NS_PER_MS) {
      return `${(Number(ns) / 1_000_000).toFixed(2)}ms`;
    }
    if (ns >= NS_PER_US) {
      return `${(Number(ns) / 1_000).toFixed(2)}µs`;
    }
    return `${ns}ns`;
  }
}

// ===== Latency Histogram =====

/**
 * Bucket boundaries for latency histogram (in microseconds)
 */
const DEFAULT_BUCKETS = [
  10,      // 10µs
  50,      // 50µs
  100,     // 100µs
  250,     // 250µs
  500,     // 500µs
  1000,    // 1ms
  2500,    // 2.5ms
  5000,    // 5ms
  10000,   // 10ms
  25000,   // 25ms
  50000,   // 50ms
  100000,  // 100ms
  250000,  // 250ms
  500000,  // 500ms
  1000000, // 1s
];

/**
 * Histogram entry
 */
export interface HistogramEntry {
  bucket: number;
  count: number;
  cumulativeCount: number;
}

/**
 * Latency histogram for tracking operation latencies
 */
export class LatencyHistogram {
  private buckets: number[];
  private counts: number[];
  private totalCount: number = 0;
  private sum: bigint = BigInt(0);
  private min: bigint = BigInt(Number.MAX_SAFE_INTEGER);
  private max: bigint = BigInt(0);

  constructor(buckets: number[] = DEFAULT_BUCKETS) {
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length + 1).fill(0);
  }

  /**
   * Record a latency measurement in microseconds
   */
  record(latencyUs: number | bigint): void {
    const latency = typeof latencyUs === 'bigint' ? latencyUs : BigInt(latencyUs);

    this.totalCount++;
    this.sum += latency;

    if (latency < this.min) {
      this.min = latency;
    }
    if (latency > this.max) {
      this.max = latency;
    }

    // Find bucket
    const bucketIndex = this.buckets.findIndex(b => latency <= BigInt(b));
    const index = bucketIndex === -1 ? this.buckets.length : bucketIndex;
    if (index >= 0 && index < this.counts.length) {
      this.counts[index]!++;
    }
  }

  /**
   * Record from a Timer instance
   */
  recordTimer(timer: Timer): void {
    this.record(timer.elapsedUs());
  }

  /**
   * Get histogram entries with cumulative counts
   */
  getHistogram(): HistogramEntry[] {
    let cumulative = 0;
    const entries: HistogramEntry[] = [];

    for (let i = 0; i < this.buckets.length; i++) {
      const count = this.counts[i] ?? 0;
      cumulative += count;
      entries.push({
        bucket: this.buckets[i] ?? 0,
        count: count,
        cumulativeCount: cumulative,
      });
    }

    // Add overflow bucket
    const overflowCount = this.counts[this.buckets.length] ?? 0;
    cumulative += overflowCount;
    entries.push({
      bucket: Infinity,
      count: overflowCount,
      cumulativeCount: cumulative,
    });

    return entries;
  }

  /**
   * Get percentile latency in microseconds
   */
  getPercentile(percentile: number): number {
    if (this.totalCount === 0) {
      return 0;
    }

    const targetCount = Math.ceil((percentile / 100) * this.totalCount);
    let cumulative = 0;

    for (let i = 0; i < this.buckets.length; i++) {
      const count = this.counts[i] ?? 0;
      cumulative += count;
      if (cumulative >= targetCount) {
        return this.buckets[i] ?? 0;
      }
    }

    return Infinity;
  }

  /**
   * Get statistics
   */
  getStats(): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    return {
      count: this.totalCount,
      min: this.totalCount > 0 ? Number(this.min) : 0,
      max: this.totalCount > 0 ? Number(this.max) : 0,
      mean: this.totalCount > 0 ? Number(this.sum) / this.totalCount : 0,
      p50: this.getPercentile(50),
      p90: this.getPercentile(90),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
    };
  }

  /**
   * Reset the histogram
   */
  reset(): void {
    this.counts = new Array(this.buckets.length + 1).fill(0);
    this.totalCount = 0;
    this.sum = BigInt(0);
    this.min = BigInt(Number.MAX_SAFE_INTEGER);
    this.max = BigInt(0);
  }

  /**
   * Get a formatted report
   */
  getReport(): string {
    const stats = this.getStats();
    const lines: string[] = [
      'Latency Histogram Report',
      '='.repeat(50),
      `Count: ${stats.count}`,
      `Min: ${this.formatUs(stats.min)}`,
      `Max: ${this.formatUs(stats.max)}`,
      `Mean: ${this.formatUs(stats.mean)}`,
      `P50: ${this.formatUs(stats.p50)}`,
      `P90: ${this.formatUs(stats.p90)}`,
      `P95: ${this.formatUs(stats.p95)}`,
      `P99: ${this.formatUs(stats.p99)}`,
      '-'.repeat(50),
      'Histogram:',
    ];

    const histogram = this.getHistogram();
    for (const entry of histogram) {
      const percentage = ((entry.cumulativeCount / this.totalCount) * 100).toFixed(1);
      const bucketLabel = entry.bucket === Infinity ? '+Inf' : `≤${this.formatUs(entry.bucket)}`;
      lines.push(`${bucketLabel.padEnd(12)}: ${entry.count.toString().padStart(6)} (${percentage}%)`);
    }

    return lines.join('\n');
  }

  private formatUs(us: number): string {
    if (us >= 1000) {
      return `${(us / 1000).toFixed(2)}ms`;
    }
    return `${Math.round(us)}µs`;
  }
}

// ===== Convenience Functions =====

/**
 * Time a function execution and return result with timing
 */
export async function timeAsync<T>(
  fn: () => Promise<T>,
  _name: string = 'operation'
): Promise<{ result: T; elapsedUs: bigint; elapsedMs: number }> {
  const timer = new Timer();
  const result = await fn();
  const elapsedUs = timer.elapsedUs();
  return {
    result,
    elapsedUs,
    elapsedMs: Number(elapsedUs) / 1000,
  };
}

/**
 * Time a synchronous function execution
 */
export function timeSync<T>(
  fn: () => T,
  _name: string = 'operation'
): { result: T; elapsedUs: bigint; elapsedMs: number } {
  const timer = new Timer();
  const result = fn();
  const elapsedUs = timer.elapsedUs();
  return {
    result,
    elapsedUs,
    elapsedMs: Number(elapsedUs) / 1000,
  };
}

/**
 * Create a performance observer for monitoring
 */
export function createPerformanceObserver(
  callback: (entry: PerformanceEntry) => void
): PerformanceObserver | null {
  if (typeof PerformanceObserver !== 'undefined') {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        callback(entry);
      }
    });
    return observer;
  }
  return null;
}
