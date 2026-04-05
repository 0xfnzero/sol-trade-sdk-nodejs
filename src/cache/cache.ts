/**
 * High-Performance Cache Implementation for Sol Trade SDK
 * Provides LRU, TTL, and sharded caches for optimal performance.
 */

// ===== Types =====

interface CacheEntry<V> {
  value: V;
  expiration: number;
  accessCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

// ===== LRU Cache =====

/**
 * Thread-safe LRU cache with TTL support.
 * O(1) get and set operations.
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number;
  private ttl: number;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize: number = 1000, ttl: number = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl; // milliseconds
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiration) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    entry.accessCount++;
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V): void {
    const expiration = Date.now() + this.ttl;

    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.expiration = expiration;
      this.cache.delete(key);
      this.cache.set(key, entry);
    } else {
      this.cache.set(key, {
        value,
        expiration,
        accessCount: 0,
      });

      // Evict if over capacity
      while (this.cache.size > this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
        this.evictions++;
      }
    }
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  cleanup(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiration) {
        this.cache.delete(key);
        this.evictions++;
        removed++;
      }
    }
    return removed;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ===== TTL Cache =====

/**
 * Simple TTL cache with fast reads.
 */
export class TTLCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private ttl: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(ttl: number = 300000) {
    this.ttl = ttl;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiration) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      expiration: Date.now() + this.ttl,
      accessCount: 0,
    });
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  cleanup(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiration) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: 0,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ===== Sharded Cache =====

/**
 * Sharded cache for high concurrency scenarios.
 * Distributes keys across multiple shards to reduce lock contention.
 */
export class ShardedCache<K, V> {
  private shards: LRUCache<K, V>[];
  private shardMask: number;

  constructor(shards: number = 16, maxSizePerShard: number = 1000, ttl: number = 300000) {
    this.shards = [];
    for (let i = 0; i < shards; i++) {
      this.shards.push(new LRUCache<K, V>(maxSizePerShard, ttl));
    }
    this.shardMask = shards - 1;
  }

  private getShard(key: K): LRUCache<K, V> {
    // Simple hash
    const hash = this.hashKey(key);
    return this.shards[hash & this.shardMask];
  }

  private hashKey(key: K): number {
    const str = String(key);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  get(key: K): V | undefined {
    return this.getShard(key).get(key);
  }

  set(key: K, value: V): void {
    this.getShard(key).set(key, value);
  }

  delete(key: K): boolean {
    return this.getShard(key).delete(key);
  }

  clear(): void {
    for (const shard of this.shards) {
      shard.clear();
    }
  }

  getStats(): CacheStats {
    let totalHits = 0;
    let totalMisses = 0;
    let totalEvictions = 0;
    let totalSize = 0;

    for (const shard of this.shards) {
      const stats = shard.getStats();
      totalHits += stats.hits;
      totalMisses += stats.misses;
      totalEvictions += stats.evictions;
      totalSize += stats.size;
    }

    const total = totalHits + totalMisses;
    return {
      hits: totalHits,
      misses: totalMisses,
      evictions: totalEvictions,
      size: totalSize,
      hitRate: total > 0 ? totalHits / total : 0,
    };
  }
}

// ===== Function Cache Decorator =====

/**
 * Decorator for caching function results.
 */
export function cached<K extends any[], R>(
  cache: LRUCache<string, R> | TTLCache<string, R>,
  keyFn?: (...args: K) => string
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: K) => R>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = function (this: any, ...args: K): R {
      const key = keyFn ? keyFn(...args) : `${propertyKey}:${JSON.stringify(args)}`;
      
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = originalMethod.apply(this, args);
      cache.set(key, result);
      return result;
    };

    return descriptor;
  };
}

// ===== Pre-configured Global Caches =====

export const blockhashCache = new TTLCache<string, string>(2000); // 2 seconds
export const accountCache = new ShardedCache<string, Buffer>(16, 500, 10000); // 10 seconds
export const priceCache = new TTLCache<string, number>(1000); // 1 second
