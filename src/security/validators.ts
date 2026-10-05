/**
 * Input validators for Sol Trade SDK
 *
 * Provides secure input validation for:
 * - RPC URLs
 * - Program IDs
 * - Amounts
 * - Slippage values
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Known legitimate Solana program IDs
 */
export const KNOWN_PROGRAM_IDS: Record<string, string[]> = {
  // PumpFun
  pumpfun: ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'],
  // PumpSwap
  pumpswap: ['pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'],
  // Raydium
  raydium: [
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // CLMM
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // AMM V4
  ],
  // Meteora
  meteora: ['cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'], // DAMM V2
  // Bonk
  bonk: ['LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'],
  // System programs
  system: [
    '11111111111111111111111111111111', // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token
  ],
};

// Base58 character set
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_REGEX = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

// Private IP patterns
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^localhost$/i,
];

/**
 * Validate RPC URL format and security.
 */
export function validateRpcUrl(url: string, allowHttp: boolean = false): string {
  if (!url) {
    throw new ValidationError('RPC URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(`Invalid URL format: ${url}`);
  }

  // Check scheme
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new ValidationError(`Invalid URL scheme: ${parsed.protocol}. Must be http or https`);
  }

  if (parsed.protocol === 'http:' && !allowHttp) {
    throw new ValidationError(
      'HTTP RPC URLs are insecure. Use HTTPS or set allowHttp=true if you understand the risks'
    );
  }

  // Check hostname
  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and private IPs in production
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new ValidationError(
        `Private IP/localhost RPC URLs are not allowed for security: ${hostname}`
      );
    }
  }

  // Check port
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    if (port < 1 || port > 65535) {
      throw new ValidationError(`Invalid port number: ${port}`);
    }
  }

  // Reconstruct clean URL
  let cleanUrl = `${parsed.protocol}//${parsed.hostname}`;
  if (parsed.port) {
    cleanUrl += `:${parsed.port}`;
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    cleanUrl += parsed.pathname;
  }

  return cleanUrl;
}

/**
 * Validate a Solana program ID.
 */
export function validateProgramId(programId: string, expectedProgram?: string): string {
  if (!programId) {
    throw new ValidationError('Program ID cannot be empty');
  }

  // Check base58 format
  if (!BASE58_REGEX.test(programId)) {
    throw new ValidationError(`Invalid base58 characters in program ID: ${programId}`);
  }

  // Check length
  if (programId.length < 32 || programId.length > 48) {
    throw new ValidationError(`Invalid program ID length: ${programId.length} (expected 32-48)`);
  }

  // Verify against known program IDs if expected
  if (expectedProgram) {
    const expectedIds = KNOWN_PROGRAM_IDS[expectedProgram.toLowerCase()];
    if (expectedIds && !expectedIds.includes(programId)) {
      throw new ValidationError(
        `Program ID ${programId} does not match known ${expectedProgram} program IDs. ` +
          `Expected one of: ${expectedIds.slice(0, 3).join(', ')}`
      );
    }
  }

  return programId;
}

/**
 * Validate an amount value.
 */
export function validateAmount(
  amount: number | bigint,
  name: string = 'amount',
  allowZero: boolean = false
): bigint {
  const bigAmount = typeof amount === 'bigint' ? amount : BigInt(amount);

  if (bigAmount < BigInt(0)) {
    throw new ValidationError(`${name} cannot be negative: ${amount}`);
  }

  if (bigAmount === BigInt(0) && !allowZero) {
    throw new ValidationError(`${name} cannot be zero`);
  }

  // Check for reasonable upper bound
  const maxSafe = BigInt('9223372036854775807'); // Max i64
  if (bigAmount > maxSafe) {
    throw new ValidationError(`${name} exceeds maximum safe value: ${amount} > ${maxSafe}`);
  }

  return bigAmount;
}

/**
 * Validate slippage in basis points.
 */
export function validateSlippage(slippageBasisPoints: number): number {
  if (!Number.isInteger(slippageBasisPoints)) {
    throw new ValidationError(`Slippage must be an integer, got ${typeof slippageBasisPoints}`);
  }

  if (slippageBasisPoints < 0) {
    throw new ValidationError(`Slippage cannot be negative: ${slippageBasisPoints}`);
  }

  if (slippageBasisPoints >= 10000) {
    throw new ValidationError(
      `Slippage must be less than 10000 basis points (100%), got ${slippageBasisPoints}`
    );
  }

  // Warn on high slippage
  if (slippageBasisPoints > 1000) {
    console.warn(
      `High slippage detected: ${slippageBasisPoints} bp (${slippageBasisPoints / 100}%). ` +
        'This may result in significant price impact.'
    );
  }

  return slippageBasisPoints;
}

/**
 * Validate a Solana public key.
 */
export function validatePubkey(pubkey: string | PublicKey, name: string = 'pubkey'): PublicKey {
  if (!pubkey) {
    throw new ValidationError(`${name} cannot be empty`);
  }

  const pubkeyStr = typeof pubkey === 'string' ? pubkey : pubkey.toBase58();

  // Check base58 format
  if (!BASE58_REGEX.test(pubkeyStr)) {
    throw new ValidationError(`Invalid base58 characters in ${name}: ${pubkeyStr}`);
  }

  // Check length
  if (pubkeyStr.length < 32 || pubkeyStr.length > 48) {
    throw new ValidationError(`Invalid ${name} length: ${pubkeyStr.length} (expected 32-48)`);
  }

  try {
    return new PublicKey(pubkeyStr);
  } catch (error) {
    throw new ValidationError(`Invalid ${name}: ${pubkeyStr} - ${error}`);
  }
}

/**
 * Validate a trading pair.
 */
export function validateMintPair(inputMint: string, outputMint: string): void {
  validatePubkey(inputMint, 'input_mint');
  validatePubkey(outputMint, 'output_mint');

  if (inputMint === outputMint) {
    throw new ValidationError('Input and output mint cannot be the same');
  }
}

/**
 * Validate transaction size.
 */
export function validateTransactionSize(transactionBytes: Buffer | Uint8Array, maxSize: number = 1232): void {
  if (!(transactionBytes instanceof Buffer) && !(transactionBytes instanceof Uint8Array)) {
    throw new ValidationError(`Transaction must be bytes, got ${typeof transactionBytes}`);
  }

  if (transactionBytes.length > maxSize) {
    throw new ValidationError(
      `Transaction size ${transactionBytes.length} exceeds maximum ${maxSize} bytes`
    );
  }
}

/**
 * Validate a signature string.
 */
export function validateSignature(signature: string): string {
  if (!signature) {
    throw new ValidationError('Signature cannot be empty');
  }

  // Signatures are 64 bytes = ~88 base58 chars
  if (!BASE58_REGEX.test(signature)) {
    throw new ValidationError(`Invalid base58 characters in signature: ${signature}`);
  }

  if (signature.length < 80 || signature.length > 96) {
    throw new ValidationError(`Invalid signature length: ${signature.length}`);
  }

  return signature;
}
