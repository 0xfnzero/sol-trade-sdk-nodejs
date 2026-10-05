import {pumpFunBuyExact,pumpFunSellExact} from "./pumpfun_exact";
/**
 * PumpFun bonding curve calculations.
 * Based on sol-trade-sdk Rust implementation.
 */

// Constants from Rust
export const FEE_BASIS_POINTS = 95; // 1%
export const CREATOR_FEE = 30; // 0.5%
export const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000;
export const INITIAL_VIRTUAL_SOL_RESERVES = 30_000_000_000; // 30 SOL
export const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;
export const TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Compute fee for a given amount
 */
export function computeFee(amount: number, feeBasisPoints: number): number {
  return exactOutput((exactInput(amount)*exactInput(feeBasisPoints)+9999n)/10000n);
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
  if(creator.length!==32)throw Error("Invalid creator");
  return exactOutput(pumpFunBuyExact(exactInput(virtualTokenReserves),exactInput(virtualSolReserves),exactInput(realTokenReserves),exactInput(amount),95n+(creator.some(b=>b!==0)?30n:0n)));
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
  if(creator.length!==32)throw Error("Invalid creator");
  return exactOutput(pumpFunSellExact(exactInput(virtualTokenReserves),exactInput(virtualSolReserves),exactInput(amount),95n+(creator.some(b=>b!==0)?30n:0n)));
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

function exactInput(n:number):bigint{if(!Number.isSafeInteger(n)||n<0)throw new RangeError("Use bigint calc API for unsafe integers");return BigInt(n);}
function exactOutput(n:bigint):number{if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError("Use bigint calc API for unsafe output");return Number(n);}
