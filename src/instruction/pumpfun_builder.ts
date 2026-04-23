/**
 * PumpFun Protocol Instruction Builder
 *
 * Production-grade instruction builder for PumpFun bonding curve protocol.
 * Supports buy, sell, and cashback claim operations.
 * 100% port from Rust: src/instruction/pumpfun.rs
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
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";

// ============================================
// Program IDs and Constants
// ============================================

/** PumpFun program ID */
export const PUMPFUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

/** Event Authority for PumpFun */
export const PUMPFUN_EVENT_AUTHORITY = new PublicKey(
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
);

/** Fee Program */
export const PUMPFUN_FEE_PROGRAM = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);

/** Global Volume Accumulator */
export const PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR = new PublicKey(
  "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y"
);

/** Fee Config */
export const PUMPFUN_FEE_CONFIG = new PublicKey(
  "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt"
);

/** Global Account */
export const PUMPFUN_GLOBAL_ACCOUNT = new PublicKey(
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
);

/** Fee Recipient */
export const PUMPFUN_FEE_RECIPIENT = new PublicKey(
  "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"
);

/** Non-mayhem: random among primary + Pump.fun AMM protocol fee recipients (Rust `get_standard_fee_recipient_meta_random`). */
export const PUMPFUN_STANDARD_FEE_RECIPIENTS: PublicKey[] = [
  PUMPFUN_FEE_RECIPIENT,
  new PublicKey("7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ"),
  new PublicKey("7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX"),
  new PublicKey("9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz"),
  new PublicKey("AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY"),
  new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
  new PublicKey("FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz"),
  new PublicKey("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP"),
];

/**
 * Protocol extra fee recipients (Apr 2026 breaking upgrade).
 * One pubkey is appended after bonding-curve-v2 on buy/sell; account must be writable.
 * @see https://github.com/pump-fun/pump-public-docs/blob/main/docs/BREAKING_FEE_RECIPIENT.md
 */
export const PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"),
  new PublicKey("9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7"),
  new PublicKey("GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL"),
  new PublicKey("3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR"),
  new PublicKey("5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6"),
  new PublicKey("EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL"),
  new PublicKey("5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD"),
  new PublicKey("A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW"),
];

/** Mayhem Fee Recipients */
export const PUMPFUN_MAYHEM_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey("GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS"),
  new PublicKey("4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6"),
  new PublicKey("8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR"),
  new PublicKey("4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH"),
  new PublicKey("8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6"),
  new PublicKey("Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk"),
  new PublicKey("463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq"),
  new PublicKey("6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA"),
];

// ============================================
// Discriminators - from Rust src/instruction/utils/pumpfun.rs
// ============================================

/** Buy instruction discriminator */
export const PUMPFUN_BUY_DISCRIMINATOR: Buffer = Buffer.from([
  102, 6, 61, 18, 1, 218, 235, 234,
]);

/** Buy exact SOL in discriminator */
export const PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR: Buffer = Buffer.from([
  56, 252, 116, 8, 158, 223, 205, 95,
]);

/** Sell instruction discriminator */
export const PUMPFUN_SELL_DISCRIMINATOR: Buffer = Buffer.from([
  51, 230, 133, 164, 1, 127, 131, 173,
]);

/** Claim cashback discriminator */
export const PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR: Buffer = Buffer.from([
  37, 58, 35, 126, 190, 53, 228, 197,
]);

// ============================================
// Seeds
// ============================================

export const PUMPFUN_BONDING_CURVE_SEED = Buffer.from("bonding-curve");
export const PUMPFUN_BONDING_CURVE_V2_SEED = Buffer.from("bonding-curve-v2");
export const PUMPFUN_CREATOR_VAULT_SEED = Buffer.from("creator-vault");
export const PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED = Buffer.from("user_volume_accumulator");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the bonding curve PDA for a given mint
 */
export function getBondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PUMPFUN_BONDING_CURVE_SEED, mint.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the bonding curve v2 PDA for a given mint
 */
