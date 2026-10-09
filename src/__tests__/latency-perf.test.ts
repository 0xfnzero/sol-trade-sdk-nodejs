import { afterEach, describe, expect, it, vi } from 'vitest';
import { LatencyOptimizer, LockFreeQueue } from '../perf/ultra-low-latency';

afterEach(() => vi.useRealTimers());

describe('nonblocking queue and async arrival notification', () => {
  it('does not synchronously wait for a same-loop producer', async () => {
    const queue = new LockFreeQueue<number>();
    const wait = queue.dequeueWait(100_000);
    const producer = new Promise<void>(resolve => setImmediate(() => {
      expect(queue.enqueue(7)).toBe(true);
      resolve();
    }));
    expect(queue.dequeueSpin(20_000)).toBeUndefined();
    expect(await wait).toBe(7);
    await producer;
    expect(queue.size()).toBe(0);
  });

  it('serves consumers in FIFO order and removes timed-out or aborted waiters', async () => {
    vi.useFakeTimers();
    const queue = new LockFreeQueue<number>(8);
    const expired = queue.dequeueWait(1000);
    const aborted = new AbortController();
    const cancel = queue.dequeueWait(100_000, aborted.signal);
    const first = queue.dequeueWait(100_000);
    const second = queue.dequeueWait(100_000);
    aborted.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(await expired).toBeUndefined();
    expect(await cancel).toBeUndefined();
    queue.enqueue(11); queue.enqueue(12);
    expect(await first).toBe(11);
    expect(await second).toBe(12);
    expect(vi.getTimerCount()).toBe(0);
    queue.enqueue(13);
    expect(await queue.dequeueWait()).toBe(13);
  });

  it('clears pending waits, bounds consumers, and retains circular queue capacity', async () => {
    const queue = new LockFreeQueue<number>(2);
    const wait = queue.dequeueWait(100_000);
    await expect(queue.dequeueWait(100_000)).rejects.toThrow('Too many');
    queue.clear();
    expect(await wait).toBeUndefined();
    expect(queue.enqueue(1)).toBe(true);
    expect(queue.enqueue(2)).toBe(false);
    expect(queue.dequeue()).toBe(1);
    expect(queue.enqueue(2)).toBe(true);
    expect(queue.dequeue()).toBe(2);
    expect(await queue.dequeueWait(0)).toBeUndefined();
    await expect(queue.dequeueWait(-1)).rejects.toThrow(RangeError);
  });
});

function reference(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return {
    minLatencyUs: sorted[0] ?? 0, maxLatencyUs: sorted[n - 1] ?? 0,
    avgLatencyUs: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
    p50LatencyUs: sorted[Math.floor(n * .5)] ?? 0,
    p99LatencyUs: sorted[Math.floor(n * .99)] ?? 0,
    p999LatencyUs: sorted[Math.floor(n * .999)] ?? 0, totalOperations: n,
  };
}

describe('fixed latency window', () => {
  it('preserves exact window percentiles over wraps, duplicates and varied input order', () => {
    for (const size of [1, 2, 17, 101, 10000]) {
      const optimizer = new LatencyOptimizer(size);
      let window: number[] = [];
      for (let i = 0; i < size * 3 + 7; i++) {
        const value = ((i * 7919) % 1009) - 3;
        optimizer.recordLatency(value);
        window.push(value); window = window.slice(-size);
        if (i % Math.max(1, Math.floor(size / 10)) === 0) {
          expect(optimizer.getStats()).toEqual(reference(window));
        }
      }
      expect(optimizer.getStats()).toEqual(reference(window));
      optimizer.reset();
      expect(optimizer.getStats()).toEqual(reference([]));
      optimizer.recordLatency(5);
      expect(optimizer.getStats()).toEqual(reference([5]));
    }
  });

  it('keeps cached statistics isolated from callers and invalidates them on new measurements', () => {
    const optimizer = new LatencyOptimizer(3);
    for (const value of [1, 1, 1]) optimizer.recordLatency(value);
    const stats = optimizer.getStats(); stats.p50LatencyUs = 99;
    expect(optimizer.getStats()).toEqual(reference([1, 1, 1]));
    optimizer.recordLatency(8);
    expect(optimizer.getStats()).toEqual(reference([1, 1, 8]));
    for (const size of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => new LatencyOptimizer(size)).toThrow(RangeError);
    }
  });

  it('retains legacy non-finite input handling', () => {
    const optimizer = new LatencyOptimizer(3);
    for (const value of [10, Infinity, 20, NaN, 15]) optimizer.recordLatency(value);
    expect(optimizer.getStats()).toEqual(reference([20, NaN, 15]));
  });
});
