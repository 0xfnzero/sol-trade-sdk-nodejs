/**
 * Raydium AMM V4 Protocol Instruction Builder
 *
 * Production-grade instruction builder for Raydium AMM V4 protocol.
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
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "@solana/spl-token";

// ============================================
// Program IDs and Constants
// ============================================

const SOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111111");

/** Raydium AMM V4 program ID */
export const RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

/** Authority */
export const RAYDIUM_AMM_V4_AUTHORITY = new PublicKey(
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
);

/** Fee rates */
export const RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR = BigInt(25);
export const RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR = BigInt(10000);
export const RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR = BigInt(25);
export const RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR = BigInt(10000);

// ============================================
// Discriminators
// ============================================

/** Swap base in instruction discriminator (single byte) */
export const RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR: Buffer = Buffer.from([9]);

/** Swap base out instruction discriminator (single byte) */
export const RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR: Buffer = Buffer.from([11]);

// ============================================
// Seeds
// ============================================

export const RAYDIUM_AMM_V4_POOL_SEED = Buffer.from("pool");

// ============================================
// Helper Functions
// ============================================

/**
 * Compute swap amount for AMM V4
 */
export function computeRaydiumAmmV4SwapAmount(
  coinReserve: bigint,
  pcReserve: bigint,
  isCoinIn: boolean,
  amountIn: bigint,
  slippageBasisPoints: bigint
): { amountOut: bigint; minAmountOut: bigint } {
  // Apply trade fee (0.25%)
  const amountInAfterFee = amountIn - (amountIn * RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR) / RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR;

  // Calculate output using constant product formula
  let amountOut: bigint;
  if (isCoinIn) {
    // Selling coin for pc: output = (pcReserve * amountIn) / (coinReserve + amountIn)
    const denominator = coinReserve + amountInAfterFee;
    amountOut = (pcReserve * amountInAfterFee) / denominator;
  } else {
    // Selling pc for coin: output = (coinReserve * amountIn) / (pcReserve + amountIn)
    const denominator = pcReserve + amountInAfterFee;
    amountOut = (coinReserve * amountInAfterFee) / denominator;
  }

  // Apply slippage
  const minAmountOut = amountOut - (amountOut * slippageBasisPoints) / BigInt(10000);

  return { amountOut, minAmountOut };
}

// ============================================
// Types
// ============================================

export interface RaydiumAmmV4Params {
  amm: PublicKey;
  coinMint: PublicKey;
  pcMint: PublicKey;
  tokenCoin: PublicKey;
  tokenPc: PublicKey;
  ammOpenOrders: PublicKey;
  ammTargetOrders: PublicKey;
  serumProgram: PublicKey;
  serumMarket: PublicKey;
  serumBids: PublicKey;
  serumAsks: PublicKey;
  serumEventQueue: PublicKey;
  serumCoinVaultAccount: PublicKey;
  serumPcVaultAccount: PublicKey;
  serumVaultSigner: PublicKey;
  coinReserve: bigint;
  pcReserve: bigint;
}

export interface BuildRaydiumAmmV4BuyInstructionsParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: RaydiumAmmV4Params;
}

export interface BuildRaydiumAmmV4SellInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  outputMint?: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  fixedOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: RaydiumAmmV4Params;
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
      `${label} must match the Raydium AMM v4 pool side (${expected.toBase58()}), got ${requested.toBase58()}`
    );
  }
}

function ensureMarketAccounts(params: RaydiumAmmV4Params): void {
  const required: Array<[string, PublicKey]> = [
    ['ammOpenOrders', params.ammOpenOrders],
    ['ammTargetOrders', params.ammTargetOrders],
    ['serumProgram', params.serumProgram],
    ['serumMarket', params.serumMarket],
    ['serumBids', params.serumBids],
    ['serumAsks', params.serumAsks],
    ['serumEventQueue', params.serumEventQueue],
    ['serumCoinVaultAccount', params.serumCoinVaultAccount],
    ['serumPcVaultAccount', params.serumPcVaultAccount],
    ['serumVaultSigner', params.serumVaultSigner],
  ];
  for (const [name, account] of required) {
    if (isDefaultPublicKey(account)) {
      throw new Error(
        `Raydium AMM v4 requires ${name}; pass real market accounts from the AMM/market state`
      );
    }
  }
}

/**
 * Build buy instructions for Raydium AMM V4 protocol
 */
