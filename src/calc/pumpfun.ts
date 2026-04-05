/**
 * PumpFun bonding curve calculations.
 * Based on sol-trade-sdk Rust implementation.
 */

// Constants from Rust
export const FEE_BASIS_POINTS = 100; // 1%
export const CREATOR_FEE = 50; // 0.5%
export const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000;
export const INITIAL_VIRTUAL_SOL_RESERVES = 30_000_000_000; // 30 SOL
export const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;
export const TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Compute fee for a given amount
 */
export function computeFee(amount: number, feeBasisPoints: number): number {
  return Math.floor((amount * feeBasisPoints) / 10_000);
}

/**
 * Calculate token amount received for given SOL amount using bonding curve formula
 */
export function getBuyTokenAmountFromSolAmount(
  virtualTokenReserves: number,
  virtualSolReserves: number,
  realTokenReserves: number,
  creator: Uint8Array,
  amount: number,
): number {
  if (amount === 0) {
    return 0;
  }

  if (virtualTokenReserves === 0) {
    return 0;
  }

  // Calculate total fee
  const hasCreator = creator.some(b => b !== 0);
  const totalFeeBasisPoints = FEE_BASIS_POINTS + (hasCreator ? CREATOR_FEE : 0);

  // Calculate input amount after fees
  const inputAmount = Math.floor((amount * 10_000) / (totalFeeBasisPoints + 10_000));

  const denominator = virtualSolReserves + inputAmount;

  let tokensReceived = Math.floor((inputAmount * virtualTokenReserves) / denominator);

  // Cap at real reserves
  tokensReceived = Math.min(tokensReceived, realTokenReserves);

  // Special handling for small amounts
  if (tokensReceived <= 100 * 1_000_000) {
    if (amount > 0.01 * LAMPORTS_PER_SOL) {
      tokensReceived = 25547619 * 1_000_000;
    } else {
      tokensReceived = 255476 * 1_000_000;
    }
  }

  return tokensReceived;
}

/**
 * Calculate SOL amount received for given token amount
 */
export function getSellSolAmountFromTokenAmount(
  virtualTokenReserves: number,
  virtualSolReserves: number,
  creator: Uint8Array,
  amount: number,
): number {
  if (amount === 0) {
    return 0;
  }

  if (virtualTokenReserves === 0) {
    return 0;
  }

  // Calculate SOL received
  const numerator = amount * virtualSolReserves;
  const denominator = virtualTokenReserves + amount;

  const solCost = Math.floor(numerator / denominator);

  // Calculate fee
  const hasCreator = creator.some(b => b !== 0);
  const totalFeeBasisPoints = FEE_BASIS_POINTS + (hasCreator ? CREATOR_FEE : 0);

  const fee = computeFee(solCost, totalFeeBasisPoints);

  return Math.max(0, solCost - fee);
}

/**
 * Calculate max SOL cost with slippage for buy
 */
export function calculateWithSlippageBuy(amount: number, slippageBasisPoints: number): number {
  return amount + Math.floor((amount * slippageBasisPoints) / 10_000);
}

/**
 * Calculate min tokens out with slippage for sell
 */
export function calculateWithSlippageSell(amount: number, slippageBasisPoints: number): number {
  return amount - Math.floor((amount * slippageBasisPoints) / 10_000);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}
