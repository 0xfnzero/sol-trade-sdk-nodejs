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
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "../common/spl-token";

// ============================================
// Program IDs and Constants
// ============================================

const SOL_TOKEN_ACCOUNT = new PublicKey(
  "So11111111111111111111111111111111111111111",
);

/** Raydium AMM V4 program ID */
export const RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
);

/** Authority */
export const RAYDIUM_AMM_V4_AUTHORITY = new PublicKey(
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
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
export const RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR: Buffer = Buffer.from([
  9,
]);

/** Swap base out instruction discriminator (single byte) */
export const RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR: Buffer = Buffer.from([
  11,
]);

// ============================================
// Seeds
// ============================================

export const RAYDIUM_AMM_V4_SWAP_BASE_IN_V2_DISCRIMINATOR = Buffer.from([16]);
export const RAYDIUM_AMM_V4_SWAP_BASE_OUT_V2_DISCRIMINATOR = Buffer.from([17]);

export const RAYDIUM_AMM_V4_POOL_SEED = Buffer.from("pool");

// ============================================
// Helper Functions
// ============================================

/**
 * Compute swap amount for AMM V4
 */
function u64(value: bigint) {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << 64n)
    throw Error("AMM v4 value must be u64");
  return value;
}
export function computeRaydiumAmmV4SwapAmount(
  coinReserve: bigint,
  pcReserve: bigint,
  isCoinIn: boolean,
  amountIn: bigint,
  slippageBasisPoints: bigint,
  swapFeeNumerator = 25n,
  swapFeeDenominator = 10000n,
): { amountOut: bigint; minAmountOut: bigint } {
  for (const value of [
    coinReserve,
    pcReserve,
    amountIn,
    slippageBasisPoints,
    swapFeeNumerator,
    swapFeeDenominator,
  ])
    u64(value);
  if (
    !coinReserve ||
    !pcReserve ||
    !amountIn ||
    typeof isCoinIn !== "boolean" ||
    !swapFeeDenominator ||
    swapFeeNumerator >= swapFeeDenominator
  )
    throw Error("Invalid AMM v4 reserves, amount or swap fee");
  const fee =
      (amountIn * swapFeeNumerator + swapFeeDenominator - 1n) /
      swapFeeDenominator,
    net = amountIn - fee,
    [i, o] = isCoinIn ? [coinReserve, pcReserve] : [pcReserve, coinReserve],
    amountOut = (o * net) / (i + net),
    slip = slippageBasisPoints > 9999n ? 9999n : slippageBasisPoints;
  return { amountOut, minAmountOut: (amountOut * (10000n - slip)) / 10000n };
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
  ammOpenOrders?: PublicKey;
  ammTargetOrders?: PublicKey;
  serumProgram?: PublicKey;
  serumMarket?: PublicKey;
  serumBids?: PublicKey;
  serumAsks?: PublicKey;
  serumEventQueue?: PublicKey;
  serumCoinVaultAccount?: PublicKey;
  serumPcVaultAccount?: PublicKey;
  serumVaultSigner?: PublicKey;
  coinReserve: bigint;
  pcReserve: bigint;
  swapFeeNumerator?: bigint;
  swapFeeDenominator?: bigint;
}

export interface BuildRaydiumAmmV4BuyInstructionsParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  inputMint?: PublicKey;
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

function ensureExpectedMint(
  label: string,
  requested: PublicKey,
  expected: PublicKey,
): void {
  if (!isDefaultPublicKey(requested) && !isMintMatch(requested, expected)) {
    throw new Error(
      `${label} must match the Raydium AMM v4 pool side (${expected.toBase58()}), got ${requested.toBase58()}`,
    );
  }
}