export function buildRaydiumAmmV4BuyInstructions(
  params: BuildRaydiumAmmV4BuyInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    outputMint: requestedOutputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    amm,
    coinMint,
    pcMint,
    tokenCoin,
    tokenPc,
    ammOpenOrders,
    ammTargetOrders,
    serumProgram,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    coinReserve,
    pcReserve,
  } = protocolParams;
  ensureMarketAccounts(protocolParams);

  // Check pool type
  const isWsol = coinMint.equals(WSOL_TOKEN_ACCOUNT) || pcMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = coinMint.equals(USDC_TOKEN_ACCOUNT) || pcMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction
  const isBaseIn = coinMint.equals(WSOL_TOKEN_ACCOUNT) || coinMint.equals(USDC_TOKEN_ACCOUNT);

  // Calculate output
  const swapResult = computeRaydiumAmmV4SwapAmount(
    coinReserve,
    pcReserve,
    isBaseIn,
    inputAmount,
    slippageBasisPoints
  );
  const minimumAmountOut = fixedOutputAmount ?? swapResult.minAmountOut;

  // Determine input/output mints
  const inputMint = isBaseIn ? coinMint : pcMint;
  const outputMint = isBaseIn ? pcMint : coinMint;
  ensureExpectedMint("outputMint", requestedOutputMint, outputMint);

  // Derive user token accounts
  const userSourceTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const userDestinationTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );

  // Handle WSOL wrapping
  if (createInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountInstruction(
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
        lamports: Number(inputAmount),
      })
    );
    instructions.push(createSyncNativeInstruction(wsolAta));
  } else if (createInputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userSourceTokenAccount,
        payerPubkey,
        inputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }

  // Create output mint ATA if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userDestinationTokenAccount,
        payerPubkey,
        outputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }

  // Build instruction data (1 byte discriminator + 8 bytes amountIn + 8 bytes amountOut/minAmountOut)
  const data = Buffer.alloc(17);
  (fixedOutputAmount !== undefined
    ? RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR
    : RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR
  ).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 1);
  data.writeBigUInt64LE(minimumAmountOut, 9);

  // Build accounts (Raydium AMM V4 has a specific account order - 18 accounts)
  const accounts: AccountMeta[] = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: RAYDIUM_AMM_V4_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: tokenCoin, isSigner: false, isWritable: true }, // Pool Coin Token Account
    { pubkey: tokenPc, isSigner: false, isWritable: true }, // Pool Pc Token Account
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: RAYDIUM_AMM_V4_PROGRAM_ID,
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
 * Build sell instructions for Raydium AMM V4 protocol
 */
export function buildRaydiumAmmV4SellInstructions(
  params: BuildRaydiumAmmV4SellInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1000),
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");
  const USDC_TOKEN_ACCOUNT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const {
    amm,
    coinMint,
    pcMint,
    tokenCoin,
    tokenPc,
    ammOpenOrders,
    ammTargetOrders,
    serumProgram,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    coinReserve,
    pcReserve,
  } = protocolParams;
  ensureMarketAccounts(protocolParams);

  // Check pool type
  const isWsol = coinMint.equals(WSOL_TOKEN_ACCOUNT) || pcMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = coinMint.equals(USDC_TOKEN_ACCOUNT) || pcMint.equals(USDC_TOKEN_ACCOUNT);

  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }

  // Determine swap direction (selling token for WSOL/USDC means pc is output)
  const isBaseIn = pcMint.equals(WSOL_TOKEN_ACCOUNT) || pcMint.equals(USDC_TOKEN_ACCOUNT);

  // Calculate output
  const swapResult = computeRaydiumAmmV4SwapAmount(
    coinReserve,
    pcReserve,
    isBaseIn,
    inputAmount,
    slippageBasisPoints
  );
  const minimumAmountOut = fixedOutputAmount ?? swapResult.minAmountOut;

  // Determine output mint
  const outputMint = isBaseIn ? pcMint : coinMint;
  const inputMint = isBaseIn ? coinMint : pcMint;
  ensureExpectedMint("inputMint", requestedInputMint, inputMint);
  if (requestedOutputMint) {
    ensureExpectedMint("outputMint", requestedOutputMint, outputMint);
  }

  // Derive user token accounts
  const userSourceTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const userDestinationTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );

  // Create output ATA for receiving if needed
  if (createOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  } else if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userDestinationTokenAccount,
        payerPubkey,
        outputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }

  // Build instruction data
  const data = Buffer.alloc(17);
  (fixedOutputAmount !== undefined
    ? RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR
    : RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR
  ).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 1);
  data.writeBigUInt64LE(minimumAmountOut, 9);

  // Build accounts
  const accounts: AccountMeta[] = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: RAYDIUM_AMM_V4_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: tokenCoin, isSigner: false, isWritable: true }, // Pool Coin Token Account
    { pubkey: tokenPc, isSigner: false, isWritable: true }, // Pool Pc Token Account
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: RAYDIUM_AMM_V4_PROGRAM_ID,
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
        userSourceTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  return instructions;
}

