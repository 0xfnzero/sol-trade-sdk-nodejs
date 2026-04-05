/**
 * Fast functions with caching.
 * Based on sol-trade-sdk Rust implementation.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';

// Instruction cache
const instructionCache = new Map<string, TransactionInstruction[]>();

// PDA cache
const pdaCache = new Map<string, PublicKey>();

// ATA cache
const ataCache = new Map<string, PublicKey>();

/**
 * Get cached instruction or compute and cache
 */
export function getCachedInstructions(
  cacheKey: string,
  computeFn: () => TransactionInstruction[],
): TransactionInstruction[] {
  const cached = instructionCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  const result = computeFn();
  instructionCache.set(cacheKey, [...result]);
  return result;
}

/**
 * Fast ATA creation with caching
 */
export function createAssociatedTokenAccountIdempotentFast(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): TransactionInstruction[] {
  const cacheKey = `${payer.toBase58()}-${owner.toBase58()}-${mint.toBase58()}-${tokenProgram.toBase58()}`;

  return getCachedInstructions(cacheKey, () => {
    // Get ATA address
    const ata = getAssociatedTokenAddressFast(owner, mint, tokenProgram);

    // Create instruction data
    // [1] = create idempotent
    const data = Buffer.from([1, ...payer.toBytes(), ...ata.toBytes(), ...owner.toBytes(), ...mint.toBytes(), ...tokenProgram.toBytes()]);

    // This is a simplified placeholder - actual implementation would use proper ATA program
    return [];
  });
}

/**
 * Fast ATA address derivation with caching
 */
export function getAssociatedTokenAddressFast(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  const cacheKey = `${owner.toBase58()}-${mint.toBase58()}-${tokenProgram.toBase58()}`;

  const cached = ataCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Derive ATA (simplified - would use proper PDA derivation)
  // ATA = find_program_address([owner, token_program, mint], associated_token_program)
  const result = PublicKey.default; // Placeholder
  ataCache.set(cacheKey, result);
  return result;
}

/**
 * Fast ATA address derivation with seed optimization
 */
export function getAssociatedTokenAddressWithProgramIdFastUseSeed(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
  useSeed: boolean = false,
): PublicKey {
  if (useSeed) {
    // Use seed-optimized path
    const cacheKey = `seed-${owner.toBase58()}-${mint.toBase58()}-${tokenProgram.toBase58()}`;
    const cached = ataCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Derive with seed optimization
    const result = PublicKey.default; // Placeholder
    ataCache.set(cacheKey, result);
    return result;
  }

  return getAssociatedTokenAddressFast(owner, mint, tokenProgram);
}

/**
 * Create ATA with seed optimization
 */
export function createAssociatedTokenAccountIdempotentFastUseSeed(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
  useSeed: boolean = false,
): TransactionInstruction[] {
  if (useSeed) {
    const cacheKey = `seed-create-${payer.toBase58()}-${owner.toBase58()}-${mint.toBase58()}-${tokenProgram.toBase58()}`;

    return getCachedInstructions(cacheKey, () => {
      // Seed-optimized ATA creation
      return [];
    });
  }

  return createAssociatedTokenAccountIdempotentFast(payer, owner, mint, tokenProgram);
}

/**
 * Clear all caches (for testing)
 */
export function clearCaches(): void {
  instructionCache.clear();
  pdaCache.clear();
  ataCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  instructionCacheSize: number;
  pdaCacheSize: number;
  ataCacheSize: number;
} {
  return {
    instructionCacheSize: instructionCache.size,
    pdaCacheSize: pdaCache.size,
    ataCacheSize: ataCache.size,
  };
}
