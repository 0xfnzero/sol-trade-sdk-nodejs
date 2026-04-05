/**
 * Utility functions for Sol Trade SDK
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Calculate amount with slippage for buy operations
 */
export function calculateWithSlippageBuy(
  amount: bigint,
  slippageBasisPoints: number
): bigint {
  return (amount * BigInt(10000 + slippageBasisPoints)) / BigInt(10000);
}

/**
 * Calculate amount with slippage for sell operations
 */
export function calculateWithSlippageSell(
  amount: bigint,
  slippageBasisPoints: number
): bigint {
  return (amount * BigInt(10000 - slippageBasisPoints)) / BigInt(10000);
}

/**
 * Calculate buy token amount from SOL amount for PumpFun
 */
export function getBuyTokenAmountFromSolAmount(
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  realTokenReserves: bigint,
  creatorFee: number,
  solAmount: bigint
): bigint {
  // Simplified calculation - full implementation requires proper bonding curve math
  const k = virtualTokenReserves * virtualSolReserves;
  const newSolReserves = virtualSolReserves + solAmount;
  const newTokenReserves = k / newSolReserves;
  const tokensOut = virtualTokenReserves - newTokenReserves;
  return tokensOut;
}

/**
 * Calculate sell SOL amount from token amount for PumpFun
 */
export function getSellSolAmountFromTokenAmount(
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  creatorFee: number,
  tokenAmount: bigint
): bigint {
  // Simplified calculation
  const k = virtualTokenReserves * virtualSolReserves;
  const newTokenReserves = virtualTokenReserves + tokenAmount;
  const newSolReserves = k / newTokenReserves;
  const solOut = virtualSolReserves - newSolReserves;
  return solOut;
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1e9;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9));
}

/**
 * Get current timestamp in microseconds
 */
export function nowMicroseconds(): bigint {
  return BigInt(Date.now()) * BigInt(1000);
}

/**
 * Validate public key string
 */
export function isValidPublicKey(key: string): boolean {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format public key for display (truncated)
 */
export function formatPublicKey(key: PublicKey | string, chars: number = 8): string {
  const keyStr = typeof key === 'string' ? key : key.toBase58();
  if (keyStr.length <= chars * 2) return keyStr;
  return `${keyStr.slice(0, chars)}...${keyStr.slice(-chars)}`;
}

/**
 * Calculate price impact percentage
 */
export function calculatePriceImpact(
  reserveIn: bigint,
  amountIn: bigint
): number {
  return Number((amountIn * BigInt(10000)) / reserveIn) / 100;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}
