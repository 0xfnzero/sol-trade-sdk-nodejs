/**
 * Calculation utilities for Sol Trade SDK
 *
 * Security features:
 * - Overflow/underflow protection
 * - Input validation
 * - Bounds checking
 */

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// ===== Security Constants =====

const MAX_SAFE_BIGINT = BigInt('18446744073709551615'); // 2^64 - 1
const MAX_BASIS_POINTS = BigInt(10000);

// ===== Error Classes =====

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

// ===== Validation Functions =====

function validateAmount(amount: bigint, name: string = 'amount'): void {
  if (amount < BigInt(0)) {
    throw new CalculationError(`${name} cannot be negative: ${amount}`);
  }
  if (amount > MAX_SAFE_BIGINT) {
    throw new CalculationError(`${name} exceeds maximum safe value: ${amount}`);
  }
}

function validateBasisPoints(basisPoints: bigint): void {
  if (basisPoints < BigInt(0) || basisPoints > MAX_BASIS_POINTS) {
    throw new CalculationError(`Basis points must be between 0 and 10000, got ${basisPoints}`);
  }
}

function checkOverflow(a: bigint, b: bigint, operation: 'multiply' | 'add'): void {
  if (operation === 'multiply') {
    // Check if multiplication would overflow
    if (a !== BigInt(0) && b > MAX_SAFE_BIGINT / a) {
      throw new CalculationError(`Multiplication overflow: ${a} * ${b}`);
    }
  } else if (operation === 'add') {
    // Check if addition would overflow
    if (a > MAX_SAFE_BIGINT - b) {
      throw new CalculationError(`Addition overflow: ${a} + ${b}`);
    }
  }
}

// ===== Common Calculation Functions =====

/**
 * Compute fee based on amount and fee basis points
 * Includes overflow protection
 */
export function computeFee(amount: bigint, feeBasisPoints: bigint): bigint {
  validateAmount(amount, 'amount');
  validateBasisPoints(feeBasisPoints);

  checkOverflow(amount, feeBasisPoints, 'multiply');
  return ceilDiv(amount * feeBasisPoints, BigInt(10000));
}

/**
 * Ceiling division with zero check
 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === BigInt(0)) {
    throw new CalculationError('Division by zero');
  }
  validateAmount(a, 'dividend');
  validateAmount(b, 'divisor');

  checkOverflow(a, b - BigInt(1), 'add');
  return (a + b - BigInt(1)) / b;
}

/**
 * Calculate buy amount with slippage protection
 * Includes overflow protection and validation
 */
export function calculateWithSlippageBuy(amount: bigint, basisPoints: bigint): bigint {
  validateAmount(amount, 'amount');
  validateBasisPoints(basisPoints);

  checkOverflow(amount, basisPoints, 'multiply');
  const slippageAmount = (amount * basisPoints) / BigInt(10000);

  checkOverflow(amount, slippageAmount, 'add');
  return amount + slippageAmount;
}

/**
 * Calculate sell amount with slippage protection
 * Includes underflow protection
 */
export function calculateWithSlippageSell(amount: bigint, basisPoints: bigint): bigint {
  validateAmount(amount, 'amount');
  validateBasisPoints(basisPoints);

  checkOverflow(amount, basisPoints, 'multiply');
  const slippageAmount = (amount * basisPoints) / BigInt(10000);

  if (slippageAmount >= amount) {
    throw new CalculationError(`Slippage ${basisPoints} basis points would result in zero or negative amount`);
  }

  return amount - slippageAmount;
}

// ===== PumpFun Constants =====

export const PUMPFUN_CONSTANTS = {
  FEE_BASIS_POINTS: BigInt(100),   // 1%
  CREATOR_FEE: BigInt(50),          // 0.5%
  INITIAL_VIRTUAL_TOKEN_RESERVES: BigInt('1073000000000000'),
  INITIAL_VIRTUAL_SOL_RESERVES: BigInt('30000000000'),
  INITIAL_REAL_TOKEN_RESERVES: BigInt('793000000000000'),
  TOKEN_TOTAL_SUPPLY: BigInt('1000000000000000'),
};

