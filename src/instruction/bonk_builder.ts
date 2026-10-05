/**
 * Bonk Protocol Instruction Builder
 *
 * Production-grade instruction builder for Bonk AMM protocol.
 * Supports buy and sell operations with WSOL and USD1 pools.
 * 100% port from Rust: src/instruction/bonk.rs
 */

import {
  PublicKey,
  Keypair,
  AccountMeta,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "../common/spl-token";

// ============================================
// Program IDs and Constants - from Rust src/instruction/utils/bonk.rs
// ============================================

/** Bonk program ID */
export const BONK_PROGRAM_ID = new PublicKey(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
);

/** Bonk Authority */
export const BONK_AUTHORITY = new PublicKey(
  "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh"
);

/** Bonk Global Config */
export const BONK_GLOBAL_CONFIG = new PublicKey(
  "6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX"
);

/** Bonk USD1 Global Config */
export const BONK_USD1_GLOBAL_CONFIG = new PublicKey(
  "EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz"
);

/** Bonk Event Authority */
export const BONK_EVENT_AUTHORITY = new PublicKey(
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr"
);

/** WSOL Token Account (mint) */
export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

/** USD1 Token Account (mint) */
export const USD1_MINT = new PublicKey(
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"
);

/** USDC Token Account (mint) */
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

/** Fee rates - from Rust */
export const BONK_PLATFORM_FEE_RATE = BigInt(100); // 1%
export const BONK_PROTOCOL_FEE_RATE = BigInt(25); // 0.25%
export const BONK_SHARE_FEE_RATE = BigInt(0); // 0%

// ============================================
// Discriminators - from Rust src/instruction/utils/bonk.rs
// ============================================

/** Buy exact in instruction discriminator */
export const BONK_BUY_EXACT_IN_DISCRIMINATOR: Buffer = Buffer.from([
  250, 234, 13, 123, 213, 156, 19, 236,
]);

/** Sell exact in instruction discriminator */
export const BONK_SELL_EXACT_IN_DISCRIMINATOR: Buffer = Buffer.from([
  149, 39, 222, 155, 211, 124, 152, 26,
]);

// ============================================
// Seeds
// ============================================

export const BONK_POOL_SEED = Buffer.from("pool");
export const BONK_POOL_VAULT_SEED = Buffer.from("pool_vault");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the pool PDA for given base and quote mints
 */
export function getBonkPoolPda(baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BONK_POOL_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the vault PDA for given pool and mint
 */
export function getBonkVaultPda(poolState: PublicKey, mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BONK_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

/**
 * Get platform associated account PDA
 */
export function getBonkPlatformAssociatedAccount(platformConfig: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [platformConfig.toBuffer(), WSOL_MINT.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

/**
 * Get creator associated account PDA
 */
export function getBonkCreatorAssociatedAccount(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), WSOL_MINT.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

// ============================================
// Types
// ============================================

export interface BonkParams {
  poolState: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  mintTokenProgram: PublicKey;
  platformConfig: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
  globalConfig?: PublicKey;
}

export interface BonkBuildBuyParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: BonkParams;
}

export interface BonkBuildSellParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: BonkParams;
}

// ============================================
// Helper Functions
// ============================================

function clampSlippageBps(slippageBps: bigint): bigint {
  return slippageBps > BigInt(9999) ? BigInt(9999) : slippageBps;
}

/** Buy path: fees on SOL input, then constant-product, then slippage. */
function getBuyTokenAmountFromSolAmount(
  amountIn: bigint,
  protocolFeeRate: bigint,
  platformFeeRate: bigint,
  shareFeeRate: bigint,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  slippageBps: bigint,
): bigint {
  const bps = clampSlippageBps(slippageBps);
  const protocolFee = (amountIn * protocolFeeRate) / BigInt(10000);
  const platformFee = (amountIn * platformFeeRate) / BigInt(10000);
  const shareFee = (amountIn * shareFeeRate) / BigInt(10000);
  const amountInNet = amountIn - protocolFee - platformFee - shareFee;

  const inputReserve = virtualQuote + realQuote;
  const outputReserve = virtualBase - realBase;
  const numerator = amountInNet * outputReserve;
  const denominator = inputReserve + amountInNet;
  let amountOut = numerator / denominator;

  amountOut = amountOut - (amountOut * bps) / BigInt(10000);
  return amountOut;
}

/** Sell path: constant-product first, fees on SOL output, then slippage. */
function getSellSolAmountFromTokenAmount(
  amountIn: bigint,
  protocolFeeRate: bigint,
  platformFeeRate: bigint,
  shareFeeRate: bigint,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  slippageBps: bigint,
): bigint {
  const bps = clampSlippageBps(slippageBps);
  const inputReserve = virtualBase - realBase;
  const outputReserve = virtualQuote + realQuote;
  const numerator = amountIn * outputReserve;
  const denominator = inputReserve + amountIn;
  const solAmountOut = numerator / denominator;

  const protocolFee = (solAmountOut * protocolFeeRate) / BigInt(10000);
  const platformFee = (solAmountOut * platformFeeRate) / BigInt(10000);
  const shareFee = (solAmountOut * shareFeeRate) / BigInt(10000);
  const solAmountNet = solAmountOut - protocolFee - platformFee - shareFee;

  return solAmountNet - (solAmountNet * bps) / BigInt(10000);
}

// ============================================
// Instruction Builders
// ============================================

/**
 * Build buy instructions for Bonk protocol
 * 100% port from Rust: src/instruction/bonk.rs build_buy_instructions
 */
export function buildBonkBuyInstructions(
  params: BonkBuildBuyParams
): TransactionInstruction[] {
  const {
    payer,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const isUsd1Pool = protocolParams.globalConfig?.equals(BONK_USD1_GLOBAL_CONFIG) ?? false;
  const quoteMint = isUsd1Pool ? USD1_MINT : WSOL_MINT;

  // Get pool state
  const poolState = protocolParams.poolState.equals(PublicKey.default)
    ? getBonkPoolPda(outputMint, quoteMint)
    : protocolParams.poolState;

  const globalConfig = isUsd1Pool ? BONK_USD1_GLOBAL_CONFIG : BONK_GLOBAL_CONFIG;

  // Calculate minimum output (buy: SOL -> token)
  const minimumAmountOut = fixedOutputAmount ?? getBuyTokenAmountFromSolAmount(
    inputAmount,
    BONK_PROTOCOL_FEE_RATE,
    BONK_PLATFORM_FEE_RATE,
    BONK_SHARE_FEE_RATE,
    protocolParams.virtualBase,
    protocolParams.virtualQuote,
    protocolParams.realBase,
    protocolParams.realQuote,
    slippageBasisPoints,
  );

  // Derive token accounts
  const userBaseTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    protocolParams.mintTokenProgram,
  );
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID,
  );

  // Derive vaults
  const baseVault = protocolParams.baseVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, outputMint)
    : protocolParams.baseVault;
  const quoteVault = protocolParams.quoteVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, quoteMint)
    : protocolParams.quoteVault;

  // Handle WSOL wrapping
  if (createInputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true, TOKEN_PROGRAM_ID);
    instructions.push(
      createAssociatedTokenAccountInstruction(payerPubkey, wsolAta, payerPubkey, NATIVE_MINT)
    );
    // Transfer SOL
    const transferIx = SystemProgram.transfer({
      fromPubkey: payerPubkey,
      toPubkey: wsolAta,
      lamports: Number(inputAmount),
    });
    instructions.push(transferIx);
    // Sync native
    instructions.push(createSyncNativeInstruction(wsolAta));
  }

  // Create output ATA
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userBaseTokenAccount,
        payerPubkey,
        outputMint,
        protocolParams.mintTokenProgram,
      )
    );
  }

  // Build instruction data
  const shareFeeRate = BigInt(0);
  const data = Buffer.alloc(32);
  BONK_BUY_EXACT_IN_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(shareFeeRate, 24);

  // Build accounts
  const keys: AccountMeta[] = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: BONK_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: protocolParams.platformConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: protocolParams.mintTokenProgram, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: BONK_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: BONK_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: protocolParams.platformAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: protocolParams.creatorAssociatedAccount, isSigner: false, isWritable: true },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: BONK_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA
  if (closeInputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true, TOKEN_PROGRAM_ID);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey)
    );
  }

  return instructions;
}

