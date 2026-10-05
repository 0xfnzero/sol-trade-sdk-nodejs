import {pumpFunBuyExact,pumpFunSellExact} from "./pumpfun_exact";
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
const I128_MIN_BIGINT = -(BigInt(1) << BigInt(127));
const I128_MAX_BIGINT = (BigInt(1) << BigInt(127)) - BigInt(1);

/// Maximum slippage in basis points (99.99% = 9999 bps)
/// This prevents the wrap amount from doubling when slippage is 100%
const MAX_SLIPPAGE_BASIS_POINTS = BigInt(9999);

// ===== Error Classes =====

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

// ===== Validation Functions =====

function validateAmount(amount: bigint, name: string = 'amount'): void {
  if (typeof amount !== 'bigint') throw new CalculationError(`${name} must be bigint`);
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
  validateAmount(feeBasisPoints, 'fee basis points');
  const result = (amount * feeBasisPoints + 9999n) / 10000n;
  validateAmount(result, 'fee');
  return result;
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

  return a / b + (a % b === 0n ? 0n : 1n);
}

/**
 * Calculate buy amount with slippage protection
 * Includes overflow protection and validation
 * 
 * Note: Basis points are clamped to MAX_SLIPPAGE_BASIS_POINTS (9999 = 99.99%)
 * to prevent the amount from doubling when basisPoints = 10000.
 */
export function calculateWithSlippageBuy(amount: bigint, basisPoints: bigint): bigint {
  validateAmount(amount, 'amount');
  
  validateAmount(basisPoints, 'slippage basis points');
  // Rust clamps slippage and saturates the final u64 buy budget.
  const bps = basisPoints > MAX_SLIPPAGE_BASIS_POINTS ? MAX_SLIPPAGE_BASIS_POINTS : basisPoints;
  
  const result = amount + amount * bps / 10000n;
  return result > MAX_SAFE_BIGINT ? MAX_SAFE_BIGINT : result;
}

/**
 * Calculate sell amount with slippage protection
 * Includes underflow protection
 * 
 * 100% from Rust: src/utils/calc/common.rs calculate_with_slippage_sell
 * 
 * Slippage is clamped to 9999 bps; zero input returns zero.
 */
export function calculateWithSlippageSell(amount: bigint, basisPoints: bigint): bigint {
  validateAmount(amount, 'amount');
  validateAmount(basisPoints, 'slippage basis points');
  const bps = basisPoints > MAX_SLIPPAGE_BASIS_POINTS ? MAX_SLIPPAGE_BASIS_POINTS : basisPoints;
  return amount - amount * bps / 10000n;
}

// ===== PumpFun Constants =====
// Values from Rust: src/instruction/utils/pumpfun.rs global_constants
export const PUMPFUN_CONSTANTS = {
  FEE_BASIS_POINTS: BigInt(95),    // Protocol fee (NOT 100!)
  CREATOR_FEE: BigInt(30),          // Creator fee (NOT 50!)
  INITIAL_VIRTUAL_TOKEN_RESERVES: BigInt('1073000000000000'),
  INITIAL_VIRTUAL_SOL_RESERVES: BigInt('30000000000'),
  INITIAL_REAL_TOKEN_RESERVES: BigInt('793100000000000'), // Fixed: was 793000000000000
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
  if(typeof hasCreator!=="boolean")throw new TypeError("hasCreator must be boolean");
  return pumpFunBuyExact(virtualTokenReserves,virtualSolReserves,realTokenReserves,amount,95n+(hasCreator?30n:0n));
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
  if(typeof hasCreator!=="boolean")throw new TypeError("hasCreator must be boolean");
  return pumpFunSellExact(virtualTokenReserves,virtualSolReserves,amount,95n+(hasCreator?30n:0n));
}

// ===== PumpSwap Constants =====
// Values from Rust: src/instruction/utils/pumpswap.rs accounts
export const PUMPSWAP_CONSTANTS = {
  LP_FEE_BASIS_POINTS: BigInt(25),          // 0.25% (was 20)
  PROTOCOL_FEE_BASIS_POINTS: BigInt(5),     // 0.05% (was 20)
  COIN_CREATOR_FEE_BASIS_POINTS: BigInt(5), // 0.05% (was 10)
};

export interface PumpSwapFeeBasisPoints {
  lpFeeBasisPoints: bigint;
  protocolFeeBasisPoints: bigint;
  coinCreatorFeeBasisPoints: bigint;
}