/**
 * Calculate buy token amount from SOL amount for PumpFun
 */
export function getBuyTokenAmountFromSolAmount(
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  realTokenReserves: bigint,
  hasCreator: boolean,
  amount: bigint
): bigint {
  if (amount === BigInt(0) || virtualTokenReserves === BigInt(0)) {
    return BigInt(0);
  }

  let totalFeeBasisPoints = PUMPFUN_CONSTANTS.FEE_BASIS_POINTS;
  if (hasCreator) {
    totalFeeBasisPoints += PUMPFUN_CONSTANTS.CREATOR_FEE;
  }

  const inputAmount =
    (amount * BigInt(10000)) / (totalFeeBasisPoints + BigInt(10000));
  const denominator = virtualSolReserves + inputAmount;

  let tokensReceived =
    (inputAmount * virtualTokenReserves) / denominator;

  if (tokensReceived > realTokenReserves) {
    tokensReceived = realTokenReserves;
  }

  // Minimum token protection
  if (tokensReceived <= BigInt(100) * BigInt(1000000)) {
    if (amount > BigInt(10000000)) {
      // > 0.01 SOL
      tokensReceived = BigInt('25547619000000000');
    } else {
      tokensReceived = BigInt('255476000000000');
    }
  }

  return tokensReceived;
}

/**
 * Calculate sell SOL amount from token amount for PumpFun
 */
export function getSellSolAmountFromTokenAmount(
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  hasCreator: boolean,
  amount: bigint
): bigint {
  if (amount === BigInt(0) || virtualTokenReserves === BigInt(0)) {
    return BigInt(0);
  }

  const numerator = amount * virtualSolReserves;
  const denominator = virtualTokenReserves + amount;

  const solCost = numerator / denominator;

  let totalFeeBasisPoints = PUMPFUN_CONSTANTS.FEE_BASIS_POINTS;
  if (hasCreator) {
    totalFeeBasisPoints += PUMPFUN_CONSTANTS.CREATOR_FEE;
  }

  const fee = computeFee(solCost, totalFeeBasisPoints);

  if (solCost < fee) {
    return BigInt(0);
  }
  return solCost - fee;
}

// ===== PumpSwap Constants =====

export const PUMPSWAP_CONSTANTS = {
  LP_FEE_BASIS_POINTS: BigInt(20),          // 0.2%
  PROTOCOL_FEE_BASIS_POINTS: BigInt(20),    // 0.2%
  COIN_CREATOR_FEE_BASIS_POINTS: BigInt(10), // 0.1%
};

export interface BuyBaseInputResult {
  internalQuoteAmount: bigint;
  uiQuote: bigint;
  maxQuote: bigint;
}

export interface BuyQuoteInputResult {
  base: bigint;
  internalQuoteWithoutFees: bigint;
  maxQuote: bigint;
}

export interface SellBaseInputResult {
  uiQuote: bigint;
  minQuote: bigint;
  internalQuoteAmountOut: bigint;
}

export interface SellQuoteInputResult {
  internalRawQuote: bigint;
  base: bigint;
  minQuote: bigint;
}

/**
 * Calculate quote needed to buy base tokens on PumpSwap
 */
export function buyBaseInputInternal(
  base: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  hasCoinCreator: boolean
): BuyBaseInputResult {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  if (base > baseReserve) {
    throw new Error('Cannot buy more base tokens than pool reserves');
  }

  const numerator = quoteReserve * base;
  const denominator = baseReserve - base;

  if (denominator === BigInt(0)) {
    throw new Error('Pool would be depleted');
  }

  const quoteAmountIn = ceilDiv(numerator, denominator);

  const lpFee = computeFee(quoteAmountIn, PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS);
  const protocolFee = computeFee(quoteAmountIn, PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS);
  let coinCreatorFee = BigInt(0);
  if (hasCoinCreator) {
    coinCreatorFee = computeFee(quoteAmountIn, PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS);
  }

  const totalQuote = quoteAmountIn + lpFee + protocolFee + coinCreatorFee;
  const maxQuote = calculateWithSlippageBuy(totalQuote, slippageBasisPoints);

  return {
    internalQuoteAmount: quoteAmountIn,
    uiQuote: totalQuote,
    maxQuote,
  };
}