/**
 * Build sell instructions for Bonk protocol
 * 100% port from Rust: src/instruction/bonk.rs build_sell_instructions
 */
export function buildBonkSellInstructions(
  params: BonkBuildSellParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const isUsd1Pool = protocolParams.globalConfig?.equals(BONK_USD1_GLOBAL_CONFIG) ?? false;
  const quoteMint = isUsd1Pool ? USD1_MINT : WSOL_MINT;

  // Get pool state
  const poolState = protocolParams.poolState.equals(PublicKey.default)
    ? getBonkPoolPda(inputMint, quoteMint)
    : protocolParams.poolState;

  const globalConfig = isUsd1Pool ? BONK_USD1_GLOBAL_CONFIG : BONK_GLOBAL_CONFIG;

  // Calculate minimum output (sell: token -> SOL)
  const minimumAmountOut = fixedOutputAmount ?? getSellSolAmountFromTokenAmount(
    inputAmount,
    BONK_PROTOCOL_FEE_RATE,
    BONK_PLATFORM_FEE_RATE,
    BONK_SHARE_FEE_RATE,
    protocolParams.virtualBase,
    protocolParams.virtualQuote,
    protocolParams.realBase,
    protocolParams.realQuote,
    slippageBasisPoints,
  );

  // Derive token accounts
  const userBaseTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    protocolParams.mintTokenProgram,
  );
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID,
  );

  // Derive vaults
  const baseVault = protocolParams.baseVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, inputMint)
    : protocolParams.baseVault;
  const quoteVault = protocolParams.quoteVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, quoteMint)
    : protocolParams.quoteVault;

  // Create output ATA for WSOL
  if (createOutputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true, TOKEN_PROGRAM_ID);
    instructions.push(
      createAssociatedTokenAccountInstruction(payerPubkey, wsolAta, payerPubkey, NATIVE_MINT)
    );
  }

  // Build instruction data
  const shareFeeRate = BigInt(0);
  const data = Buffer.alloc(32);
  BONK_SELL_EXACT_IN_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(shareFeeRate, 24);

  // Build accounts
  const keys: AccountMeta[] = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: BONK_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: protocolParams.platformConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: protocolParams.mintTokenProgram, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: BONK_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: BONK_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: protocolParams.platformAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: protocolParams.creatorAssociatedAccount, isSigner: false, isWritable: true },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: BONK_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA
  if (closeOutputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true, TOKEN_PROGRAM_ID);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey)
    );
  }

  // Close input token account
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(userBaseTokenAccount, payerPubkey, payerPubkey, [], protocolParams.mintTokenProgram)
    );
  }

  return instructions;
}

