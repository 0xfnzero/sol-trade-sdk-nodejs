/**
 * Instruction builders for Sol Trade SDK
 */

import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  ASSOCIATED_TOKEN_PROGRAM,
  PUMPFUN_PROGRAM,
  PUMPSWAP_PROGRAM,
  PUMPFUN_DISCRIMINATORS,
  PUMPSWAP_DISCRIMINATORS,
  FEE_RECIPIENT,
  MAYHEM_FEE_RECIPIENTS,
} from '../constants';
import { randomBytes } from 'crypto';

/**
 * Find Program Address helper
 */
export function findProgramAddress(
  seeds: (Buffer | Uint8Array)[],
  programId: PublicKey
): [PublicKey, number] {
  const seedBuffers = seeds.map((s) => Buffer.from(s));
  return PublicKey.findProgramAddressSync(seedBuffers, programId);
}

/**
 * Get bonding curve PDA for PumpFun
 */
export function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get bonding curve V2 PDA for PumpFun
 */
export function getBondingCurveV2PDA(mint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('bonding-curve-v2'), mint.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get user volume accumulator PDA
 */
export function getUserVolumeAccumulatorPDA(user: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('user-volume-accumulator'), user.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get creator vault PDA
 */
export function getCreatorVaultPDA(creator: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get global account PDA
 */
export function getGlobalAccountPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('global')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get event authority PDA
 */
export function getEventAuthorityPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('__event_authority')],
    PUMPFUN_PROGRAM
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
  const [ata] = findProgramAddress(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return ata;
}

/**
 * Get fee recipient based on mayhem mode
 * Uses cryptographically secure random selection
 */
export function getFeeRecipient(isMayhemMode: boolean): PublicKey {
  if (isMayhemMode) {
    // Use cryptographically secure randomness instead of Math.random()
    const randomIndex = randomBytes(1)[0] % MAYHEM_FEE_RECIPIENTS.length;
    return MAYHEM_FEE_RECIPIENTS[randomIndex];
  }
  return FEE_RECIPIENT;
}

/**
 * Create associated token account instruction
 */
export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): TransactionInstruction {
  const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM,
    data: Buffer.alloc(0),
  });
}

/**
 * Build PumpFun buy instruction
 */
export function buildPumpFunBuyInstruction(params: {
  payer: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  userTokenAccount: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  amountIn: number;
  minTokensOut: number;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  useExactSolIn: boolean;
}): TransactionInstruction {
  const {
    payer,
    mint,
    bondingCurve,
    associatedBondingCurve,
    userTokenAccount,
    creatorVault,
    tokenProgram,
    amountIn,
    minTokensOut,
    isMayhemMode,
    isCashbackCoin,
    useExactSolIn,
  } = params;

  const globalAccount = getGlobalAccountPDA();
  const eventAuthority = getEventAuthorityPDA();
  const bondingCurveV2 = getBondingCurveV2PDA(mint);
  const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
  const feeRecipient = getFeeRecipient(isMayhemMode);

  // Build instruction data
  let data: Buffer;
  if (useExactSolIn) {
    // buy_exact_sol_in discriminator + spendable_sol_in (u64) + min_tokens_out (u64) + track_volume (2 bytes)
    data = Buffer.alloc(26);
    PUMPFUN_DISCRIMINATORS.BUY_EXACT_SOL_IN.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amountIn), 8);
    data.writeBigUInt64LE(BigInt(minTokensOut), 16);
    // track_volume: Some(true) if cashback coin
    data[24] = 1; // Option: Some
    data[25] = isCashbackCoin ? 1 : 0;
  } else {
    // buy discriminator + token_amount (u64) + max_sol_cost (u64) + track_volume (2 bytes)
    data = Buffer.alloc(26);
    PUMPFUN_DISCRIMINATORS.BUY.copy(data, 0);
    // Token amount would be calculated from SOL input
    data.writeBigUInt64LE(BigInt(0), 8); // placeholder
    data.writeBigUInt64LE(BigInt(amountIn), 16);
    data[24] = 1;
    data[25] = isCashbackCoin ? 1 : 0;
  }

  const keys = [
    { pubkey: globalAccount, isSigner: false, isWritable: false },
    { pubkey: feeRecipient, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: getGlobalVolumeAccumulatorPDA(), isSigner: false, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: getFeeConfigPDA(), isSigner: false, isWritable: false },
    { pubkey: getFeeProgramPDA(), isSigner: false, isWritable: false },
    { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PUMPFUN_PROGRAM,
    data,
  });
}

/**
 * Build PumpFun sell instruction
 */
export function buildPumpFunSellInstruction(params: {
  payer: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  userTokenAccount: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  tokenAmount: number;
  minSolOutput: number;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}): TransactionInstruction {
  const {
    payer,
    mint,
    bondingCurve,
    associatedBondingCurve,
    userTokenAccount,
    creatorVault,
    tokenProgram,
    tokenAmount,
    minSolOutput,
    isMayhemMode,
    isCashbackCoin,
  } = params;

  const globalAccount = getGlobalAccountPDA();
  const eventAuthority = getEventAuthorityPDA();
  const bondingCurveV2 = getBondingCurveV2PDA(mint);
  const feeRecipient = getFeeRecipient(isMayhemMode);

  // Build instruction data
  const data = Buffer.alloc(24);
  PUMPFUN_DISCRIMINATORS.SELL.copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmount), 8);
  data.writeBigUInt64LE(BigInt(minSolOutput), 16);

  const keys = [
    { pubkey: globalAccount, isSigner: false, isWritable: false },
    { pubkey: feeRecipient, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: getFeeConfigPDA(), isSigner: false, isWritable: false },
    { pubkey: getFeeProgramPDA(), isSigner: false, isWritable: false },
  ];

  // Add user volume accumulator for cashback coins
  if (isCashbackCoin) {
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    keys.push({ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true });
  }

  // Add bonding curve v2
  keys.push({ pubkey: bondingCurveV2, isSigner: false, isWritable: false });

  return new TransactionInstruction({
    keys,
    programId: PUMPFUN_PROGRAM,
    data,
  });
}

// Helper PDAs
function getGlobalVolumeAccumulatorPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('global-volume-accumulator')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

function getFeeConfigPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('fee-config')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

function getFeeProgramPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('fee-program')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get pool PDA for PumpSwap
 */
export function getPoolPDA(baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('pool'), baseMint.toBuffer(), quoteMint.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
