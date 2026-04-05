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
  Signer,
  Transaction,
  TransactionInstruction,
  AddressLookupTableAccount,
  Commitment,
  RpcResponseAndContext,
  SignatureResult,
  BlockhashWithExpiryBlockHeight,
} from '@solana/web3.js';

// Import GasFeeStrategy class for createGasFeeStrategy
import { GasFeeStrategy as GasFeeStrategyClass } from './common/gas-fee-strategy';

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
}

/**
 * Gas fee strategy configuration
 */
export interface GasFeeStrategy {
  buyPriorityFee: number;
  sellPriorityFee: number;
  buyComputeUnits: number;
  sellComputeUnits: number;
  buyTipLamports: number;
  sellTipLamports: number;
}

/**
 * Durable nonce information
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
  gasFeeStrategy?: GasFeeStrategy;
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
  gasFeeStrategy?: GasFeeStrategy;
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
}

/**
 * SWQOS timing information
 */
export interface SwqosTiming {
  swqosType: SwqosType;
  duration: number; // microseconds
}

/**
 * Trade error with details
 */
export class TradeError extends Error {
  constructor(
    public code: number,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

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

/**
 * Main trading client for Solana DEX operations
 */
export class TradingClient {
  private payer: Keypair;
  private connection: Connection;
  private config: TradeConfig;
  private middlewares: Middleware[] = [];
  private logEnabled: boolean;

  constructor(payer: Keypair, config: TradeConfig) {
    this.payer = payer;
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment || 'confirmed',
    });
    this.logEnabled = config.logEnabled ?? true;
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
    if (!params.recentBlockhash && !params.durableNonce) {
      throw new TradeError(
        1,
        'Must provide either recentBlockhash or durableNonce'
      );
    }

    const builder = InstructionBuilderFactory.create(params.dexType);
    const instructions = await builder.buildBuyInstructions({
      payer: this.payer.publicKey,
      inputMint: this.getInputMint(params.inputTokenType),
      outputMint: params.mint,
      inputAmount: params.inputTokenAmount,
      slippageBasisPoints: params.slippageBasisPoints,
      protocolParams: params.extensionParams,
      createOutputAta: params.createMintAta ?? true,
      closeInputAta: params.closeInputTokenAta ?? false,
      fixedOutputAmount: params.fixedOutputTokenAmount,
      useExactSolAmount: params.useExactSolAmount,
    });

    // Process middlewares
    const processedInstructions = await this.processMiddlewares(
      instructions,
      TradeType.Buy,
      params
    );

    // Build and send transaction
    return this.executeTransaction(
      processedInstructions,
      params.recentBlockhash,
      params.addressLookupTableAccount,
      params.waitTxConfirmed ?? true
    );
  }