// ===== Pool State Decoder - from Rust: src/instruction/utils/bonk_types.rs =====

export const BONK_POOL_STATE_SIZE = 421; // 8 + 1*5 + 8*10 + 32*7 + 8*8 + 8*5

export interface BonkVestingSchedule {
  totalLockedAmount: bigint;
  cliffPeriod: bigint;
  unlockPeriod: bigint;
  startTime: bigint;
  allocatedShareAmount: bigint;
}

export interface BonkPoolState {
  epoch: bigint;
  authBump: number;
  status: number;
  baseDecimals: number;
  quoteDecimals: number;
  migrateType: number;
  supply: bigint;
  totalBaseSell: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  totalQuoteFundRaising: bigint;
  quoteProtocolFee: bigint;
  platformFee: bigint;
  migrateFee: bigint;
  vestingSchedule: BonkVestingSchedule;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  creator: PublicKey;
}

/**
 * Decode a Bonk pool state from account data
 * 100% from Rust: src/instruction/utils/bonk_types.rs pool_state_decode
 */
export function decodeBonkPoolState(data: Buffer): BonkPoolState | null {
  if (data.length < BONK_POOL_STATE_SIZE) {
    return null;
  }

  try {
    let offset = 0;

    // epoch: u64
    const epoch = data.readBigUInt64LE(offset);
    offset += 8;

    // auth_bump: u8
    const authBump = data.readUInt8(offset);
    offset += 1;

    // status: u8
    const status = data.readUInt8(offset);
    offset += 1;

    // base_decimals: u8
    const baseDecimals = data.readUInt8(offset);
    offset += 1;

    // quote_decimals: u8
    const quoteDecimals = data.readUInt8(offset);
    offset += 1;

    // migrate_type: u8
    const migrateType = data.readUInt8(offset);
    offset += 1;

    // supply: u64
    const supply = data.readBigUInt64LE(offset);
    offset += 8;

    // total_base_sell: u64
    const totalBaseSell = data.readBigUInt64LE(offset);
    offset += 8;

    // virtual_base: u64
    const virtualBase = data.readBigUInt64LE(offset);
    offset += 8;

    // virtual_quote: u64
    const virtualQuote = data.readBigUInt64LE(offset);
    offset += 8;

    // real_base: u64
    const realBase = data.readBigUInt64LE(offset);
    offset += 8;

    // real_quote: u64
    const realQuote = data.readBigUInt64LE(offset);
    offset += 8;

    // total_quote_fund_raising: u64
    const totalQuoteFundRaising = data.readBigUInt64LE(offset);
    offset += 8;

    // quote_protocol_fee: u64
    const quoteProtocolFee = data.readBigUInt64LE(offset);
    offset += 8;

    // platform_fee: u64
    const platformFee = data.readBigUInt64LE(offset);
    offset += 8;

    // migrate_fee: u64
    const migrateFee = data.readBigUInt64LE(offset);
    offset += 8;

    // vesting_schedule: VestingSchedule (5 * u64)
    const vestingSchedule: BonkVestingSchedule = {
      totalLockedAmount: data.readBigUInt64LE(offset),
      cliffPeriod: data.readBigUInt64LE(offset + 8),
      unlockPeriod: data.readBigUInt64LE(offset + 16),
      startTime: data.readBigUInt64LE(offset + 24),
      allocatedShareAmount: data.readBigUInt64LE(offset + 32),
    };
    offset += 40;

    // global_config: Pubkey
    const globalConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // platform_config: Pubkey
    const platformConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // base_mint: Pubkey
    const baseMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // quote_mint: Pubkey
    const quoteMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // base_vault: Pubkey
    const baseVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // quote_vault: Pubkey
    const quoteVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // creator: Pubkey
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    // offset += 32; // Not needed, last field

    return {
      epoch,
      authBump,
      status,
      baseDecimals,
      quoteDecimals,
      migrateType,
      supply,
      totalBaseSell,
      virtualBase,
      virtualQuote,
      realBase,
      realQuote,
      totalQuoteFundRaising,
      quoteProtocolFee,
      platformFee,
      migrateFee,
      vestingSchedule,
      globalConfig,
      platformConfig,
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      creator,
    };
  } catch {
    return null;
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/bonk.rs =====

/**
 * Fetch a Bonk pool state from RPC.
 * 100% from Rust: src/instruction/utils/bonk.rs fetch_pool_state
 */
export async function fetchBonkPoolState(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  poolAddress: PublicKey
): Promise<BonkPoolState | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  return decodeBonkPoolState(account.value.data);
}

/**
 * Get pool PDA for Bonk.
 * Seeds: ["pool", base_mint, quote_mint]
 */
export function getBonkPoolPDA(baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
  const POOL_SEED = Buffer.from('pool');
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

/**
 * Get vault PDA for Bonk.
 * Seeds: ["pool_vault", pool_state, mint]
 */
export function getBonkVaultPDA(poolState: PublicKey, mint: PublicKey): PublicKey {
  const POOL_VAULT_SEED = Buffer.from('pool_vault');
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
