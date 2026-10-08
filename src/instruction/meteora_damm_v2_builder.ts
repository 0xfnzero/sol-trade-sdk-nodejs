/**
 * Meteora DAMM V2 Protocol Instruction Builder
 *
 * Production-grade instruction builder for Meteora DAMM V2 protocol.
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
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "../common/spl-token";

// ============================================
// Program IDs and Constants
// ============================================

const SOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111111");

/** Meteora DAMM V2 program ID */
export const METEORA_DAMM_V2_PROGRAM_ID = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);

/** Authority */
export const METEORA_DAMM_V2_AUTHORITY = new PublicKey(
  "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC"
);

// ============================================
// Discriminators
// ============================================

/** Swap instruction discriminator */
export const METEORA_DAMM_V2_SWAP_DISCRIMINATOR: Buffer = Buffer.from([
  248, 198, 158, 145, 225, 117, 135, 200,
]);
export const METEORA_DAMM_V2_SWAP2_DISCRIMINATOR: Buffer = Buffer.from([
  65, 75, 63, 76, 235, 91, 91, 136,
]);
export const METEORA_DAMM_V2_SWAP_MODE_EXACT_IN = 0;
export const METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL = 1;
export const METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT = 2;
export const METEORA_DAMM_V2_SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

// ============================================
// Seeds
// ============================================

export const METEORA_DAMM_V2_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the event authority PDA
 */
export function getMeteoraDammV2EventAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [METEORA_DAMM_V2_EVENT_AUTHORITY_SEED],
    METEORA_DAMM_V2_PROGRAM_ID
  );
  return pda;
}

// ============================================
// Types
// ============================================

export interface MeteoraDammV2Params {
  pool: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  /** Optional referral token account (writable), inserted before event authority. */
  referralTokenAccount?: PublicKey;
  /** 0 exact-in, 1 partial-fill (default), 2 exact-out */
  swapMode?: number;
  /** Append Instructions sysvar when pool rate limiter applies. */
  includeRateLimiterSysvar?: boolean;
}

function resolveMeteoraSwapMode(params: MeteoraDammV2Params): number {
  const mode = params.swapMode ?? METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL;
  if (
    mode !== METEORA_DAMM_V2_SWAP_MODE_EXACT_IN &&
    mode !== METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL &&
    mode !== METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT
  ) {
    throw new Error(`Unsupported MeteoraDammV2 swap_mode ${mode}`);
  }
  return mode;
}

function resolveMeteoraAmounts(
  swapMode: number,
  amountIn: bigint,
  fixedOutput: bigint
): [bigint, bigint] {
  if (swapMode === METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT) {
    return [fixedOutput, amountIn];
  }
  return [amountIn, fixedOutput];
}

function buildMeteoraAccountMetas(
  protocolParams: MeteoraDammV2Params,
  payerPubkey: PublicKey,
  inputTokenAccount: PublicKey,
  outputTokenAccount: PublicKey,
  eventAuthority: PublicKey
): AccountMeta[] {
  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram,
    referralTokenAccount,
    includeRateLimiterSysvar = false,
  } = protocolParams;

  const accounts: AccountMeta[] = [
    { pubkey: METEORA_DAMM_V2_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
  ];
  accounts.push(referralTokenAccount
    ? {pubkey:referralTokenAccount,isSigner:false,isWritable:true}
    : {pubkey:METEORA_DAMM_V2_PROGRAM_ID,isSigner:false,isWritable:false});
  accounts.push(
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false }
  );
  if (includeRateLimiterSysvar) {
    accounts.push({
      pubkey: METEORA_DAMM_V2_SYSVAR_INSTRUCTIONS,
      isSigner: false,
      isWritable: false,
    });
  }
  return accounts;
}

export interface BuildMeteoraDammV2BuyInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: MeteoraDammV2Params;
}

export interface BuildMeteoraDammV2SellInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: MeteoraDammV2Params;
}

// ============================================
// Instruction Builders
// ============================================

function isDefaultPublicKey(pubkey: PublicKey): boolean {
  return pubkey.equals(PublicKey.default);
}

function isMintMatch(requested: PublicKey, expected: PublicKey): boolean {
  return (
    requested.equals(expected) ||
    (expected.equals(NATIVE_MINT) && requested.equals(SOL_TOKEN_ACCOUNT))
  );
}

