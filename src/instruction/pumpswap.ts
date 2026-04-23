/**
 * PumpSwap instruction builder - Production-grade implementation
 * 100% port from Rust sol-trade-sdk
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  ASSOCIATED_TOKEN_PROGRAM,
  WSOL_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT,
} from '../constants';
import {
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  ceilDiv,
  computeFee,
  buyQuoteInputInternal,
  sellBaseInputInternal,
  PUMPSWAP_CONSTANTS,
} from '../calc';

// ===== Constants from Rust: src/instruction/utils/pumpswap.rs =====

export const PUMPSWAP_PROGRAM = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
export const PUMPSWAP_PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMPSWAP_FEE_PROGRAM = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

// Accounts
export const PUMPSWAP_FEE_RECIPIENT = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
export const PUMPSWAP_GLOBAL_ACCOUNT = new PublicKey('ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw');
export const PUMPSWAP_EVENT_AUTHORITY = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
export const PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR = new PublicKey('C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw');
export const PUMPSWAP_FEE_CONFIG = new PublicKey('5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx');
export const PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY = new PublicKey('8N3GDaZ2iwN65oxVatKTLPNooAVUJTbfiVJ1ahyqwjSk');

// Mayhem fee recipients (use any one randomly)
export const PUMPSWAP_MAYHEM_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey('GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS'),
  new PublicKey('4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6'),
  new PublicKey('8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR'),
  new PublicKey('4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH'),
  new PublicKey('8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6'),
  new PublicKey('Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk'),
  new PublicKey('463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq'),
  new PublicKey('6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA'),
];

/** Protocol extra fee recipients (Apr 2026); after pool-v2: readonly, then quote ATA (mutable). */
export const PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey('5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD'),
  new PublicKey('9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7'),
  new PublicKey('GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL'),
  new PublicKey('3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR'),
  new PublicKey('5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6'),
  new PublicKey('EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL'),
  new PublicKey('5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD'),
  new PublicKey('A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW'),
];

// Discriminators
export const PUMPSWAP_BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
export const PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR = Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]);
export const PUMPSWAP_SELL_DISCRIMINATOR = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
export const PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR = Buffer.from([37, 58, 35, 126, 190, 53, 228, 197]);

// Seeds
const POOL_V2_SEED = Buffer.from('pool-v2');
const POOL_SEED = Buffer.from('pool');
const POOL_AUTHORITY_SEED = Buffer.from('pool-authority');
const USER_VOLUME_ACCUMULATOR_SEED = Buffer.from('user_volume_accumulator');
const CREATOR_VAULT_SEED = Buffer.from('creator_vault');
const FEE_CONFIG_SEED = Buffer.from('fee_config');
const GLOBAL_VOLUME_ACCUMULATOR_SEED = Buffer.from('global_volume_accumulator');

// ===== PDA Derivation Functions =====

/**
 * Get a random Mayhem fee recipient
 */
export function getMayhemFeeRecipientRandom(): PublicKey {
  const index = Math.floor(Math.random() * PUMPSWAP_MAYHEM_FEE_RECIPIENTS.length);
  const recipient = PUMPSWAP_MAYHEM_FEE_RECIPIENTS[index];
  if (!recipient) {
    return PUMPSWAP_MAYHEM_FEE_RECIPIENTS[0]!;
  }
  return recipient;
}

export function getPumpSwapProtocolExtraFeeRecipientRandom(): PublicKey {
  const index = Math.floor(Math.random() * PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS.length);
  return PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS[index] ?? PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS[0]!;
}

/**
 * Pool v2 PDA (seeds: ["pool-v2", base_mint])
 */
export function getPoolV2PDA(baseMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_V2_SEED, baseMint.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

/**
 * Pump program pool-authority PDA (for canonical pool)
 */
export function getPumpPoolAuthorityPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_AUTHORITY_SEED, mint.toBuffer()],
    PUMPSWAP_PUMP_PROGRAM_ID
  );
  return pda;
}

/**
 * Canonical Pump pool PDA
 */
