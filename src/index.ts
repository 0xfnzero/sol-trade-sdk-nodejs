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
import { cpus } from 'node:os';

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
import { InstructionProcessor, Prefetch } from './execution/execution';
import type { SwqosClient as RuntimeSwqosClient } from './swqos/clients';

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
 * Account lifecycle policy for high-level trade requests.
 */
export enum AccountPolicy {
  Auto = 'Auto',
  HotPathMinimal = 'HotPathMinimal',
  CreateMissing = 'CreateMissing',
  AssumePrepared = 'AssumePrepared',
}

/**
 * High-level buy sizing intent.
 */
export type BuyAmount =
  | { type: 'ExactInput'; amount: number }
  | { type: 'ExactOutput'; outputAmount: number; maxInputAmount: number }
  | { type: 'WithMaxInput'; quoteAmount: number };

export const BuyAmount = {
  ExactInput: (amount: number): BuyAmount => ({ type: 'ExactInput', amount }),
  ExactOutput: (outputAmount: number, maxInputAmount: number): BuyAmount => ({
    type: 'ExactOutput',
    outputAmount,
    maxInputAmount,
  }),
  WithMaxInput: (quoteAmount: number): BuyAmount => ({ type: 'WithMaxInput', quoteAmount }),
} as const;

/**
 * High-level sell sizing intent.
 */
export type SellAmount =
  | { type: 'ExactInput'; amount: number }
  | { type: 'ExactOutput'; outputAmount: number; maxInputAmount: number };

export const SellAmount = {
  ExactInput: (amount: number): SellAmount => ({ type: 'ExactInput', amount }),
  ExactOutput: (outputAmount: number, maxInputAmount: number): SellAmount => ({
    type: 'ExactOutput',
    outputAmount,
    maxInputAmount,
  }),
} as const;

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
  Dublin = 'Dublin',
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
  Solami = 'Solami',
  Triton = 'Triton',
  QuickNode = 'QuickNode',
  Syndica = 'Syndica',
  Figment = 'Figment',
  Alchemy = 'Alchemy',
}

export enum SwqosTransport {
  Http = 'Http',
  Grpc = 'Grpc',
  Quic = 'Quic',
}

export enum AstralaneTransport {
  Binary = 'Binary',
  Plain = 'Plain',
  Quic = 'Quic',
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
  transport?: SwqosTransport;
  astralaneTransport?: AstralaneTransport;
  swqosOnly?: boolean;
}

const SWQOS_BLACKLISTED_TYPES = new Set<SwqosType>([
  SwqosType.NextBlock,
]);

export function isSwqosTypeBlacklisted(type: SwqosType): boolean {
  return SWQOS_BLACKLISTED_TYPES.has(type);
}

