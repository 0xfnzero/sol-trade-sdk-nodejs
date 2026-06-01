/**
 * Raydium CPMM (Concentrated Pool Market Maker) Protocol Instruction Builder
 *
 * Production-grade instruction builder for Raydium CPMM protocol.
 * 100% port of Rust implementation.
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
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
} from "@solana/spl-token";

// ============================================
// Program IDs and Constants
// ============================================

/** Raydium CPMM program ID */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

/** Authority */
export const RAYDIUM_CPMM_AUTHORITY = new PublicKey(
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL"
);

/** Fee rates */
export const RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE = BigInt(1_000_000);
export const RAYDIUM_CPMM_TRADE_FEE_RATE = BigInt(2500);
export const RAYDIUM_CPMM_CREATOR_FEE_RATE = BigInt(0);
export const RAYDIUM_CPMM_PROTOCOL_FEE_RATE = BigInt(120000);
export const RAYDIUM_CPMM_FUND_FEE_RATE = BigInt(40000);

// ============================================
// Discriminators
// ============================================

/** Swap base in instruction discriminator */
export const RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR: Buffer = Buffer.from([
  143, 190, 90, 218, 196, 30, 51, 222,
]);

/** Swap base out instruction discriminator */
export const RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR: Buffer = Buffer.from([
  55, 217, 98, 86, 163, 74, 180, 173,
]);

// ============================================
// Seeds
// ============================================

export const RAYDIUM_CPMM_POOL_SEED = Buffer.from("pool");
export const RAYDIUM_CPMM_POOL_VAULT_SEED = Buffer.from("pool_vault");
export const RAYDIUM_CPMM_OBSERVATION_STATE_SEED = Buffer.from("observation");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the pool PDA for given config and mints
 */