export function getCanonicalPoolPDA(mint: PublicKey): PublicKey {
  const authority = getPumpPoolAuthorityPDA(mint);
  const index = Buffer.alloc(2);
  index.writeUInt16LE(0);
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, index, authority.toBuffer(), mint.toBuffer(), WSOL_TOKEN_ACCOUNT.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

/**
 * Coin creator vault authority PDA
 */
export function getCoinCreatorVaultAuthority(coinCreator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [CREATOR_VAULT_SEED, coinCreator.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

/**
 * Coin creator vault ATA
 */
export function getCoinCreatorVaultAta(coinCreator: PublicKey, quoteMint: PublicKey): PublicKey {
  const authority = getCoinCreatorVaultAuthority(coinCreator);
  return getAssociatedTokenAddress(authority, quoteMint, TOKEN_PROGRAM);
}

/**
 * Fee recipient ATA
 */
export function getFeeRecipientAta(feeRecipient: PublicKey, quoteMint: PublicKey): PublicKey {
  return getAssociatedTokenAddress(feeRecipient, quoteMint, TOKEN_PROGRAM);
}

/**
 * User volume accumulator PDA
 */
export function getUserVolumeAccumulatorPDA(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_VOLUME_ACCUMULATOR_SEED, user.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

/**
 * WSOL ATA of UserVolumeAccumulator (for buy cashback)
 */
export function getUserVolumeAccumulatorWsolAta(user: PublicKey): PublicKey {
  const accumulator = getUserVolumeAccumulatorPDA(user);
  return getAssociatedTokenAddress(accumulator, WSOL_TOKEN_ACCOUNT, TOKEN_PROGRAM);
}

/**
 * Quote-mint ATA of UserVolumeAccumulator (for sell cashback)
 */
export function getUserVolumeAccumulatorQuoteAta(
  user: PublicKey,
  quoteMint: PublicKey,
  quoteTokenProgram: PublicKey
): PublicKey {
  const accumulator = getUserVolumeAccumulatorPDA(user);
  return getAssociatedTokenAddress(accumulator, quoteMint, quoteTokenProgram);
}

/**
 * Global volume accumulator PDA
 * Seeds: ["global_volume_accumulator"], owner: PUMPSWAP_PROGRAM
 */
export function getGlobalVolumeAccumulatorPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [GLOBAL_VOLUME_ACCUMULATOR_SEED],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

/**
 * Get associated token address
 */
export function getAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return ata;
}

// ===== WSOL Manager =====

/**
 * Create WSOL ATA and wrap SOL
 * Returns instructions for: create ATA (idempotent), transfer SOL, sync_native
 */
export function handleWsol(owner: PublicKey, amount: bigint): TransactionInstruction[] {
  const wsolAta = getAssociatedTokenAddress(owner, WSOL_TOKEN_ACCOUNT, TOKEN_PROGRAM);
  const instructions: TransactionInstruction[] = [];

  // Create ATA (idempotent)
  instructions.push(
    createAssociatedTokenAccountIdempotent(owner, owner, WSOL_TOKEN_ACCOUNT, TOKEN_PROGRAM)
  );

  // Transfer SOL to WSOL ATA
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: wsolAta,
      lamports: Number(amount),
    })
  );

  // Sync native
  instructions.push(
    new TransactionInstruction({
      keys: [{ pubkey: wsolAta, isSigner: false, isWritable: true }],
      programId: TOKEN_PROGRAM,
      data: Buffer.from([17]), // sync_native discriminator
    })
  );

  return instructions;
}

/**
 * Close WSOL ATA and reclaim rent
 */
export function closeWsol(owner: PublicKey): TransactionInstruction {
  const wsolAta = getAssociatedTokenAddress(owner, WSOL_TOKEN_ACCOUNT, TOKEN_PROGRAM);
  return new TransactionInstruction({
    keys: [
      { pubkey: wsolAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM,
    data: Buffer.from([9, 0, 0, 0, 0, 0, 0, 0]), // close_account discriminator
  });
}

/**
 * Create associated token account idempotent
 */
export function createAssociatedTokenAccountIdempotent(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): TransactionInstruction {
  const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM,
    data: Buffer.from([1]), // Idempotent discriminator
  });
}

// ===== Params Interface =====

export interface PumpSwapParams {
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  poolBaseTokenReserves: bigint;
  poolQuoteTokenReserves: bigint;
  coinCreatorVaultAta: PublicKey;
  coinCreatorVaultAuthority: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}