// ===== AMM Info Decoder - from Rust: src/instruction/utils/raydium_amm_v4_types.rs =====

export const AMM_INFO_SIZE = 752;

export interface RaydiumAmmFees {
  minSeparateNumerator: bigint;
  minSeparateDenominator: bigint;
  tradeFeeNumerator: bigint;
  tradeFeeDenominator: bigint;
  pnlNumerator: bigint;
  pnlDenominator: bigint;
  swapFeeNumerator: bigint;
  swapFeeDenominator: bigint;
}

export interface RaydiumAmmOutputData {
  needTakePnlCoin: bigint;
  needTakePnlPc: bigint;
  totalPnlPc: bigint;
  totalPnlCoin: bigint;
  poolOpenTime: bigint;
  punishPcAmount: bigint;
  punishCoinAmount: bigint;
  orderbookToInitTime: bigint;
  swapCoinInAmount: bigint;
  swapPcOutAmount: bigint;
  swapTakePcFee: bigint;
  swapPcInAmount: bigint;
  swapCoinOutAmount: bigint;
  swapTakeCoinFee: bigint;
}

export interface RaydiumAmmInfo {
  status: bigint;
  nonce: bigint;
  orderNum: bigint;
  depth: bigint;
  coinDecimals: bigint;
  pcDecimals: bigint;
  state: bigint;
  resetFlag: bigint;
  minSize: bigint;
  volMaxCutRatio: bigint;
  amountWave: bigint;
  coinLotSize: bigint;
  pcLotSize: bigint;
  minPriceMultiplier: bigint;
  maxPriceMultiplier: bigint;
  sysDecimalValue: bigint;
  fees: RaydiumAmmFees;
  output: RaydiumAmmOutputData;
  tokenCoin: PublicKey;
  tokenPc: PublicKey;
  coinMint: PublicKey;
  pcMint: PublicKey;
  lpMint: PublicKey;
  openOrders: PublicKey;
  market: PublicKey;
  serumDex: PublicKey;
  targetOrders: PublicKey;
  withdrawQueue: PublicKey;
  tokenTempLp: PublicKey;
  ammOwner: PublicKey;
  lpAmount: bigint;
  clientOrderId: bigint;
}

export interface RaydiumMarketState {
  vaultSignerNonce: bigint;
  serumCoinVaultAccount: PublicKey;
  serumPcVaultAccount: PublicKey;
  serumEventQueue: PublicKey;
  serumBids: PublicKey;
  serumAsks: PublicKey;
}

export const MARKET_STATE_SIZE = 388;

/**
 * Decode Raydium AMM v4 info from account data.
 * 100% from Rust: src/instruction/utils/raydium_amm_v4_types.rs amm_info_decode
 */