export function getRaydiumCpmmPoolPda(
  ammConfig: PublicKey,
  mint1: PublicKey,
  mint2: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [RAYDIUM_CPMM_POOL_SEED, ammConfig.toBuffer(), mint1.toBuffer(), mint2.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the vault PDA for a pool and mint
 */
export function getRaydiumCpmmVaultPda(poolState: PublicKey, mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [RAYDIUM_CPMM_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the observation state PDA for a pool
 */
export function getRaydiumCpmmObservationStatePda(poolState: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [RAYDIUM_CPMM_OBSERVATION_STATE_SEED, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Compute swap amount for CPMM
 */
export function computeRaydiumCpmmSwapAmount(
  baseReserve: bigint,
  quoteReserve: bigint,
  isBaseIn: boolean,
  amountIn: bigint,
  slippageBasisPoints: bigint
): { amountOut: bigint; minAmountOut: bigint } {
  // Apply trade fee (0.25%)
  const feeRate = RAYDIUM_CPMM_TRADE_FEE_RATE;
  const feeDenominator = RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE;
  const amountInAfterFee = amountIn - (amountIn * feeRate) / feeDenominator;

  // Calculate output using constant product formula
  let amountOut: bigint;
  if (isBaseIn) {
    // Selling base for quote: output = (quoteReserve * amountIn) / (baseReserve + amountIn)
    const denominator = baseReserve + amountInAfterFee;
    amountOut = (quoteReserve * amountInAfterFee) / denominator;
  } else {
    // Selling quote for base: output = (baseReserve * amountIn) / (quoteReserve + amountIn)
    const denominator = quoteReserve + amountInAfterFee;
    amountOut = (baseReserve * amountInAfterFee) / denominator;
  }

  // Apply slippage
  const minAmountOut = amountOut - (amountOut * slippageBasisPoints) / BigInt(10000);

  return { amountOut, minAmountOut };
}

// ============================================
// Types
// ============================================

export interface RaydiumCpmmParams {
  poolState?: PublicKey;
  ammConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  baseVault?: PublicKey;
  quoteVault?: PublicKey;
  baseReserve: bigint;
  quoteReserve: bigint;
  observationState?: PublicKey;
}

export interface BuildRaydiumCpmmBuyInstructionsParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: RaydiumCpmmParams;
}

export interface BuildRaydiumCpmmSellInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: RaydiumCpmmParams;
}

// ============================================
// Instruction Builders
// ============================================

/**
 * Build buy instructions for Raydium CPMM protocol
 */
export function buildRaydiumCpmmBuyInstructions(
  params: BuildRaydiumCpmmBuyInstructionsParams
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

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    ammConfig,
    baseMint,
    quoteMint,
    baseTokenProgram,
    quoteTokenProgram,
    baseVault,
    quoteVault,
    baseReserve,
    quoteReserve,
    observationState,
  } = protocolParams;

  // Check pool type
  const isWsol = baseMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = baseMint.equals(USDC_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction
  const isBaseIn = baseMint.equals(WSOL_TOKEN_ACCOUNT) || baseMint.equals(USDC_TOKEN_ACCOUNT);
  const inputMint = isBaseIn ? baseMint : quoteMint;
  const inputTokenProgram = isBaseIn ? baseTokenProgram : quoteTokenProgram;
  const expectedOutputMint = isBaseIn ? quoteMint : baseMint;
  const outputTokenProgram = isBaseIn ? quoteTokenProgram : baseTokenProgram;
  if (!outputMint.equals(expectedOutputMint)) {
    throw new Error(`outputMint must match Raydium CPMM pool side ${expectedOutputMint.toBase58()}`);
  }

  // Derive pool state
  const poolState = protocolParams.poolState && !protocolParams.poolState.equals(PublicKey.default)
    ? protocolParams.poolState
    : getRaydiumCpmmPoolPda(ammConfig, baseMint, quoteMint);

  // Calculate output only for base-in swaps; fixed-output swaps pass max input directly.
  const minimumAmountOut =
    fixedOutputAmount ??
    computeRaydiumCpmmSwapAmount(
      baseReserve,
      quoteReserve,
      isBaseIn,
      inputAmount,
      slippageBasisPoints
    ).minAmountOut;

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    outputTokenProgram
  );

  // Derive vault accounts
  const inputVaultAccount = ((): PublicKey => {
    if (baseMint.equals(inputMint) && baseVault && !baseVault.equals(PublicKey.default)) {
      return baseVault;
    }
    if (quoteMint.equals(inputMint) && quoteVault && !quoteVault.equals(PublicKey.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, inputMint);
  })();

  const outputVaultAccount = ((): PublicKey => {
    if (baseMint.equals(outputMint) && baseVault && !baseVault.equals(PublicKey.default)) {
      return baseVault;
    }
    if (quoteMint.equals(outputMint) && quoteVault && !quoteVault.equals(PublicKey.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, outputMint);
  })();

  // Derive observation state
  const observationStateAccount = observationState && !observationState.equals(PublicKey.default)
    ? observationState
    : getRaydiumCpmmObservationStatePda(poolState);

  // Handle input account creation/wrapping
  if (createInputMintAta) {
    const isInputWsol = inputMint.equals(WSOL_TOKEN_ACCOUNT);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        inputTokenAccount,
        payerPubkey,
        inputMint,
        inputTokenProgram
      )
    );
    if (isInputWsol) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: inputTokenAccount,
          lamports: inputAmount,
        })
      );
      instructions.push(createSyncNativeInstruction(inputTokenAccount));
    }
  }

  // Create output mint ATA if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }

  // Build instruction data
  const data = Buffer.alloc(24);
  (fixedOutputAmount !== undefined
    ? RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR
    : RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR
  ).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount ?? minimumAmountOut, 16);

  // Build accounts
  const accounts: AccountMeta[] = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: RAYDIUM_CPMM_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: inputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: outputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationStateAccount, isSigner: false, isWritable: true },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: RAYDIUM_CPMM_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    instructions.push(
      createCloseAccountInstruction(inputTokenAccount, payerPubkey, payerPubkey, [], inputTokenProgram)
    );
  }

  return instructions;
}

/**
 * Build sell instructions for Raydium CPMM protocol
 */