function normalizeSwqosConfigs(rpcUrl: string, configs: SwqosConfig[]): SwqosConfig[] {
  const out = [...configs];
  if (!out.some((c) => c.type === SwqosType.Default)) {
    out.push({
      type: SwqosType.Default,
      region: SwqosRegion.Default,
      apiKey: '',
      customUrl: rpcUrl,
    });
  }
  return out.filter((c) => !isSwqosTypeBlacklisted(c.type));
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
  waitForAllSubmits?: boolean;
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
  waitForAllSubmits?: boolean;
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
 * Simple buy request that describes trade intent instead of low-level ATA flags.
 */
export interface SimpleBuyParams {
  dexType: DexType;
  payWith: TradeTokenType;
  mint: PublicKey;
  amount: BuyAmount;
  extensionParams: DexParamEnum;
  recentBlockhash?: string;
  gasFeeStrategy?: GasFeeStrategyConfig;
  slippageBasisPoints?: number;
  accountPolicy?: AccountPolicy;
  addressLookupTableAccount?: AddressLookupTableAccount;
  waitTxConfirmed?: boolean;
  waitForAllSubmits?: boolean;
  durableNonce?: DurableNonceInfo;
  simulate?: boolean;
  grpcRecvUs?: number;
}

/**
 * Simple sell request that describes trade intent instead of low-level ATA flags.
 */
export interface SimpleSellParams {
  dexType: DexType;
  receiveAs: TradeTokenType;
  mint: PublicKey;
  amount: SellAmount;
  extensionParams: DexParamEnum;
  recentBlockhash?: string;
  gasFeeStrategy?: GasFeeStrategyConfig;
  slippageBasisPoints?: number;
  accountPolicy?: AccountPolicy;
  addressLookupTableAccount?: AddressLookupTableAccount;
  waitTxConfirmed?: boolean;
  waitForAllSubmits?: boolean;
  durableNonce?: DurableNonceInfo;
  simulate?: boolean;
  withTip?: boolean;
  grpcRecvUs?: number;
}

export function createSimpleBuyParams(
  dexType: DexType,
  payWith: TradeTokenType,
  mint: PublicKey,
  amount: BuyAmount,
  extensionParams: DexParamEnum,
  recentBlockhash: string,
  gasFeeStrategy?: GasFeeStrategyConfig
): SimpleBuyParams {
  return {
    dexType,
    payWith,
    mint,
    amount,
    extensionParams,
    recentBlockhash,
    gasFeeStrategy,
    accountPolicy: AccountPolicy.Auto,
    waitTxConfirmed: false,
    waitForAllSubmits: false,
    simulate: false,
  };
}

export function createSimpleBuyParamsWithDurableNonce(
  dexType: DexType,
  payWith: TradeTokenType,
  mint: PublicKey,
  amount: BuyAmount,
  extensionParams: DexParamEnum,
  durableNonce: DurableNonceInfo,
  gasFeeStrategy?: GasFeeStrategyConfig
): SimpleBuyParams {
  return {
    ...createSimpleBuyParams(dexType, payWith, mint, amount, extensionParams, '', gasFeeStrategy),
    recentBlockhash: undefined,
    durableNonce,
  };
}

export function createSimpleSellParams(
  dexType: DexType,
  receiveAs: TradeTokenType,
  mint: PublicKey,
  amount: SellAmount,
  extensionParams: DexParamEnum,
  recentBlockhash: string,
  gasFeeStrategy?: GasFeeStrategyConfig
): SimpleSellParams {
  return {
    dexType,
    receiveAs,
    mint,
    amount,
    extensionParams,
    recentBlockhash,
    gasFeeStrategy,
    accountPolicy: AccountPolicy.Auto,
    waitTxConfirmed: false,
    waitForAllSubmits: false,
    simulate: false,
    withTip: true,
  };
}

export function createSimpleSellParamsWithDurableNonce(
  dexType: DexType,
  receiveAs: TradeTokenType,
  mint: PublicKey,
  amount: SellAmount,
  extensionParams: DexParamEnum,
  durableNonce: DurableNonceInfo,
  gasFeeStrategy?: GasFeeStrategyConfig
): SimpleSellParams {
  return {
    ...createSimpleSellParams(dexType, receiveAs, mint, amount, extensionParams, '', gasFeeStrategy),
    recentBlockhash: undefined,
    durableNonce,
  };
}

export function withSimpleBuySlippage(params: SimpleBuyParams, value: number): SimpleBuyParams {
  return { ...params, slippageBasisPoints: value };
}

export function withSimpleBuyAccountPolicy(
  params: SimpleBuyParams,
  value: AccountPolicy
): SimpleBuyParams {
  return { ...params, accountPolicy: value };
}

export function withSimpleBuyAddressLookupTableAccount(
  params: SimpleBuyParams,
  value: AddressLookupTableAccount
): SimpleBuyParams {
  return { ...params, addressLookupTableAccount: value };
}

export function withSimpleBuyDurableNonce(
  params: SimpleBuyParams,
  value: DurableNonceInfo
): SimpleBuyParams {
  return { ...params, durableNonce: value, recentBlockhash: undefined };
}

export function withSimpleBuyWaitTxConfirmed(
  params: SimpleBuyParams,
  value: boolean
): SimpleBuyParams {
  return { ...params, waitTxConfirmed: value };
}

export function withSimpleBuyWaitForAllSubmits(
  params: SimpleBuyParams,
  value: boolean
): SimpleBuyParams {
  return { ...params, waitForAllSubmits: value };
}

export function withSimpleBuySimulate(params: SimpleBuyParams, value: boolean): SimpleBuyParams {
  return { ...params, simulate: value };
}

export function withSimpleBuyGrpcRecvUs(params: SimpleBuyParams, value: number): SimpleBuyParams {
  return { ...params, grpcRecvUs: value };
}

export function withSimpleSellSlippage(params: SimpleSellParams, value: number): SimpleSellParams {
  return { ...params, slippageBasisPoints: value };
}

export function withSimpleSellAccountPolicy(
  params: SimpleSellParams,
  value: AccountPolicy
): SimpleSellParams {
  return { ...params, accountPolicy: value };
}

export function withSimpleSellAddressLookupTableAccount(
  params: SimpleSellParams,
  value: AddressLookupTableAccount
): SimpleSellParams {
  return { ...params, addressLookupTableAccount: value };
}

export function withSimpleSellDurableNonce(
  params: SimpleSellParams,
  value: DurableNonceInfo
): SimpleSellParams {
  return { ...params, durableNonce: value, recentBlockhash: undefined };
}

export function withSimpleSellWaitTxConfirmed(
  params: SimpleSellParams,
  value: boolean
): SimpleSellParams {
  return { ...params, waitTxConfirmed: value };
}

export function withSimpleSellWaitForAllSubmits(
  params: SimpleSellParams,
  value: boolean
): SimpleSellParams {
  return { ...params, waitForAllSubmits: value };
}

export function withSimpleSellSimulate(params: SimpleSellParams, value: boolean): SimpleSellParams {
  return { ...params, simulate: value };
}

export function withSimpleSellTip(params: SimpleSellParams, value: boolean): SimpleSellParams {
  return { ...params, withTip: value };
}

export function withSimpleSellGrpcRecvUs(params: SimpleSellParams, value: number): SimpleSellParams {
  return { ...params, grpcRecvUs: value };
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
  observedTradeCreator?: PublicKey;
  feeSharingCreatorVaultIfActive?: PublicKey;
  closeTokenAccountWhenSell?: boolean;
  /** Event-adapter fee recipient; omit or `PublicKey.default` for SDK random pool (Rust parity). */
  feeRecipient?: PublicKey;
  /** PumpFun V2 quote mint; omit or default pubkey for WSOL. */
  quoteMint?: PublicKey;
}

export interface ParserPumpFunTradeEvent {
  mint?: string | PublicKey;
  bonding_curve?: string | PublicKey;
  associated_bonding_curve?: string | PublicKey;
  creator?: string | PublicKey;
  creator_vault?: string | PublicKey;
  virtual_token_reserves?: bigint | number | string;
  virtual_sol_reserves?: bigint | number | string;
  virtual_quote_reserves?: bigint | number | string;
  real_token_reserves?: bigint | number | string;
  real_sol_reserves?: bigint | number | string;
  real_quote_reserves?: bigint | number | string;
  token_program?: string | PublicKey;
  fee_recipient?: string | PublicKey;
  quote_mint?: string | PublicKey;
  is_cashback_coin?: boolean;
  mayhem_mode?: boolean;
}

function parserPublicKey(value: string | PublicKey | undefined): PublicKey {
  if (!value) return PublicKey.default;
  if (value instanceof PublicKey) return value;
  if (value === PublicKey.default.toBase58()) return PublicKey.default;
  return new PublicKey(value);
}

function pumpFunQuoteMintForLayout(quoteMint: PublicKey): PublicKey {
  if (quoteMint.equals(PublicKey.default) || quoteMint.equals(SDK_CONSTANTS.SOL_TOKEN_ACCOUNT)) {
    return PublicKey.default;
  }
  return quoteMint;
}

function parserU64(value: bigint | number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'bigint' ? value : BigInt(value);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TradeError(106, `event u64 value ${n.toString()} exceeds JavaScript safe integer range`);
  }
  return Number(n);
}