export function getBondingCurveV2Pda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PUMPFUN_BONDING_CURVE_V2_SEED, mint.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the creator vault PDA for a given creator
 */
export function getCreatorVaultPda(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PUMPFUN_CREATOR_VAULT_SEED, creator.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the user volume accumulator PDA for a given user
 */
export function getPumpFunUserVolumeAccumulatorPda(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED, user.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}

/**
 * Get a random Mayhem fee recipient
 */
export function getRandomMayhemFeeRecipient(): PublicKey {
  const index = Math.floor(Math.random() * PUMPFUN_MAYHEM_FEE_RECIPIENTS.length);
  const recipient = PUMPFUN_MAYHEM_FEE_RECIPIENTS[index];
  if (!recipient) {
    return PUMPFUN_MAYHEM_FEE_RECIPIENTS[0]!;
  }
  return recipient;
}

export function getStandardFeeRecipientRandom(): PublicKey {
  const index = Math.floor(Math.random() * PUMPFUN_STANDARD_FEE_RECIPIENTS.length);
  return PUMPFUN_STANDARD_FEE_RECIPIENTS[index] ?? PUMPFUN_FEE_RECIPIENT;
}

/** Random protocol extra fee recipient (after bonding-curve-v2, mutable). */
export function getPumpFunProtocolExtraFeeRecipientRandom(): PublicKey {
  const index = Math.floor(Math.random() * PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS.length);
  return PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS[index] ?? PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS[0]!;
}

/**
 * Account #2 fee recipient: prefer gRPC/event `feeRecipient`; if `default` pubkey, random from mayhem or standard pool (Rust `pump_fun_fee_recipient_meta`).
 */
export function pumpFunFeeRecipientMeta(
  fromStream: PublicKey | undefined,
  isMayhemMode: boolean
): PublicKey {
  if (fromStream && !fromStream.equals(PublicKey.default)) {
    return fromStream;
  }
  return isMayhemMode ? getRandomMayhemFeeRecipient() : getStandardFeeRecipientRandom();
}

// ============================================
// Types
// ============================================

export interface PumpFunBondingCurve {
  account: PublicKey;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}

export interface PumpFunParams {
  bondingCurve: PumpFunBondingCurve;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  associatedBondingCurve?: PublicKey;
  closeTokenAccountWhenSell?: boolean;
  /** From parser/gRPC (`tradeEvent.feeRecipient`); default pubkey → random pool */
  feeRecipient?: PublicKey;
}

export interface PumpFunBuildBuyParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  protocolParams: PumpFunParams;
  useExactSolAmount?: boolean;
}

export interface PumpFunBuildSellParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  closeInputMintAta?: boolean;
  protocolParams: PumpFunParams;
}

// ============================================
// Helper Functions
// ============================================

const MAX_SLIPPAGE_BPS = BigInt(9999);

function calculateWithSlippageBuy(amount: bigint, basisPoints: bigint): bigint {
  const bps = basisPoints > MAX_SLIPPAGE_BPS ? MAX_SLIPPAGE_BPS : basisPoints;
  return amount + (amount * bps) / BigInt(10000);
}

function calculateWithSlippageSell(amount: bigint, basisPoints: bigint): bigint {
  const bps = basisPoints > MAX_SLIPPAGE_BPS ? MAX_SLIPPAGE_BPS : basisPoints;
  const result = amount - (amount * bps) / BigInt(10000);
  return result > BigInt(0) ? result : BigInt(1);
}

// ============================================
// Instruction Builders
// ============================================

/**
 * Build buy instructions for PumpFun protocol
 * 100% port from Rust: src/instruction/pumpfun.rs build_buy_instructions
 */
