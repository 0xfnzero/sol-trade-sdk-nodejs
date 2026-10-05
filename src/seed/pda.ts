/**
 * Seed-based PDA Derivation for Sol Trade SDK
 * High-performance PDA computation with caching.
 */

import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import { LRUCache } from '../cache/cache';

// ===== Constants =====

// Program IDs - MUST match src/constants/index.ts
// These are the official Solana mainnet program IDs
export const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
export const RAYDIUM_CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
export const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// ===== Types =====

export interface PDA {
  pubkey: Buffer;
  bump: number;
}

// ===== PDA Cache =====

const pdaCache = new LRUCache<string, PDA>(1000, 60000);

// ===== Base58 / Solana PDA derivation =====
export function base58Encode(buffer: Buffer): string { return bs58.encode(buffer); }
export function base58Decode(value: string): Buffer { return Buffer.from(bs58.decode(value)); }
export async function findProgramAddress(seeds: Buffer[], programId: string): Promise<PDA> {
  const program = new PublicKey(programId);
  const key = `${program.toBase58()}:${seeds.map(s => s.toString('hex')).join(':')}`;
  const cached = pdaCache.get(key);
  if (cached) return {pubkey: Buffer.from(cached.pubkey), bump: cached.bump};
  const [pubkey, bump] = PublicKey.findProgramAddressSync(seeds, program);
  pdaCache.set(key, {pubkey: Buffer.from(pubkey.toBuffer()), bump});
  return {pubkey: pubkey.toBuffer(), bump};
}
export async function createProgramAddress(seeds: Buffer[], programId: string): Promise<Buffer> {
  return PublicKey.createProgramAddressSync(seeds, new PublicKey(programId)).toBuffer();
}

// ===== PumpFun PDAs =====

export async function getBondingCurvePDA(mint: string): Promise<PDA> {
  const mintBytes = base58Decode(mint);
  return findProgramAddress(
    [Buffer.from('bonding-curve'), mintBytes],
    PUMPFUN_PROGRAM_ID
  );
}

export async function getGlobalAccountPDA(): Promise<PDA> {
  return findProgramAddress(
    [Buffer.from('global')],
    PUMPFUN_PROGRAM_ID
  );
}

/** Retained only to reject the old invented fee-recipient PDA. Use current Global config. */
export async function getFeeRecipientPDA(_isMayhemMode = false): Promise<PDA> {
  throw new Error('PumpFun fee recipient is a configured address, not a PDA; read current Global config');
}

export async function getEventAuthorityPDA(): Promise<PDA> {
  return findProgramAddress(
    [Buffer.from('__event_authority')],
    PUMPFUN_PROGRAM_ID
  );
}

export async function getUserVolumeAccumulatorPDA(user: string): Promise<PDA> {
  const userBytes = base58Decode(user);
  return findProgramAddress(
    [Buffer.from('user_volume_accumulator'), userBytes],
    PUMPFUN_PROGRAM_ID
  );
}

// ===== PumpSwap PDAs =====

export async function getPumpSwapPoolPDA(baseMint: string, quoteMint: string, index: number, creator: string): Promise<PDA> {
  if (!Number.isInteger(index) || index < 0 || index > 65535 || !creator) throw new Error('PumpSwap pool requires u16 index and creator');
  const bytes = Buffer.alloc(2); bytes.writeUInt16LE(index);
  return findProgramAddress([Buffer.from('pool'),bytes,new PublicKey(creator).toBuffer(),new PublicKey(baseMint).toBuffer(),new PublicKey(quoteMint).toBuffer()],PUMPSWAP_PROGRAM_ID);
}

// ===== Raydium PDAs =====

export async function getRaydiumAmmAuthorityPDA(): Promise<PDA> {
  return findProgramAddress(
    [Buffer.from('amm authority')],
    RAYDIUM_AMM_V4_PROGRAM_ID
  );
}

export async function getRaydiumCpmmPoolPDA(
  ammConfig: string,
  baseMint: string,
  quoteMint: string
): Promise<PDA> {
  const ammBytes = base58Decode(ammConfig);
  const baseBytes = base58Decode(baseMint);
  const quoteBytes = base58Decode(quoteMint);
  return findProgramAddress(
    [Buffer.from('pool'), ammBytes, baseBytes, quoteBytes],
    RAYDIUM_CPMM_PROGRAM_ID
  );
}

// ===== Meteora PDAs =====

/** A token pair alone cannot identify a DAMM v2 pool/configuration. */
export async function getMeteoraPoolPDA(_tokenAMint: string, _tokenBMint: string): Promise<PDA> {
  throw new Error('DAMM v2 pool cannot be derived from two mints alone; provide the observed pool address');
}

// ===== Associated Token Account =====

export async function getAssociatedTokenAddress(
  wallet: string,
  mint: string,
  tokenProgram: string = TOKEN_PROGRAM_ID
): Promise<Buffer> {
  const walletBytes = base58Decode(wallet);
  const mintBytes = base58Decode(mint);
  const programBytes = base58Decode(tokenProgram);

  const pda = await findProgramAddress(
    [walletBytes, programBytes, mintBytes],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return pda.pubkey;
}
