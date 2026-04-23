/**
 * Trading factory and executor for Sol Trade SDK
 *
 * Provides factory methods for creating trade executors for different DEX protocols
 */

import type { PublicKey } from '@solana/web3.js';

// ===== DEX Types =====

export enum DexType {
  PumpFun = 'PumpFun',
  PumpSwap = 'PumpSwap',
  Bonk = 'Bonk',
  RaydiumCpmm = 'RaydiumCpmm',
  RaydiumAmmV4 = 'RaydiumAmmV4',
  MeteoraDammV2 = 'MeteoraDammV2',
}

export enum TradeType {
  Buy = 'Buy',
  Sell = 'Sell',
  Create = 'Create',
  CreateAndBuy = 'CreateAndBuy',
}

// ===== Trade Result Types =====

export interface TradeResult {
  signature: string;
  success: boolean;
  error?: string;
  confirmationTimeMs?: number;
  submittedAt?: Date;
  confirmedAt?: Date;
  retries?: number;
}

export interface BatchTradeResult {
  results: TradeResult[];
  totalTimeMs: number;
  successCount: number;
  failedCount: number;
}

// ===== Execute Options =====

export interface TradeExecuteOptions {
  waitConfirmation?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  parallelSubmit?: boolean;
  timeoutMs?: number;
  priority?: number;
  skipPreflight?: boolean;
}

export function defaultTradeExecuteOptions(): TradeExecuteOptions {
  return {
    waitConfirmation: true,
    maxRetries: 3,
    retryDelayMs: 100,
    parallelSubmit: true,
    timeoutMs: 30000,
    priority: 0,
    skipPreflight: false,
  };
}

// ===== Protocol Params =====

export interface PumpFunParams {
  bondingCurve?: any;
  associatedBondingCurve?: PublicKey;
  creatorVault?: PublicKey;
  tokenProgram?: PublicKey;
  closeTokenAccountWhenSell?: boolean;
}

export interface PumpSwapParams {
  pool?: PublicKey;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
  poolBaseTokenAccount?: PublicKey;
  poolQuoteTokenAccount?: PublicKey;
  poolBaseTokenReserves?: bigint;
  poolQuoteTokenReserves?: bigint;
  coinCreatorVaultAta?: PublicKey;
  coinCreatorVaultAuthority?: PublicKey;
  baseTokenProgram?: PublicKey;
  quoteTokenProgram?: PublicKey;
  isMayhemMode?: boolean;
  isCashbackCoin?: boolean;
}

export interface BonkParams {
  virtualBase?: bigint;
  virtualQuote?: bigint;
  realBase?: bigint;
  realQuote?: bigint;
  poolState?: PublicKey;
  baseVault?: PublicKey;
  quoteVault?: PublicKey;
  mintTokenProgram?: PublicKey;
  platformConfig?: PublicKey;
  platformAssociatedAccount?: PublicKey;
  creatorAssociatedAccount?: PublicKey;
  globalConfig?: PublicKey;
}

export interface RaydiumCpmmParams {
  poolState?: PublicKey;
  ammConfig?: PublicKey;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
  baseReserve?: bigint;
  quoteReserve?: bigint;
  baseVault?: PublicKey;
  quoteVault?: PublicKey;
  baseTokenProgram?: PublicKey;
  quoteTokenProgram?: PublicKey;
  observationState?: PublicKey;
}

export interface RaydiumAmmV4Params {
  amm?: PublicKey;
  coinMint?: PublicKey;
  pcMint?: PublicKey;
  tokenCoin?: PublicKey;
  tokenPc?: PublicKey;
  coinReserve?: bigint;
  pcReserve?: bigint;
}

export interface MeteoraDammV2Params {
  pool?: PublicKey;
  tokenAVault?: PublicKey;
  tokenBVault?: PublicKey;
  tokenAMint?: PublicKey;
  tokenBMint?: PublicKey;
  tokenAProgram?: PublicKey;
  tokenBProgram?: PublicKey;
}

// ===== Trade Executor Interface =====

export interface ITradeExecutor {
  executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult>;
  executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult>;
}

// ===== Base Executor =====

export abstract class BaseExecutor implements ITradeExecutor {
  abstract executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult>;
  abstract executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult>;

  protected buildResult(
    signature: string,
    success: boolean,
    error?: string
  ): TradeResult {
    return {
      signature,
      success,
      error,
      submittedAt: new Date(),
    };
  }
}

// ===== PumpFun Executor =====

export class PumpFunExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== PumpSwap Executor =====

export class PumpSwapExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== Bonk Executor =====

export class BonkExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== Raydium CPMM Executor =====

export class RaydiumCpmmExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== Raydium AMM V4 Executor =====

export class RaydiumAmmV4Executor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== Meteora DAMM V2 Executor =====

export class MeteoraDammV2Executor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }

  async executeSell(_params: Record<string, unknown>, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.buildResult('', true);
  }
}

// ===== Trade Executor Factory =====

export class TradeExecutorFactory {
  private static executors: Map<DexType, () => ITradeExecutor> = new Map([
    [DexType.PumpFun, () => new PumpFunExecutor()],
    [DexType.PumpSwap, () => new PumpSwapExecutor()],
    [DexType.Bonk, () => new BonkExecutor()],
    [DexType.RaydiumCpmm, () => new RaydiumCpmmExecutor()],
    [DexType.RaydiumAmmV4, () => new RaydiumAmmV4Executor()],
    [DexType.MeteoraDammV2, () => new MeteoraDammV2Executor()],
  ]);

  /**
   * Create a trade executor for the given DEX type
   */
  static createExecutor(dexType: DexType): ITradeExecutor {
    const factory = this.executors.get(dexType);
    if (!factory) {
      throw new Error(`No executor available for DEX type: ${dexType}`);
    }
    return factory();
  }

  /**
   * Register a custom executor factory
   */
  static registerExecutor(dexType: DexType, factory: () => ITradeExecutor): void {
    this.executors.set(dexType, factory);
  }

  /**
   * Get supported DEX types
   */
  static getSupportedDexTypes(): DexType[] {
    return Array.from(this.executors.keys());
  }
}

// Main `TradingClient` lives in `src/index.ts` (parity with Rust SDK). Use `TradeExecutorFactory` for protocol stubs/tests.
