/**
 * Sol Trade SDK - TypeScript SDK for Solana DEX trading
 * 
 * A comprehensive SDK for seamless Solana DEX trading with support for
 * PumpFun, PumpSwap, Bonk, Raydium CPMM, Raydium AMM V4, and Meteora DAMM V2.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  Commitment,
  BlockhashWithExpiryBlockHeight,
  SystemProgram,
  type SimulateTransactionConfig,
} from '@solana/web3.js';

// Import GasFeeStrategy class for createGasFeeStrategy / TradeConfig.gasStrategy
import {
  GasFeeStrategy as GasFeeStrategyClass,
  GasFeeStrategyType,
  TradeType as GfsTradeType,
  SwqosType as GfsSwqosType,
  type GasFeeStrategyValue,
} from './common/gas-fee-strategy';
import { CONSTANTS as SDK_CONSTANTS } from './constants';
import {
  buildPumpFunBuyInstructions,
  buildPumpFunSellInstructions,
  buildPumpFunClaimCashbackInstruction,
  type PumpFunParams as PumpFunBuilderParams,
} from './instruction/pumpfun_builder';
import {
  buildBuyInstructions as buildPumpSwapBuyInstructions,
  buildSellInstructions as buildPumpSwapSellInstructions,
  buildClaimCashbackInstruction as buildPumpSwapClaimCashbackInstruction,
  createAssociatedTokenAccountIdempotent as createAtaIdempotentPumpSwap,
  findPoolByMint as findPumpSwapPoolByMint,
  type PumpSwapParams as PumpSwapBuilderParams,
} from './instruction/pumpswap';
import {
  buildBonkBuyInstructions,
  buildBonkSellInstructions,
  type BonkParams as BonkBuilderParams,
} from './instruction/bonk_builder';
import {
  buildRaydiumCpmmBuyInstructions,
  buildRaydiumCpmmSellInstructions,
  type RaydiumCpmmParams as RaydiumCpmmBuilderParams,
} from './instruction/raydium_cpmm_builder';
import {
  buildRaydiumAmmV4BuyInstructions,
  buildRaydiumAmmV4SellInstructions,
  type RaydiumAmmV4Params as RaydiumAmmV4BuilderParams,
} from './instruction/raydium_amm_v4_builder';
import {
  buildMeteoraDammV2BuyInstructions,
  buildMeteoraDammV2SellInstructions,
} from './instruction/meteora_damm_v2_builder';
import { handleWsol, closeWsol as wsolCloseIx } from './common/wsol-manager';
import { computeBudgetInstructions } from './common/compute-budget';
import { confirmAnyTransactionSignature } from './common/confirm-any-signature';
import { mapWithConcurrencyLimit } from './common/map-pool';
import { InstructionProcessor, Prefetch } from './execution/execution';

// ============== Enums ==============

/**
 * Supported DEX protocols
 */
export enum DexType {
  PumpFun = 'PumpFun',
  PumpSwap = 'PumpSwap',
  Bonk = 'Bonk',
  RaydiumCpmm = 'RaydiumCpmm',
  RaydiumAmmV4 = 'RaydiumAmmV4',
  MeteoraDammV2 = 'MeteoraDammV2',
}

/**
 * Type of token to trade
 */
export enum TradeTokenType {
  SOL = 'SOL',
  WSOL = 'WSOL',
  USD1 = 'USD1',
  USDC = 'USDC',
}

/**
 * Trade operation type
 */
export enum TradeType {
  Buy = 'Buy',
  Sell = 'Sell',
}

/**
 * SWQOS service regions
 */
export enum SwqosRegion {
  Frankfurt = 'Frankfurt',
  NewYork = 'NewYork',
  Amsterdam = 'Amsterdam',
  Tokyo = 'Tokyo',
  Singapore = 'Singapore',
  SLC = 'SLC',
  London = 'London',
  LosAngeles = 'LosAngeles',
  Default = 'Default',
}

/**
 * SWQOS service types
 */
export enum SwqosType {
  Default = 'Default',
  Jito = 'Jito',
  Bloxroute = 'Bloxroute',
  ZeroSlot = 'ZeroSlot',
  Temporal = 'Temporal',
  FlashBlock = 'FlashBlock',
  BlockRazor = 'BlockRazor',
  Node1 = 'Node1',
  Astralane = 'Astralane',
  NextBlock = 'NextBlock',
  Helius = 'Helius',
  Stellium = 'Stellium',
  Lightspeed = 'Lightspeed',
  Soyas = 'Soyas',
  Speedlanding = 'Speedlanding',
  Triton = 'Triton',
  QuickNode = 'QuickNode',
  Syndica = 'Syndica',
  Figment = 'Figment',
  Alchemy = 'Alchemy',
}

// ============== Interfaces ==============

/**
 * SWQOS service configuration
 */
export interface SwqosConfig {
  type: SwqosType;
  region: SwqosRegion;
  apiKey: string;
  customUrl?: string;
  mevProtection?: boolean;
}

/**
 * Gas fee strategy configuration
 */
export interface GasFeeStrategyConfig {
  buyPriorityFee: number;
  sellPriorityFee: number;
  buyComputeUnits: number;
  sellComputeUnits: number;
  buyTipLamports: number;
  sellTipLamports: number;
}

/**
 * Durable nonce information
 *
 * Populate via `fetchDurableNonceInfo` (Rust `fetch_nonce_info` parity) or manually.
 */
export interface DurableNonceInfo {
  nonceAccount: PublicKey;
  authority: PublicKey;
  nonceHash: string;
  recentBlockhash: string;
}

/**
 * Buy trade parameters
 */
export interface TradeBuyParams {
  dexType: DexType;
  inputTokenType: TradeTokenType;
  mint: PublicKey;
  inputTokenAmount: number;
  slippageBasisPoints?: number;
  recentBlockhash?: string;
  extensionParams: DexParamEnum;
  addressLookupTableAccount?: AddressLookupTableAccount;
  waitTxConfirmed?: boolean;
  createInputTokenAta?: boolean;
  closeInputTokenAta?: boolean;
  createMintAta?: boolean;
  durableNonce?: DurableNonceInfo;
  fixedOutputTokenAmount?: number;
  gasFeeStrategy?: GasFeeStrategyConfig;
  simulate?: boolean;
  useExactSolAmount?: boolean;
  grpcRecvUs?: number;
}

/**
 * Sell trade parameters
 */
export interface TradeSellParams {
  dexType: DexType;
  outputTokenType: TradeTokenType;
  mint: PublicKey;
  inputTokenAmount: number;
  slippageBasisPoints?: number;
  recentBlockhash?: string;
  withTip?: boolean;
  extensionParams: DexParamEnum;
  addressLookupTableAccount?: AddressLookupTableAccount;
  waitTxConfirmed?: boolean;
  createOutputTokenAta?: boolean;
  closeOutputTokenAta?: boolean;
  closeMintTokenAta?: boolean;
  durableNonce?: DurableNonceInfo;
  fixedOutputTokenAmount?: number;
  gasFeeStrategy?: GasFeeStrategyConfig;
  simulate?: boolean;
  grpcRecvUs?: number;
}

/**
 * Trade execution result
 */
export interface TradeResult {
  success: boolean;
  signatures: string[];
  error?: TradeError;
  timings: SwqosTiming[];
  /**
   * Set when `simulate: true` on buy/sell — Rust `simulate_transaction` (`units_consumed`, `logs`).
   */
  simulation?: {
    unitsConsumed?: number;
    logs?: string[] | null;
  };
}

/**
 * SWQOS timing information
 */
export interface SwqosTiming {
  swqosType: SwqosType;
  duration: number; // microseconds
  /** Present when `TradeConfig.gasStrategy` expands multiple Rust `GasFeeStrategyType` rows. */
  gasFeeStrategyType?: GasFeeStrategyType;
}