export function buildRaydiumCpmmSellInstructions(
  params: BuildRaydiumCpmmSellInstructionsParams
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

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    ammConfig,
    baseMint,
    quoteMint,
    baseTokenProgram,
    quoteTokenProgram,
    baseVault,
    quoteVault,
    baseReserve,
    quoteReserve,
    observationState,
  } = protocolParams;

  // Check pool type
  const isWsol = baseMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = baseMint.equals(USDC_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction
  const isQuoteOut = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);
  const expectedInputMint = isQuoteOut ? baseMint : quoteMint;
  const inputTokenProgram = isQuoteOut ? baseTokenProgram : quoteTokenProgram;
  const outputMint = isQuoteOut ? quoteMint : baseMint;
  const outputTokenProgram = isQuoteOut ? quoteTokenProgram : baseTokenProgram;
  if (!inputMint.equals(expectedInputMint)) {
    throw new Error(`inputMint must match Raydium CPMM pool side ${expectedInputMint.toBase58()}`);
  }

  // Derive pool state
  const poolState = protocolParams.poolState && !protocolParams.poolState.equals(PublicKey.default)
    ? protocolParams.poolState
    : getRaydiumCpmmPoolPda(ammConfig, baseMint, quoteMint);

  // Calculate output only for base-in swaps; fixed-output swaps pass max input directly.
  const minimumAmountOut =
    fixedOutputAmount ??
    computeRaydiumCpmmSwapAmount(
      baseReserve,
      quoteReserve,
      isQuoteOut,
      inputAmount,
      slippageBasisPoints
    ).minAmountOut;

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    outputTokenProgram
  );

  // Derive vault accounts
  const inputVaultAccount = ((): PublicKey => {
    if (baseMint.equals(inputMint) && baseVault && !baseVault.equals(PublicKey.default)) {
      return baseVault;
    }
    if (quoteMint.equals(inputMint) && quoteVault && !quoteVault.equals(PublicKey.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, inputMint);
  })();

  const outputVaultAccount = ((): PublicKey => {
    if (baseMint.equals(outputMint) && baseVault && !baseVault.equals(PublicKey.default)) {
      return baseVault;
    }
    if (quoteMint.equals(outputMint) && quoteVault && !quoteVault.equals(PublicKey.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, outputMint);
  })();

  // Derive observation state
  const observationStateAccount = observationState && !observationState.equals(PublicKey.default)
    ? observationState
    : getRaydiumCpmmObservationStatePda(poolState);

  // Create output ATA for receiving if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }

  // Build instruction data
  const data = Buffer.alloc(24);
  (fixedOutputAmount !== undefined
    ? RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR
    : RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR
  ).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount ?? minimumAmountOut, 16);

  // Build accounts
  const accounts: AccountMeta[] = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: RAYDIUM_CPMM_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: inputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: outputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationStateAccount, isSigner: false, isWritable: true },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: RAYDIUM_CPMM_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    instructions.push(
      createCloseAccountInstruction(outputTokenAccount, payerPubkey, payerPubkey, [], outputTokenProgram)
    );
  }

  // Close input token ATA if requested
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        inputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        inputTokenProgram
      )
    );
  }

  return instructions;
}

// ===== Pool State Decoder - from Rust: src/instruction/utils/raydium_cpmm_types.rs =====

export const RAYDIUM_CPMM_POOL_STATE_SIZE = 629;

export interface RaydiumCPMMpoolState {
  ammConfig: PublicKey;
  poolCreator: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  lpMint: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Program: PublicKey;
  token1Program: PublicKey;
  observationKey: PublicKey;
  authBump: number;
  status: number;
  lpMintDecimals: number;
  mint0Decimals: number;
  mint1Decimals: number;
  lpSupply: bigint;
  protocolFeesToken0: bigint;
  protocolFeesToken1: bigint;
  fundFeesToken0: bigint;
  fundFeesToken1: bigint;
  openTime: bigint;
  recentEpoch: bigint;
}

/**
 * Decode a Raydium CPMM pool state from account data
 * 100% from Rust: src/instruction/utils/raydium_cpmm_types.rs pool_state_decode
 */