function ensureExpectedMint(label: string, requested: PublicKey, expected: PublicKey): void {
  if (!isDefaultPublicKey(requested) && !isMintMatch(requested, expected)) {
    throw new Error(
      `${label} must match the Meteora DAMM v2 pool side (${expected.toBase58()}), got ${requested.toBase58()}`
    );
  }
}

/**
 * Build buy instructions for Meteora DAMM V2 protocol
 */
export function buildMeteoraDammV2BuyInstructions(
  params: BuildMeteoraDammV2BuyInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  if (!fixedOutputAmount) {
    throw new Error("fixedOutputAmount must be set for Meteora DAMM V2 swap");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram,
  } = protocolParams;

  // Check pool type
  const isWsol = tokenAMint.equals(WSOL_TOKEN_ACCOUNT) || tokenBMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = tokenAMint.equals(USDC_TOKEN_ACCOUNT) || tokenBMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction
  const isAIn = tokenAMint.equals(WSOL_TOKEN_ACCOUNT) || tokenAMint.equals(USDC_TOKEN_ACCOUNT);

  const inputMint = isAIn ? tokenAMint : tokenBMint;
  const outputMint = isAIn ? tokenBMint : tokenAMint;
  ensureExpectedMint("inputMint", requestedInputMint, inputMint);
  ensureExpectedMint("outputMint", requestedOutputMint, outputMint);

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );

  // Derive event authority
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();

  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;

  // Handle input account creation/wrapping
  if (createInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: payerPubkey,
        toPubkey: wsolAta,
        lamports: inputAmount,
      })
    );
    instructions.push(createSyncNativeInstruction(wsolAta));
  } else if (createInputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        inputTokenAccount,
        payerPubkey,
        inputMint,
        inputTokenProgram
      )
    );
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

  // Build swap2 instruction data
  const swapMode = resolveMeteoraSwapMode(protocolParams);
  const [amount0, amount1] = resolveMeteoraAmounts(swapMode, inputAmount, fixedOutputAmount);
  const data = Buffer.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amount0, 8);
  data.writeBigUInt64LE(amount1, 16);
  data.writeUInt8(swapMode, 24);

  const accounts = buildMeteoraAccountMetas(
    protocolParams,
    payerPubkey,
    inputTokenAccount,
    outputTokenAccount,
    eventAuthority
  );

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey, [], TOKEN_PROGRAM_ID)
    );
  }

  return instructions;
}

/**
 * Build sell instructions for Meteora DAMM V2 protocol
 */
export function buildMeteoraDammV2SellInstructions(
  params: BuildMeteoraDammV2SellInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  if (!fixedOutputAmount) {
    throw new Error("fixedOutputAmount must be set for Meteora DAMM V2 swap");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram,
  } = protocolParams;

  // Check pool type
  const isWsol = tokenBMint.equals(WSOL_TOKEN_ACCOUNT) || tokenAMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = tokenBMint.equals(USDC_TOKEN_ACCOUNT) || tokenAMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction (selling token for WSOL/USDC)
  const isAIn = tokenBMint.equals(WSOL_TOKEN_ACCOUNT) || tokenBMint.equals(USDC_TOKEN_ACCOUNT);

  const inputMint = isAIn ? tokenAMint : tokenBMint;
  const outputMint = isAIn ? tokenBMint : tokenAMint;
  ensureExpectedMint("inputMint", requestedInputMint, inputMint);
  ensureExpectedMint("outputMint", requestedOutputMint, outputMint);

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );

  // Derive event authority
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();

  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;

  // Create output ATA for receiving if needed
  if (createOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  } else if (createOutputMintAta) {
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

  // Build swap2 instruction data
  const swapMode = resolveMeteoraSwapMode(protocolParams);
  const [amount0, amount1] = resolveMeteoraAmounts(swapMode, inputAmount, fixedOutputAmount);
  const data = Buffer.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amount0, 8);
  data.writeBigUInt64LE(amount1, 16);
  data.writeUInt8(swapMode, 24);

  const accounts = buildMeteoraAccountMetas(
    protocolParams,
    payerPubkey,
    inputTokenAccount,
    outputTokenAccount,
    eventAuthority
  );

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey, [], TOKEN_PROGRAM_ID)
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
        isAIn ? tokenAProgram : tokenBProgram
      )
    );
  }

  return instructions;
}

// ===== Pool Types and Decoder - from Rust: src/instruction/utils/meteora_damm_v2_types.rs =====

/** Pool size in bytes */
export const METEORA_POOL_SIZE = 1104;