export function buildPumpFunBuyInstructions(
  params: PumpFunBuildBuyParams
): TransactionInstruction[] {
  const {
    payer,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    createOutputMintAta = true,
    protocolParams,
    useExactSolAmount = true,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const { bondingCurve, creatorVault, tokenProgram, associatedBondingCurve, feeRecipient } =
    protocolParams;

  // Derive bonding curve address
  const bondingCurveAddr =
    bondingCurve.account.equals(PublicKey.default) || !bondingCurve.account
      ? getBondingCurvePda(outputMint)
      : bondingCurve.account;

  // Get token program
  const tokenProgramId = tokenProgram || TOKEN_PROGRAM_ID;

  // Derive associated bonding curve
  const associatedBondingCurveAddr =
    associatedBondingCurve && !associatedBondingCurve.equals(PublicKey.default)
      ? associatedBondingCurve
      : getAssociatedTokenAddressSync(outputMint, bondingCurveAddr, true, tokenProgramId);

  // Derive user token account
  const userTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    tokenProgramId
  );

  // Derive user volume accumulator
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);

  // Create ATA if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userTokenAccount,
        payerPubkey,
        outputMint,
        tokenProgramId
      )
    );
  }

  const feeRecipientPk = pumpFunFeeRecipientMeta(feeRecipient, bondingCurve.isMayhemMode);

  // Derive bonding curve v2
  const bondingCurveV2 = getBondingCurveV2Pda(outputMint);

  // Track volume for cashback coins
  const trackVolume = bondingCurve.isCashbackCoin
    ? Buffer.from([1, 1])
    : Buffer.from([1, 0]);

  // Build instruction data
  let data: Buffer;
  if (useExactSolAmount) {
    // buy_exact_sol_in(spendable_sol_in: u64, min_tokens_out: u64, track_volume)
    const minTokensOut = fixedOutputAmount
      ? fixedOutputAmount
      : calculateWithSlippageSell(inputAmount, slippageBasisPoints);
    data = Buffer.alloc(26);
    PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(minTokensOut, 16);
    trackVolume.copy(data, 24);
  } else {
    // buy(token_amount: u64, max_sol_cost: u64, track_volume)
    const maxSolCost = calculateWithSlippageBuy(inputAmount, slippageBasisPoints);
    data = Buffer.alloc(26);
    PUMPFUN_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(maxSolCost, 16);
    trackVolume.copy(data, 24);
  }

  // Build accounts
  const keys: AccountMeta[] = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
    { pubkey: getPumpFunProtocolExtraFeeRecipientRandom(), isSigner: false, isWritable: true },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data,
    })
  );

  return instructions;
}

/**
 * Build sell instructions for PumpFun protocol
 * 100% port from Rust: src/instruction/pumpfun.rs build_sell_instructions
 */
export function buildPumpFunSellInstructions(
  params: PumpFunBuildSellParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const {
    bondingCurve,
    creatorVault,
    tokenProgram,
    associatedBondingCurve,
    closeTokenAccountWhenSell,
    feeRecipient,
  } = protocolParams;

  // Derive bonding curve address
  const bondingCurveAddr =
    bondingCurve.account.equals(PublicKey.default) || !bondingCurve.account
      ? getBondingCurvePda(inputMint)
      : bondingCurve.account;

  // Get token program
  const tokenProgramId = tokenProgram || TOKEN_PROGRAM_ID;

  // Derive associated bonding curve
  const associatedBondingCurveAddr =
    associatedBondingCurve && !associatedBondingCurve.equals(PublicKey.default)
      ? associatedBondingCurve
      : getAssociatedTokenAddressSync(inputMint, bondingCurveAddr, true, tokenProgramId);

  // Derive user token account
  const userTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    tokenProgramId
  );

  const feeRecipientPk = pumpFunFeeRecipientMeta(feeRecipient, bondingCurve.isMayhemMode);

  // Derive bonding curve v2
  const bondingCurveV2 = getBondingCurveV2Pda(inputMint);

  // Build instruction data (sell: token_amount, min_sol_output)
  const minSolOutput = fixedOutputAmount
    ? fixedOutputAmount
    : calculateWithSlippageSell(inputAmount, slippageBasisPoints);
  const data = Buffer.alloc(24);
  PUMPFUN_SELL_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minSolOutput, 16);

  // Build accounts
  const keys: AccountMeta[] = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
  ];

  // Add user volume accumulator for cashback coins
  if (bondingCurve.isCashbackCoin) {
    const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);
    keys.push({ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true });
  }

  // Add bonding curve v2
  keys.push({ pubkey: bondingCurveV2, isSigner: false, isWritable: false });
  keys.push({ pubkey: getPumpFunProtocolExtraFeeRecipientRandom(), isSigner: false, isWritable: true });

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data,
    })
  );

  // Close token account if requested
  if (closeInputMintAta || closeTokenAccountWhenSell) {
    instructions.push(
      createCloseAccountInstruction(
        userTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        tokenProgramId
      )
    );
  }

  return instructions;
}