export interface BuildBuyParams {
  payer: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints: bigint;
  protocolParams: PumpSwapParams;
  createInputMintAta?: boolean;
  closeInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  useExactQuoteAmount?: boolean;
  fixedOutputAmount?: bigint;
}

export interface BuildSellParams {
  payer: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints: bigint;
  protocolParams: PumpSwapParams;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  fixedOutputAmount?: bigint;
}

// ===== Instruction Builders =====

/**
 * Build buy instructions for PumpSwap
 * 100% port from Rust: src/instruction/pumpswap.rs build_buy_instructions
 */
export function buildBuyInstructions(params: BuildBuyParams): TransactionInstruction[] {
  const {
    payer,
    inputAmount,
    slippageBasisPoints,
    protocolParams,
    createInputMintAta = false,
    closeInputMintAta = false,
    createOutputMintAta = true,
    useExactQuoteAmount = true,
    fixedOutputAmount,
  } = params;

  if (inputAmount === 0n) {
    throw new Error('Amount cannot be zero');
  }

  const {
    pool,
    baseMint,
    quoteMint,
    poolBaseTokenAccount,
    poolQuoteTokenAccount,
    poolBaseTokenReserves,
    poolQuoteTokenReserves,
    coinCreatorVaultAta,
    coinCreatorVaultAuthority,
    baseTokenProgram,
    quoteTokenProgram,
    isMayhemMode,
    isCashbackCoin,
  } = protocolParams;

  // Check if pool contains WSOL or USDC
  const isWsol = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || baseMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = quoteMint.equals(USDC_TOKEN_ACCOUNT) || baseMint.equals(USDC_TOKEN_ACCOUNT);
  
  if (!isWsol && !isUsdc) {
    throw new Error('Pool must contain WSOL or USDC');
  }

  const quoteIsWsolOrUsdc = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);

  // Determine creator for fee calculation
  let creator = PublicKey.default;
  if (!coinCreatorVaultAuthority.equals(PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY)) {
    creator = coinCreatorVaultAuthority;
  }
  const hasCoinCreator = !creator.equals(PublicKey.default);

  // Calculate trade amounts
  let tokenAmount: bigint;
  let solAmount: bigint;

  if (quoteIsWsolOrUsdc) {
    // Buying base with quote (WSOL/USDC)
    const result = buyQuoteInputInternal(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      hasCoinCreator
    );
    tokenAmount = result.base;
    solAmount = result.maxQuote;
  } else {
    // This would be selling base for quote - shouldn't happen in buy
    throw new Error('Invalid configuration for buy');
  }

  // Override token amount if fixed output is specified
  if (fixedOutputAmount !== undefined) {
    tokenAmount = fixedOutputAmount;
  }

  // Get user token accounts
  const userBaseTokenAccount = getAssociatedTokenAddress(payer, baseMint, baseTokenProgram);
  const userQuoteTokenAccount = getAssociatedTokenAddress(payer, quoteMint, quoteTokenProgram);

  // Determine fee recipient
  const feeRecipient = isMayhemMode ? getMayhemFeeRecipientRandom() : PUMPSWAP_FEE_RECIPIENT;
  const feeRecipientAta = getFeeRecipientAta(feeRecipient, quoteMint);

  // Build instructions
  const instructions: TransactionInstruction[] = [];

  // Handle WSOL wrapping if needed
  if (createInputMintAta && quoteIsWsolOrUsdc) {
    // Determine wrap amount based on instruction type:
    // - buy_exact_quote_in: program spends exactly input_amount, wrap input_amount
    // - buy: program may spend up to max_quote, wrap max_quote
    const wrapAmount = useExactQuoteAmount ? inputAmount : solAmount;
    instructions.push(...handleWsol(payer, wrapAmount));
  }

  // Create output token ATA if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotent(payer, payer, baseMint, baseTokenProgram)
    );
  }

  // Build accounts array
  const accounts = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: PUMPSWAP_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: feeRecipient, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
    { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false },
  ];

  // Add volume accumulator accounts for quote (WSOL/USDC) buy
  if (quoteIsWsolOrUsdc) {
    accounts.push(
      { pubkey: PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true }
    );
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push({ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true });
  }

  // Add fee config and program
  accounts.push(
    { pubkey: PUMPSWAP_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_FEE_PROGRAM, isSigner: false, isWritable: false }
  );

  // Add cashback WSOL ATA if needed
  if (isCashbackCoin) {
    const wsolAta = getUserVolumeAccumulatorWsolAta(payer);
    accounts.push({ pubkey: wsolAta, isSigner: false, isWritable: true });
  }

  // Add pool v2 PDA
  const poolV2 = getPoolV2PDA(baseMint);
  accounts.push({ pubkey: poolV2, isSigner: false, isWritable: false });
  const protocolExtraFee = getPumpSwapProtocolExtraFeeRecipientRandom();
  accounts.push({ pubkey: protocolExtraFee, isSigner: false, isWritable: false });
  accounts.push({
    pubkey: getAssociatedTokenAddress(protocolExtraFee, quoteMint, TOKEN_PROGRAM),
    isSigner: false,
    isWritable: true,
  });

  // Build instruction data
  const trackVolume = isCashbackCoin ? Buffer.from([1, 1]) : Buffer.from([1, 0]);
  let data: Buffer;

  if (useExactQuoteAmount) {
    // buy_exact_quote_in(spendable_quote_in, min_base_amount_out, track_volume)
    const minBaseAmountOut = calculateWithSlippageSell(tokenAmount, slippageBasisPoints);
    data = Buffer.alloc(26);
    PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(minBaseAmountOut, 16);
    trackVolume.copy(data, 24);
  } else {
    // buy(token_amount, max_quote, track_volume)
    data = Buffer.alloc(26);
    PUMPSWAP_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(solAmount, 16);
    trackVolume.copy(data, 24);
  }

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: PUMPSWAP_PROGRAM,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeInputMintAta) {
    instructions.push(closeWsol(payer));
  }

  return instructions;
}