/**
 * Calculate base tokens received for quote input on PumpSwap
 */
export function buyQuoteInputInternal(
  quote: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  hasCoinCreator: boolean
): BuyQuoteInputResult {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }

  let totalFeeBps =
    PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS +
    PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS;
  if (hasCoinCreator) {
    totalFeeBps += PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS;
  }
  const denominator = BigInt(10000) + totalFeeBps;

  const effectiveQuote = (quote * BigInt(10000)) / denominator;

  const numerator = baseReserve * effectiveQuote;
  const denominatorEffective = quoteReserve + effectiveQuote;

  if (denominatorEffective === BigInt(0)) {
    throw new Error('Pool would be depleted');
  }

  const baseAmountOut = numerator / denominatorEffective;
  const maxQuote = calculateWithSlippageBuy(quote, slippageBasisPoints);

  return {
    base: baseAmountOut,
    internalQuoteWithoutFees: effectiveQuote,
    maxQuote,
  };
}

/**
 * Calculate quote received for selling base tokens on PumpSwap
 */
export function sellBaseInputInternal(
  base: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  hasCoinCreator: boolean
): SellBaseInputResult {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }

  const quoteAmountOut =
    (quoteReserve * base) / (baseReserve + base);

  const lpFee = computeFee(quoteAmountOut, PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS);
  const protocolFee = computeFee(quoteAmountOut, PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS);
  let coinCreatorFee = BigInt(0);
  if (hasCoinCreator) {
    coinCreatorFee = computeFee(quoteAmountOut, PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS);
  }

  const totalFees = lpFee + protocolFee + coinCreatorFee;
  if (totalFees > quoteAmountOut) {
    throw new Error('Fees exceed output');
  }
  const finalQuote = quoteAmountOut - totalFees;
  const minQuote = calculateWithSlippageSell(finalQuote, slippageBasisPoints);

  return {
    uiQuote: finalQuote,
    minQuote,
    internalQuoteAmountOut: quoteAmountOut,
  };
}

/**
 * Calculate base needed to receive quote amount on PumpSwap
 */
export function sellQuoteInputInternal(
  quote: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  hasCoinCreator: boolean
): SellQuoteInputResult {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  if (quote > quoteReserve) {
    throw new Error('Cannot receive more than pool reserves');
  }

  let coinCreatorFee = BigInt(0);
  if (hasCoinCreator) {
    coinCreatorFee = PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS;
  }

  const rawQuote = calculateQuoteAmountOut(
    quote,
    PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS,
    PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS,
    coinCreatorFee
  );

  if (rawQuote >= quoteReserve) {
    throw new Error('Invalid input: desired amount exceeds reserve');
  }

  const baseAmountIn = ceilDiv(
    baseReserve * rawQuote,
    quoteReserve - rawQuote
  );
  const minQuote = calculateWithSlippageSell(quote, slippageBasisPoints);

  return {
    internalRawQuote: rawQuote,
    base: baseAmountIn,
    minQuote,
  };
}

function calculateQuoteAmountOut(
  userQuoteAmountOut: bigint,
  lpFeeBasisPoints: bigint,
  protocolFeeBasisPoints: bigint,
  coinCreatorFeeBasisPoints: bigint
): bigint {
  const totalFeeBasisPoints =
    lpFeeBasisPoints + protocolFeeBasisPoints + coinCreatorFeeBasisPoints;
  const denominator = BigInt(10000) - totalFeeBasisPoints;
  return ceilDiv(userQuoteAmountOut * BigInt(10000), denominator);
}

