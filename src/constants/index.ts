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

// DEX Programs
export const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKopJFfWcCzNfXt3D');
export const PUMPSWAP_PROGRAM = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwq52pCSbAhL');
export const BONK_PROGRAM = new PublicKey('bonk2zCzQaobPKMKsM5Rut46yHp3zQD1ntUk8Ld8ARq');
export const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTUBBfMTm5L2AhwDtLd6P4VeXvgQA2Po');
export const RAYDIUM_AMM_V4_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
export const METEORA_DAMM_V2_PROGRAM = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YvKpNLuh');

// Fee recipients
export const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4Cs9tM');

export const MAYHEM_FEE_RECIPIENTS: PublicKey[] = [
  new PublicKey('7VtWHe8WJeU9Sy5j1XF5n8qPzDtJjWxMgYVtJ89AQrVj'),
  new PublicKey('82jN8eGgPvMSW1KP9W6GdW4bQ3YbB7sGgC6BhZnLVQvR'),
];

// Instruction discriminators
export const PUMPFUN_DISCRIMINATORS = {
  BUY: Buffer.from([102, 6, 141, 196, 242, 95, 28, 167]),
  SELL: Buffer.from([187, 75, 56, 100, 133, 176, 22, 141]),
  BUY_EXACT_SOL_IN: Buffer.from([133, 104, 247, 38, 153, 106, 73, 253]),
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