/**
 * Build PumpFun params from an already-decoded trade event object.
 * The event's `virtual_quote_reserves` / `real_quote_reserves` are mapped to
 * the SDK's quote reserve fields used by slippage calculation.
 */
export function pumpFunParamsFromParserTrade(
  event: ParserPumpFunTradeEvent,
  closeTokenAccountWhenSell?: boolean
): PumpFunParams {
  const quoteMint = parserPublicKey(event.quote_mint);
  const legacySolQuote =
    quoteMint.equals(PublicKey.default) || quoteMint.equals(SDK_CONSTANTS.SOL_TOKEN_ACCOUNT);
  const hasVirtualQuote = event.virtual_quote_reserves !== undefined;
  const hasRealQuote = event.real_quote_reserves !== undefined;
  const virtualQuote =
    !legacySolQuote && hasVirtualQuote
      ? parserU64(event.virtual_quote_reserves)
      : parserU64(event.virtual_sol_reserves);
  const realQuote =
    !legacySolQuote && hasRealQuote
      ? parserU64(event.real_quote_reserves)
      : parserU64(event.real_sol_reserves);
  const creator = parserPublicKey(event.creator);
  return {
    bondingCurve: {
      discriminator: 0,
      account: parserPublicKey(event.bonding_curve),
      virtualTokenReserves: parserU64(event.virtual_token_reserves),
      virtualSolReserves: virtualQuote,
      realTokenReserves: parserU64(event.real_token_reserves),
      realSolReserves: realQuote,
      tokenTotalSupply: 0,
      complete: false,
      creator,
      isMayhemMode: !!event.mayhem_mode,
      isCashbackCoin: !!event.is_cashback_coin,
    },
    associatedBondingCurve: parserPublicKey(event.associated_bonding_curve),
    creatorVault: parserPublicKey(event.creator_vault),
    tokenProgram: parserPublicKey(event.token_program),
    closeTokenAccountWhenSell,
    feeRecipient: parserPublicKey(event.fee_recipient),
    quoteMint: pumpFunQuoteMintForLayout(quoteMint),
    observedTradeCreator: creator.equals(PublicKey.default) ? undefined : creator,
  };
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

export interface ParserPumpSwapTradeEvent {
  pool?: string | PublicKey;
  base_mint?: string | PublicKey;
  quote_mint?: string | PublicKey;
  pool_base_token_account?: string | PublicKey;
  pool_quote_token_account?: string | PublicKey;
  pool_base_token_reserves?: bigint | number | string;
  pool_quote_token_reserves?: bigint | number | string;
  coin_creator_vault_ata?: string | PublicKey;
  coin_creator_vault_authority?: string | PublicKey;
  base_token_program?: string | PublicKey;
  quote_token_program?: string | PublicKey;
  is_mayhem_mode?: boolean;
  is_cashback_coin?: boolean;
}

export function pumpSwapParamsFromParserTrade(event: ParserPumpSwapTradeEvent): PumpSwapParams {
  return {
    pool: parserPublicKey(event.pool),
    baseMint: parserPublicKey(event.base_mint),
    quoteMint: parserPublicKey(event.quote_mint),
    poolBaseTokenAccount: parserPublicKey(event.pool_base_token_account),
    poolQuoteTokenAccount: parserPublicKey(event.pool_quote_token_account),
    poolBaseTokenReserves: parserU64(event.pool_base_token_reserves),
    poolQuoteTokenReserves: parserU64(event.pool_quote_token_reserves),
    coinCreatorVaultAta: parserPublicKey(event.coin_creator_vault_ata),
    coinCreatorVaultAuthority: parserPublicKey(event.coin_creator_vault_authority),
    baseTokenProgram: parserPublicKey(event.base_token_program),
    quoteTokenProgram: parserPublicKey(event.quote_token_program),
    isMayhemMode: !!event.is_mayhem_mode,
    isCashbackCoin: !!event.is_cashback_coin,
  };
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
  ammOpenOrders: PublicKey;
  ammTargetOrders: PublicKey;
  serumProgram: PublicKey;
  serumMarket: PublicKey;
  serumBids: PublicKey;
  serumAsks: PublicKey;
  serumEventQueue: PublicKey;
  serumCoinVaultAccount: PublicKey;
  serumPcVaultAccount: PublicKey;
  serumVaultSigner: PublicKey;
  coinReserve: bigint;
  pcReserve: bigint;
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
  /** Prefer assigning SWQOS submit threads from the end of the CPU core list. */
  swqosCoresFromEnd?: boolean;
  /** If true, best-effort background WSOL ATA creation after connect (Rust `create_wsol_ata_on_startup`). */
  createWsolAtaOnStartup?: boolean;
  /**
   * Rust `MiddlewareManager`: `process_protocol_instructions` before gas/tip wiring;
   * `process_full_instructions` after nonce + tip + compute budget + protocol (see `transaction_builder.rs`).
   */
  middlewareManager?: MiddlewareManager;
  /**
   * Deprecated compatibility field. Submit hot path starts every SWQOS/default RPC route
   * immediately so the required default RPC lane is never delayed behind a local cap.
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
  private _swqosCoresFromEnd: boolean = false;
  private _createWsolAtaOnStartup: boolean = true;
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
    this._swqosConfigs = normalizeSwqosConfigs(this._rpcUrl, configs);
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

  swqosCoresFromEnd(enabled: boolean): this {
    this._swqosCoresFromEnd = enabled;
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
      swqosConfigs: normalizeSwqosConfigs(this._rpcUrl, this._swqosConfigs),
      commitment: this._commitment,
      logEnabled: this._logEnabled,
      checkMinTip: this._checkMinTip,
      mevProtection: this._mevProtection,
      useSeedOptimize: this._useSeedOptimize,
      swqosCoresFromEnd: this._swqosCoresFromEnd,
      createWsolAtaOnStartup: this._createWsolAtaOnStartup,
      gasFeeStrategy: this._gasFeeStrategy,
      gasStrategy: this._gasStrategy,
      middlewareManager: this._middlewareManager,
      maxSwqosSubmitConcurrency: this._maxSwqosSubmitConcurrency,
    };
  }
}

export function recommendedSenderThreadCoreIndices(
  swqosCount: number,
  availableCores: number = cpus().length,
  fromEnd: boolean = true
): number[] {
  if (swqosCount <= 0 || availableCores <= 0) {
    return [];
  }
  const maxByCores = Math.max(Math.floor((availableCores * 2) / 3), 1);
  const count = Math.min(swqosCount, maxByCores, availableCores);
  if (fromEnd) {
    return Array.from({ length: count }, (_, i) => availableCores - count + i);
  }
  return Array.from({ length: count }, (_, i) => i);
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

function buyAccountFlags(policy: AccountPolicy = AccountPolicy.Auto): {
  createInputTokenAta: boolean;
  createMintAta: boolean;
  closeInputTokenAta: boolean;
} {
  switch (policy) {
    case AccountPolicy.HotPathMinimal:
    case AccountPolicy.AssumePrepared:
      return {
        createInputTokenAta: false,
        createMintAta: false,
        closeInputTokenAta: false,
      };
    case AccountPolicy.CreateMissing:
      return {
        createInputTokenAta: true,
        createMintAta: true,
        closeInputTokenAta: false,
      };
    case AccountPolicy.Auto:
    default:
      return {
        createInputTokenAta: false,
        createMintAta: true,
        closeInputTokenAta: false,
      };
  }
}

function sellAccountFlags(
  policy: AccountPolicy = AccountPolicy.Auto,
  receiveAs: TradeTokenType
): {
  createOutputTokenAta: boolean;
  closeOutputTokenAta: boolean;
  closeMintTokenAta: boolean;
} {
  switch (policy) {
    case AccountPolicy.HotPathMinimal:
    case AccountPolicy.AssumePrepared:
      return {
        createOutputTokenAta: false,
        closeOutputTokenAta: false,
        closeMintTokenAta: false,
      };
    case AccountPolicy.CreateMissing:
      return {
        createOutputTokenAta: true,
        closeOutputTokenAta: false,
        closeMintTokenAta: false,
      };
    case AccountPolicy.Auto:
    default:
      return {
        createOutputTokenAta: receiveAs !== TradeTokenType.SOL,
        closeOutputTokenAta: false,
        closeMintTokenAta: false,
      };
  }
}

export function simpleBuyParamsToTradeBuyParams(
  params: SimpleBuyParams
): TradeBuyParams {
  let inputTokenAmount: number;
  let fixedOutputTokenAmount: number | undefined;
  let useExactSolAmount: boolean;

  switch (params.amount.type) {
    case 'ExactInput':
      inputTokenAmount = params.amount.amount;
      useExactSolAmount = true;
      break;
    case 'ExactOutput':
      inputTokenAmount = params.amount.maxInputAmount;
      fixedOutputTokenAmount = params.amount.outputAmount;
      useExactSolAmount = true;
      break;
    case 'WithMaxInput':
      inputTokenAmount = params.amount.quoteAmount;
      useExactSolAmount = false;
      break;
  }

  const flags = buyAccountFlags(params.accountPolicy);
  return {
    dexType: params.dexType,
    inputTokenType: params.payWith,
    mint: params.mint,
    inputTokenAmount,
    slippageBasisPoints: params.slippageBasisPoints,
    recentBlockhash: params.durableNonce ? undefined : params.recentBlockhash,
    extensionParams: params.extensionParams,
    addressLookupTableAccount: params.addressLookupTableAccount,
    waitTxConfirmed: params.waitTxConfirmed ?? false,
    waitForAllSubmits: params.waitForAllSubmits ?? false,
    createInputTokenAta: flags.createInputTokenAta,
    closeInputTokenAta: flags.closeInputTokenAta,
    createMintAta: flags.createMintAta,
    durableNonce: params.durableNonce,
    fixedOutputTokenAmount,
    gasFeeStrategy: params.gasFeeStrategy,
    simulate: params.simulate ?? false,
    useExactSolAmount,
    grpcRecvUs: params.grpcRecvUs,
  };
}

export function simpleSellParamsToTradeSellParams(
  params: SimpleSellParams
): TradeSellParams {
  let inputTokenAmount: number;
  let fixedOutputTokenAmount: number | undefined;

  switch (params.amount.type) {
    case 'ExactInput':
      inputTokenAmount = params.amount.amount;
      break;
    case 'ExactOutput':
      inputTokenAmount = params.amount.maxInputAmount;
      fixedOutputTokenAmount = params.amount.outputAmount;
      break;
  }

  const flags = sellAccountFlags(params.accountPolicy, params.receiveAs);
  return {
    dexType: params.dexType,
    outputTokenType: params.receiveAs,
    mint: params.mint,
    inputTokenAmount,
    slippageBasisPoints: params.slippageBasisPoints,
    recentBlockhash: params.durableNonce ? undefined : params.recentBlockhash,
    withTip: params.withTip ?? true,
    extensionParams: params.extensionParams,
    addressLookupTableAccount: params.addressLookupTableAccount,
    waitTxConfirmed: params.waitTxConfirmed ?? false,
    waitForAllSubmits: params.waitForAllSubmits ?? false,
    createOutputTokenAta: flags.createOutputTokenAta,
    closeOutputTokenAta: flags.closeOutputTokenAta,
    closeMintTokenAta: flags.closeMintTokenAta,
    durableNonce: params.durableNonce,
    fixedOutputTokenAmount,
    gasFeeStrategy: params.gasFeeStrategy,
    simulate: params.simulate ?? false,
    grpcRecvUs: params.grpcRecvUs,
  };
}

function mapPumpFunParams(p: PumpFunParams): PumpFunBuilderParams {
  const bc = p.bondingCurve;
  return {
    bondingCurve: {
      account: bc.account,
      virtualTokenReserves: BigInt(bc.virtualTokenReserves),
      virtualSolReserves: BigInt(bc.virtualSolReserves),
      realTokenReserves: BigInt(bc.realTokenReserves),
      creator: bc.creator,
      isMayhemMode: bc.isMayhemMode,
      isCashbackCoin: bc.isCashbackCoin,
    },
    creatorVault: p.creatorVault,
    tokenProgram: p.tokenProgram,
    associatedBondingCurve: p.associatedBondingCurve,
    observedTradeCreator: p.observedTradeCreator,
    feeSharingCreatorVaultIfActive: p.feeSharingCreatorVaultIfActive,
    closeTokenAccountWhenSell: p.closeTokenAccountWhenSell,
    feeRecipient: p.feeRecipient,
    quoteMint: p.quoteMint,
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
  waitForAllSubmits?: boolean;
  /** Rust `execute_parallel`: multi-SWQOS buy requires durable nonce; also drives nonce advance + blockhash. */
  durableNonce?: DurableNonceInfo;
}

/** Rust `async_executor`: `FAST_SUBMIT_RESULT_TIMEOUT` when `wait_transaction_confirmed` is false. */
const SWQOS_SUBMIT_TIMEOUT_MS_WHEN_NO_CONFIRM = 5000;
const PACKET_DATA_SIZE = 1232;

/** Rust `executor::simulate_transaction` / `RpcSimulateTransactionConfig` (processed, inner ix, no sig verify). */
export const RUST_PARITY_SIMULATE_CONFIG: SimulateTransactionConfig = {
  sigVerify: false,
  replaceRecentBlockhash: false,
  commitment: 'processed',
  innerInstructions: true,
};

/** Instruction order matches Rust `trading/common/transaction_builder.rs` `build_transaction`: nonce → tip → compute budget → business. */
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
  let serializedLen: number;
  try {
    serializedLen = tx.serialize().length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('encoding overruns') ||
      message.toLowerCase().includes('too large')
    ) {
      throw new TradeError(
        109,
        `transaction too large: exceeds ${PACKET_DATA_SIZE}; SDK did not remove compute budget or relay tip because that changes transaction priority semantics. Use an address lookup table or pre-create token ATAs before submitting`,
        error as Error
      );
    }
    throw error;
  }
  if (serializedLen > PACKET_DATA_SIZE) {
    throw new TradeError(
      109,
      `transaction too large: ${serializedLen} > ${PACKET_DATA_SIZE}; SDK did not remove compute budget or relay tip because that changes transaction priority semantics. Use an address lookup table or pre-create token ATAs before submitting`
    );
  }
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
  transport?: SwqosTransport;
  astralaneTransport?: AstralaneTransport;
  swqosOnly?: boolean;
} {
  return {
    type: c.type,
    region: c.region,
    apiKey: c.apiKey,
    customUrl: c.customUrl,
    mevProtection: c.mevProtection ?? globalMev ?? false,
    transport: c.transport,
    astralaneTransport: c.astralaneTransport,
    swqosOnly: c.swqosOnly,
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

interface SwqosSubmitResult {
  ok: boolean;
  sig?: string;
  err?: unknown;
  task: SwqosGasTask;
  duration: number;
}

async function collectUntilFirstSuccess<R>(
  promises: readonly Promise<R>[],
  isSuccess: (result: R) => boolean
): Promise<R[]> {
  if (promises.length === 0) return [];
  const results: R[] = [];
  const pending = new Map(
    promises.map((promise, index) => [
      index,
      promise.then((result) => ({ index, result })),
    ])
  );

  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values());
    pending.delete(index);
    results.push(result);
    if (isSuccess(result)) return results;
  }

  return results;
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
  logEnabled: boolean,
  getClient?: (cfg: SwqosConfig) => RuntimeSwqosClient
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
          const client =
            getClient?.(cfg) ??
            swqosMod.ClientFactory.createClient(mapSwqosToClientConfig(cfg, mevProtection), rpcUrl);
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
  logEnabled: boolean,
  getClient?: (cfg: SwqosConfig) => RuntimeSwqosClient
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
    const client =
      getClient?.(cfg) ??
      swqosMod.ClientFactory.createClient(mapSwqosToClientConfig(cfg, mevProtection), rpcUrl);
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
  rpcUrl: string,
  getClient?: (cfg: SwqosConfig) => RuntimeSwqosClient
): PublicKey | null {
  const preferred =
    configs.find((c) => c.type !== SwqosType.Default) ?? configs[0];
  if (!preferred) return null;
  const client =
    getClient?.(preferred) ??
    swqosMod.ClientFactory.createClient(mapSwqosToClientConfig(preferred, mevProtection), rpcUrl);
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
  private _swqosModulePromise?: Promise<typeof import('./swqos/clients')>;
  private _swqosClientCache: Map<string, RuntimeSwqosClient> = new Map();

  constructor(payer: Keypair, config: TradeConfig) {
    this.payer = payer;
    this._config = {
      ...config,
      swqosConfigs: normalizeSwqosConfigs(config.rpcUrl, config.swqosConfigs ?? []),
    };
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment ?? 'confirmed',
    });
    this._logEnabled = config.logEnabled ?? true;
  }

  private getSwqosModule(): Promise<typeof import('./swqos/clients')> {
    this._swqosModulePromise ??= import('./swqos/clients');
    return this._swqosModulePromise;
  }

  private swqosClientCacheKey(cfg: SwqosConfig): string {
    return JSON.stringify([
      this._config.rpcUrl,
      this._config.mevProtection ?? false,
      cfg.type,
      cfg.region ?? null,
      cfg.customUrl ?? null,
      cfg.apiKey ?? null,
      cfg.transport ?? null,
      cfg.astralaneTransport ?? null,
      cfg.swqosOnly ?? null,
      cfg.mevProtection ?? null,
    ]);
  }

  private getSwqosClient(
    swqosMod: typeof import('./swqos/clients'),
    cfg: SwqosConfig
  ): RuntimeSwqosClient {
    const key = this.swqosClientCacheKey(cfg);
    const cached = this._swqosClientCache.get(key);
    if (cached) return cached;
    const client = swqosMod.ClientFactory.createClient(
      mapSwqosToClientConfig(cfg, this._config.mevProtection),
      this._config.rpcUrl
    );
    this._swqosClientCache.set(key, client);
    return client;
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
      params.durableNonce?.nonceHash ?? params.recentBlockhash;
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
      params.waitTxConfirmed ?? false,
      params.simulate,
      {
        tradeType: TradeType.Buy,
        dexType: params.dexType,
        gasFeeStrategy: params.gasFeeStrategy,
        withTip: true,
        grpcRecvUs: params.grpcRecvUs,
        waitForAllSubmits: params.waitForAllSubmits ?? false,
        durableNonce: params.durableNonce,
      }
    );
  }

  /**
   * Execute a high-level buy request.
   */
  async buySimple(params: SimpleBuyParams): Promise<TradeResult> {
    return this.buy(simpleBuyParamsToTradeBuyParams(params));
  }

  /**
   * Execute a sell order
   */
  async sell(params: TradeSellParams): Promise<TradeResult> {
    const blockhash =
      params.durableNonce?.nonceHash ?? params.recentBlockhash;
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
      params.waitTxConfirmed ?? false,
      params.simulate,
      {
        tradeType: TradeType.Sell,
        dexType: params.dexType,
        gasFeeStrategy: params.gasFeeStrategy,
        withTip: params.withTip ?? true,
        grpcRecvUs: params.grpcRecvUs,
        waitForAllSubmits: params.waitForAllSubmits ?? false,
        durableNonce: params.durableNonce,
      }
    );
  }

  /**
   * Execute a high-level sell request.
   */
  async sellSimple(params: SimpleSellParams): Promise<TradeResult> {
    return this.sell(simpleSellParamsToTradeSellParams(params));
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
    if (amount <= 0) throw new TradeError(2, 'Amount must be greater than zero');
    return this.sendInstructions(handleWsol(this.payer.publicKey, BigInt(amount)));
  }

  /**
   * Close WSOL account and unwrap to SOL
   */
  async closeWsol(): Promise<string> {
    return this.sendSingleInstruction(wsolCloseIx(this.payer.publicKey));
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
    return this.sendInstructions(ixs);
  }

  private async sendSingleInstruction(ix: TransactionInstruction): Promise<string> {
    return this.sendInstructions([ix]);
  }

  private async sendInstructions(ixs: TransactionInstruction[]): Promise<string> {
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
	          createInputMintAta: params.createInputTokenAta ?? false,
	          closeInputMintAta: params.closeInputTokenAta ?? false,
	          protocolParams: mapPumpFunParams(ext.params),
	          useExactSolAmount: params.useExactSolAmount ?? true,
	          inputMint: this.getInputMint(params.inputTokenType),
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
          ammOpenOrders: p.ammOpenOrders,
          ammTargetOrders: p.ammTargetOrders,
          serumProgram: p.serumProgram,
          serumMarket: p.serumMarket,
          serumBids: p.serumBids,
          serumAsks: p.serumAsks,
          serumEventQueue: p.serumEventQueue,
          serumCoinVaultAccount: p.serumCoinVaultAccount,
          serumPcVaultAccount: p.serumPcVaultAccount,
          serumVaultSigner: p.serumVaultSigner,
          coinReserve: p.coinReserve,
          pcReserve: p.pcReserve,
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
	          createOutputMintAta: params.createOutputTokenAta ?? false,
	          protocolParams: mapPumpFunParams(ext.params),
	          outputMint: this.getOutputMint(params.outputTokenType),
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
          ammOpenOrders: p.ammOpenOrders,
          ammTargetOrders: p.ammTargetOrders,
          serumProgram: p.serumProgram,
          serumMarket: p.serumMarket,
          serumBids: p.serumBids,
          serumAsks: p.serumAsks,
          serumEventQueue: p.serumEventQueue,
          serumCoinVaultAccount: p.serumCoinVaultAccount,
          serumPcVaultAccount: p.serumPcVaultAccount,
          serumVaultSigner: p.serumVaultSigner,
          coinReserve: p.coinReserve,
          pcReserve: p.pcReserve,
        };
        return buildRaydiumAmmV4SellInstructions({
          payer: this.payer.publicKey,
          inputMint: params.mint,
          outputMint: this.getOutputMint(params.outputTokenType),
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
    const blockhash = execCtx?.durableNonce?.nonceHash ?? recentBlockhash;
    if (!blockhash) {
      return {
        success: false,
        signatures: [],
        error: new TradeError(
          105,
          'recentBlockhash or durableNonce.nonceHash is required; trade execution hot path does not query RPC for blockhash'
        ),
        timings: [],
      };
    }

    const swqosList = this._config.swqosConfigs ?? [];
    const tradeType = execCtx?.tradeType ?? TradeType.Buy;
    const withTip = execCtx?.withTip ?? true;

    const swqosMod = swqosList.length > 0 ? await this.getSwqosModule() : null;
    const swqosClientForConfig = swqosMod
      ? (cfg: SwqosConfig) => this.getSwqosClient(swqosMod, cfg)
      : undefined;

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
        this._logEnabled,
        swqosClientForConfig
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
        this._logEnabled,
        swqosClientForConfig
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

    const nonDefaultSwqosTaskCount = swqosTasks.filter(
      (task) => task.cfg.type !== SwqosType.Default
    ).length;
    if (nonDefaultSwqosTaskCount > 1 && !execCtx?.durableNonce) {
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
                this._config.rpcUrl,
                swqosClientForConfig
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
        const submitTask = async (task: SwqosGasTask): Promise<SwqosSubmitResult> => {
          const t0 = performance.now();
          try {
            const tipPk = withTip
              ? resolveTipRecipientPubkey(
                  swqosMod,
                  [task.cfg],
                  this._config.mevProtection,
                  this._config.rpcUrl,
                  swqosClientForConfig
                )
              : null;
            const tx = buildSignedVersionedTransaction(
              this.payer,
              finalizeWiredForSign(buildWired(task.gas, tipPk, withTip)),
              blockhash,
              lookupTableAccount
            );
            const raw = Buffer.from(tx.serialize());
            const client = swqosClientForConfig!(task.cfg);
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
            return { ok: true, sig, task, duration };
          } catch (e) {
            const duration = Math.round((performance.now() - t0) * 1000);
            return { ok: false, err: e, task, duration };
          }
        };

        const submitPromises = swqosTasks.map((task) => submitTask(task));
        const waitForAllSubmits = execCtx?.waitForAllSubmits ?? false;
        const results = waitConfirmed || waitForAllSubmits
          ? await Promise.all(submitPromises)
          : await collectUntilFirstSuccess(submitPromises, (result) => result.ok);

        for (const v of results) {
          timings.push({
            swqosType: v.task.cfg.type,
            duration: v.duration,
            gasFeeStrategyType: v.task.strategyType,
          });
          if (v.ok) {
            if (v.sig) signatures.push(v.sig);
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
            : new TradeError(
                100,
                `All SWQOS submissions failed${
                  results.some((v) => !v.ok)
                    ? `: ${results
                        .filter((v) => !v.ok)
                        .map((v) => `${v.task.cfg.type}: ${v.err instanceof Error ? v.err.message : String(v.err)}`)
                        .join('; ')}`
                    : ''
                }`
              ),
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
        await confirmAnyTransactionSignature(this.connection, [signature], {
          commitment: this._config.commitment ?? 'confirmed',
        });
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('encoding overruns') ||
        errorMessage.toLowerCase().includes('too large')
      ) {
        return {
          success: false,
          signatures: [],
          error: new TradeError(
            109,
            `transaction too large: exceeds ${PACKET_DATA_SIZE}; SDK did not remove compute budget or relay tip because that changes transaction priority semantics. Use an address lookup table or pre-create token ATAs before submitting`,
            error as Error
          ),
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
  const {
    commitment,
    logEnabled,
    checkMinTip,
    mevProtection,
    useSeedOptimize,
    swqosCoresFromEnd,
    createWsolAtaOnStartup,
    ...rest
  } = options ?? {};
  return {
    rpcUrl,
    swqosConfigs: normalizeSwqosConfigs(rpcUrl, swqosConfigs),
    ...rest,
    commitment: commitment ?? 'confirmed',
    logEnabled: logEnabled ?? true,
    checkMinTip: checkMinTip ?? false,
    mevProtection: mevProtection ?? false,
    useSeedOptimize: useSeedOptimize ?? true,
    swqosCoresFromEnd: swqosCoresFromEnd ?? false,
    createWsolAtaOnStartup: createWsolAtaOnStartup ?? true,
  };
}

// Re-export utilities
export * from './constants';
export * from './instruction';
export * from './params';
export * from './utils';

// Re-export hotpath module
export * from './hotpath';

// Re-export ultra-low-latency/perf helpers without colliding with hotpath symbols.
export * as perf from './perf';

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