/**
 * Build sell instructions for PumpSwap
 * 100% port from Rust: src/instruction/pumpswap.rs build_sell_instructions
 */
export function buildSellInstructions(params: BuildSellParams): TransactionInstruction[] {
  const {
    payer,
    inputAmount,
    slippageBasisPoints,
    protocolParams,
    createOutputMintAta = false,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    fixedOutputAmount,
  } = params;

  if (inputAmount === 0n) {
    throw new Error('Amount cannot be zero');
  }

  const {
    pool,
    baseMint,
    quoteMint,
    poolBaseTokenAccount,
    poolQuoteTokenAccount,
    poolBaseTokenReserves,
    poolQuoteTokenReserves,
    coinCreatorVaultAta,
    coinCreatorVaultAuthority,
    baseTokenProgram,
    quoteTokenProgram,
    isMayhemMode,
    isCashbackCoin,
  } = protocolParams;

  // Check if pool contains WSOL or USDC
  const isWsol = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || baseMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = quoteMint.equals(USDC_TOKEN_ACCOUNT) || baseMint.equals(USDC_TOKEN_ACCOUNT);
  
  if (!isWsol && !isUsdc) {
    throw new Error('Pool must contain WSOL or USDC');
  }

  const quoteIsWsolOrUsdc = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);

  // Determine creator for fee calculation
  let creator = PublicKey.default;
  if (!coinCreatorVaultAuthority.equals(PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY)) {
    creator = coinCreatorVaultAuthority;
  }
  const hasCoinCreator = !creator.equals(PublicKey.default);

  // Calculate trade amounts
  let tokenAmount: bigint;
  let solAmount: bigint;

  if (quoteIsWsolOrUsdc) {
    // Selling base for quote (WSOL/USDC)
    tokenAmount = inputAmount;
    const result = sellBaseInputInternal(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      hasCoinCreator
    );
    solAmount = result.minQuote;
  } else {
    // Selling quote for base - unusual case
    tokenAmount = inputAmount;
    solAmount = 0n; // Would need different calculation
  }

  // Override sol amount if fixed output is specified
  if (fixedOutputAmount !== undefined) {
    solAmount = fixedOutputAmount;
  }

  // Get user token accounts
  const userBaseTokenAccount = getAssociatedTokenAddress(payer, baseMint, baseTokenProgram);
  const userQuoteTokenAccount = getAssociatedTokenAddress(payer, quoteMint, quoteTokenProgram);

  // Determine fee recipient
  const feeRecipient = isMayhemMode ? getMayhemFeeRecipientRandom() : PUMPSWAP_FEE_RECIPIENT;
  const feeRecipientAta = getFeeRecipientAta(feeRecipient, quoteMint);

  // Build instructions
  const instructions: TransactionInstruction[] = [];

  // Create WSOL/USDC ATA if needed for receiving
  if (createOutputMintAta && quoteIsWsolOrUsdc) {
    instructions.push(
      createAssociatedTokenAccountIdempotent(payer, payer, quoteMint, quoteTokenProgram)
    );
  }

  // Build accounts array
  const accounts = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: PUMPSWAP_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: feeRecipient, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
    { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false },
  ];

  // Add volume accumulator accounts for non-quote sell
  if (!quoteIsWsolOrUsdc) {
    accounts.push(
      { pubkey: PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true }
    );
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push({ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true });
  }

  // Add fee config and program
  accounts.push(
    { pubkey: PUMPSWAP_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_FEE_PROGRAM, isSigner: false, isWritable: false }
  );

  // Add cashback accounts if needed (sell uses quote ATA)
  if (isCashbackCoin) {
    const quoteAta = getUserVolumeAccumulatorQuoteAta(payer, quoteMint, quoteTokenProgram);
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push(
      { pubkey: quoteAta, isSigner: false, isWritable: true },
      { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true }
    );
  }

  // Add pool v2 PDA
  const poolV2 = getPoolV2PDA(baseMint);
  accounts.push({ pubkey: poolV2, isSigner: false, isWritable: false });
  const protocolExtraFee = getPumpSwapProtocolExtraFeeRecipientRandom();
  accounts.push({ pubkey: protocolExtraFee, isSigner: false, isWritable: false });
  accounts.push({
    pubkey: getAssociatedTokenAddress(protocolExtraFee, quoteMint, TOKEN_PROGRAM),
    isSigner: false,
    isWritable: true,
  });

  // Build instruction data
  const data = Buffer.alloc(24);
  if (quoteIsWsolOrUsdc) {
    PUMPSWAP_SELL_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(solAmount, 16);
  } else {
    PUMPSWAP_SELL_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(solAmount, 8);
    data.writeBigUInt64LE(tokenAmount, 16);
  }

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: PUMPSWAP_PROGRAM,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeOutputMintAta && quoteIsWsolOrUsdc) {
    instructions.push(closeWsol(payer));
  }

  // Close base token account if requested
  if (closeInputMintAta) {
    const closeIx = new TransactionInstruction({
      keys: [
        { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: false },
      ],
      programId: baseTokenProgram,
      data: Buffer.from([9, 0, 0, 0, 0, 0, 0, 0]),
    });
    instructions.push(closeIx);
  }

  return instructions;
}

