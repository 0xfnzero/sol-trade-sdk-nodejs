/**
 * Constants for Sol Trade SDK
 */

import { PublicKey } from '@solana/web3.js';

// System programs
export const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

// Token programs
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_PROGRAM_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// Token mints
export const SOL_TOKEN_ACCOUNT = new PublicKey('So11111111111111111111111111111111111111111');
export const WSOL_TOKEN_ACCOUNT = new PublicKey('So11111111111111111111111111111111111111112');
export const USD1_TOKEN_ACCOUNT = new PublicKey('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB');
export const USDC_TOKEN_ACCOUNT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Associated token program
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Rent sysvar
export const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

// DEX Programs — aligned with sol-trade-sdk Rust (mainnet)
export const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
/** PumpSwap AMM program (same as `instruction/pumpswap` PUMPSWAP_PROGRAM) */
export const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
export const BONK_PROGRAM = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
export const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
export const RAYDIUM_AMM_V4_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
export const METEORA_DAMM_V2_PROGRAM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');

// Fee recipients (generic SDK defaults)
export const SDK_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4Cs9tM');

export const SDK_MAYHEM_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey('7VtWHe8WJeU9Sy5j1XF5n8qPzDtJjWxMgYVtJ89AQrVj'),
  new PublicKey('82jN8eGgPvMSW1KP9W6GdW4bQ3YbB7sGgC6BhZnLVQvR'),
];

// Instruction discriminators — aligned with `instruction/pumpfun_builder` / Rust
export const PUMPFUN_DISCRIMINATORS = {
  BUY: Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]),
  SELL: Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]),
  BUY_EXACT_SOL_IN: Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]),
  CLAIM_CASHBACK: Buffer.from([37, 58, 35, 126, 190, 53, 228, 197]),
};

export const PUMPSWAP_DISCRIMINATORS = {
  SWAP: Buffer.from([43, 4, 237, 11, 26, 201, 30, 98]),
  DEPOSIT: Buffer.from([242, 35, 198, 137, 82, 225, 242, 178]),
  WITHDRAW: Buffer.from([183, 18, 178, 128, 70, 157, 46, 34]),
};

// Default values
export const DEFAULT_SLIPPAGE = 500; // 5%
export const DEFAULT_COMPUTE_UNITS = 200000;
export const DEFAULT_PRIORITY_FEE = 100000;
export const DEFAULT_TIP_LAMPORTS = 100000;

/** Aggregate for consumers expecting a single `CONSTANTS` object (matches historical `index` export). */
export const CONSTANTS = {
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  SOL_TOKEN_ACCOUNT,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT,
  ASSOCIATED_TOKEN_PROGRAM,
  RENT,
  PUMPFUN_PROGRAM,
  PUMPSWAP_PROGRAM: PUMPSWAP_PROGRAM_ID,
  BONK_PROGRAM,
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_AMM_V4_PROGRAM,
  METEORA_DAMM_V2_PROGRAM,
  DEFAULT_SLIPPAGE,
  DEFAULT_COMPUTE_UNITS,
  DEFAULT_PRIORITY_FEE,
  DEFAULT_TIP_LAMPORTS,
} as const;

// SWQOS endpoints
export const SWQOS_ENDPOINTS: Record<string, Record<string, string>> = {
  Jito: {
    Frankfurt: 'frankfurt.mainnet.block-engine.jito.wtf',
    NewYork: 'amsterdam.mainnet.block-engine.jito.wtf',
    Amsterdam: 'amsterdam.mainnet.block-engine.jito.wtf',
    Tokyo: 'tokyo.mainnet.block-engine.jito.wtf',
    Singapore: 'singapore.mainnet.block-engine.jito.wtf',
  },
  // Add more SWQOS endpoints as needed
};