export { TradeError } from './sdk-errors';
import { TradeError } from './sdk-errors';
import type { MiddlewareManager } from './middleware/traits';

// ============== DEX Parameters ==============

/**
 * Bonding curve account state
 */
export interface BondingCurveAccount {
  discriminator: number;
  account: PublicKey;
  virtualTokenReserves: number;
  virtualSolReserves: number;
  realTokenReserves: number;
  realSolReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
  creator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}

/**
 * PumpFun protocol parameters
 */
export interface PumpFunParams {
  bondingCurve: BondingCurveAccount;
  associatedBondingCurve: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  closeTokenAccountWhenSell?: boolean;
  /** Parser/gRPC fee recipient; omit or `PublicKey.default` for SDK random pool (Rust parity). */
  feeRecipient?: PublicKey;
}

/**
 * PumpSwap protocol parameters
 */
export interface PumpSwapParams {
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  poolBaseTokenReserves: number;
  poolQuoteTokenReserves: number;
  coinCreatorVaultAta: PublicKey;
  coinCreatorVaultAuthority: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}

/**
 * Bonk protocol parameters
 */
export interface BonkParams {
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  poolState: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  mintTokenProgram: PublicKey;
  platformConfig: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
  globalConfig: PublicKey;
}

/**
 * Raydium CPMM protocol parameters
 */
export interface RaydiumCpmmParams {
  poolState: PublicKey;
  ammConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseReserve: number;
  quoteReserve: number;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  observationState: PublicKey;
}

/**
 * Raydium AMM V4 protocol parameters
 */
export interface RaydiumAmmV4Params {
  amm: PublicKey;
  coinMint: PublicKey;
  pcMint: PublicKey;
  tokenCoin: PublicKey;
  tokenPc: PublicKey;
  coinReserve: number;
  pcReserve: number;
}

/**
 * Meteora DAMM V2 protocol parameters
 */
export interface MeteoraDammV2Params {
  pool: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
}

/**
 * Union type for DEX parameters
 */
export type DexParamEnum =
  | { type: 'PumpFun'; params: PumpFunParams }
  | { type: 'PumpSwap'; params: PumpSwapParams }
  | { type: 'Bonk'; params: BonkParams }
  | { type: 'RaydiumCpmm'; params: RaydiumCpmmParams }
  | { type: 'RaydiumAmmV4'; params: RaydiumAmmV4Params }
  | { type: 'MeteoraDammV2'; params: MeteoraDammV2Params };

// ============== Main Client ==============

/**
 * Trading configuration
 */
export interface TradeConfig {
  rpcUrl: string;
  swqosConfigs: SwqosConfig[];
  commitment?: Commitment;
  logEnabled?: boolean;
  checkMinTip?: boolean;
  mevProtection?: boolean;
  /** Default gas/CU settings when trade params omit `gasFeeStrategy`. */
  gasFeeStrategy?: GasFeeStrategyConfig;
  /**
   * Per-SWQOS gas table (Rust `GasFeeStrategy`). Used when neither trade nor `gasFeeStrategy` flat config is set.
   * Lookup uses the first SWQOS entry after `withTip` / `checkMinTip` filtering.
   */
  gasStrategy?: GasFeeStrategyClass;
  /** Reserved for Rust parity (seed-optimized ATA); instruction builders may ignore if not wired. */
  useSeedOptimize?: boolean;
  /** If true, best-effort background WSOL ATA creation after connect (Rust `create_wsol_ata_on_startup`). */
  createWsolAtaOnStartup?: boolean;
  /**
   * Rust `MiddlewareManager`: `process_protocol_instructions` before gas/tip wiring;
   * `process_full_instructions` after nonce + tip + compute budget + protocol (see `transaction_builder.rs`).
   */
  middlewareManager?: MiddlewareManager;
  /**
   * Cap concurrent SWQOS `sendTransaction` calls when multiple gas/SWQOS tasks run.
   * Rust uses a bounded worker pool (`max_sender_concurrency`); set this to approximate that (e.g. 8–18).
   * Omit or set ≥ task count to keep previous behavior (all tasks parallel).
   */
  maxSwqosSubmitConcurrency?: number;
}

/**
 * Builder for TradeConfig - makes all options discoverable via IDE autocomplete.
 *
 * @example
 * const config = TradeConfigBuilder.create(rpcUrl)
 *   .swqosConfigs([{ type: SwqosType.Jito, apiKey: 'your-key' }])
 *   // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
 *   .build();
 */
export class TradeConfigBuilder {
  private _rpcUrl: string;
  private _swqosConfigs: SwqosConfig[] = [];
  private _commitment?: Commitment;
  private _logEnabled: boolean = true;
  private _checkMinTip: boolean = false;
  private _mevProtection: boolean = false;
  private _useSeedOptimize: boolean = true;
  private _createWsolAtaOnStartup: boolean = false;
  private _gasFeeStrategy?: GasFeeStrategyConfig;
  private _gasStrategy?: GasFeeStrategyClass;
  private _middlewareManager?: MiddlewareManager;
  private _maxSwqosSubmitConcurrency?: number;

  private constructor(rpcUrl: string) {
    this._rpcUrl = rpcUrl;
  }

  static create(rpcUrl: string): TradeConfigBuilder {
    return new TradeConfigBuilder(rpcUrl);
  }

  swqosConfigs(configs: SwqosConfig[]): this {
    this._swqosConfigs = configs;
    return this;
  }

  commitment(commitment: Commitment): this {
    this._commitment = commitment;
    return this;
  }

  logEnabled(enabled: boolean): this {
    this._logEnabled = enabled;
    return this;
  }

  checkMinTip(check: boolean): this {
    this._checkMinTip = check;
    return this;
  }

  /**
   * Enable MEV protection (default: false).
   * When enabled:
   * - BlockRazor uses mode=sandwichMitigation
   * - Astralane uses port 9000 MEV-protected QUIC endpoint
   */
  mevProtection(enabled: boolean): this {
    this._mevProtection = enabled;
    return this;
  }

  useSeedOptimize(enabled: boolean): this {
    this._useSeedOptimize = enabled;
    return this;
  }

  createWsolAtaOnStartup(enabled: boolean): this {
    this._createWsolAtaOnStartup = enabled;
    return this;
  }

  gasFeeStrategy(config: GasFeeStrategyConfig): this {
    this._gasFeeStrategy = config;
    return this;
  }

  gasStrategy(strategy: GasFeeStrategyClass): this {
    this._gasStrategy = strategy;
    return this;
  }

  /** Rust `SolanaTrade::with_middleware_manager` parity. */
  middlewareManager(manager: MiddlewareManager): this {
    this._middlewareManager = manager;
    return this;
  }

  /**
   * Limit parallel SWQOS submits (Rust `max_sender_concurrency` / worker pool).
   */
  maxSwqosSubmitConcurrency(limit: number | undefined): this {
    this._maxSwqosSubmitConcurrency = limit;
    return this;
  }

  build(): TradeConfig {
    return {
      rpcUrl: this._rpcUrl,
      swqosConfigs: this._swqosConfigs,
      commitment: this._commitment,
      logEnabled: this._logEnabled,
      checkMinTip: this._checkMinTip,
      mevProtection: this._mevProtection,
      useSeedOptimize: this._useSeedOptimize,
      createWsolAtaOnStartup: this._createWsolAtaOnStartup,
      gasFeeStrategy: this._gasFeeStrategy,
      gasStrategy: this._gasStrategy,
      middlewareManager: this._middlewareManager,
      maxSwqosSubmitConcurrency: this._maxSwqosSubmitConcurrency,
    };
  }
}

/**
 * Middleware context
 */
export interface MiddlewareContext {
  tradeType: TradeType;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: number;
  payer: PublicKey;
  additionalData?: Record<string, unknown>;
}

/**
 * Middleware interface
 */
