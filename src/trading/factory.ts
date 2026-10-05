import {CachedTradeExecutor,type CachedDexType} from "./cached_trade";
/**
 * Trading factory and executor for Sol Trade SDK
 *
 * Provides factory methods for creating trade executors for different DEX protocols
 */

import type {CachedTradeRequest} from "./cached_trade";
import type { PublicKey, Signer } from '@solana/web3.js';

// ===== DEX Types =====

export enum DexType {
  PumpFun = 'PumpFun',
  PumpSwap = 'PumpSwap',
  Bonk = 'Bonk',
  LaunchLab = 'LaunchLab',
  StonkFun = 'StonkFun',
  RaydiumClmm = 'RaydiumClmm',
  OrcaWhirlpool = 'OrcaWhirlpool',
  MeteoraDlmm = 'MeteoraDlmm',
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

export interface TradeExecutionRequest {
  request: CachedTradeRequest;
  signers: readonly Signer[];
  submit: (wire: Uint8Array, direction: "Buy" | "Sell") => Promise<string>;
}

export interface TradeResult {
  submitted?: boolean;
  confirmed?: boolean;
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
  virtualQuoteReserves?: bigint;
  coinCreatorVaultAta?: PublicKey;
  coinCreatorVaultAuthority?: PublicKey;
  baseTokenProgram?: PublicKey;
  quoteTokenProgram?: PublicKey;
  isMayhemMode?: boolean;
  isCashbackCoin?: boolean;
  poolCreator?: PublicKey;
  coinCreator?: PublicKey;
  cashbackFeeBasisPoints?: bigint;
  feeBasisPoints?: {
    lpFeeBasisPoints: bigint;
    protocolFeeBasisPoints: bigint;
    coinCreatorFeeBasisPoints: bigint;
  };
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
  ammOpenOrders?: PublicKey;
  ammTargetOrders?: PublicKey;
  serumProgram?: PublicKey;
  serumMarket?: PublicKey;
  serumBids?: PublicKey;
  serumAsks?: PublicKey;
  serumEventQueue?: PublicKey;
  serumCoinVaultAccount?: PublicKey;
  serumPcVaultAccount?: PublicKey;
  serumVaultSigner?: PublicKey;
  coinReserve?: bigint;
  pcReserve?: bigint;
  swapFeeNumerator?:bigint;
  swapFeeDenominator?:bigint;
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
  executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult>;
  executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult>;
}

// ===== Base Executor =====

export abstract class BaseExecutor implements ITradeExecutor {
  abstract executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult>;
  abstract executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult>;

  protected async executeUnified(dexType: DexType, direction: "Buy" | "Sell", params: Record<string, unknown> | TradeExecutionRequest, opts?: TradeExecuteOptions): Promise<TradeResult> {
    const p = params as unknown as TradeExecutionRequest;
    if (!p?.request || !Array.isArray(p.signers) || typeof p.submit !== "function") throw Error("Provide TradeExecutionRequest with frozen state, signers and raw-wire submit");
    if (p.request.dexType !== dexType) throw Error("Factory/request protocol mismatch");
    if (p.request.tradeType !== direction) throw Error("Factory/request trade direction mismatch");
    if (opts?.waitConfirmation) throw Error("RPC confirmation is unavailable on this hot path; consume gRPC evidence separately");
    const receipt = await new CachedTradeExecutor(dexType as CachedDexType).execute(p.request,p.signers,p.submit);
    return {...receipt,success:receipt.submitted,submittedAt:new Date()};
  }

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
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.PumpFun, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.PumpFun, 'Sell', _params, _opts);
  }
}

// ===== PumpSwap Executor =====

export class PumpSwapExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.PumpSwap, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.PumpSwap, 'Sell', _params, _opts);
  }
}

// ===== Bonk Executor =====

export class BonkExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.Bonk, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.Bonk, 'Sell', _params, _opts);
  }
}

// ===== Raydium CPMM Executor =====

export class RaydiumCpmmExecutor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.RaydiumCpmm, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.RaydiumCpmm, 'Sell', _params, _opts);
  }
}

// ===== Raydium AMM V4 Executor =====

export class RaydiumAmmV4Executor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.RaydiumAmmV4, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.RaydiumAmmV4, 'Sell', _params, _opts);
  }
}

// ===== Meteora DAMM V2 Executor =====

export class MeteoraDammV2Executor extends BaseExecutor {
  async executeBuy(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.MeteoraDammV2, 'Buy', _params, _opts);
  }

  async executeSell(_params: Record<string, unknown> | TradeExecutionRequest, _opts?: TradeExecuteOptions): Promise<TradeResult> {
    return this.executeUnified(DexType.MeteoraDammV2, 'Sell', _params, _opts);
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
  static getSupportedCachedDexTypes(): DexType[] {return [DexType.PumpFun,DexType.MeteoraDammV2,DexType.PumpSwap,DexType.RaydiumAmmV4,DexType.LaunchLab,DexType.Bonk,DexType.StonkFun,DexType.RaydiumCpmm,DexType.RaydiumClmm,DexType.OrcaWhirlpool,DexType.MeteoraDlmm];}
  static createCachedExecutor(dexType: DexType): CachedTradeExecutor {
    if(!['PumpFun','MeteoraDammV2','PumpSwap','RaydiumAmmV4','LaunchLab','Bonk','StonkFun','RaydiumCpmm','RaydiumClmm','OrcaWhirlpool','MeteoraDlmm'].includes(dexType))throw Error('Protocol has no native cached trade executor');
    return new CachedTradeExecutor(dexType as CachedDexType);
  }
  static createExecutor(dexType: DexType): ITradeExecutor {
    if (!this.executors.has(dexType) && this.getSupportedCachedDexTypes().includes(dexType)) return new UnifiedTradeExecutor(dexType);
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
    return [...new Set([...this.executors.keys(),...this.getSupportedCachedDexTypes()])];
  }
}

// Main `TradingClient` lives in `src/index.ts` (parity with Rust SDK). Use `TradeExecutorFactory` for protocol stubs/tests.

export class UnifiedTradeExecutor extends BaseExecutor {
  constructor(private readonly dexType: DexType) { super(); }
  executeBuy(params: Record<string,unknown> | TradeExecutionRequest,opts?:TradeExecuteOptions) {return this.executeUnified(this.dexType,"Buy",params,opts);}
  executeSell(params: Record<string,unknown> | TradeExecutionRequest,opts?:TradeExecuteOptions) {return this.executeUnified(this.dexType,"Sell",params,opts);}
}