/**
 * Meteora DAMM V2 Pool structure (simplified for essential fields)
 * 100% from Rust: src/instruction/utils/meteora_damm_v2_types.rs Pool
 */
export interface MeteoraBaseFeeStruct {
  cliffFeeNumerator: bigint;
  feeSchedulerMode: number;
  padding0: Uint8Array;
  numberOfPeriod: number;
  periodFrequency: bigint;
  reductionFactor: bigint;
  padding1: bigint;
}

export interface MeteoraDynamicFeeStruct {
  initialized: number;
  padding: Uint8Array;
  maxVolatilityAccumulator: number;
  variableFeeControl: number;
  binStep: number;
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
  lastUpdateTimestamp: bigint;
  binStepU128: bigint;
  sqrtPriceReference: bigint;
  volatilityAccumulator: bigint;
  volatilityReference: bigint;
}

export interface MeteoraPoolFeesStruct {
  /** Current fields; legacy padding below remains a raw compatibility overlay. */
  compoundingFeeBps: number;
  initSqrtPrice: bigint;
  baseFee: MeteoraBaseFeeStruct;
  protocolFeePercent: number;
  partnerFeePercent: number;
  referralFeePercent: number;
  padding0: Uint8Array;
  dynamicFee: MeteoraDynamicFeeStruct;
  padding1: bigint[];
}

export interface MeteoraPoolMetrics {
  totalLpAFee: bigint;
  totalLpBFee: bigint;
  totalProtocolAFee: bigint;
  totalProtocolBFee: bigint;
  totalPartnerAFee: bigint;
  totalPartnerBFee: bigint;
  totalPosition: bigint;
  padding: bigint;
}

export interface MeteoraRewardInfo {
  initialized: number;
  rewardTokenFlag: number;
  padding0: Uint8Array;
  padding1: Uint8Array;
  mint: PublicKey;
  vault: PublicKey;
  funder: PublicKey;
  rewardDuration: bigint;
  rewardDurationEnd: bigint;
  rewardRate: bigint;
  rewardPerTokenStored: Uint8Array;
  lastUpdateTime: bigint;
  cumulativeSecondsWithEmptyLiquidityReward: bigint;
}

export interface MeteoraDammV2Pool {
  deadLiquidityFeeCheckpoint: bigint;
  feeVersion: number;
  creator: PublicKey;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  layoutVersion: number;
  poolFees: MeteoraPoolFeesStruct;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  whitelistedVault: PublicKey;
  partner: PublicKey;
  liquidity: bigint;
  padding: bigint;
  protocolAFee: bigint;
  protocolBFee: bigint;
  partnerAFee: bigint;
  partnerBFee: bigint;
  sqrtMinPrice: bigint;
  sqrtMaxPrice: bigint;
  sqrtPrice: bigint;
  activationPoint: bigint;
  activationType: number;
  poolStatus: number;
  tokenAFlag: number;
  tokenBFlag: number;
  collectFeeMode: number;
  poolType: number;
  padding0: Uint8Array;
  feeAPerLiquidity: Uint8Array;
  feeBPerLiquidity: Uint8Array;
  permanentLockLiquidity: bigint;
  metrics: MeteoraPoolMetrics;
  padding1: bigint[];
  rewardInfos: MeteoraRewardInfo[];
}