// ===== Bonk Constants =====

export const BONK_CONSTANTS = {
  PROTOCOL_FEE_RATE: BigInt(25),   // 0.25%
  PLATFORM_FEE_RATE: BigInt(50),   // 0.5%
  SHARE_FEE_RATE: BigInt(25),      // 0.25%
  DEFAULT_VIRTUAL_BASE: BigInt('1073025605596382'),
  DEFAULT_VIRTUAL_QUOTE: BigInt('30000852951'),
};

/**
 * Calculate output amount for Bonk
 */
export function getBonkAmountOut(
  amountIn: bigint,
  virtualBase: bigint,
  virtualQuote: bigint
): bigint {
  if (virtualBase === BigInt(0) || virtualQuote === BigInt(0)) {
    return BigInt(0);
  }

  const amountOut = (amountIn * virtualQuote) / virtualBase;
  return amountOut;
}

/**
 * Calculate input amount needed for Bonk
 */
export function getBonkAmountIn(
  amountOut: bigint,
  virtualBase: bigint,
  virtualQuote: bigint
): bigint {
  if (virtualBase === BigInt(0) || virtualQuote === BigInt(0)) {
    return BigInt(0);
  }

  const totalFeeRate =
    BONK_CONSTANTS.PROTOCOL_FEE_RATE +
    BONK_CONSTANTS.PLATFORM_FEE_RATE +
    BONK_CONSTANTS.SHARE_FEE_RATE;
  const amountIn =
    ((amountOut * BigInt(10000)) / (BigInt(10000) - totalFeeRate) * virtualBase) /
    virtualQuote;

  return amountIn;
}

// ===== Raydium Calculations =====

/**
 * Calculate output amount for Raydium AMM V4
 */
export function raydiumAmmV4GetAmountOut(
  amountIn: bigint,
  inputReserve: bigint,
  outputReserve: bigint
): bigint {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0)) {
    return BigInt(0);
  }

  // Apply 0.25% fee
  const amountInWithFee = amountIn * BigInt(9975);
  const numerator = amountInWithFee * outputReserve;
  const denominator = inputReserve * BigInt(10000) + amountInWithFee;

  return numerator / denominator;
}

/**
 * Calculate input amount needed for Raydium AMM V4
 */
export function raydiumAmmV4GetAmountIn(
  amountOut: bigint,
  inputReserve: bigint,
  outputReserve: bigint
): bigint {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0) || amountOut >= outputReserve) {
    return BigInt(0);
  }

  const numerator = inputReserve * amountOut * BigInt(10000);
  const denominator = (outputReserve - amountOut) * BigInt(9975);

  return ceilDiv(numerator, denominator);
}

/**
 * Calculate output amount for Raydium CPMM
 */
export function raydiumCpmmGetAmountOut(
  amountIn: bigint,
  inputReserve: bigint,
  outputReserve: bigint
): bigint {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0)) {
    return BigInt(0);
  }

  const amountOut = (amountIn * outputReserve) / (inputReserve + amountIn);
  return amountOut;
}

// ===== Utility Functions =====

/**
 * Calculate price impact percentage
 */
export function calculatePriceImpact(reserveIn: bigint, amountIn: bigint): number {
  if (reserveIn === BigInt(0)) {
    return 0;
  }
  return Number((amountIn * BigInt(10000)) / reserveIn) / 100;
}

/**
 * Calculate price from reserves
 */
export function calculatePrice(
  quoteReserve: bigint,
  baseReserve: bigint,
  quoteDecimals: number,
  baseDecimals: number
): number {
  if (baseReserve === BigInt(0)) {
    return 0;
  }
  const quoteAdjusted = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  const baseAdjusted = Number(baseReserve) / Math.pow(10, baseDecimals);
  return quoteAdjusted / baseAdjusted;
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / 1e9;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9));
}