export function decodeRaydiumCPMMpoolState(data: Buffer): RaydiumCPMMpoolState | null {
  if (data.length < RAYDIUM_CPMM_POOL_STATE_SIZE) {
    return null;
  }

  try {
    let offset = 0;

    // amm_config: Pubkey
    const ammConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // pool_creator: Pubkey
    const poolCreator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token0_vault: Pubkey
    const token0Vault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token1_vault: Pubkey
    const token1Vault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // lp_mint: Pubkey
    const lpMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token0_mint: Pubkey
    const token0Mint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token1_mint: Pubkey
    const token1Mint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token0_program: Pubkey
    const token0Program = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token1_program: Pubkey
    const token1Program = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // observation_key: Pubkey
    const observationKey = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // auth_bump: u8
    const authBump = data.readUInt8(offset);
    offset += 1;

    // status: u8
    const status = data.readUInt8(offset);
    offset += 1;

    // lp_mint_decimals: u8
    const lpMintDecimals = data.readUInt8(offset);
    offset += 1;

    // mint0_decimals: u8
    const mint0Decimals = data.readUInt8(offset);
    offset += 1;

    // mint1_decimals: u8
    const mint1Decimals = data.readUInt8(offset);
    offset += 1;

    // lp_supply: u64
    const lpSupply = data.readBigUInt64LE(offset);
    offset += 8;

    // protocol_fees_token0: u64
    const protocolFeesToken0 = data.readBigUInt64LE(offset);
    offset += 8;

    // protocol_fees_token1: u64
    const protocolFeesToken1 = data.readBigUInt64LE(offset);
    offset += 8;

    // fund_fees_token0: u64
    const fundFeesToken0 = data.readBigUInt64LE(offset);
    offset += 8;

    // fund_fees_token1: u64
    const fundFeesToken1 = data.readBigUInt64LE(offset);
    offset += 8;

    // open_time: u64
    const openTime = data.readBigUInt64LE(offset);
    offset += 8;

    // recent_epoch: u64
    const recentEpoch = data.readBigUInt64LE(offset);

    return {
      ammConfig,
      poolCreator,
      token0Vault,
      token1Vault,
      lpMint,
      token0Mint,
      token1Mint,
      token0Program,
      token1Program,
      observationKey,
      authBump,
      status,
      lpMintDecimals,
      mint0Decimals,
      mint1Decimals,
      lpSupply,
      protocolFeesToken0,
      protocolFeesToken1,
      fundFeesToken0,
      fundFeesToken1,
      openTime,
      recentEpoch,
    };
  } catch {
    return null;
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/raydium_cpmm.rs =====

/**
 * Fetch a Raydium CPMM pool state from RPC.
 * 100% from Rust: src/instruction/utils/raydium_cpmm.rs fetch_pool_state
 */
export async function fetchRaydiumCPMMpoolState(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  poolAddress: PublicKey
): Promise<RaydiumCPMMpoolState | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  return decodeRaydiumCPMMpoolState(account.value.data);
}

/**
 * Get pool PDA for Raydium CPMM.
 * Seeds: ["pool", amm_config, mint1, mint2]
 */
export function getRaydiumCPMMpoolPDA(
  ammConfig: PublicKey,
  mint1: PublicKey,
  mint2: PublicKey
): PublicKey {
  const POOL_SEED = Buffer.from('pool');
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, ammConfig.toBuffer(), mint1.toBuffer(), mint2.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Get vault PDA for Raydium CPMM.
 * Seeds: ["pool_vault", pool_state, mint]
 */
export function getRaydiumCPMMvaultPDA(poolState: PublicKey, mint: PublicKey): PublicKey {
  const POOL_VAULT_SEED = Buffer.from('pool_vault');
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Get observation state PDA for Raydium CPMM.
 * Seeds: ["observation", pool_state]
 */
export function getRaydiumCPMMobservationStatePDA(poolState: PublicKey): PublicKey {
  const OBSERVATION_STATE_SEED = Buffer.from('observation');
  const [pda] = PublicKey.findProgramAddressSync(
    [OBSERVATION_STATE_SEED, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Get token balances for a Raydium CPMM pool.
 * 100% from Rust: src/instruction/utils/raydium_cpmm.rs get_pool_token_balances
 */
export async function getRaydiumCPMMpoolTokenBalances(
  connection: {
    getTokenAccountBalance: (pubkey: PublicKey) => Promise<{ value?: { amount: string } }>
  },
  poolState: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey
): Promise<{ token0Balance: bigint; token1Balance: bigint } | null> {
  try {
    const token0Vault = getRaydiumCPMMvaultPDA(poolState, token0Mint);
    const token1Vault = getRaydiumCPMMvaultPDA(poolState, token1Mint);

    const token0Result = await connection.getTokenAccountBalance(token0Vault);
    const token1Result = await connection.getTokenAccountBalance(token1Vault);

    const token0Balance = BigInt(token0Result?.value?.amount ?? '0');
    const token1Balance = BigInt(token1Result?.value?.amount ?? '0');

    return { token0Balance, token1Balance };
  } catch {
    return null;
  }
}