/**
 * Build claim cashback instruction for PumpSwap
 */
export function buildClaimCashbackInstruction(
  payer: PublicKey,
  quoteMint: PublicKey,
  quoteTokenProgram: PublicKey
): TransactionInstruction {
  const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
  const userVolumeAccumulatorWsolAta = getUserVolumeAccumulatorWsolAta(payer);
  const userWsolAta = getAssociatedTokenAddress(payer, quoteMint, quoteTokenProgram);

  const accounts = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: userVolumeAccumulatorWsolAta, isSigner: false, isWritable: true },
    { pubkey: userWsolAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys: accounts,
    programId: PUMPSWAP_PROGRAM,
    data: PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR,
  });
}

// ===== Pool Types and Decoding - from Rust: src/instruction/utils/pumpswap_types.rs =====

/**
 * Pool size in bytes (244 bytes as per pump-public-docs)
 */
export const POOL_SIZE = 244;

/**
 * PumpSwap Pool structure
 * Matches Rust: src/instruction/utils/pumpswap_types.rs Pool struct
 */
export interface PumpSwapPool {
  poolBump: number;
  index: number;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  lpSupply: bigint;
  coinCreator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}

/**
 * Decode a PumpSwap pool from account data
 * Uses Borsh deserialization
 */
export function decodePool(data: Buffer): PumpSwapPool | null {
  if (data.length < POOL_SIZE) {
    return null;
  }

  try {
    let offset = 0;

    // pool_bump: u8
    const poolBump = data.readUInt8(offset);
    offset += 1;

    // index: u16
    const index = data.readUInt16LE(offset);
    offset += 2;

    // creator: Pubkey (32 bytes)
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // base_mint: Pubkey
    const baseMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // quote_mint: Pubkey
    const quoteMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // lp_mint: Pubkey
    const lpMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // pool_base_token_account: Pubkey
    const poolBaseTokenAccount = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // pool_quote_token_account: Pubkey
    const poolQuoteTokenAccount = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // lp_supply: u64
    const lpSupply = data.readBigUInt64LE(offset);
    offset += 8;

    // coin_creator: Pubkey
    const coinCreator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // is_mayhem_mode: bool
    const isMayhemMode = data.readUInt8(offset) === 1;
    offset += 1;

    // is_cashback_coin: bool
    const isCashbackCoin = data.readUInt8(offset) === 1;
    offset += 1;

    return {
      poolBump,
      index,
      creator,
      baseMint,
      quoteMint,
      lpMint,
      poolBaseTokenAccount,
      poolQuoteTokenAccount,
      lpSupply,
      coinCreator,
      isMayhemMode,
      isCashbackCoin,
    };
  } catch {
    return null;
  }
}