/**
 * Build claim cashback instruction for PumpFun
 */
export function buildPumpFunClaimCashbackInstruction(payer: PublicKey): TransactionInstruction {
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payer);

  const keys: AccountMeta[] = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PUMPFUN_PROGRAM_ID,
    data: PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR,
  });
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/pumpfun.rs =====

/**
 * Fetch bonding curve account from RPC.
 * 100% from Rust: src/instruction/utils/pumpfun.rs fetch_bonding_curve_account
 */
export async function fetchBondingCurveAccount(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  mint: PublicKey
): Promise<{ bondingCurve: PumpFunBondingCurve; bondingCurvePda: PublicKey } | null> {
  const bondingCurvePda = getBondingCurvePda(mint);
  const account = await connection.getAccountInfo(bondingCurvePda);
  
  if (!account?.value?.data || account.value.data.length === 0) {
    return null;
  }
  
  const data = account.value.data;
  // Bonding curve data starts after 8-byte discriminator
  let offset = 8;
  
  // virtual_token_reserves: u64
  const virtualTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  
  // virtual_sol_reserves: u64
  const virtualSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  
  // real_token_reserves: u64
  const realTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  
  // real_sol_reserves: u64
  const realSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  
  // token_total_supply: u64
  offset += 8; // skip
  
  // complete: bool
  const complete = data.readUInt8(offset) === 1;
  offset += 1;
  
  // creator: Pubkey (32 bytes)
  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  
  // is_mayhem_mode: bool
  const isMayhemMode = data.readUInt8(offset) === 1;
  offset += 1;
  
  // is_cashback_coin: bool
  const isCashbackCoin = data.readUInt8(offset) === 1;
  
  return {
    bondingCurve: {
      account: bondingCurvePda,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      isMayhemMode,
      isCashbackCoin,
    },
    bondingCurvePda,
  };
}

/**
 * Get creator from creator vault PDA.
 * 100% from Rust: src/instruction/utils/pumpfun.rs get_creator
 */
export function getCreator(creatorVaultPda: PublicKey): PublicKey {
  // Check if creator_vault_pda is default
  const defaultBytes = Buffer.alloc(32);
  if (creatorVaultPda.equals(new PublicKey(defaultBytes))) {
    return new PublicKey(defaultBytes);
  }
  
  // Check against default creator vault
  const defaultCreatorVault = getCreatorVaultPda(new PublicKey(defaultBytes));
  if (creatorVaultPda.equals(defaultCreatorVault)) {
    return new PublicKey(defaultBytes);
  }
  
  return creatorVaultPda;
}

/**
 * Get buy price (tokens received for SOL).
 * 100% from Rust: src/instruction/utils/pumpfun.rs get_buy_price
 */
export function getBuyPrice(
  amount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  realTokenReserves: bigint
): bigint {
  if (amount === 0n) {
    return 0n;
  }
  
  const n = virtualSolReserves * virtualTokenReserves;
  const i = virtualSolReserves + amount;
  const r = n / i + 1n;
  const s = virtualTokenReserves - r;
  
  return s < realTokenReserves ? s : realTokenReserves;
}