export function pumpSwapFeeBasisPoints(
  lpFeeBasisPoints: bigint,
  protocolFeeBasisPoints: bigint,
  coinCreatorFeeBasisPoints: bigint
): PumpSwapFeeBasisPoints {
  return { lpFeeBasisPoints, protocolFeeBasisPoints, coinCreatorFeeBasisPoints };
}

export function legacyPumpSwapFeeBasisPoints(hasCoinCreator: boolean): PumpSwapFeeBasisPoints {
  return pumpSwapFeeBasisPoints(
    PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS,
    PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS,
    hasCoinCreator ? PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS : BigInt(0)
  );
}

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

/** Add the signed i128 offset to the vault. Zero is valid; trade quotes require liquidity. */
export function effectiveQuoteReserves(
  quoteVaultBalance: bigint,
  virtualQuoteReserves: bigint
): bigint {
  if (quoteVaultBalance < BigInt(0) || quoteVaultBalance > MAX_SAFE_BIGINT) {
    throw new CalculationError(`Invalid u64 quote vault balance: ${quoteVaultBalance}`);
  }
  if (virtualQuoteReserves < I128_MIN_BIGINT || virtualQuoteReserves > I128_MAX_BIGINT) {
    throw new CalculationError(
      `Invalid signed i128 virtual quote reserves: ${virtualQuoteReserves}`
    );
  }
  const effective = quoteVaultBalance + virtualQuoteReserves;
  if (effective < BigInt(0) || effective > MAX_SAFE_BIGINT) {
    throw new CalculationError(
      `Invalid effective quote reserves: raw=${quoteVaultBalance}, virtual=${virtualQuoteReserves}`
    );
  }
  return effective;
}

function pumpSwapCeilDiv(value: bigint, divisor: bigint, name: string): bigint {
  if (value < BigInt(0) || divisor <= BigInt(0)) {
    throw new CalculationError(`Invalid ${name} division`);
  }
  const result = (value + divisor - BigInt(1)) / divisor;
  if (result > MAX_SAFE_BIGINT) {
    throw new CalculationError(`Calculated ${name} exceeds u64`);
  }
  return result;
}

function validatePumpSwapInputs(amount: bigint, slippage: bigint, baseReserve: bigint, quoteReserve: bigint, fees: PumpSwapFeeBasisPoints): void {
  for (const [name, value] of Object.entries({amount, slippage, baseReserve, quoteReserve,
    lpFee: fees.lpFeeBasisPoints, protocolFee: fees.protocolFeeBasisPoints, creatorFee: fees.coinCreatorFeeBasisPoints})) {
    validateAmount(value, name);
  }
}

/**
 * Calculate quote needed to buy base tokens on PumpSwap
 */
