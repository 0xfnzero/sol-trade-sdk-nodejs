/**
 * Seed-based PDA Derivation for Sol Trade SDK
 * High-performance PDA computation with caching.
 */

import { LRUCache } from '../cache/cache';

// ===== Constants =====

// Program IDs - MUST match src/constants/index.ts
// These are the official Solana mainnet program IDs
export const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKopJFfWcCzNfXt3D';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRdGP4LmVn7LKwEqT7dPWn1oLKs';
export const RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
export const RAYDIUM_CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTUBBfMTm5L2AhwDtLd6P4VeXvgQA2Po';
export const METEORA_DAMM_V2_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YvKpNLuh';
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

// ===== Helper Functions =====

function concatBuffers(...buffers: Buffer[]): Buffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = Buffer.alloc(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    buf.copy(result, offset);
    offset += buf.length;
  }
  return result;
}

async function sha256(data: Buffer): Promise<Buffer> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer);
}

// ===== Base58 =====

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(buffer: Buffer): string {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

export function base58Decode(str: string): Buffer {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const carry = BASE58_ALPHABET.indexOf(str[i]);
    if (carry === -1) {
      throw new Error('Invalid base58 character');
    }
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    leadingZeros++;
  }
  return Buffer.concat([
    Buffer.alloc(leadingZeros, 0),
    Buffer.from(bytes.reverse()),
  ]);
}

// ===== PDA Derivation =====

/**
 * Find a program-derived address.
 */
export async function findProgramAddress(
  seeds: Buffer[],
  programId: string
): Promise<PDA> {
  // Check cache
  const cacheKey = `${programId}:${seeds.map(s => s.toString('hex')).join(':')}`;
  const cached = pdaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const programBytes = base58Decode(programId);

  for (let bump = 255; bump > 0; bump--) {
    try {
      const address = await createProgramAddress(
        [...seeds, Buffer.from([bump])],
        programId
      );

      const pda: PDA = { pubkey: address, bump };
      pdaCache.set(cacheKey, pda);
      return pda;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to find valid PDA');
}

/**
 * Create a program-derived address without bump.
 */
export async function createProgramAddress(
  seeds: Buffer[],
  programId: string
): Promise<Buffer> {
  const programBytes = base58Decode(programId);
  const data = concatBuffers(...seeds, programBytes);
  const hash = await sha256(data);

  // Check if on ed25519 curve (simplified check)
  // In production, use proper ed25519 check
  if (hash[31] & 0x80) {
    throw new Error('Invalid seeds: address on curve');
  }

  return hash;
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

export async function getFeeRecipientPDA(isMayhemMode: boolean = false): Promise<PDA> {
  const seed = isMayhemMode ? 'fee_recipient_mayhem' : 'fee_recipient';
  return findProgramAddress(
    [Buffer.from(seed)],
    PUMPFUN_PROGRAM_ID
  );
}

export async function getEventAuthorityPDA(): Promise<PDA> {
  return findProgramAddress(
    [Buffer.from('event')],
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

export async function getPumpSwapPoolPDA(baseMint: string, quoteMint: string): Promise<PDA> {
  const baseBytes = base58Decode(baseMint);
  const quoteBytes = base58Decode(quoteMint);
  return findProgramAddress(
    [Buffer.from('pool'), baseBytes, quoteBytes],
    PUMPSWAP_PROGRAM_ID
  );
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

export async function getMeteoraPoolPDA(tokenAMint: string, tokenBMint: string): Promise<PDA> {
  const aBytes = base58Decode(tokenAMint);
  const bBytes = base58Decode(tokenBMint);
  return findProgramAddress(
    [Buffer.from('pool'), aBytes, bBytes],
    METEORA_DAMM_V2_PROGRAM_ID
  );
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