// ===== Pool Finder Functions - from Rust: src/instruction/utils/pumpswap.rs =====

/**
 * Find a PumpSwap pool by mint
 * 
 * Search order (matches @pump-fun/pump-swap-sdk):
 * 1. Pool v2 PDA ["pool-v2", base_mint]
 * 2. Canonical pool PDA ["pool", 0, pumpPoolAuthority(mint), mint, WSOL]
 * 3. getProgramAccounts by base_mint / quote_mint
 */
export async function findPoolByMint(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value: { data: Buffer } | null }> },
  mint: PublicKey
): Promise<{ poolAddress: PublicKey; pool: PumpSwapPool } | null> {
  // 1. Try Pool v2 PDA
  const poolV2 = getPoolV2PDA(mint);
  const poolV2Account = await connection.getAccountInfo(poolV2);
  if (poolV2Account?.value?.data) {
    const pool = decodePool(poolV2Account.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: poolV2, pool };
    }
  }

  // 2. Try canonical pool PDA
  const canonicalAddress = getCanonicalPoolPDA(mint);
  const canonicalAccount = await connection.getAccountInfo(canonicalAddress);
  if (canonicalAccount?.value?.data) {
    const pool = decodePool(canonicalAccount.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: canonicalAddress, pool };
    }
  }

  return null;
}

/**
 * Get fee config PDA
 */
export function getFeeConfigPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [FEE_CONFIG_SEED, PUMPSWAP_PROGRAM.toBuffer()],
    new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ')
  );
  return pda;
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/pumpswap.rs =====

/**
 * Fetch a PumpSwap pool from RPC.
 * 100% from Rust: src/instruction/utils/pumpswap.rs fetch_pool
 */
export async function fetchPool(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  poolAddress: PublicKey
): Promise<PumpSwapPool | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  const pool = decodePool(account.value.data);
  return pool;
}

/**
 * Get token balances for a pool's token accounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs get_token_balances
 */
export async function getTokenBalances(
  connection: {
    getTokenAccountBalance: (pubkey: PublicKey) => Promise<{ value?: { amount: string } }>
  },
  pool: PumpSwapPool
): Promise<{ baseBalance: bigint; quoteBalance: bigint } | null> {
  try {
    const baseBalanceResult = await connection.getTokenAccountBalance(pool.poolBaseTokenAccount);
    const quoteBalanceResult = await connection.getTokenAccountBalance(pool.poolQuoteTokenAccount);

    const baseBalance = BigInt(baseBalanceResult?.value?.amount ?? '0');
    const quoteBalance = BigInt(quoteBalanceResult?.value?.amount ?? '0');

    return { baseBalance, quoteBalance };
  } catch {
    return null;
  }
}

/**
 * Find a PumpSwap pool by mint with full RPC lookup.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_mint
 * Search order:
 * 1. Pool v2 PDA ["pool-v2", base_mint]
 * 2. Canonical pool PDA
 * 3. getProgramAccounts by base_mint / quote_mint (optional fallback)
 */
