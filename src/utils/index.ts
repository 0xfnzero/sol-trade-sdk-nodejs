import {pumpFunBuyExact,pumpFunSellExact} from "../calc/pumpfun_exact";
/**
 * Utility functions for Sol Trade SDK
 */

import { PublicKey } from '@solana/web3.js';

/// Maximum slippage in basis points (99.99% = 9999 bps)
/// This prevents the wrap amount from doubling when slippage is 100%
const MAX_SLIPPAGE_BASIS_POINTS = 9999;

/**
 * Calculate amount with slippage for buy operations
 * 
 * Note: Basis points are clamped to MAX_SLIPPAGE_BASIS_POINTS (9999 = 99.99%)
 * to prevent the amount from doubling when slippageBasisPoints = 10000.
 */
export function calculateWithSlippageBuy(
  amount: bigint,
  slippageBasisPoints: number
): bigint {
  // Clamp basis points to max 9999 (99.99%) to prevent amount doubling at 100%
  const bps = slippageBasisPoints > MAX_SLIPPAGE_BASIS_POINTS 
    ? MAX_SLIPPAGE_BASIS_POINTS 
    : slippageBasisPoints;
  return (amount * BigInt(10000 + bps)) / BigInt(10000);
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
  _realTokenReserves: bigint,
  _creatorFee: number,
  solAmount: bigint
): bigint {
  if(!Number.isSafeInteger(_creatorFee)||_creatorFee<0)throw Error("Invalid creator fee bps");
  return pumpFunBuyExact(virtualTokenReserves,virtualSolReserves,_realTokenReserves,solAmount,95n+BigInt(_creatorFee));
}

/**
 * Calculate sell SOL amount from token amount for PumpFun
 */
export function getSellSolAmountFromTokenAmount(
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  _creatorFee: number,
  tokenAmount: bigint
): bigint {
  if(!Number.isSafeInteger(_creatorFee)||_creatorFee<0)throw Error("Invalid creator fee bps");
  return pumpFunSellExact(virtualTokenReserves,virtualSolReserves,tokenAmount,95n+BigInt(_creatorFee));
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