export function decodeMeteoraPool(data: Buffer): MeteoraDammV2Pool | null {
 if(data.length < METEORA_POOL_SIZE)return null;
 let offset=0;
 const take=(size:number)=>{const value=Buffer.from(data.subarray(offset,offset+size));offset+=size;return value};
 const integer=(size:number)=>{const value=take(size);let n=0n;for(let i=size-1;i>=0;i--)n=(n<<8n)|BigInt(value[i]!);return n};
 const readBaseFeeStruct=(): MeteoraBaseFeeStruct => ({
 cliffFeeNumerator: integer(8),
 feeSchedulerMode: Number(integer(1)),
 padding0: take(5),
 numberOfPeriod: Number(integer(2)),
 periodFrequency: integer(8),
 reductionFactor: integer(8),
 padding1: integer(8),
 });
 const readDynamicFeeStruct=(): MeteoraDynamicFeeStruct => ({
 initialized: Number(integer(1)),
 padding: take(7),
 maxVolatilityAccumulator: Number(integer(4)),
 variableFeeControl: Number(integer(4)),
 binStep: Number(integer(2)),
 filterPeriod: Number(integer(2)),
 decayPeriod: Number(integer(2)),
 reductionFactor: Number(integer(2)),
 lastUpdateTimestamp: integer(8),
 binStepU128: integer(16),
 sqrtPriceReference: integer(16),
 volatilityAccumulator: integer(16),
 volatilityReference: integer(16),
 });
 const readPoolFeesStruct=(): MeteoraPoolFeesStruct => ({
 compoundingFeeBps: data.readUInt16LE(46),
 initSqrtPrice: data.readBigUInt64LE(144) | (data.readBigUInt64LE(152) << 64n),
 baseFee: readBaseFeeStruct(),
 protocolFeePercent: Number(integer(1)),
 partnerFeePercent: Number(integer(1)),
 referralFeePercent: Number(integer(1)),
 padding0: take(5),
 dynamicFee: readDynamicFeeStruct(),
 padding1: Array.from({length:2},()=>integer(8)),
 });
 const readPoolMetrics=(): MeteoraPoolMetrics => ({
 totalLpAFee: integer(16),
 totalLpBFee: integer(16),
 totalProtocolAFee: integer(8),
 totalProtocolBFee: integer(8),
 totalPartnerAFee: integer(8),
 totalPartnerBFee: integer(8),
 totalPosition: integer(8),
 padding: integer(8),
 });
 const readRewardInfo=(): MeteoraRewardInfo => ({
 initialized: Number(integer(1)),
 rewardTokenFlag: Number(integer(1)),
 padding0: take(6),
 padding1: take(8),
 mint: new PublicKey(take(32)),
 vault: new PublicKey(take(32)),
 funder: new PublicKey(take(32)),
 rewardDuration: integer(8),
 rewardDurationEnd: integer(8),
 rewardRate: integer(16),
 rewardPerTokenStored: take(32),
 lastUpdateTime: integer(8),
 cumulativeSecondsWithEmptyLiquidityReward: integer(8),
 });
 const readPool=(): MeteoraDammV2Pool => ({
 deadLiquidityFeeCheckpoint: data.readBigUInt64LE(400),
 feeVersion: data[478]!,
 creator: new PublicKey(data.subarray(640,672)),
 tokenAAmount: data.readBigUInt64LE(672),
 tokenBAmount: data.readBigUInt64LE(680),
 layoutVersion: data[688]!,
 poolFees: readPoolFeesStruct(),
 tokenAMint: new PublicKey(take(32)),
 tokenBMint: new PublicKey(take(32)),
 tokenAVault: new PublicKey(take(32)),
 tokenBVault: new PublicKey(take(32)),
 whitelistedVault: new PublicKey(take(32)),
 partner: new PublicKey(take(32)),
 liquidity: integer(16),
 padding: integer(16),
 protocolAFee: integer(8),
 protocolBFee: integer(8),
 partnerAFee: integer(8),
 partnerBFee: integer(8),
 sqrtMinPrice: integer(16),
 sqrtMaxPrice: integer(16),
 sqrtPrice: integer(16),
 activationPoint: integer(8),
 activationType: Number(integer(1)),
 poolStatus: Number(integer(1)),
 tokenAFlag: Number(integer(1)),
 tokenBFlag: Number(integer(1)),
 collectFeeMode: Number(integer(1)),
 poolType: Number(integer(1)),
 padding0: take(2),
 feeAPerLiquidity: take(32),
 feeBPerLiquidity: take(32),
 permanentLockLiquidity: integer(16),
 metrics: readPoolMetrics(),
 padding1: Array.from({length:10},()=>integer(8)),
 rewardInfos: Array.from({length:2},()=>readRewardInfo()),
 });
 return readPool();
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/meteora_damm_v2.rs =====

/**
 * Fetch a Meteora DAMM V2 pool from RPC.
 * 100% from Rust: src/instruction/utils/meteora_damm_v2.rs fetch_pool
 */
export async function fetchMeteoraPool(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer; owner?: PublicKey } }> },
  poolAddress: PublicKey
): Promise<MeteoraDammV2Pool | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }

  // Verify owner is Meteora DAMM V2 program
  if (account.value.owner && !account.value.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) {
    return null;
  }

  const data = account.value.data;
  if (data.length < 8 + METEORA_POOL_SIZE || !data.subarray(0,8).equals(Buffer.from([241,154,109,4,17,177,109,188]))) return null;
  return decodeMeteoraPool(data.subarray(8));
}