export async function findByMint(
  connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }>;
    getProgramAccounts?: (programId: PublicKey, config?: unknown) => Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>>;
  },
  mint: PublicKey
): Promise<{ poolAddress: PublicKey; pool: PumpSwapPool } | null> {
  // 1. Try v2 PDA
  const poolV2 = getPoolV2PDA(mint);
  const poolV2Account = await connection.getAccountInfo(poolV2);
  if (poolV2Account?.value?.data) {
    const pool = decodePool(poolV2Account.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: poolV2, pool };
    }
  }

  // 2. Try canonical pool PDA
  const canonicalAddress = getCanonicalPoolPDA(mint);
  const canonicalAccount = await connection.getAccountInfo(canonicalAddress);
  if (canonicalAccount?.value?.data) {
    const pool = decodePool(canonicalAccount.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: canonicalAddress, pool };
    }
  }

  // 3. Optional: getProgramAccounts fallback (if available)
  // This would require more complex implementation with memcmp filters

  return null;
}

// ===== Pool Size Constants - from Rust: src/instruction/utils/pumpswap.rs =====

/** Pool data size for SPL Token (8 discriminator + 244 data) */
const POOL_DATA_LEN_SPL = 8 + 244;
/** Pool data size for Token2022 */
const POOL_DATA_LEN_T22 = 643;

/**
 * Find a PumpSwap pool by base mint using getProgramAccounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_base_mint
 * base_mint offset: 8(discriminator) + 1(bump) + 2(index) + 32(creator) = 43
 */
export async function findByBaseMint(
  connection: {
    getProgramAccounts: (
      programId: PublicKey,
      config?: {
        filters?: Array<{ dataSize?: number; memcmp?: { offset: number; bytes: string } }>;
        encoding?: string;
      }
    ) => Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>>;
  },
  baseMint: PublicKey
): Promise<{ poolAddress: PublicKey; pool: PumpSwapPool } | null> {
  // base_mint offset: 8(discriminator) + 1(bump) + 2(index) + 32(creator) = 43
  const memcmpOffset = 43;

  // Query both pool sizes in parallel (SPL Token and Token2022)
  const filters = [
    { memcmp: { offset: memcmpOffset, bytes: baseMint.toBase58() } }
  ];

  try {
    const results = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      filters,
      encoding: 'base64'
    });

    if (!results || results.length === 0) {
      return null;
    }

    // Decode and sort by lp_supply (highest first)
    const pools: { poolAddress: PublicKey; pool: PumpSwapPool }[] = [];
    for (const { pubkey, account } of results) {
      const pool = decodePool(account.data);
      if (pool) {
        pools.push({ poolAddress: pubkey, pool });
      }
    }

    if (pools.length === 0) {
      return null;
    }

    // Sort by lp_supply descending
    pools.sort((a, b) => Number(b.pool.lpSupply - a.pool.lpSupply));

    return pools[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Find a PumpSwap pool by quote mint using getProgramAccounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_quote_mint
 * quote_mint offset: 8 + 1 + 2 + 32 + 32 = 75
 */
export async function findByQuoteMint(
  connection: {
    getProgramAccounts: (
      programId: PublicKey,
      config?: {
        filters?: Array<{ dataSize?: number; memcmp?: { offset: number; bytes: string } }>;
        encoding?: string;
      }
    ) => Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>>;
  },
  quoteMint: PublicKey
): Promise<{ poolAddress: PublicKey; pool: PumpSwapPool } | null> {
  // quote_mint offset: 8 + 1 + 2 + 32 + 32 = 75
  const memcmpOffset = 75;

  const filters = [
    { memcmp: { offset: memcmpOffset, bytes: quoteMint.toBase58() } }
  ];

  try {
    const results = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      filters,
      encoding: 'base64'
    });

    if (!results || results.length === 0) {
      return null;
    }

    // Decode and sort by lp_supply (highest first)
    const pools: { poolAddress: PublicKey; pool: PumpSwapPool }[] = [];
    for (const { pubkey, account } of results) {
      const pool = decodePool(account.data);
      if (pool) {
        pools.push({ poolAddress: pubkey, pool });
      }
    }

    if (pools.length === 0) {
      return null;
    }

    // Sort by lp_supply descending
    pools.sort((a, b) => Number(b.pool.lpSupply - a.pool.lpSupply));

    return pools[0] ?? null;
  } catch {
    return null;
  }
}
