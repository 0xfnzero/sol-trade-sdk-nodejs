/**
 * Compute Budget Manager - Caching compute budget instructions.
 * Based on sol-trade-sdk Rust implementation patterns.
 */

// ===== Constants =====

/**
 * ComputeBudgetProgram is the Solana compute budget program ID
 */
export const COMPUTE_BUDGET_PROGRAM = new Uint8Array([
  0x43, 0x6f, 0x6d, 0x70, 0x75, 0x74, 0x65, 0x42, 0x75, 0x64, 0x67, 0x65,
  0x74, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31,
  0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31,
]);

/**
 * Instruction discriminators
 */
export const SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR = new Uint8Array([
  0x02, 0x00, 0x00, 0x00,
]);
export const SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR = new Uint8Array([
  0x00, 0x00, 0x00, 0x00,
]);

// ===== Cache Key =====

/**
 * Cache key for compute budget instructions
 */
interface ComputeBudgetCacheKey {
  unitPrice: bigint;
  unitLimit: number;
}

function cacheKeyToString(key: ComputeBudgetCacheKey): string {
  return `${key.unitPrice}:${key.unitLimit}`;
}

// ===== Cache =====

/**
 * Stores compute budget instructions.
 * Uses Map for high-performance access.
 */
class ComputeBudgetCache {
  private cache = new Map<string, Uint8Array[]>();

  get(key: ComputeBudgetCacheKey): Uint8Array[] | undefined {
    return this.cache.get(cacheKeyToString(key));
  }

  set(key: ComputeBudgetCacheKey, value: Uint8Array[]): void {
    this.cache.set(cacheKeyToString(key), value);
  }

  has(key: ComputeBudgetCacheKey): boolean {
    return this.cache.has(cacheKeyToString(key));
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const globalCache = new ComputeBudgetCache();

// ===== Instruction Builders =====

/**
 * Create set compute unit price instruction
 */
export function setComputeUnitPrice(price: bigint): Uint8Array {
  // Instruction: [discriminator (4 bytes) | price (8 bytes)]
  const data = new Uint8Array(12);
  data.set(SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR, 0);
  
  // Little-endian price (8 bytes)
  const view = new DataView(data.buffer, 4, 8);
  view.setBigUint64(0, price, true); // little-endian
  
  return data;
}

/**
 * Create set compute unit limit instruction
 */
export function setComputeUnitLimit(limit: number): Uint8Array {
  // Instruction: [discriminator (4 bytes) | limit (4 bytes)]
  const data = new Uint8Array(8);
  data.set(SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR, 0);
  
  // Little-endian limit (4 bytes)
  const view = new DataView(data.buffer, 4, 4);
  view.setUint32(0, limit, true); // little-endian
  
  return data;
}

// ===== Cached Instruction Functions =====

/**
 * Extend instructions with compute budget instructions.
 * On cache hit, extends from cached array (no allocation).
 */
export function extendComputeBudgetInstructions(
  instructions: Uint8Array[],
  unitPrice: bigint,
  unitLimit: number
): Uint8Array[] {
  const cacheKey: ComputeBudgetCacheKey = { unitPrice, unitLimit };

  // Check cache
  const cached = globalCache.get(cacheKey);
  if (cached) {
    instructions.push(...cached);
    return instructions;
  }

  // Build new instructions
  const insts: Uint8Array[] = [];
  if (unitPrice > 0n) {
    insts.push(setComputeUnitPrice(unitPrice));
  }
  if (unitLimit > 0) {
    insts.push(setComputeUnitLimit(unitLimit));
  }

  // Store in cache
  globalCache.set(cacheKey, insts);

  instructions.push(...insts);
  return instructions;
}

/**
 * Returns compute budget instructions.
 * Note: prefer extendComputeBudgetInstructions on hot path.
 */
export function computeBudgetInstructions(
  unitPrice: bigint,
  unitLimit: number
): Uint8Array[] {
  const cacheKey: ComputeBudgetCacheKey = { unitPrice, unitLimit };

  // Check cache
  const cached = globalCache.get(cacheKey);
  if (cached) {
    return [...cached]; // Return copy
  }

  // Build new instructions
  const insts: Uint8Array[] = [];
  if (unitPrice > 0n) {
    insts.push(setComputeUnitPrice(unitPrice));
  }
  if (unitLimit > 0) {
    insts.push(setComputeUnitLimit(unitLimit));
  }

  // Store in cache
  globalCache.set(cacheKey, insts);

  return [...insts];
}

// ===== Cache Statistics =====

/**
 * Get cache size
 */
export function getCacheStats(): number {
  return globalCache.size;
}

/**
 * Clear the cache (for testing)
 */
export function clearCache(): void {
  globalCache.clear();
}
