/**
 * High-Performance Pool and Concurrency Utilities for Sol Trade SDK
 */

// ===== Types =====

interface PoolStats {
  activeTasks: number;
  tasksCompleted: number;
  queueSize: number;
}

// ===== Worker Pool =====

/**
 * High-performance worker pool for parallel task execution.
 */
export class WorkerPool {
  private taskQueue: Array<() => Promise<any>> = [];
  private activeWorkers = 0;
  private tasksCompleted = 0;
  private maxWorkers: number;
  private maxQueueSize: number;
  private idleResolvers: Array<() => void> = [];

  constructor(workers: number = 4, maxQueueSize: number = 100) {
    this.maxWorkers = workers;
    this.maxQueueSize = maxQueueSize;
  }

  async submit<T>(task: () => Promise<T>): Promise<T> {
    if (this.taskQueue.length >= this.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push(async () => {
        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      });
      this.processQueue();
    });
  }

  async submitBatch<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map(task => this.submit(task)));
  }

  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const task = this.taskQueue.shift()!;
      this.activeWorkers++;

      try {
        await task();
      } finally {
        this.activeWorkers--;
        this.tasksCompleted++;
        this.processQueue();
      }
    }

    if (this.activeWorkers === 0 && this.taskQueue.length === 0) {
      this.idleResolvers.forEach(resolve => resolve());
      this.idleResolvers = [];
    }
  }

  async idle(): Promise<void> {
    if (this.activeWorkers === 0 && this.taskQueue.length === 0) {
      return;
    }
    return new Promise(resolve => {
      this.idleResolvers.push(resolve);
    });
  }

  getStats(): PoolStats {
    return {
      activeTasks: this.activeWorkers,
      tasksCompleted: this.tasksCompleted,
      queueSize: this.taskQueue.length,
    };
  }
}

// ===== Rate Limiter =====

/**
 * Token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: number;
  private lastUpdate: number;

  constructor(
    private rate: number,
    private burst: number = 10
  ) {
    this.tokens = burst;
    this.lastUpdate = Date.now();
  }

  allow(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Add tokens based on elapsed time
    this.tokens += elapsed * this.rate;
    if (this.tokens > this.burst) {
      this.tokens = this.burst;
    }

    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  async wait(): Promise<void> {
    while (!this.allow()) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

// ===== Multi Rate Limiter =====

/**
 * Rate limiter with multiple keys.
 */
export class MultiRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor(
    private rate: number,
    private burst: number = 10
  ) {}

  allow(key: string): boolean {
    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = new RateLimiter(this.rate, this.burst);
      this.limiters.set(key, limiter);
    }
    return limiter.allow();
  }

  async wait(key: string): Promise<void> {
    while (!this.allow(key)) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

// ===== Connection Pool =====

export interface Connection {
  close(): void;
  isAlive(): boolean;
}

/**
 * Generic connection pool with automatic management.
 */
export class ConnectionPool<T extends Connection> {
  private pool: T[] = [];
  private created = 0;
  private waiting = 0;

  constructor(
    private factory: () => T,
    private maxSize: number = 10,
    private timeout: number = 30000
  ) {}

  async get(): Promise<T> {
    if (this.pool.length > 0) {
      const conn = this.pool.pop()!;
      if (conn.isAlive()) {
        return conn;
      }
      this.created--;
      return this.create();
    }

    if (this.created < this.maxSize) {
      return this.create();
    }

    // Wait for available connection
    this.waiting++;
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.timeout) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (this.pool.length > 0) {
        const conn = this.pool.pop()!;
        if (conn.isAlive()) {
          this.waiting--;
          return conn;
        }
        this.created--;
      }
    }

    this.waiting--;
    throw new Error('Connection timeout');
  }

  release(conn: T): void {
    if (!conn.isAlive()) {
      this.created--;
      return;
    }

    if (this.pool.length < this.maxSize) {
      this.pool.push(conn);
    } else {
      conn.close();
      this.created--;
    }
  }

  private create(): T {
    const conn = this.factory();
    this.created++;
    return conn;
  }

  closeAll(): void {
    for (const conn of this.pool) {
      conn.close();
    }
    this.pool = [];
    this.created = 0;
  }

  getStats(): { created: number; available: number; waiting: number } {
    return {
      created: this.created,
      available: this.pool.length,
      waiting: this.waiting,
    };
  }
}

// ===== Object Pool =====

/**
 * Generic object pool for reusing expensive objects.
 */
export class ObjectPool<T> {
  private pool: T[] = [];

  constructor(
    private factory: () => T,
    private resetFunc?: (obj: T) => void,
    private maxSize: number = 100
  ) {}

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.resetFunc) {
      this.resetFunc(obj);
    }
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  with<R>(fn: (obj: T) => R): R {
    const obj = this.acquire();
    try {
      return fn(obj);
    } finally {
      this.release(obj);
    }
  }
}
