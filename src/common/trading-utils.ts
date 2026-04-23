/**
 * Trading Utilities - 100% port from Rust: src/trading/common/utils.rs
 * 
 * Provides async RPC utilities for:
 * - Getting token balances
 * - Getting SOL balance
 * - Transferring SOL
 * - Closing token accounts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
  type Commitment,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TOKEN_PROGRAM, WSOL_TOKEN_ACCOUNT } from '../constants';
import { TokenInstructionBuilder, TokenUtil } from './spl-token';
import { getAssociatedTokenAddressFast } from './wsol-manager';

// ===== Token Balance Functions =====

/**
 * Get multiple token balances from vault accounts
 * 100% from Rust: src/trading/common/utils.rs get_multi_token_balances
 */
export async function getMultiTokenBalances(
  connection: Connection,
  token0Vault: PublicKey,
  token1Vault: PublicKey
): Promise<[bigint, bigint]> {
  const [balance0, balance1] = await Promise.all([
    connection.getTokenAccountBalance(token0Vault),
    connection.getTokenAccountBalance(token1Vault),
  ]);
  
  const token0Amount = BigInt(balance0.value.amount);
  const token1Amount = BigInt(balance1.value.amount);
  
  return [token0Amount, token1Amount];
}

/**
 * Get token balance for a user's token account
 * 100% from Rust: src/trading/common/utils.rs get_token_balance
 */
export async function getTokenBalance(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): Promise<bigint> {
  return getTokenBalanceWithOptions(connection, payer, mint, tokenProgram, false);
}

/**
 * Get token balance with options
 * 100% from Rust: src/trading/common/utils.rs get_token_balance_with_options
 */
export async function getTokenBalanceWithOptions(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
  useSeed: boolean
): Promise<bigint> {
  let ata: PublicKey;
  
  if (useSeed) {
    // Use seed-based ATA derivation
    const { getAssociatedTokenAddressUseSeed } = await import('./wsol-manager');
    ata = getAssociatedTokenAddressUseSeed(payer, mint, tokenProgram);
  } else {
    ata = getAssociatedTokenAddressFast(payer, mint, tokenProgram);
  }
  
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return BigInt(balance.value.amount);
  } catch (error) {
    // Account doesn't exist or has no balance
    return BigInt(0);
  }
}

// ===== SOL Balance Functions =====

/**
 * Get SOL balance for an account
 * 100% from Rust: src/trading/common/utils.rs get_sol_balance
 */
export async function getSolBalance(
  connection: Connection,
  account: PublicKey
): Promise<bigint> {
  const balance = await connection.getBalance(account);
  return BigInt(balance);
}

// ===== Transfer Functions =====

/**
 * Transfer SOL from one account to another
 * 100% from Rust: src/trading/common/utils.rs transfer_sol
 */
export async function transferSol(
  connection: Connection,
  payer: Keypair,
  receiveWallet: PublicKey,
  amount: bigint,
  commitment: Commitment = 'confirmed'
): Promise<string> {
  if (amount === BigInt(0)) {
    throw new Error('transfer_sol: Amount cannot be zero');
  }
  
  // Check balance
  const balance = await getSolBalance(connection, payer.publicKey);
  if (balance < amount) {
    throw new Error('Insufficient balance');
  }
  
  // Build transfer instruction
  const transferInstruction = {
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: receiveWallet, isSigner: false, isWritable: true },
    ],
    programId: new PublicKey('11111111111111111111111111111111'),
    data: Buffer.from([2, ...Array.from({ length: 8 }, (_, i) => 
      Number((amount >> BigInt(i * 8)) & BigInt(0xff))
    )]),
  };
  
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(commitment);
  
  const transaction = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: payer.publicKey,
  });
  transaction.add(transferInstruction);
  transaction.sign(payer);
  
  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    commitment
  );
  
  return signature;
}

// ===== Close Token Account Functions =====

/**
 * Close token account and reclaim rent
 * 100% from Rust: src/trading/common/utils.rs close_token_account
 */
export async function closeTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  commitment: Commitment = 'confirmed'
): Promise<string> {
  // Get associated token account address
  const ata = getAssociatedTokenAddressFast(payer.publicKey, mint, TOKEN_PROGRAM);
  
  // Check if account exists
  try {
    await connection.getAccountInfo(ata);
  } catch {
    // Account doesn't exist, return success
    return '';
  }
  
  // Build close account instruction
  const closeAccountIx = TokenInstructionBuilder.closeAccount(
    ata,
    payer.publicKey,
    payer.publicKey,
    [],
    TOKEN_PROGRAM
  );
  
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(commitment);
  
  const transaction = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: payer.publicKey,
  });
  transaction.add(closeAccountIx);
  transaction.sign(payer);
  
  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    commitment
  );
  
  return signature;
}

// ===== Utility Functions =====

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

/**
 * Check if a mint is WSOL
 */
export function isWsolMint(mint: PublicKey): boolean {
  return mint.equals(WSOL_TOKEN_ACCOUNT);
}