  /**
   * Execute a sell order
   */
  async sell(params: TradeSellParams): Promise<TradeResult> {
    if (!params.recentBlockhash && !params.durableNonce) {
      throw new TradeError(
        1,
        'Must provide either recentBlockhash or durableNonce'
      );
    }

    const builder = InstructionBuilderFactory.create(params.dexType);
    const instructions = await builder.buildSellInstructions({
      payer: this.payer.publicKey,
      inputMint: params.mint,
      outputMint: this.getOutputMint(params.outputTokenType),
      inputAmount: params.inputTokenAmount,
      slippageBasisPoints: params.slippageBasisPoints,
      protocolParams: params.extensionParams,
      createOutputAta: params.createOutputTokenAta ?? false,
      closeInputAta: params.closeMintTokenAta ?? false,
      fixedOutputAmount: params.fixedOutputTokenAmount,
    });

    const processedInstructions = await this.processMiddlewares(
      instructions,
      TradeType.Sell,
      params
    );

    return this.executeTransaction(
      processedInstructions,
      params.recentBlockhash,
      params.addressLookupTableAccount,
      params.waitTxConfirmed ?? true
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
    return this.connection.getLatestBlockhash();
  }

  /**
   * Wrap SOL to WSOL
   */
  async wrapSolToWsol(amount: number): Promise<string> {
    const instructions = WsolManager.handleWsol(
      this.payer.publicKey,
      amount
    );
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    const transaction = new Transaction({
      blockhash,
      lastValidBlockHeight,
    });
    transaction.add(...instructions);
    transaction.sign(this.payer);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Close WSOL account and unwrap to SOL
   */
  async closeWsol(): Promise<string> {
    const instructions = WsolManager.closeWsol(this.payer.publicKey);
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    const transaction = new Transaction({
      blockhash,
      lastValidBlockHeight,
    });
    transaction.add(...instructions);
    transaction.sign(this.payer);

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  private getInputMint(tokenType: TradeTokenType): PublicKey {
    switch (tokenType) {
      case TradeTokenType.SOL:
        return CONSTANTS.SOL_TOKEN_ACCOUNT;
      case TradeTokenType.WSOL:
        return CONSTANTS.WSOL_TOKEN_ACCOUNT;
      case TradeTokenType.USDC:
        return CONSTANTS.USDC_TOKEN_ACCOUNT;
      case TradeTokenType.USD1:
        return CONSTANTS.USD1_TOKEN_ACCOUNT;
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

    for (const middleware of this.middlewares) {
      result = await middleware.process(result, {
        tradeType,
        inputMint: 'inputMint' in params ? params.inputMint : params.mint,
        outputMint: 'outputMint' in params ? params.outputMint : params.mint,
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
    waitConfirmed?: boolean
  ): Promise<TradeResult> {
    const blockhash =
      recentBlockhash ?? (await this.connection.getLatestBlockhash()).blockhash;

    const transaction = new Transaction();
    transaction.add(...instructions);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.payer.publicKey;

    if (lookupTableAccount) {
      // Handle address lookup table
    }

    transaction.sign(this.payer);

    try {
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize()
      );

      if (waitConfirmed) {
        await this.connection.confirmTransaction(signature);
      }

      return {
        success: true,
        signatures: [signature],
        timings: [],
      };
    } catch (error) {
      return {
        success: false,
        signatures: [],
        error: new TradeError(100, 'Transaction failed', error as Error),
        timings: [],
      };
    }
  }
}

// ============== Helper Classes ==============

/**
 * Instruction builder factory
 */
class InstructionBuilderFactory {
  static create(dexType: DexType): InstructionBuilder {
    switch (dexType) {
      case DexType.PumpFun:
        return new PumpFunInstructionBuilder();
      case DexType.PumpSwap:
        return new PumpSwapInstructionBuilder();
      case DexType.Bonk:
        return new BonkInstructionBuilder();
      case DexType.RaydiumCpmm:
        return new RaydiumCpmmInstructionBuilder();
      case DexType.RaydiumAmmV4:
        return new RaydiumAmmV4InstructionBuilder();
      case DexType.MeteoraDammV2:
        return new MeteoraDammV2InstructionBuilder();
      default:
        throw new TradeError(4, `Unsupported DEX type: ${dexType}`);
    }
  }
}

/**
 * Instruction builder interface
 */
interface InstructionBuilder {
  buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]>;
  buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]>;
}

interface BuildParams {
  payer: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: number;
  slippageBasisPoints?: number;
  protocolParams: DexParamEnum;
  createOutputAta?: boolean;
  closeInputAta?: boolean;
  fixedOutputAmount?: number;
  useExactSolAmount?: boolean;
}

// Placeholder implementations - full implementations in separate files
class PumpFunInstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    // Full implementation requires detailed instruction building
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

class PumpSwapInstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

class BonkInstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

class RaydiumCpmmInstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

class RaydiumAmmV4InstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

class MeteoraDammV2InstructionBuilder implements InstructionBuilder {
  async buildBuyInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
  async buildSellInstructions(params: BuildParams): Promise<TransactionInstruction[]> {
    return [];
  }
}

/**
 * WSOL manager for wrapping/unwrapping SOL
 */
class WsolManager {
  static handleWsol(owner: PublicKey, amount: number): TransactionInstruction[] {
    // Implementation for wrapping SOL
    return [];
  }

  static closeWsol(owner: PublicKey): TransactionInstruction[] {
    // Implementation for closing WSOL account
    return [];
  }
}

/**
 * Constants for the SDK
 */
export const CONSTANTS = {
  SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  TOKEN_PROGRAM_2022: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
  SOL_TOKEN_ACCOUNT: new PublicKey('So11111111111111111111111111111111111111111'),
  WSOL_TOKEN_ACCOUNT: new PublicKey('So11111111111111111111111111111111111111112'),
  USD1_TOKEN_ACCOUNT: new PublicKey('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'),
  USDC_TOKEN_ACCOUNT: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  RENT: new PublicKey('SysvarRent111111111111111111111111111111111'),
  ASSOCIATED_TOKEN_PROGRAM: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  PUMPFUN_PROGRAM: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKopJFfWcCzNfXt3D'),
  PUMPSWAP_PROGRAM: new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwq52pCSbAhL'),
  BONK_PROGRAM: new PublicKey('bonk2zCzQaobPKMKsM5Rut46yHp3zQD1ntUk8Ld8ARq'),
  RAYDIUM_CPMM_PROGRAM: new PublicKey('CPMMoo8L3F4NbTUBBfMTm5L2AhwDtLd6P4VeXvgQA2Po'),
  RAYDIUM_AMM_V4_PROGRAM: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
  
  // Constants
  DEFAULT_SLIPPAGE: 500,
  DEFAULT_COMPUTE_UNITS: 200000,
  DEFAULT_PRIORITY_FEE: 100000,
  DEFAULT_TIP_LAMPORTS: 100000,
};

/**
 * Create a new gas fee strategy with defaults
 */
export function createGasFeeStrategy(): GasFeeStrategyClass {
  return new GasFeeStrategyClass();
}

/**
 * Create a new trade config
 */
export function createTradeConfig(
  rpcUrl: string,
  swqosConfigs: SwqosConfig[] = []
): TradeConfig {
  return {
    rpcUrl,
    swqosConfigs,
    commitment: 'confirmed',
    logEnabled: true,
  };
}

// Re-export utilities
export * from './constants';
export * from './instruction';
export * from './utils';

// Re-export hotpath module
export * from './hotpath';

// Re-export gas fee strategy class (overrides interface)
export { GasFeeStrategy, GasFeeStrategyType, GasFeeStrategyValue } from './common/gas-fee-strategy';