export interface Middleware {
  process(
    instructions: TransactionInstruction[],
    context: MiddlewareContext
  ): Promise<TransactionInstruction[]>;
  name: string;
}

function validateDexParamEnum(dexType: DexType, ext: DexParamEnum): void {
  if (ext.type !== dexType) {
    throw new TradeError(
      5,
      `extensionParams.type (${ext.type}) must match dexType (${String(dexType)})`
    );
  }
}

function mapPumpFunParams(p: PumpFunParams): PumpFunBuilderParams {
  const bc = p.bondingCurve;
  return {
    bondingCurve: {
      account: bc.account,
      virtualTokenReserves: BigInt(bc.virtualTokenReserves),
      virtualSolReserves: BigInt(bc.virtualSolReserves),
      realTokenReserves: BigInt(bc.realTokenReserves),
      isMayhemMode: bc.isMayhemMode,
      isCashbackCoin: bc.isCashbackCoin,
    },
    creatorVault: p.creatorVault,
    tokenProgram: p.tokenProgram,
    associatedBondingCurve: p.associatedBondingCurve,
    closeTokenAccountWhenSell: p.closeTokenAccountWhenSell,
    feeRecipient: p.feeRecipient,
  };
}

/**
 * 按 mint 查找池地址（与 Rust `find_pool_by_mint` 一致：当前仅 PumpSwap）。
 */
export async function findPoolByMint(
  connection: Connection,
  mint: PublicKey,
  dexType: DexType
): Promise<PublicKey> {
  if (dexType !== DexType.PumpSwap) {
    throw new TradeError(
      6,
      `findPoolByMint is only implemented for PumpSwap`
    );
  }
  const found = await findPumpSwapPoolByMint(
    {
      getAccountInfo: async (pk: PublicKey) => {
        const a = await connection.getAccountInfo(pk);
        return { value: a ? { data: a.data as Buffer } : null };
      },
    },
    mint
  );
  if (!found) {
    throw new TradeError(7, 'No PumpSwap pool found for mint');
  }
  return found.poolAddress;
}

/** @internal */
interface TxExecContext {
  tradeType: TradeType;
  /** For Rust `InstructionMiddleware` protocol / full passes (`String(dex_type)`). */
  dexType: DexType;
  gasFeeStrategy?: GasFeeStrategyConfig;
  withTip?: boolean;
  grpcRecvUs?: number;
  /** Rust `execute_parallel`: multi-SWQOS buy requires durable nonce; also drives nonce advance + blockhash. */
  durableNonce?: DurableNonceInfo;
}

/** Rust `async_executor`: `SUBMIT_TIMEOUT_SECS` when `wait_transaction_confirmed` is false. */
const SWQOS_SUBMIT_TIMEOUT_MS_WHEN_NO_CONFIRM = 2000;

/** Rust `executor::simulate_transaction` / `RpcSimulateTransactionConfig` (processed, inner ix, no sig verify). */
export const RUST_PARITY_SIMULATE_CONFIG: SimulateTransactionConfig = {
  sigVerify: false,
  replaceRecentBlockhash: false,
  commitment: 'processed',
  innerInstructions: true,
};

/** Instruction order matches Rust `trading/common/transaction_builder.rs` `build_transaction`: tip → compute budget → business. */
function buildInstructionListWithGasAndTip(
  coreInstructions: TransactionInstruction[],
  payer: PublicKey,
  tradeType: TradeType,
  gas: GasFeeStrategyConfig | undefined,
  tipRecipient: PublicKey | null,
  addTip: boolean
): TransactionInstruction[] {
  const isBuy = tradeType === TradeType.Buy;
  const cuLimit = gas
    ? isBuy
      ? gas.buyComputeUnits
      : gas.sellComputeUnits
    : SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS;
  const cuPrice = BigInt(
    gas
      ? isBuy
        ? gas.buyPriorityFee
        : gas.sellPriorityFee
      : SDK_CONSTANTS.DEFAULT_PRIORITY_FEE
  );
  const tipLamports = gas
    ? isBuy
      ? gas.buyTipLamports
      : gas.sellTipLamports
    : 0;

  const out: TransactionInstruction[] = [];
  if (addTip && tipRecipient && tipLamports > 0) {
    out.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipRecipient,
        lamports: tipLamports,
      })
    );
  }
  out.push(...computeBudgetInstructions(cuPrice, cuLimit));
  return [...out, ...coreInstructions];
}

/**
 * Rust `trading/common/transaction_builder.rs` `build_versioned_transaction`:
 * always produce a v0 {@link VersionedTransaction} with optional LUT.
 */
function buildSignedVersionedTransaction(
  payer: Keypair,
  instructions: TransactionInstruction[],
  recentBlockhash: string,
  addressLookupTableAccount?: AddressLookupTableAccount
): VersionedTransaction {
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message(
    addressLookupTableAccount != null ? [addressLookupTableAccount] : []
  );
  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);
  return tx;
}

function mapSwqosToClientConfig(
  c: SwqosConfig,
  globalMev?: boolean
): {
  type: SwqosType;
  region?: SwqosRegion;
  apiKey?: string;
  customUrl?: string;
  mevProtection?: boolean;
} {
  return {
    type: c.type,
    region: c.region,
    apiKey: c.apiKey,
    customUrl: c.customUrl,
    mevProtection: c.mevProtection ?? globalMev ?? false,
  };
}

function gasConfigFromStrategyClass(
  gs: GasFeeStrategyClass,
  swqosType: SwqosType
): GasFeeStrategyConfig | undefined {
  const st = swqosType as unknown as GfsSwqosType;
  const buyV = gs.get(st, GfsTradeType.Buy, GasFeeStrategyType.Normal);
  const sellV = gs.get(st, GfsTradeType.Sell, GasFeeStrategyType.Normal);
  if (!buyV && !sellV) return undefined;
  return {
    buyComputeUnits: buyV?.cuLimit ?? SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS,
    sellComputeUnits: sellV?.cuLimit ?? SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS,
    buyPriorityFee: buyV?.cuPrice ?? SDK_CONSTANTS.DEFAULT_PRIORITY_FEE,
    sellPriorityFee: sellV?.cuPrice ?? SDK_CONSTANTS.DEFAULT_PRIORITY_FEE,
    buyTipLamports: buyV ? Math.floor(buyV.tip * 1e9) : 0,
    sellTipLamports: sellV ? Math.floor(sellV.tip * 1e9) : 0,
  };
}

/** Single strategy row → flat gas config for the active trade direction (Rust `GasFeeStrategyValue` job). */
function gasConfigFromStrategyValue(
  value: GasFeeStrategyValue,
  tradeType: TradeType
): GasFeeStrategyConfig {
  const isBuy = tradeType === TradeType.Buy;
  const tipLam = Math.floor(value.tip * 1e9);
  return {
    buyComputeUnits: isBuy ? value.cuLimit : SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS,
    sellComputeUnits: !isBuy ? value.cuLimit : SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS,
    buyPriorityFee: isBuy ? value.cuPrice : SDK_CONSTANTS.DEFAULT_PRIORITY_FEE,
    sellPriorityFee: !isBuy ? value.cuPrice : SDK_CONSTANTS.DEFAULT_PRIORITY_FEE,
    buyTipLamports: isBuy ? tipLam : 0,
    sellTipLamports: !isBuy ? tipLam : 0,
  };
}

/** One parallel send: SWQOS config + gas row (Rust `task_configs` entry). */
interface SwqosGasTask {
  cfg: SwqosConfig;
  gas: GasFeeStrategyConfig | undefined;
  strategyType?: GasFeeStrategyType;
}

/**
 * Rust `async_executor::execute_parallel`: `gas_fee_strategy.get_strategies(trade_type)` × each SWQOS client,
 * with `check_min_tip` applied per (client, strategy row).
 */