function v2Pair(p: RaydiumAmmV4Params, mint: PublicKey, buy: boolean) {
  if (
    p.coinMint.equals(p.pcMint) ||
    [p.amm, p.coinMint, p.pcMint, p.tokenCoin, p.tokenPc].some((k) =>
      k.equals(PublicKey.default),
    )
  )
    throw Error("Invalid AMM v4 pool accounts");
  if (mint.equals(SOL_TOKEN_ACCOUNT)) mint = NATIVE_MINT;
  if (!mint.equals(p.coinMint) && !mint.equals(p.pcMint))
    throw Error(
      (buy ? "outputMint" : "inputMint") +
        " must match the Raydium AMM v4 pool side",
    );
  const coinIn = buy ? mint.equals(p.pcMint) : mint.equals(p.coinMint);
  return {
    inputMint: coinIn ? p.coinMint : p.pcMint,
    outputMint: coinIn ? p.pcMint : p.coinMint,
    coinIn,
  };
}
function v2Swap(
  p: RaydiumAmmV4Params,
  payer: PublicKey,
  im: PublicKey,
  om: PublicKey,
  amount: bigint,
  slippage: bigint,
  coinIn: boolean,
  fixed?: bigint,
) {
  u64(amount);
  if (!amount) throw Error("Amount cannot be zero");
  let minimum: bigint;
  if (fixed !== undefined) {
    u64(fixed);
    if (!fixed) throw Error("Exact output cannot be zero");
    minimum = fixed;
  } else
    minimum = computeRaydiumAmmV4SwapAmount(
      p.coinReserve,
      p.pcReserve,
      coinIn,
      amount,
      slippage,
      p.swapFeeNumerator ?? 25n,
      p.swapFeeDenominator ?? 10000n,
    ).minAmountOut;
  const keys = [
      TOKEN_PROGRAM_ID,
      p.amm,
      RAYDIUM_AMM_V4_AUTHORITY,
      p.tokenCoin,
      p.tokenPc,
      getAssociatedTokenAddressSync(im, payer, true, TOKEN_PROGRAM_ID),
      getAssociatedTokenAddressSync(om, payer, true, TOKEN_PROGRAM_ID),
      payer,
    ],
    data = Buffer.alloc(17);
  data[0] = fixed === undefined ? 16 : 17;
  data.writeBigUInt64LE(amount, 1);
  data.writeBigUInt64LE(minimum, 9);
  return new TransactionInstruction({
    programId: RAYDIUM_AMM_V4_PROGRAM_ID,
    data,
    keys: keys.map((pubkey, i) => ({
      pubkey,
      isSigner: i === 7,
      isWritable: [1, 3, 4, 5, 6].includes(i),
    })),
  });
}
/** V2 independent buy. Supplied reserves must exclude pending PnL; no RPC. */
export function buildRaydiumAmmV4BuyInstructions(
  params: BuildRaydiumAmmV4BuyInstructionsParams,
): TransactionInstruction[] {
  const p = params.protocolParams,
    payer =
      params.payer instanceof Keypair ? params.payer.publicKey : params.payer,
    {
      inputMint: im,
      outputMint: om,
      coinIn,
    } = v2Pair(p, params.outputMint, true);
  if (params.inputMint) ensureExpectedMint("inputMint", params.inputMint, im);
  const swap = v2Swap(
      p,
      payer,
      im,
      om,
      params.inputAmount,
      params.slippageBasisPoints ?? 1000n,
      coinIn,
      params.fixedOutputAmount,
    ),
    instructions: TransactionInstruction[] = [];
  if (params.createInputMintAta ?? true) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        getAssociatedTokenAddressSync(im, payer, true, TOKEN_PROGRAM_ID),
        payer,
        im,
        TOKEN_PROGRAM_ID,
      ),
    );
    if (im.equals(NATIVE_MINT)) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: getAssociatedTokenAddressSync(
            im,
            payer,
            true,
            TOKEN_PROGRAM_ID,
          ),
          lamports: params.inputAmount,
        }),
      );
      instructions.push(
        createSyncNativeInstruction(
          getAssociatedTokenAddressSync(im, payer, true, TOKEN_PROGRAM_ID),
        ),
      );
    }
  }
  if (params.createOutputMintAta ?? true)
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        getAssociatedTokenAddressSync(om, payer, true, TOKEN_PROGRAM_ID),
        payer,
        om,
        TOKEN_PROGRAM_ID,
      ),
    );
  instructions.push(swap);
  if (params.closeInputMintAta && im.equals(NATIVE_MINT))
    instructions.push(
      createCloseAccountInstruction(
        getAssociatedTokenAddressSync(im, payer, true, TOKEN_PROGRAM_ID),
        payer,
        payer,
      ),
    );
  return instructions;
}
/** V2 independent sell for either side, including stock/token pairs. No RPC. */
export function buildRaydiumAmmV4SellInstructions(
  params: BuildRaydiumAmmV4SellInstructionsParams,
): TransactionInstruction[] {
  const p = params.protocolParams,
    payer =
      params.payer instanceof Keypair ? params.payer.publicKey : params.payer,
    {
      inputMint: im,
      outputMint: om,
      coinIn,
    } = v2Pair(p, params.inputMint, false);
  if (params.outputMint)
    ensureExpectedMint("outputMint", params.outputMint, om);
  const swap = v2Swap(
      p,
      payer,
      im,
      om,
      params.inputAmount,
      params.slippageBasisPoints ?? 1000n,
      coinIn,
      params.fixedOutputAmount,
    ),
    instructions: TransactionInstruction[] = [];
  if (params.createOutputMintAta ?? true)
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        getAssociatedTokenAddressSync(om, payer, true, TOKEN_PROGRAM_ID),
        payer,
        om,
        TOKEN_PROGRAM_ID,
      ),
    );
  instructions.push(swap);
  if (params.closeOutputMintAta && om.equals(NATIVE_MINT))
    instructions.push(
      createCloseAccountInstruction(
        getAssociatedTokenAddressSync(om, payer, true, TOKEN_PROGRAM_ID),
        payer,
        payer,
      ),
    );
  if (params.closeInputMintAta)
    instructions.push(
      createCloseAccountInstruction(
        getAssociatedTokenAddressSync(im, payer, true, TOKEN_PROGRAM_ID),
        payer,
        payer,
      ),
    );
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
    const readU128 = (): bigint => {
      const value =
        data.readBigUInt64LE(offset) |
        (data.readBigUInt64LE(offset + 8) << 64n);
      offset += 16;
      return value;
    };
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
      swapCoinInAmount: readU128(),
      swapPcOutAmount: readU128(),
      swapTakePcFee: readU64(),
      swapPcInAmount: readU128(),
      swapCoinOutAmount: readU128(),
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
  vaultSignerNonce: bigint,
): PublicKey {
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64LE(vaultSignerNonce);
  try {
    return PublicKey.createProgramAddressSync(
      [serumMarket.toBuffer(), nonce],
      serumProgram,
    );
  } catch {
    return PublicKey.createProgramAddressSync(
      [serumMarket.toBuffer(), Buffer.from([Number(vaultSignerNonce & 0xffn)])],
      serumProgram,
    );
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/raydium_amm_v4.rs =====

/**
 * Fetch AMM info from RPC.
 * 100% from Rust: src/instruction/utils/raydium_amm_v4.rs fetch_amm_info
 */
export async function fetchAmmInfo(
  connection: {
    getAccountInfo: (
      pubkey: PublicKey,
    ) => Promise<{ value?: { data: Buffer } }>;
  },
  amm: PublicKey,
): Promise<RaydiumAmmInfo | null> {
  const account = await connection.getAccountInfo(amm);
  if (!account?.value?.data) {
    return null;
  }
  return decodeAmmInfo(account.value.data);
}

export async function fetchMarketState(
  connection: {
    getAccountInfo: (
      pubkey: PublicKey,
    ) => Promise<{ value?: { data: Buffer } }>;
  },
  market: PublicKey,
): Promise<RaydiumMarketState | null> {
  const account = await connection.getAccountInfo(market);
  if (!account?.value?.data) {
    return null;
  }
  return decodeMarketState(account.value.data);
}