export function buyBaseInputInternal(
  base: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  virtualQuoteReserves: bigint,
  hasCoinCreator: boolean
): BuyBaseInputResult {
  return buyBaseInputInternalWithFees(
    base,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}

export function buyBaseInputInternalWithFees(
  base: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  virtualQuoteReserves: bigint,
  feeBasisPoints: PumpSwapFeeBasisPoints
): BuyBaseInputResult {
  validatePumpSwapInputs(base, slippageBasisPoints, baseReserve, quoteReserve, feeBasisPoints);
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(quoteReserve, virtualQuoteReserves);
  if (effectiveQuoteReserve === BigInt(0)) {
    throw new CalculationError('Invalid effective quote reserves: depleted pool');
  }
  if (base > baseReserve) {
    throw new Error('Cannot buy more base tokens than pool reserves');
  }

  const numerator = effectiveQuoteReserve * base;
  const denominator = baseReserve - base;

  if (denominator === BigInt(0)) {
    throw new Error('Pool would be depleted');
  }

  const quoteAmountIn = pumpSwapCeilDiv(numerator, denominator, 'raw quote amount');

  const lpFee = computeFee(quoteAmountIn, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(quoteAmountIn, feeBasisPoints.protocolFeeBasisPoints);
  const coinCreatorFee = computeFee(quoteAmountIn, feeBasisPoints.coinCreatorFeeBasisPoints);

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
  virtualQuoteReserves: bigint,
  hasCoinCreator: boolean
): BuyQuoteInputResult {
  return buyQuoteInputInternalWithFees(
    quote,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}

export function buyQuoteInputInternalWithFees(
  quote: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  virtualQuoteReserves: bigint,
  feeBasisPoints: PumpSwapFeeBasisPoints
): BuyQuoteInputResult {
  validatePumpSwapInputs(quote, slippageBasisPoints, baseReserve, quoteReserve, feeBasisPoints);
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(quoteReserve, virtualQuoteReserves);
  if (effectiveQuoteReserve === BigInt(0)) {
    throw new CalculationError('Invalid effective quote reserves: depleted pool');
  }

  const totalFeeBps =
    feeBasisPoints.lpFeeBasisPoints +
    feeBasisPoints.protocolFeeBasisPoints +
    feeBasisPoints.coinCreatorFeeBasisPoints;
  validateAmount(totalFeeBps, 'total fee basis points');
  const denominator = BigInt(10000) + totalFeeBps;
  validateAmount(denominator, 'fee denominator');

  let effectiveQuote = (quote * BigInt(10000)) / denominator;
  const lpFee = computeFee(effectiveQuote, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(effectiveQuote, feeBasisPoints.protocolFeeBasisPoints);
  const coinCreatorFee = computeFee(effectiveQuote, feeBasisPoints.coinCreatorFeeBasisPoints);
  const totalWithFees = effectiveQuote + lpFee + protocolFee + coinCreatorFee;
  if (totalWithFees > quote) {
    effectiveQuote -= totalWithFees - quote;
    if (effectiveQuote < BigInt(0)) {
      throw new CalculationError('Quote input is too small to cover fees');
    }
  }
  if (effectiveQuote === 0n) throw new CalculationError('Quote input is too small after fees');
  const inputAmount = effectiveQuote - 1n;

  const numerator = baseReserve * inputAmount;
  const denominatorEffective = effectiveQuoteReserve + inputAmount;

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
  virtualQuoteReserves: bigint,
  hasCoinCreator: boolean
): SellBaseInputResult {
  return sellBaseInputInternalWithFees(
    base,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}

export function sellBaseInputInternalWithFees(
  base: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  virtualQuoteReserves: bigint,
  feeBasisPoints: PumpSwapFeeBasisPoints
): SellBaseInputResult {
  validatePumpSwapInputs(base, slippageBasisPoints, baseReserve, quoteReserve, feeBasisPoints);
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(quoteReserve, virtualQuoteReserves);
  if (effectiveQuoteReserve === BigInt(0)) {
    throw new CalculationError('Invalid effective quote reserves: depleted pool');
  }

  const quoteAmountOut =
    (effectiveQuoteReserve * base) / (baseReserve + base);

  const lpFee = computeFee(quoteAmountOut, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(quoteAmountOut, feeBasisPoints.protocolFeeBasisPoints);
  const coinCreatorFee = computeFee(quoteAmountOut, feeBasisPoints.coinCreatorFeeBasisPoints);

  const totalFees = lpFee + protocolFee + coinCreatorFee;
  validateAmount(totalFees, 'total fees');
  if (totalFees > quoteAmountOut) {
    throw new Error('Fees exceed output');
  }
  const quoteVaultOutflow = quoteAmountOut - lpFee;
  if (quoteVaultOutflow > quoteReserve) {
    throw new Error('Insufficient real quote reserves to cover the sell output');
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
  virtualQuoteReserves: bigint,
  hasCoinCreator: boolean
): SellQuoteInputResult {
  return sellQuoteInputInternalWithFees(
    quote,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}

export function sellQuoteInputInternalWithFees(
  quote: bigint,
  slippageBasisPoints: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  virtualQuoteReserves: bigint,
  feeBasisPoints: PumpSwapFeeBasisPoints
): SellQuoteInputResult {
  validatePumpSwapInputs(quote, slippageBasisPoints, baseReserve, quoteReserve, feeBasisPoints);
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error('Invalid input: reserves cannot be zero');
  }
  if (quote > quoteReserve) {
    throw new Error('Cannot receive more than pool reserves');
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(quoteReserve, virtualQuoteReserves);
  if (effectiveQuoteReserve === BigInt(0)) {
    throw new CalculationError('Invalid effective quote reserves: depleted pool');
  }

  const rawQuote = calculateQuoteAmountOut(
    quote,
    feeBasisPoints.lpFeeBasisPoints,
    feeBasisPoints.protocolFeeBasisPoints,
    feeBasisPoints.coinCreatorFeeBasisPoints
  );


  const lpFee = computeFee(rawQuote, feeBasisPoints.lpFeeBasisPoints);
  const quoteVaultOutflow = rawQuote - lpFee;
  if (quoteVaultOutflow > quoteReserve) {
    throw new Error('Insufficient real quote reserves to cover the sell output');
  }

  if (rawQuote >= effectiveQuoteReserve) {
    throw new Error('Invalid input: desired amount exceeds reserve');
  }

  const baseAmountIn = pumpSwapCeilDiv(
    baseReserve * rawQuote,
    effectiveQuoteReserve - rawQuote,
    'base amount'
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
  if (denominator <= BigInt(0)) {
    throw new Error('Total fee basis points must be less than 10,000');
  }
  return pumpSwapCeilDiv(
    userQuoteAmountOut * BigInt(10000),
    denominator,
    'quote amount'
  );
}

// ===== Bonk Constants =====

export const BONK_CONSTANTS = {
  PROTOCOL_FEE_RATE: BigInt(25),   // 0.25%
  PLATFORM_FEE_RATE: BigInt(100),  // 1%
  SHARE_FEE_RATE: BigInt(0),       // 0%
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

// ===== Meteora DAMM V2 Calculations =====

export interface MeteoraSwapResult {
  amountOut: bigint;
  minAmountOut: bigint;
}

/**
 * Compute swap amount for Meteora DAMM V2
 */
/** Compatibility constant-product estimate, not a DAMM v2 fee/sqrt-price quote. */
export function meteoraDammV2ComputeSwapAmount(tokenAReserve:bigint,tokenBReserve:bigint,isAToB:boolean,amountIn:bigint,slippageBasisPoints:bigint):MeteoraSwapResult {
 validateAmount(slippageBasisPoints,'slippage');
 if(typeof isAToB!=='boolean')throw new CalculationError('direction must be boolean');
 const amountOut=meteoraDammV2GetAmountOut(amountIn,isAToB?tokenAReserve:tokenBReserve,isAToB?tokenBReserve:tokenAReserve,0n);
 return {amountOut,minAmountOut:calculateWithSlippageSell(amountOut,slippageBasisPoints)};
}
export function meteoraDammV2CalculatePrice(tokenAReserve:bigint,tokenBReserve:bigint):number {
 validateAmount(tokenAReserve,'reserve A');validateAmount(tokenBReserve,'reserve B');
 return tokenAReserve===0n?0:Number(tokenBReserve)/Number(tokenAReserve);
}
export function meteoraDammV2CalculateLiquidity(tokenAReserve:bigint,tokenBReserve:bigint):bigint {
 validateAmount(tokenAReserve,'reserve A');validateAmount(tokenBReserve,'reserve B');
 const n=tokenAReserve*tokenBReserve;
 if(n<2n)return n;
 let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));
 for(;;){const y=(x+n/x)>>1n;if(y>=x)return x;x=y;}
}
export function meteoraDammV2GetAmountOut(amountIn:bigint,inputReserve:bigint,outputReserve:bigint,feeBasisPoints:bigint):bigint {
 for(const v of [amountIn,inputReserve,outputReserve,feeBasisPoints])validateAmount(v);
 if(feeBasisPoints>=10000n||!inputReserve||!outputReserve||!amountIn)return 0n;
 const net=amountIn*(10000n-feeBasisPoints)/10000n;
 return net*outputReserve/(inputReserve+net);
}
export function meteoraDammV2GetAmountIn(amountOut:bigint,inputReserve:bigint,outputReserve:bigint,feeBasisPoints:bigint):bigint {
 for(const v of [amountOut,inputReserve,outputReserve,feeBasisPoints])validateAmount(v);
 if(feeBasisPoints>=10000n||!inputReserve||!outputReserve||amountOut>=outputReserve)return 0n;
 const raw=inputReserve*amountOut,remaining=outputReserve-amountOut;
 const net=raw/remaining+(raw%remaining===0n?0n:1n);
 const numerator=net*10000n,denominator=10000n-feeBasisPoints;
 const result=numerator/denominator+(numerator%denominator===0n?0n:1n);
 // Match the compatibility Go entry's zero result for an unrepresentable u64 input.
 return result>MAX_SAFE_BIGINT?0n:result;
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

// ===== Price Calculation Functions - from Rust: src/utils/price/ =====

const DEFAULT_TOKEN_DECIMALS = 6;
const SOL_DECIMALS = 9;

/**
 * Calculate the price of token in WSOL
 * 100% from Rust: src/utils/price/bonk.rs price_token_in_wsol
 */
export function priceTokenInWsol(
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint
): number {
  return priceBaseInQuoteWithVirtual(
    virtualBase,
    virtualQuote,
    realBase,
    realQuote,
    DEFAULT_TOKEN_DECIMALS,
    SOL_DECIMALS
  );
}

/**
 * Calculate the price of base in quote with virtual reserves
 * 100% from Rust: src/utils/price/bonk.rs price_base_in_quote
 */
export function priceBaseInQuoteWithVirtual(
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  baseDecimals: number,
  quoteDecimals: number
): number {
  // Calculate decimal places difference
  const decimalDiff = quoteDecimals - baseDecimals;
  const decimalFactor = decimalDiff >= 0 
    ? Math.pow(10, decimalDiff) 
    : 1.0 / Math.pow(10, -decimalDiff);
  
  // Calculate reserves state before price calculation
  const quoteReserves = virtualQuote + realQuote;
  const baseReserves = virtualBase > realBase ? virtualBase - realBase : BigInt(0);
  
  if (baseReserves === BigInt(0)) {
    return 0.0;
  }
  
  if (decimalFactor === 0.0) {
    return 0.0;
  }
  
  // Use floating point calculation to avoid precision loss
  const price = (Number(quoteReserves) / Number(baseReserves)) / decimalFactor;
  
  return price;
}

/**
 * Calculate the token price in quote based on base and quote reserves
 * 100% from Rust: src/utils/price/common.rs price_base_in_quote
 */
export function priceBaseInQuoteFromReserves(
  baseReserve: bigint,
  quoteReserve: bigint,
  baseDecimals: number,
  quoteDecimals: number
): number {
  const base = Number(baseReserve) / Math.pow(10, baseDecimals);
  const quote = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  if (base === 0.0) {
    return 0.0;
  }
  return quote / base;
}

/**
 * Calculate the token price in base based on base and quote reserves
 * 100% from Rust: src/utils/price/common.rs price_quote_in_base
 */
export function priceQuoteInBase(
  baseReserve: bigint,
  quoteReserve: bigint,
  baseDecimals: number,
  quoteDecimals: number
): number {
  const base = Number(baseReserve) / Math.pow(10, baseDecimals);
  const quote = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  if (quote === 0.0) {
    return 0.0;
  }
  return base / quote;
}

// ===== PumpFun Price Calculation =====

// Constants from Rust: src/instruction/utils/pumpfun.rs global_constants
const LAMPORTS_PER_SOL = 1_000_000_000;
const SCALE = 1_000_000; // 6 decimals for tokens

/**
 * Calculate the token price in SOL based on virtual reserves
 * 100% from Rust: src/utils/price/pumpfun.rs price_token_in_sol
 */
export function priceTokenInSol(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): number {
  const vSol = Number(virtualSolReserves) / LAMPORTS_PER_SOL;
  const vTokens = Number(virtualTokenReserves) / SCALE;
  if (vTokens === 0.0) {
    return 0.0;
  }
  return vSol / vTokens;
}

// ===== Bonk Calculations - from Rust: src/utils/calc/bonk.rs =====

/**
 * Calculates the amount of tokens to receive when buying with SOL
 * 100% from Rust: src/utils/calc/bonk.rs get_buy_token_amount_from_sol_amount
 */
export function getBonkBuyTokenAmountFromSolAmount(
  amountIn: bigint,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  slippageBasisPoints: bigint
): bigint {
  const amountInU128 = amountIn;
  const bps =
    slippageBasisPoints > MAX_SLIPPAGE_BASIS_POINTS
      ? MAX_SLIPPAGE_BASIS_POINTS
      : slippageBasisPoints;

  // Fee rates from Bonk - 100% from Rust: src/instruction/utils/bonk.rs accounts
  const PROTOCOL_FEE_RATE = BigInt(25);   // 0.25%
  const PLATFORM_FEE_RATE = BigInt(100);  // 1%
  const SHARE_FEE_RATE = BigInt(0);       // 0%

  // Calculate fees
  const protocolFee = (amountInU128 * PROTOCOL_FEE_RATE) / BigInt(10000);
  const platformFee = (amountInU128 * PLATFORM_FEE_RATE) / BigInt(10000);
  const shareFee = (amountInU128 * SHARE_FEE_RATE) / BigInt(10000);

  // Calculate net input after fees
  const amountInNet = amountInU128 - protocolFee - platformFee - shareFee;

  // Calculate total reserves
  const inputReserve = virtualQuote + realQuote;
  const outputReserve = virtualBase - realBase;

  // Apply constant product formula
  const numerator = amountInNet * outputReserve;
  const denominator = inputReserve + amountInNet;
  let amountOut = numerator / denominator;

  // Apply slippage (bps already clamped)
  amountOut = amountOut - (amountOut * bps) / BigInt(10000);

  return amountOut;
}

/**
 * Calculates the amount of SOL to receive when selling tokens
 * 100% from Rust: src/utils/calc/bonk.rs get_sell_sol_amount_from_token_amount
 */
export function getBonkSellSolAmountFromTokenAmount(
  amountIn: bigint,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  slippageBasisPoints: bigint
): bigint {
  const amountInU128 = amountIn;
  const bps =
    slippageBasisPoints > MAX_SLIPPAGE_BASIS_POINTS
      ? MAX_SLIPPAGE_BASIS_POINTS
      : slippageBasisPoints;

  // For sell, input_reserve is token reserves, output_reserve is SOL reserves
  const inputReserve = virtualBase - realBase;
  const outputReserve = virtualQuote + realQuote;

  // Use constant product formula
  const numerator = amountInU128 * outputReserve;
  const denominator = inputReserve + amountInU128;
  const solAmountOut = numerator / denominator;

  // Fee rates from Bonk - 100% from Rust: src/instruction/utils/bonk.rs accounts
  const PROTOCOL_FEE_RATE = BigInt(25);   // 0.25%
  const PLATFORM_FEE_RATE = BigInt(100);  // 1%
  const SHARE_FEE_RATE = BigInt(0);       // 0%

  // Calculate fees
  const protocolFee = (solAmountOut * PROTOCOL_FEE_RATE) / BigInt(10000);
  const platformFee = (solAmountOut * PLATFORM_FEE_RATE) / BigInt(10000);
  const shareFee = (solAmountOut * SHARE_FEE_RATE) / BigInt(10000);

  // Net SOL after fees
  const solAmountNet = solAmountOut - protocolFee - platformFee - shareFee;

  // Apply slippage (bps already clamped)
  const finalAmount = solAmountNet - (solAmountNet * bps) / BigInt(10000);

  return finalAmount;
}

// ===== Raydium CPMM Calculations - from Rust: src/utils/calc/raydium_cpmm.rs =====

export interface RaydiumCpmmComputeSwapParams {
  allTrade: boolean;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  fee: bigint;
}

export interface RaydiumCpmmSwapResult {
  newInputVaultAmount: bigint;
  newOutputVaultAmount: bigint;
  inputAmount: bigint;
  outputAmount: bigint;
  tradeFee: bigint;
  protocolFee: bigint;
  fundFee: bigint;
  creatorFee: bigint;
}

// Raydium CPMM fee constants
const RAYDIUM_CPMM_FEE_RATE_DENOMINATOR = BigInt(1_000_000);
const RAYDIUM_CPMM_TRADE_FEE_RATE = BigInt(2500);
const RAYDIUM_CPMM_CREATOR_FEE_RATE = BigInt(0);
const RAYDIUM_CPMM_PROTOCOL_FEE_RATE = BigInt(120000);
const RAYDIUM_CPMM_FUND_FEE_RATE = BigInt(40000);

function computeRaydiumCpmmTradingFee(amount: bigint, feeRate: bigint): bigint {
  const numerator = amount * feeRate;
  return (numerator + RAYDIUM_CPMM_FEE_RATE_DENOMINATOR - BigInt(1)) / RAYDIUM_CPMM_FEE_RATE_DENOMINATOR;
}

function computeRaydiumCpmmProtocolFundFee(amount: bigint, feeRate: bigint): bigint {
  const numerator = amount * feeRate;
  return numerator / RAYDIUM_CPMM_FEE_RATE_DENOMINATOR;
}

/**
 * Computes swap parameters for Raydium CPMM
 * 100% from Rust: src/utils/calc/raydium_cpmm.rs compute_swap_amount
 */
export function computeRaydiumCpmmSwapAmount(
  baseReserve: bigint,
  quoteReserve: bigint,
  isBaseIn: boolean,
  amountIn: bigint,
  slippageBasisPoints: bigint
): RaydiumCpmmComputeSwapParams {
  const [inputReserve, outputReserve] = isBaseIn 
    ? [baseReserve, quoteReserve] 
    : [quoteReserve, baseReserve];
  
  // Calculate swap
  const tradeFee = computeRaydiumCpmmTradingFee(amountIn, RAYDIUM_CPMM_TRADE_FEE_RATE);
  const inputAmountLessFees = amountIn - tradeFee;
  
  const protocolFee = computeRaydiumCpmmProtocolFundFee(tradeFee, RAYDIUM_CPMM_PROTOCOL_FEE_RATE);
  const fundFee = computeRaydiumCpmmProtocolFundFee(tradeFee, RAYDIUM_CPMM_FUND_FEE_RATE);
  
  // Calculate output
  const outputAmountSwapped = (outputReserve * inputAmountLessFees) / (inputReserve + inputAmountLessFees);
  const outputAmount = outputAmountSwapped; // Creator fee is 0
  
  // Calculate min amount out with slippage
  const minAmountOut = outputAmount - (outputAmount * slippageBasisPoints) / BigInt(10000);
  
  const allTrade = true;
  
  return {
    allTrade,
    amountIn,
    amountOut: outputAmount,
    minAmountOut,
    fee: tradeFee,
  };
}

// ===== Raydium AMM V4 Calculations - from Rust: src/utils/calc/raydium_amm_v4.rs =====

const RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR = BigInt(25);
const RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR = BigInt(10000);
const RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR = BigInt(25);
const RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR = BigInt(10000);

/**
 * Computes swap parameters for Raydium AMM V4
 * 100% from Rust: src/utils/calc/raydium_amm_v4.rs compute_swap_amount
 */
export function computeRaydiumAmmV4SwapAmount(
  baseReserve: bigint,
  quoteReserve: bigint,
  isBaseIn: boolean,
  amountIn: bigint,
  slippageBasisPoints: bigint
): RaydiumCpmmComputeSwapParams {
  const [inputReserve, outputReserve] = isBaseIn 
    ? [baseReserve, quoteReserve] 
    : [quoteReserve, baseReserve];
  
  // Calculate trade fee
  const tradeFeeNumerator = amountIn * RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR;
  const tradeFee = (tradeFeeNumerator + RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR - BigInt(1)) / RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR;
  
  const inputAmountLessFees = amountIn - tradeFee;
  
  // Calculate swap fee
  const swapFeeNumerator = tradeFee * RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR;
  const swapFee = swapFeeNumerator / RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR;
  
  // Calculate output
  const outputAmountSwapped = (outputReserve * inputAmountLessFees) / (inputReserve + inputAmountLessFees);
  const outputAmount = outputAmountSwapped - swapFee;
  
  // Calculate min amount out with slippage
  const minAmountOut = outputAmount - (outputAmount * slippageBasisPoints) / BigInt(10000);
  
  return {
    allTrade: true,
    amountIn,
    amountOut: outputAmount,
    minAmountOut,
    fee: tradeFee,
  };
}

// ===== Raydium CLMM Price Calculations - from Rust: src/utils/price/raydium_clmm.rs =====

/**
 * Calculate the price of token0 in token1 from sqrt price
 * 100% from Rust: src/utils/price/raydium_clmm.rs price_token0_in_token1
 */
export function priceToken0InToken1(
  sqrtPriceX64: bigint,
  decimalsToken0: number,
  decimalsToken1: number
): number {
  const sqrtPrice = Number(sqrtPriceX64) / Math.pow(2, 64); // Q64.64 to float
  const priceRaw = sqrtPrice * sqrtPrice; // Price without decimal adjustment
  const scale = Math.pow(10, decimalsToken0 - decimalsToken1);
  return priceRaw * scale;
}

/**
 * Calculate the price of token1 in token0 from sqrt price
 * 100% from Rust: src/utils/price/raydium_clmm.rs price_token1_in_token0
 */
export function priceToken1InToken0(
  sqrtPriceX64: bigint,
  decimalsToken0: number,
  decimalsToken1: number
): number {
  return 1.0 / priceToken0InToken1(sqrtPriceX64, decimalsToken0, decimalsToken1);
}

export * from "./dlmm";