function expandSwqosGasTasks(
  effectiveSwqos: SwqosConfig[],
  tradeType: TradeType,
  execGas: GasFeeStrategyConfig | undefined,
  configGas: GasFeeStrategyConfig | undefined,
  gasStrategy: GasFeeStrategyClass | undefined,
  useStrategyRowMinTip: boolean,
  checkMinTip: boolean,
  withTip: boolean,
  swqosMod: typeof import('./swqos/clients'),
  mevProtection: boolean | undefined,
  rpcUrl: string,
  logEnabled: boolean
): SwqosGasTask[] {
  const out: SwqosGasTask[] = [];

  if (execGas || configGas) {
    for (const cfg of effectiveSwqos) {
      const gas = resolveMergedGas(execGas, configGas, undefined, cfg.type);
      out.push({ cfg, gas });
    }
    return out;
  }

  if (gasStrategy && useStrategyRowMinTip) {
    const gfsTT = tradeType as unknown as GfsTradeType;
    const rows = gasStrategy.getStrategies(gfsTT);
    for (const cfg of effectiveSwqos) {
      const st = cfg.type as unknown as GfsSwqosType;
      const matching = rows.filter((r) => r.swqosType === st);
      if (matching.length === 0) {
        const g = gasConfigFromStrategyClass(gasStrategy, cfg.type);
        if (g) {
          out.push({ cfg, gas: g, strategyType: GasFeeStrategyType.Normal });
        }
        continue;
      }
      for (const row of matching) {
        const tipLamports = Math.floor(row.value.tip * 1e9);
        if (checkMinTip && withTip && cfg.type !== SwqosType.Default) {
          const client = swqosMod.ClientFactory.createClient(
            mapSwqosToClientConfig(cfg, mevProtection),
            rpcUrl
          );
          const minLamports = Math.ceil(client.minTipSol() * 1_000_000_000);
          if (tipLamports < minLamports) {
            if (logEnabled) {
              console.info(
                `[sol-trade-sdk] SWQOS ${cfg.type} (${row.strategyType}) skipped (checkMinTip): tip ${tipLamports} lamports < minimum ${minLamports}`
              );
            }
            continue;
          }
        }
        out.push({
          cfg,
          gas: gasConfigFromStrategyValue(row.value, tradeType),
          strategyType: row.strategyType,
        });
      }
    }
    return out;
  }

  for (const cfg of effectiveSwqos) {
    const gas = resolveMergedGas(undefined, undefined, gasStrategy, cfg.type);
    out.push({ cfg, gas });
  }
  return out;
}

function resolveMergedGas(
  execGas: GasFeeStrategyConfig | undefined,
  configGas: GasFeeStrategyConfig | undefined,
  gasStrategy: GasFeeStrategyClass | undefined,
  firstSwqosType: SwqosType | undefined
): GasFeeStrategyConfig | undefined {
  if (execGas) return execGas;
  if (configGas) return configGas;
  if (gasStrategy && firstSwqosType !== undefined) {
    return gasConfigFromStrategyClass(gasStrategy, firstSwqosType);
  }
  return undefined;
}

/** Rust `execute_parallel`: when `with_tip` is false, only `Default` RPC SWQOS participates. */
function filterSwqosConfigsForWithTip(
  configs: SwqosConfig[],
  withTip: boolean
): SwqosConfig[] {
  if (withTip) return configs;
  return configs.filter((c) => c.type === SwqosType.Default);
}

function filterSwqosConfigsByMinTip(
  swqosMod: typeof import('./swqos/clients'),
  configs: SwqosConfig[],
  tradeType: TradeType,
  gas: GasFeeStrategyConfig | undefined,
  mevProtection: boolean | undefined,
  rpcUrl: string,
  logEnabled: boolean
): SwqosConfig[] {
  const tipLamports = gas
    ? tradeType === TradeType.Buy
      ? gas.buyTipLamports
      : gas.sellTipLamports
    : 0;
  const out: SwqosConfig[] = [];
  for (const cfg of configs) {
    if (cfg.type === SwqosType.Default) {
      out.push(cfg);
      continue;
    }
    const client = swqosMod.ClientFactory.createClient(
      mapSwqosToClientConfig(cfg, mevProtection),
      rpcUrl
    );
    const minLamports = Math.ceil(client.minTipSol() * 1_000_000_000);
    if (tipLamports < minLamports) {
      if (logEnabled) {
        console.info(
          `[sol-trade-sdk] SWQOS ${cfg.type} skipped (checkMinTip): tip ${tipLamports} lamports < minimum ${minLamports}`
        );
      }
      continue;
    }
    out.push(cfg);
  }
  return out;
}

function resolveTipRecipientPubkey(
  swqosMod: typeof import('./swqos/clients'),
  configs: SwqosConfig[],
  mevProtection: boolean | undefined,
  rpcUrl: string
): PublicKey | null {
  const preferred =
    configs.find((c) => c.type !== SwqosType.Default) ?? configs[0];
  if (!preferred) return null;
  const client = swqosMod.ClientFactory.createClient(
    mapSwqosToClientConfig(preferred, mevProtection),
    rpcUrl
  );
  const acc = client.getTipAccount();
  if (!acc) return null;
  try {
    return new PublicKey(acc);
  } catch {
    return null;
  }
}

/**
 * Main trading client for Solana DEX operations（指令构建与 Rust SDK 对齐，经 `instruction/*` 实现）
 */
export class TradingClient {
  private payer: Keypair;
  private connection: Connection;
  private _config: TradeConfig;
  private middlewares: Middleware[] = [];
  private _logEnabled: boolean;