export function decodeAmmInfo(data: Buffer): RaydiumAmmInfo | null {
  if (data.length < AMM_INFO_SIZE) {
    return null;
  }

  try {
    let offset = 0;

    const readU64 = () => {
      const val = data.readBigUInt64LE(offset);
      offset += 8;
      return val;
    };

    // status: u64
    const status = readU64();
    // nonce: u64
    const nonce = readU64();
    // order_num: u64
    const orderNum = readU64();
    // depth: u64
    const depth = readU64();
    // coin_decimals: u64
    const coinDecimals = readU64();
    // pc_decimals: u64
    const pcDecimals = readU64();
    // state: u64
    const state = readU64();
    // reset_flag: u64
    const resetFlag = readU64();
    // min_size: u64
    const minSize = readU64();
    // vol_max_cut_ratio: u64
    const volMaxCutRatio = readU64();
    // amount_wave: u64
    const amountWave = readU64();
    // coin_lot_size: u64
    const coinLotSize = readU64();
    // pc_lot_size: u64
    const pcLotSize = readU64();
    // min_price_multiplier: u64
    const minPriceMultiplier = readU64();
    // max_price_multiplier: u64
    const maxPriceMultiplier = readU64();
    // sys_decimal_value: u64
    const sysDecimalValue = readU64();

    // fees: Fees (8 * u64)
    const fees: RaydiumAmmFees = {
      minSeparateNumerator: readU64(),
      minSeparateDenominator: readU64(),
      tradeFeeNumerator: readU64(),
      tradeFeeDenominator: readU64(),
      pnlNumerator: readU64(),
      pnlDenominator: readU64(),
      swapFeeNumerator: readU64(),
      swapFeeDenominator: readU64(),
    };

    // output: OutPutData
    const output: RaydiumAmmOutputData = {
      needTakePnlCoin: readU64(),
      needTakePnlPc: readU64(),
      totalPnlPc: readU64(),
      totalPnlCoin: readU64(),
      poolOpenTime: readU64(),
      punishPcAmount: readU64(),
      punishCoinAmount: readU64(),
      orderbookToInitTime: readU64(),
      swapCoinInAmount: readU64(),
      swapPcOutAmount: readU64(),
      swapTakePcFee: readU64(),
      swapPcInAmount: readU64(),
      swapCoinOutAmount: readU64(),
      swapTakeCoinFee: readU64(),
    };

    // token_coin: Pubkey
    const tokenCoin = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token_pc: Pubkey
    const tokenPc = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // coin_mint: Pubkey
    const coinMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // pc_mint: Pubkey
    const pcMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // lp_mint: Pubkey
    const lpMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // open_orders: Pubkey
    const openOrders = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // market: Pubkey
    const market = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // serum_dex: Pubkey
    const serumDex = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // target_orders: Pubkey
    const targetOrders = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // withdraw_queue: Pubkey
    const withdrawQueue = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token_temp_lp: Pubkey
    const tokenTempLp = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // amm_owner: Pubkey
    const ammOwner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // lp_amount: u64
    const lpAmount = readU64();

    // client_order_id: u64
    const clientOrderId = readU64();

    return {
      status,
      nonce,
      orderNum,
      depth,
      coinDecimals,
      pcDecimals,
      state,
      resetFlag,
      minSize,
      volMaxCutRatio,
      amountWave,
      coinLotSize,
      pcLotSize,
      minPriceMultiplier,
      maxPriceMultiplier,
      sysDecimalValue,
      fees,
      output,
      tokenCoin,
      tokenPc,
      coinMint,
      pcMint,
      lpMint,
      openOrders,
      market,
      serumDex,
      targetOrders,
      withdrawQueue,
      tokenTempLp,
      ammOwner,
      lpAmount,
      clientOrderId,
    };
  } catch {
    return null;
  }
}

export function decodeMarketState(data: Buffer): RaydiumMarketState | null {
  if (data.length < MARKET_STATE_SIZE) {
    return null;
  }

  try {
    let offset = 5;
    const readU64 = () => {
      const val = data.readBigUInt64LE(offset);
      offset += 8;
      return val;
    };
    const readPubkey = () => {
      const val = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
      return val;
    };

    readU64(); // account_flags
    readPubkey(); // own_address
    const vaultSignerNonce = readU64();
    readPubkey(); // coin_mint
    readPubkey(); // pc_mint
    const serumCoinVaultAccount = readPubkey();
    readU64(); // coin_deposits_total
    readU64(); // coin_fees_accrued
    const serumPcVaultAccount = readPubkey();
    readU64(); // pc_deposits_total
    readU64(); // pc_fees_accrued
    readU64(); // pc_dust_threshold
    readPubkey(); // request_queue
    const serumEventQueue = readPubkey();
    const serumBids = readPubkey();
    const serumAsks = readPubkey();

    return {
      vaultSignerNonce,
      serumCoinVaultAccount,
      serumPcVaultAccount,
      serumEventQueue,
      serumBids,
      serumAsks,
    };
  } catch {
    return null;
  }
}

export function deriveSerumVaultSigner(
  serumProgram: PublicKey,
  serumMarket: PublicKey,
  vaultSignerNonce: bigint
): PublicKey {
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64LE(vaultSignerNonce);
  try {
    return PublicKey.createProgramAddressSync(
      [serumMarket.toBuffer(), nonce],
      serumProgram
    );
  } catch {
    return PublicKey.createProgramAddressSync(
      [serumMarket.toBuffer(), Buffer.from([Number(vaultSignerNonce & 0xffn)])],
      serumProgram
    );
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/raydium_amm_v4.rs =====

/**
 * Fetch AMM info from RPC.
 * 100% from Rust: src/instruction/utils/raydium_amm_v4.rs fetch_amm_info
 */
export async function fetchAmmInfo(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  amm: PublicKey
): Promise<RaydiumAmmInfo | null> {
  const account = await connection.getAccountInfo(amm);
  if (!account?.value?.data) {
    return null;
  }
  return decodeAmmInfo(account.value.data);
}

export async function fetchMarketState(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer } }> },
  market: PublicKey
): Promise<RaydiumMarketState | null> {
  const account = await connection.getAccountInfo(market);
  if (!account?.value?.data) {
    return null;
  }
  return decodeMarketState(account.value.data);
}