  constructor(payer: Keypair, config: TradeConfig) {
    this.payer = payer;
    this._config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment ?? 'confirmed',
    });
    this._logEnabled = config.logEnabled ?? true;
  }

  /** Get the current configuration */
  get config(): TradeConfig {
    return this._config;
  }

  /** Check if logging is enabled */
  get isLogEnabled(): boolean {
    return this._logEnabled;
  }

  /**
   * Get the underlying connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the payer public key
   */
  getPayer(): PublicKey {
    return this.payer.publicKey;
  }

  private rpcCommitment(): Commitment {
    return this._config.commitment ?? 'confirmed';
  }

  /**
   * Add middleware to the chain
   */
  addMiddleware(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute a buy order
   */
  async buy(params: TradeBuyParams): Promise<TradeResult> {
    const blockhash =
      params.recentBlockhash ?? params.durableNonce?.nonceHash;
    if (!blockhash) {
      throw new TradeError(
        1,
        'Must provide recentBlockhash or durableNonce.nonceHash (current nonce blockhash)'
      );
    }
    if (
      params.inputTokenType === TradeTokenType.USD1 &&
      params.dexType !== DexType.Bonk
    ) {
      throw new TradeError(
        1,
        'USD1 as input is only supported on Bonk (Rust SDK parity)'
      );
    }
    validateDexParamEnum(params.dexType, params.extensionParams);

    Prefetch.keypair(this.payer);
    let instructions = this.buildBuyInstructions(params);
    try {
      InstructionProcessor.preprocess(instructions);
    } catch (e) {
      if (e instanceof Error && e.message === 'Instructions empty') {
        throw new TradeError(105, 'Instructions empty');
      }
      throw e;
    }
    if (this._config.middlewareManager) {
      instructions =
        this._config.middlewareManager.applyMiddlewaresProcessProtocolInstructions(
          instructions,
          String(params.dexType),
          true
        );
    }

    const processedInstructions = await this.processMiddlewares(
      instructions,
      TradeType.Buy,
      params
    );

    return this.executeTransaction(
      processedInstructions,
      blockhash,
      params.addressLookupTableAccount,
      params.waitTxConfirmed ?? true,
      params.simulate,
      {
        tradeType: TradeType.Buy,
        dexType: params.dexType,
        gasFeeStrategy: params.gasFeeStrategy,
        withTip: true,
        grpcRecvUs: params.grpcRecvUs,
        durableNonce: params.durableNonce,
      }
    );
  }

  /**
   * Execute a sell order
   */
  async sell(params: TradeSellParams): Promise<TradeResult> {
    const blockhash =
      params.recentBlockhash ?? params.durableNonce?.nonceHash;
    if (!blockhash) {
      throw new TradeError(
        1,
        'Must provide recentBlockhash or durableNonce.nonceHash (current nonce blockhash)'
      );
    }
    if (
      params.outputTokenType === TradeTokenType.USD1 &&
      params.dexType !== DexType.Bonk
    ) {
      throw new TradeError(
        1,
        'USD1 as output is only supported on Bonk (Rust SDK parity)'
      );
    }
    validateDexParamEnum(params.dexType, params.extensionParams);

    Prefetch.keypair(this.payer);
    let instructions = this.buildSellInstructions(params);
    try {
      InstructionProcessor.preprocess(instructions);
    } catch (e) {
      if (e instanceof Error && e.message === 'Instructions empty') {
        throw new TradeError(105, 'Instructions empty');
      }
      throw e;
    }
    if (this._config.middlewareManager) {
      instructions =
        this._config.middlewareManager.applyMiddlewaresProcessProtocolInstructions(
          instructions,
          String(params.dexType),
          false
        );
    }

    const processedInstructions = await this.processMiddlewares(
      instructions,
      TradeType.Sell,
      params
    );

    return this.executeTransaction(
      processedInstructions,
      blockhash,
      params.addressLookupTableAccount,
      params.waitTxConfirmed ?? true,
      params.simulate,
      {
        tradeType: TradeType.Sell,
        dexType: params.dexType,
        gasFeeStrategy: params.gasFeeStrategy,
        withTip: params.withTip ?? true,
        grpcRecvUs: params.grpcRecvUs,
        durableNonce: params.durableNonce,
      }
    );
  }

  /**
   * Execute a sell order for a percentage of tokens
   */
  async sellByPercent(
    params: TradeSellParams,
    totalAmount: number,
    percent: number
  ): Promise<TradeResult> {
    if (percent <= 0 || percent > 100) {
      throw new TradeError(2, 'Percentage must be between 1 and 100');
    }
    const amount = Math.floor((totalAmount * percent) / 100);
    return this.sell({ ...params, inputTokenAmount: amount });
  }

  /**
   * Get latest blockhash
   */
  async getLatestBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    return this.connection.getLatestBlockhash(this.rpcCommitment());
  }

  /**
   * Wrap SOL to WSOL
   */
  async wrapSolToWsol(amount: number): Promise<string> {
    const instructions = handleWsol(this.payer.publicKey, BigInt(amount));
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(this.rpcCommitment());

    const transaction = new Transaction({
      blockhash,
      lastValidBlockHeight,
    });
    transaction.add(...instructions);
    transaction.sign(this.payer);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      this.rpcCommitment()
    );

    return signature;
  }

  /**
   * Close WSOL account and unwrap to SOL
   */
  async closeWsol(): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(this.rpcCommitment());

    const transaction = new Transaction({
      blockhash,
      lastValidBlockHeight,
    });
    transaction.add(wsolCloseIx(this.payer.publicKey));
    transaction.sign(this.payer);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      this.rpcCommitment()
    );

    return signature;
  }

  /**
   * Claim PumpFun bonding-curve cashback (SOL → wallet).
   */
  async claimCashbackPumpfun(): Promise<string> {
    const ix = buildPumpFunClaimCashbackInstruction(this.payer.publicKey);
    return this.sendSingleInstruction(ix);
  }

  /**
   * Claim PumpSwap AMM cashback（会先走 WSOL ATA idempotent 创建，与 Rust 一致）。
   */
  async claimCashbackPumpswap(): Promise<string> {
    const { TOKEN_PROGRAM, WSOL_TOKEN_ACCOUNT } = SDK_CONSTANTS;
    const ixs = [
      createAtaIdempotentPumpSwap(
        this.payer.publicKey,
        this.payer.publicKey,
        WSOL_TOKEN_ACCOUNT,
        TOKEN_PROGRAM
      ),
      buildPumpSwapClaimCashbackInstruction(
        this.payer.publicKey,
        WSOL_TOKEN_ACCOUNT,
        TOKEN_PROGRAM
      ),
    ];
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(this.rpcCommitment());
    const tx = new Transaction({ blockhash, lastValidBlockHeight });
    tx.add(...ixs);
    tx.sign(this.payer);
    const signature = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      this.rpcCommitment()
    );
    return signature;
  }

  private async sendSingleInstruction(ix: TransactionInstruction): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(this.rpcCommitment());
    const tx = new Transaction({ blockhash, lastValidBlockHeight });
    tx.add(ix);
    tx.sign(this.payer);
    const signature = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      this.rpcCommitment()
    );
    return signature;
  }

  private buildBuyInstructions(params: TradeBuyParams): TransactionInstruction[] {
    const slippage = BigInt(
      params.slippageBasisPoints ?? SDK_CONSTANTS.DEFAULT_SLIPPAGE
    );
    const inputAmt = BigInt(params.inputTokenAmount);
    const ext = params.extensionParams;

    switch (params.dexType) {
      case DexType.PumpFun: {
        if (ext.type !== 'PumpFun') throw new TradeError(5, 'Invalid PumpFun params');
        return buildPumpFunBuyInstructions({
          payer: this.payer.publicKey,
          outputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createOutputMintAta: params.createMintAta ?? true,
          protocolParams: mapPumpFunParams(ext.params),
          useExactSolAmount: params.useExactSolAmount ?? true,
        });
      }
      case DexType.PumpSwap: {
        if (ext.type !== 'PumpSwap') throw new TradeError(5, 'Invalid PumpSwap params');
        const p = ext.params;
        const protocolParams: PumpSwapBuilderParams = {
          pool: p.pool,
          baseMint: p.baseMint,
          quoteMint: p.quoteMint,
          poolBaseTokenAccount: p.poolBaseTokenAccount,
          poolQuoteTokenAccount: p.poolQuoteTokenAccount,
          poolBaseTokenReserves: BigInt(p.poolBaseTokenReserves),
          poolQuoteTokenReserves: BigInt(p.poolQuoteTokenReserves),
          coinCreatorVaultAta: p.coinCreatorVaultAta,
          coinCreatorVaultAuthority: p.coinCreatorVaultAuthority,
          baseTokenProgram: p.baseTokenProgram,
          quoteTokenProgram: p.quoteTokenProgram,
          isMayhemMode: p.isMayhemMode,
          isCashbackCoin: p.isCashbackCoin,
        };
        return buildPumpSwapBuyInstructions({
          payer: this.payer.publicKey,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          protocolParams,
          createInputMintAta: params.createInputTokenAta ?? true,
          createOutputMintAta: params.createMintAta ?? true,
          closeInputMintAta: params.closeInputTokenAta ?? false,
          useExactQuoteAmount: params.useExactSolAmount ?? true,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
        });
      }
      case DexType.Bonk: {
        if (ext.type !== 'Bonk') throw new TradeError(5, 'Invalid Bonk params');
        const p = ext.params;
        const protocolParams: BonkBuilderParams = {
          poolState: p.poolState,
          baseVault: p.baseVault,
          quoteVault: p.quoteVault,
          virtualBase: BigInt(p.virtualBase),
          virtualQuote: BigInt(p.virtualQuote),
          realBase: BigInt(p.realBase),
          realQuote: BigInt(p.realQuote),
          mintTokenProgram: p.mintTokenProgram,
          platformConfig: p.platformConfig,
          platformAssociatedAccount: p.platformAssociatedAccount,
          creatorAssociatedAccount: p.creatorAssociatedAccount,
          globalConfig: p.globalConfig,
        };
        return buildBonkBuyInstructions({
          payer: this.payer.publicKey,
          outputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createInputMintAta: params.createInputTokenAta ?? true,
          createOutputMintAta: params.createMintAta ?? true,
          closeInputMintAta: params.closeInputTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.RaydiumCpmm: {
        if (ext.type !== 'RaydiumCpmm') throw new TradeError(5, 'Invalid Raydium CPMM params');
        const p = ext.params;
        const protocolParams: RaydiumCpmmBuilderParams = {
          poolState: p.poolState,
          ammConfig: p.ammConfig,
          baseMint: p.baseMint,
          quoteMint: p.quoteMint,
          baseTokenProgram: p.baseTokenProgram,
          quoteTokenProgram: p.quoteTokenProgram,
          baseVault: p.baseVault,
          quoteVault: p.quoteVault,
          baseReserve: BigInt(p.baseReserve),
          quoteReserve: BigInt(p.quoteReserve),
          observationState: p.observationState,
        };
        return buildRaydiumCpmmBuyInstructions({
          payer: this.payer.publicKey,
          outputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createInputMintAta: params.createInputTokenAta ?? true,
          createOutputMintAta: params.createMintAta ?? true,
          closeInputMintAta: params.closeInputTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.RaydiumAmmV4: {
        if (ext.type !== 'RaydiumAmmV4') throw new TradeError(5, 'Invalid Raydium AMM V4 params');
        const p = ext.params;
        const protocolParams: RaydiumAmmV4BuilderParams = {
          amm: p.amm,
          coinMint: p.coinMint,
          pcMint: p.pcMint,
          tokenCoin: p.tokenCoin,
          tokenPc: p.tokenPc,
          coinReserve: BigInt(p.coinReserve),
          pcReserve: BigInt(p.pcReserve),
        };
        return buildRaydiumAmmV4BuyInstructions({
          payer: this.payer.publicKey,
          outputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createInputMintAta: params.createInputTokenAta ?? true,
          createOutputMintAta: params.createMintAta ?? true,
          closeInputMintAta: params.closeInputTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.MeteoraDammV2: {
        if (ext.type !== 'MeteoraDammV2') throw new TradeError(5, 'Invalid Meteora params');
        if (params.fixedOutputTokenAmount === undefined) {
          throw new TradeError(
            8,
            'Meteora DAMM V2 requires fixedOutputTokenAmount (builder parity)'
          );
        }
        const p = ext.params;
        return buildMeteoraDammV2BuyInstructions({
          payer: this.payer.publicKey,
          inputMint: this.getInputMint(params.inputTokenType),
          outputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount: BigInt(params.fixedOutputTokenAmount),
          createInputMintAta: params.createInputTokenAta ?? true,
          createOutputMintAta: params.createMintAta ?? true,
          closeInputMintAta: params.closeInputTokenAta ?? false,
          protocolParams: {
            pool: p.pool,
            tokenAVault: p.tokenAVault,
            tokenBVault: p.tokenBVault,
            tokenAMint: p.tokenAMint,
            tokenBMint: p.tokenBMint,
            tokenAProgram: p.tokenAProgram,
            tokenBProgram: p.tokenBProgram,
          },
        });
      }
      default:
        throw new TradeError(4, `Unsupported DEX type: ${String(params.dexType)}`);
    }
  }

  private buildSellInstructions(params: TradeSellParams): TransactionInstruction[] {
    const slippage = BigInt(
      params.slippageBasisPoints ?? SDK_CONSTANTS.DEFAULT_SLIPPAGE
    );
    const inputAmt = BigInt(params.inputTokenAmount);
    const ext = params.extensionParams;

    switch (params.dexType) {
      case DexType.PumpFun: {
        if (ext.type !== 'PumpFun') throw new TradeError(5, 'Invalid PumpFun params');
        return buildPumpFunSellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          protocolParams: mapPumpFunParams(ext.params),
        });
      }
      case DexType.PumpSwap: {
        if (ext.type !== 'PumpSwap') throw new TradeError(5, 'Invalid PumpSwap params');
        const p = ext.params;
        const protocolParams: PumpSwapBuilderParams = {
          pool: p.pool,
          baseMint: p.baseMint,
          quoteMint: p.quoteMint,
          poolBaseTokenAccount: p.poolBaseTokenAccount,
          poolQuoteTokenAccount: p.poolQuoteTokenAccount,
          poolBaseTokenReserves: BigInt(p.poolBaseTokenReserves),
          poolQuoteTokenReserves: BigInt(p.poolQuoteTokenReserves),
          coinCreatorVaultAta: p.coinCreatorVaultAta,
          coinCreatorVaultAuthority: p.coinCreatorVaultAuthority,
          baseTokenProgram: p.baseTokenProgram,
          quoteTokenProgram: p.quoteTokenProgram,
          isMayhemMode: p.isMayhemMode,
          isCashbackCoin: p.isCashbackCoin,
        };
        return buildPumpSwapSellInstructions({
          payer: this.payer.publicKey,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          protocolParams,
          createOutputMintAta: params.createOutputTokenAta ?? false,
          closeOutputMintAta: params.closeOutputTokenAta ?? false,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
        });
      }
      case DexType.Bonk: {
        if (ext.type !== 'Bonk') throw new TradeError(5, 'Invalid Bonk params');
        const p = ext.params;
        const protocolParams: BonkBuilderParams = {
          poolState: p.poolState,
          baseVault: p.baseVault,
          quoteVault: p.quoteVault,
          virtualBase: BigInt(p.virtualBase),
          virtualQuote: BigInt(p.virtualQuote),
          realBase: BigInt(p.realBase),
          realQuote: BigInt(p.realQuote),
          mintTokenProgram: p.mintTokenProgram,
          platformConfig: p.platformConfig,
          platformAssociatedAccount: p.platformAssociatedAccount,
          creatorAssociatedAccount: p.creatorAssociatedAccount,
          globalConfig: p.globalConfig,
        };
        return buildBonkSellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createOutputMintAta: params.createOutputTokenAta ?? false,
          closeOutputMintAta: params.closeOutputTokenAta ?? false,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.RaydiumCpmm: {
        if (ext.type !== 'RaydiumCpmm') throw new TradeError(5, 'Invalid Raydium CPMM params');
        const p = ext.params;
        const protocolParams: RaydiumCpmmBuilderParams = {
          poolState: p.poolState,
          ammConfig: p.ammConfig,
          baseMint: p.baseMint,
          quoteMint: p.quoteMint,
          baseTokenProgram: p.baseTokenProgram,
          quoteTokenProgram: p.quoteTokenProgram,
          baseVault: p.baseVault,
          quoteVault: p.quoteVault,
          baseReserve: BigInt(p.baseReserve),
          quoteReserve: BigInt(p.quoteReserve),
          observationState: p.observationState,
        };
        return buildRaydiumCpmmSellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createOutputMintAta: params.createOutputTokenAta ?? false,
          closeOutputMintAta: params.closeOutputTokenAta ?? false,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.RaydiumAmmV4: {
        if (ext.type !== 'RaydiumAmmV4') throw new TradeError(5, 'Invalid Raydium AMM V4 params');
        const p = ext.params;
        const protocolParams: RaydiumAmmV4BuilderParams = {
          amm: p.amm,
          coinMint: p.coinMint,
          pcMint: p.pcMint,
          tokenCoin: p.tokenCoin,
          tokenPc: p.tokenPc,
          coinReserve: BigInt(p.coinReserve),
          pcReserve: BigInt(p.pcReserve),
        };
        return buildRaydiumAmmV4SellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          inputAmount: inputAmt,
          slippageBasisPoints: slippage,
          fixedOutputAmount:
            params.fixedOutputTokenAmount !== undefined
              ? BigInt(params.fixedOutputTokenAmount)
              : undefined,
          createOutputMintAta: params.createOutputTokenAta ?? false,
          closeOutputMintAta: params.closeOutputTokenAta ?? false,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          protocolParams,
        });
      }
      case DexType.MeteoraDammV2: {
        if (ext.type !== 'MeteoraDammV2') throw new TradeError(5, 'Invalid Meteora params');
        if (params.fixedOutputTokenAmount === undefined) {
          throw new TradeError(
            8,
            'Meteora DAMM V2 requires fixedOutputTokenAmount (builder parity)'
          );
        }
        const p = ext.params;
        return buildMeteoraDammV2SellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          outputMint: this.getOutputMint(params.outputTokenType),
          inputAmount: inputAmt,
          fixedOutputAmount: BigInt(params.fixedOutputTokenAmount),
          createOutputMintAta: params.createOutputTokenAta ?? false,
          closeOutputMintAta: params.closeOutputTokenAta ?? false,
          closeInputMintAta: params.closeMintTokenAta ?? false,
          protocolParams: {
            pool: p.pool,
            tokenAVault: p.tokenAVault,
            tokenBVault: p.tokenBVault,
            tokenAMint: p.tokenAMint,
            tokenBMint: p.tokenBMint,
            tokenAProgram: p.tokenAProgram,
            tokenBProgram: p.tokenBProgram,
          },
        });
      }
      default:
        throw new TradeError(4, `Unsupported DEX type: ${String(params.dexType)}`);
    }
  }

  private getInputMint(tokenType: TradeTokenType): PublicKey {
    switch (tokenType) {
      case TradeTokenType.SOL:
        return SDK_CONSTANTS.SOL_TOKEN_ACCOUNT;
      case TradeTokenType.WSOL:
        return SDK_CONSTANTS.WSOL_TOKEN_ACCOUNT;
      case TradeTokenType.USDC:
        return SDK_CONSTANTS.USDC_TOKEN_ACCOUNT;
      case TradeTokenType.USD1:
        return SDK_CONSTANTS.USD1_TOKEN_ACCOUNT;
      default:
        throw new TradeError(3, `Unsupported token type: ${tokenType}`);
    }
  }

  private getOutputMint(tokenType: TradeTokenType): PublicKey {
    return this.getInputMint(tokenType);
  }

  private async processMiddlewares(
    instructions: TransactionInstruction[],
    tradeType: TradeType,
    params: TradeBuyParams | TradeSellParams
  ): Promise<TransactionInstruction[]> {
    let result = instructions;

    const inputMint =
      'inputTokenType' in params
        ? this.getInputMint(params.inputTokenType)
        : params.mint;
    const outputMint =
      'inputTokenType' in params
        ? params.mint
        : this.getOutputMint(params.outputTokenType);

    for (const middleware of this.middlewares) {
      result = await middleware.process(result, {
        tradeType,
        inputMint,
        outputMint,
        inputAmount: params.inputTokenAmount,
        payer: this.payer.publicKey,
      });
    }

    return result;
  }

  private async executeTransaction(
    instructions: TransactionInstruction[],
    recentBlockhash?: string,
    lookupTableAccount?: AddressLookupTableAccount,
    waitConfirmed?: boolean,
    simulate?: boolean,
    execCtx?: TxExecContext
  ): Promise<TradeResult> {
    const blockhash =
      recentBlockhash ??
      execCtx?.durableNonce?.nonceHash ??
      (await this.connection.getLatestBlockhash(this.rpcCommitment())).blockhash;

    const swqosList = this._config.swqosConfigs ?? [];
    const tradeType = execCtx?.tradeType ?? TradeType.Buy;
    const withTip = execCtx?.withTip ?? true;

    const swqosMod =
      swqosList.length > 0 ? await import('./swqos/clients') : null;

    let effectiveSwqos = swqosList;
    if (swqosMod && !withTip) {
      effectiveSwqos = filterSwqosConfigsForWithTip(swqosList, withTip);
      if (effectiveSwqos.length === 0) {
        return {
          success: false,
          signatures: [],
          error: new TradeError(
            102,
            'No Rpc Default Swqos configured when withTip is false'
          ),
          timings: [],
        };
      }
    }

    const flatGas = !!(
      execCtx?.gasFeeStrategy ?? this._config.gasFeeStrategy
    );
    /** Rust: per-row `check_min_tip` when using `GasFeeStrategy` table (not flat override). */
    const useStrategyRowMinTip = !!(
      this._config.gasStrategy && !flatGas
    );

    let gasMerged = resolveMergedGas(
      execCtx?.gasFeeStrategy,
      this._config.gasFeeStrategy,
      this._config.gasStrategy,
      effectiveSwqos[0]?.type
    );

    if (
      swqosMod &&
      (this._config.checkMinTip ?? false) &&
      withTip &&
      !useStrategyRowMinTip
    ) {
      effectiveSwqos = filterSwqosConfigsByMinTip(
        swqosMod,
        effectiveSwqos,
        tradeType,
        gasMerged,
        this._config.mevProtection,
        this._config.rpcUrl,
        this._logEnabled
      );
      if (effectiveSwqos.length === 0) {
        return {
          success: false,
          signatures: [],
          error: new TradeError(
            103,
            'All SWQOS providers filtered out by checkMinTip (tip below minimum)'
          ),
          timings: [],
        };
      }
      gasMerged = resolveMergedGas(
        execCtx?.gasFeeStrategy,
        this._config.gasFeeStrategy,
        this._config.gasStrategy,
        effectiveSwqos[0]?.type
      );
    }

    let swqosTasks: SwqosGasTask[] = [];
    if (swqosMod) {
      swqosTasks = expandSwqosGasTasks(
        effectiveSwqos,
        tradeType,
        execCtx?.gasFeeStrategy,
        this._config.gasFeeStrategy,
        this._config.gasStrategy,
        useStrategyRowMinTip,
        this._config.checkMinTip ?? false,
        withTip,
        swqosMod,
        this._config.mevProtection,
        this._config.rpcUrl,
        this._logEnabled
      );
      if (swqosTasks.length === 0) {
        return {
          success: false,
          signatures: [],
          error: new TradeError(
            103,
            'All SWQOS providers filtered out by checkMinTip (tip below minimum)'
          ),
          timings: [],
        };
      }
    }

    if (
      swqosList.length > 0 &&
      tradeType === TradeType.Buy &&
      swqosTasks.length > 1 &&
      !execCtx?.durableNonce
    ) {
      return {
        success: false,
        signatures: [],
        error: new TradeError(
          104,
          'Multiple SWQOS transactions require durable_nonce to be set (Rust SDK parity)'
        ),
        timings: [],
      };
    }

    const nonceAdvanceIx =
      execCtx?.durableNonce?.nonceAccount
        ? SystemProgram.nonceAdvance({
            noncePubkey: execCtx.durableNonce.nonceAccount,
            authorizedPubkey: execCtx.durableNonce.authority,
          })
        : null;

    const buildWired = (
      gas: GasFeeStrategyConfig | undefined,
      tipRecipient: PublicKey | null,
      addTip: boolean
    ): TransactionInstruction[] => [
      ...(nonceAdvanceIx ? [nonceAdvanceIx] : []),
      ...buildInstructionListWithGasAndTip(
        instructions,
        this.payer.publicKey,
        tradeType,
        gas,
        tipRecipient,
        addTip
      ),
    ];

    /** Rust `transaction_builder::build_versioned_transaction`: after full ix assembly, before sign. */
    const finalizeWiredForSign = (
      wired: TransactionInstruction[]
    ): TransactionInstruction[] => {
      const mgr = this._config.middlewareManager;
      if (!mgr || execCtx?.dexType === undefined) return wired;
      return mgr.applyMiddlewaresProcessFullInstructions(
        wired,
        String(execCtx.dexType),
        execCtx.tradeType === TradeType.Buy
      );
    };

    if (this._logEnabled && execCtx?.grpcRecvUs != null && typeof performance !== 'undefined') {
      const nowUs = Math.round(performance.now() * 1000);
      const deltaUs = nowUs - execCtx.grpcRecvUs;
      console.info(`[sol-trade-sdk] grpc_recv_us → build tx: ~${deltaUs}µs (approx)`);
    }

    try {
      if (simulate) {
        if (swqosMod && swqosTasks.length > 0) {
          const t = swqosTasks[0]!;
          const tipSim = withTip
            ? resolveTipRecipientPubkey(
                swqosMod,
                [t.cfg],
                this._config.mevProtection,
                this._config.rpcUrl
              )
            : null;
          const txSim = buildSignedVersionedTransaction(
            this.payer,
            finalizeWiredForSign(buildWired(t.gas, tipSim, withTip)),
            blockhash,
            lookupTableAccount
          );
          const sim = await this.connection.simulateTransaction(
            txSim,
            RUST_PARITY_SIMULATE_CONFIG
          );
          const err = sim.value.err;
          return {
            success: err === null,
            signatures: [],
            error: err
              ? new TradeError(101, `Simulation failed: ${JSON.stringify(err)}`)
              : undefined,
            timings: [],
            simulation: {
              unitsConsumed: sim.value.unitsConsumed,
              logs: sim.value.logs ?? null,
            },
          };
        }
        const gSim = resolveMergedGas(
          execCtx?.gasFeeStrategy,
          this._config.gasFeeStrategy,
          this._config.gasStrategy,
          undefined
        );
        const txSim = buildSignedVersionedTransaction(
          this.payer,
          finalizeWiredForSign(buildWired(gSim, null, false)),
          blockhash,
          lookupTableAccount
        );
        const sim = await this.connection.simulateTransaction(
          txSim,
          RUST_PARITY_SIMULATE_CONFIG
        );
        const err = sim.value.err;
        return {
          success: err === null,
          signatures: [],
          error: err
            ? new TradeError(101, `Simulation failed: ${JSON.stringify(err)}`)
            : undefined,
          timings: [],
          simulation: {
            unitsConsumed: sim.value.unitsConsumed,
            logs: sim.value.logs ?? null,
          },
        };
      }

      if (swqosMod) {
        const timings: SwqosTiming[] = [];
        const signatures: string[] = [];
        const submitConcurrency =
          this._config.maxSwqosSubmitConcurrency ?? swqosTasks.length;
        const results = await mapWithConcurrencyLimit(
          swqosTasks,
          submitConcurrency,
          async (task) => {
            const t0 = performance.now();
            const tipPk = withTip
              ? resolveTipRecipientPubkey(
                  swqosMod,
                  [task.cfg],
                  this._config.mevProtection,
                  this._config.rpcUrl
                )
              : null;
            const tx = buildSignedVersionedTransaction(
              this.payer,
              finalizeWiredForSign(buildWired(task.gas, tipPk, withTip)),
              blockhash,
              lookupTableAccount
            );
            const raw = Buffer.from(tx.serialize());
            const client = swqosMod.ClientFactory.createClient(
              mapSwqosToClientConfig(task.cfg, this._config.mevProtection),
              this._config.rpcUrl
            );
            try {
              const pending = client.sendTransaction(tradeType, raw, false);
              const sig = await (!waitConfirmed
                ? Promise.race([
                    pending,
                    new Promise<never>((_, reject) =>
                      setTimeout(
                        () =>
                          reject(
                            new Error(
                              `SWQOS submit timed out after ${SWQOS_SUBMIT_TIMEOUT_MS_WHEN_NO_CONFIRM}ms`
                            )
                          ),
                        SWQOS_SUBMIT_TIMEOUT_MS_WHEN_NO_CONFIRM
                      )
                    ),
                  ])
                : pending);
              const duration = Math.round((performance.now() - t0) * 1000);
              return { ok: true as const, sig, task, duration };
            } catch (e) {
              const duration = Math.round((performance.now() - t0) * 1000);
              return { ok: false as const, err: e, task, duration };
            }
          }
        );

        for (const v of results) {
          timings.push({
            swqosType: v.task.cfg.type,
            duration: v.duration,
            gasFeeStrategyType: v.task.strategyType,
          });
          if (v.ok) {
            signatures.push(v.sig);
          }
        }

        const success = signatures.length > 0;
        if (success && waitConfirmed && signatures.length > 0) {
          await confirmAnyTransactionSignature(this.connection, signatures, {
            commitment: this._config.commitment ?? 'confirmed',
          });
        }

        return {
          success,
          signatures: success ? signatures : [],
          error: success
            ? undefined
            : new TradeError(100, 'All SWQOS submissions failed'),
          timings,
        };
      }

      const gRpc = resolveMergedGas(
        execCtx?.gasFeeStrategy,
        this._config.gasFeeStrategy,
        this._config.gasStrategy,
        undefined
      );
      const txRpc = buildSignedVersionedTransaction(
        this.payer,
        finalizeWiredForSign(buildWired(gRpc, null, false)),
        blockhash,
        lookupTableAccount
      );
      const signature = await this.connection.sendRawTransaction(
        Buffer.from(txRpc.serialize())
      );

      if (waitConfirmed) {
        await this.connection.confirmTransaction(
          signature,
          this._config.commitment ?? 'confirmed'
        );
      }

      return {
        success: true,
        signatures: [signature],
        timings: [],
      };
    } catch (error) {
      if (error instanceof TradeError) {
        return {
          success: false,
          signatures: [],
          error,
          timings: [],
        };
      }
      return {
        success: false,
        signatures: [],
        error: new TradeError(100, 'Transaction failed', error as Error),
        timings: [],
      };
    }
  }
}

/**
 * Create a new gas fee strategy with defaults
 */
export function createGasFeeStrategy(): GasFeeStrategyClass {
  return new GasFeeStrategyClass();
}

/**
 * Create a new trade config (shorthand for {@link TradeConfig} / {@link TradeConfigBuilder}).
 */
export function createTradeConfig(
  rpcUrl: string,
  swqosConfigs: SwqosConfig[] = [],
  options?: Partial<Omit<TradeConfig, 'rpcUrl' | 'swqosConfigs'>>
): TradeConfig {
  const { commitment, logEnabled, ...rest } = options ?? {};
  return {
    rpcUrl,
    swqosConfigs,
    ...rest,
    commitment: commitment ?? 'confirmed',
    logEnabled: logEnabled ?? true,
  };
}

// Re-export utilities
export * from './constants';
export * from './instruction';
export * from './params';
export * from './utils';

// Re-export hotpath module
export * from './hotpath';

// Re-export gas fee strategy class
export { GasFeeStrategy, GasFeeStrategyType } from './common/gas-fee-strategy';
export type { GasFeeStrategyValue } from './common/gas-fee-strategy';

// Rust `trading/core/execution` parity (preprocess, prefetch, size estimate)
export {
  InstructionProcessor,
  Prefetch,
  ExecutionPath,
  MAX_INSTRUCTIONS_WARN,
  BYTES_PER_ACCOUNT,
} from './execution/execution';

export {
  confirmAnyTransactionSignature,
  commitmentToGetTxFinality,
  extractHintsFromLogs,
  instructionErrorCodeFromMetaErr,
  type ConfirmAnySignatureOptions,
} from './common/confirm-any-signature';
export { mapWithConcurrencyLimit } from './common/map-pool';

// Durable nonce (Rust `nonce_cache`)
export { fetchDurableNonceInfo } from './common/nonce';
export type { FetchedDurableNonce } from './common/nonce';

// Re-export security module
export * from './security';

// Re-export address lookup module
export * from './address-lookup';

// Re-export trading factory
export * from './trading/factory';

// Re-export middleware module
export * from './middleware/traits';
