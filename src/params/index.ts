/**
 * DEX parameters — RPC loaders aligned with Rust `src/trading/core/params.rs`
 */

import { PublicKey, Connection } from '@solana/web3.js';
import {
  TOKEN_PROGRAM,
  PUMPFUN_PROGRAM,
  TOKEN_PROGRAM_2022,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  BONK_PROGRAM,
  SOL_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT,
} from '../constants';
import {
  reconcileMayhemModeForTrade,
  getBondingCurvePda,
  getCreatorVaultPda,
  getPumpFunFeeSharingConfigPda,
  PUMPFUN_GLOBAL_ACCOUNT,
  PUMPFUN_FEE_PROGRAM,
} from '../instruction/pumpfun_builder';
import {decodePumpFunGlobalFeeRecipient,decodePumpFunSharingCreatorVault} from '../trading/cached_pumpfun_config';
import {
  findByMint as findPumpSwapPoolByMint,
  fetchPool as fetchPumpSwapPool,
  getTokenBalances as getPumpSwapTokenBalances,
  getAssociatedTokenAddress as getPumpSwapAta,
  getCoinCreatorVaultAta,
  getCoinCreatorVaultAuthority,
  fetchFeeConfig as fetchPumpSwapFeeConfig,
  computePumpSwapFeeBasisPoints,
  type PumpSwapPool,
} from '../instruction/pumpswap';
import { effectiveQuoteReserves, type PumpSwapFeeBasisPoints } from '../calc';
import {
  fetchBonkPoolState,
  getBonkPoolPDA,
} from '../instruction/bonk_builder';
import {
  fetchRaydiumCPMMpoolState,
  getRaydiumCPMMpoolTokenBalances,
} from '../instruction/raydium_cpmm_builder';
import {
  deriveSerumVaultSigner,
  fetchAmmInfo,
  fetchMarketState,
} from '../instruction/raydium_amm_v4_builder';
import { fetchMeteoraPool } from '../instruction/meteora_damm_v2_builder';

/** Maps `Connection` to the minimal RPC shape used by Rust-parity instruction fetch helpers. */
function wrapConnection(connection: Connection) {
  return {
    getAccountInfo: async (pubkey: PublicKey) => {
      const a = await connection.getAccountInfo(pubkey);
      return { value: a ? { data: Buffer.from(a.data), owner: a.owner } : undefined };
    },
    getTokenAccountBalance: (pubkey: PublicKey) =>
      connection.getTokenAccountBalance(pubkey),
    getProgramAccounts: (
      programId: PublicKey,
      config?: Parameters<Connection['getProgramAccounts']>[1]
    ) => connection.getProgramAccounts(programId, config),
  };
}

function decodeMintSupply(data: Buffer): bigint | null {
  if (data.length < 44) return null;
  return data.readBigUInt64LE(36);
}

// ============== Bonding Curve ==============

export interface BondingCurveAccount {
  creatorFeeBps?: bigint;
  canEditCreatorFee?: boolean;
  isHolderReward?: boolean;
  creatorFee?: bigint;
  protocolFees?: bigint;
  depth?: number;
  initialVirtualQuoteReserves?: bigint;
  postCompleteBaseOut?: bigint;
  postCompleteQuoteIn?: bigint;
  discriminator: number;
  account: PublicKey;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  quoteMint?: PublicKey;
}

export function decodePumpFunBondingCurveData(
  data: Buffer,
  bondingCurveAddr: PublicKey
): BondingCurveAccount {
  const discriminator = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);
  if (data.length < 83 || (data.length > 83 && data.length < 115) || !data.subarray(0, 8).equals(discriminator)) {
    throw new Error('Invalid PumpFun bonding curve account layout');
  }
  for (const index of [48, 81, 82]) {
    if (data[index]! > 1) throw new Error('Invalid PumpFun bonding curve boolean');
  }
  let offset = 8;
  const virtualTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const virtualSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const realTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const realSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const tokenTotalSupply = data.readBigUInt64LE(offset);
  offset += 8;
  const complete = data.readUInt8(offset) === 1;
  offset += 1;
  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const isMayhemMode = data.readUInt8(offset) === 1;
  offset += 1;
  const isCashbackCoin = data.readUInt8(offset) === 1;
  const quoteMint = data.length >= 115 ? new PublicKey(data.subarray(83, 115)) : WSOL_TOKEN_ACCOUNT;
  return {
    creatorFeeBps: data.length>=123 ? data.readBigUInt64LE(115) : 0n,
    canEditCreatorFee: data.length>123 ? data[123]===1 : false,
    isHolderReward: data.length>124 ? data[124]===1 : false,
    creatorFee: data.length>=133 ? data.readBigUInt64LE(125) : 0n,
    protocolFees: data.length>=141 ? data.readBigUInt64LE(133) : 0n,
    depth: data.length>141 ? data[141]! : 0,
    initialVirtualQuoteReserves: data.length>=150 ? data.readBigUInt64LE(142) : 0n,
    postCompleteBaseOut: data.length>=158 ? data.readBigUInt64LE(150) : 0n,
    postCompleteQuoteIn: data.length>=166 ? data.readBigUInt64LE(158) : 0n,

    discriminator: 0,
    account: bondingCurveAddr,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
    creator,
    isMayhemMode,
    isCashbackCoin,
    quoteMint,
  };
}

export class PumpFunParams {
  constructor(
    public bondingCurve: BondingCurveAccount,
    public associatedBondingCurve: PublicKey,
    public creatorVault: PublicKey,
    public tokenProgram: PublicKey,
    public closeTokenAccountWhenSell?: boolean,
    public feeRecipient: PublicKey = PublicKey.default,
    public quoteMint: PublicKey = PublicKey.default,
    public observedTradeCreator?: PublicKey,
    public feeSharingCreatorVaultIfActive?: PublicKey
  ) {}

  static immediateSell(
    creatorVault: PublicKey,
    tokenProgram: PublicKey,
    closeTokenAccountWhenSell: boolean = false
  ): PumpFunParams {
    return new PumpFunParams(
      {
        discriminator: 0,
        account: PublicKey.default,
        virtualTokenReserves: BigInt(0),
        virtualSolReserves: BigInt(0),
        realTokenReserves: BigInt(0),
        realSolReserves: BigInt(0),
        tokenTotalSupply: BigInt(0),
        complete: false,
        creator: PublicKey.default,
        isMayhemMode: false,
        isCashbackCoin: false,
      },
      PublicKey.default,
      creatorVault,
      tokenProgram,
      closeTokenAccountWhenSell
    );
  }

  static fromTrade(params: {
    bondingCurve: PublicKey;
    associatedBondingCurve: PublicKey;
    mint: PublicKey;
    creator: PublicKey;
    creatorVault: PublicKey;
    virtualTokenReserves: bigint;
    virtualSolReserves: bigint;
    realTokenReserves: bigint;
    realSolReserves: bigint;
    closeTokenAccountWhenSell?: boolean;
    feeRecipient: PublicKey;
    tokenProgram: PublicKey;
    isCashbackCoin: boolean;
    quoteMint?: PublicKey;
    mayhemMode?: boolean;
  }): PumpFunParams {
    const isMayhemMode = reconcileMayhemModeForTrade(params.mayhemMode, params.feeRecipient);
    return new PumpFunParams(
      {
        discriminator: 0,
        account: params.bondingCurve.equals(PublicKey.default) ? getBondingCurvePda(params.mint) : params.bondingCurve,
        virtualTokenReserves: params.virtualTokenReserves,
        virtualSolReserves: params.virtualSolReserves,
        realTokenReserves: params.realTokenReserves,
        realSolReserves: params.realSolReserves,
        tokenTotalSupply: 1_000_000_000_000_000n,
        complete: false,
        creator: params.creator,
        isMayhemMode,
        isCashbackCoin: params.isCashbackCoin,
        quoteMint: params.quoteMint ?? WSOL_TOKEN_ACCOUNT,
      },
      params.associatedBondingCurve,
      params.creatorVault,
      params.tokenProgram,
      params.closeTokenAccountWhenSell,
      params.feeRecipient,
      params.quoteMint ?? PublicKey.default,
      params.creator.equals(PublicKey.default) ? undefined : params.creator
    );
  }

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey
  ): Promise<PumpFunParams> {
    const bondingCurveAddr = getBondingCurvePda(mint);
    const accountInfo = await connection.getAccountInfo(bondingCurveAddr);
    if (!accountInfo?.data?.length) {
      throw new Error('Bonding curve account not found');
    }
    if (!accountInfo.owner.equals(PUMPFUN_PROGRAM)) throw new Error('Invalid PumpFun bonding curve account owner');
    const bondingCurve = decodePumpFunBondingCurveData(
      accountInfo.data,
      bondingCurveAddr
    );
    const mintAccount = await connection.getAccountInfo(mint);
    if (!mintAccount || mintAccount.data.length < 82 || mintAccount.data[45] !== 1 || (!mintAccount.owner.equals(TOKEN_PROGRAM) && !mintAccount.owner.equals(TOKEN_PROGRAM_2022))) {
      throw new Error('Invalid or missing PumpFun mint account');
    }
    const tokenProgram = mintAccount.owner;
    const associatedBondingCurve = getPumpSwapAta(
      bondingCurveAddr,
      mint,
      tokenProgram
    );
    const [global,sharing] = await Promise.all([
      connection.getAccountInfo(PUMPFUN_GLOBAL_ACCOUNT),
      connection.getAccountInfo(getPumpFunFeeSharingConfigPda(mint)),
    ]);
    if (!global || !global.owner.equals(PUMPFUN_PROGRAM)) throw new Error('Invalid or missing PumpFun Global account');
    const feeRecipient = decodePumpFunGlobalFeeRecipient(global.data);
    // Explicit cold lookup can prove absence. Cached preparation cannot.
    let feeSharingCreatorVaultIfActive: PublicKey | undefined;
    if (sharing?.owner.equals(PUMPFUN_FEE_PROGRAM)) {
      try { feeSharingCreatorVaultIfActive = decodePumpFunSharingCreatorVault(sharing.data,mint); }
      catch { /* Rust cold helper treats invalid optional SharingConfig as inactive. */ }
    }
    const creatorVault = feeSharingCreatorVaultIfActive ?? getCreatorVaultPda(bondingCurve.creator);
    return new PumpFunParams(
      bondingCurve,
      associatedBondingCurve,
      creatorVault,
      tokenProgram,
      undefined,
      feeRecipient,
      bondingCurve.quoteMint,
      undefined,
      feeSharingCreatorVaultIfActive
    );
  }

  withQuoteMint(mint: PublicKey): PumpFunParams {
    const normalized = mint.equals(PublicKey.default) || mint.equals(SOL_TOKEN_ACCOUNT) ? WSOL_TOKEN_ACCOUNT : mint;
    const oldInitial = this.bondingCurve.quoteMint?.equals(USDC_TOKEN_ACCOUNT) ? 4_292_000_000n : 30_000_000_000n;
    const nextInitial = normalized.equals(USDC_TOKEN_ACCOUNT) ? 4_292_000_000n : 30_000_000_000n;
    const max = (1n << 64n) - 1n;
    const add = (a: bigint, b: bigint) => a + b > max ? max : a + b;
    if (this.bondingCurve.virtualSolReserves === add(oldInitial, this.bondingCurve.realSolReserves)) this.bondingCurve.virtualSolReserves = add(nextInitial, this.bondingCurve.realSolReserves);
    this.bondingCurve.quoteMint = normalized;
    this.quoteMint = mint.equals(PublicKey.default) || mint.equals(SOL_TOKEN_ACCOUNT) ? PublicKey.default : mint;
    return this;
  }

  withCreatorVault(vault: PublicKey): PumpFunParams {
    this.creatorVault = vault;
    return this;
  }
}

// ============== PumpSwap Params ==============

export class PumpSwapParams {
  constructor(
    public pool: PublicKey,
    public baseMint: PublicKey,
    public quoteMint: PublicKey,
    public poolBaseTokenAccount: PublicKey,
    public poolQuoteTokenAccount: PublicKey,
    public poolBaseTokenReserves: bigint,
    public poolQuoteTokenReserves: bigint,
    public virtualQuoteReserves: bigint,
    public coinCreatorVaultAta: PublicKey,
    public coinCreatorVaultAuthority: PublicKey,
    public baseTokenProgram: PublicKey,
    public quoteTokenProgram: PublicKey,
    public isMayhemMode: boolean,
    public isCashbackCoin: boolean,
    public coinCreator: PublicKey = PublicKey.default,
    public cashbackFeeBasisPoints: bigint = BigInt(0),
    public feeBasisPoints: PumpSwapFeeBasisPoints = {
      lpFeeBasisPoints: BigInt(25),
      protocolFeeBasisPoints: BigInt(5),
      coinCreatorFeeBasisPoints: coinCreator.equals(PublicKey.default) ? BigInt(0) : BigInt(5),
    },
    public poolCreator: PublicKey = PublicKey.default,
    public baseMintSupply: bigint | null = null
  ) {}

  effectiveQuoteReserves(): bigint {
    return effectiveQuoteReserves(this.poolQuoteTokenReserves, this.virtualQuoteReserves);
  }

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey,
    feeBasisPoints?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const pool = await fetchPumpSwapPool(wrapConnection(connection), poolAddress);
    if (!pool) {
      throw new Error('PumpSwap pool account not found or invalid');
    }
    return PumpSwapParams.fromPoolData(connection, poolAddress, pool, feeBasisPoints);
  }

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey,
    feeBasisPoints?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const rpc = wrapConnection(connection);
    const found = await findPumpSwapPoolByMint(
      { getAccountInfo: rpc.getAccountInfo },
      mint
    );
    if (!found) {
      throw new Error('No pool found for mint');
    }
    return PumpSwapParams.fromPoolData(
      connection,
      found.poolAddress,
      found.pool,
      feeBasisPoints
    );
  }

  private static async fromPoolData(
    connection: Connection,
    poolAddress: PublicKey,
    pool: PumpSwapPool,
    feeBasisPointsOverride?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const balances = await getPumpSwapTokenBalances(wrapConnection(connection), pool);
    if (!balances) {
      throw new Error('Failed to read pool token balances');
    }
    const baseAtaTp = getPumpSwapAta(
      poolAddress,
      pool.baseMint,
      TOKEN_PROGRAM
    );
    const quoteAtaTp = getPumpSwapAta(
      poolAddress,
      pool.quoteMint,
      TOKEN_PROGRAM
    );
    const baseTokenProgram = pool.poolBaseTokenAccount.equals(baseAtaTp)
      ? TOKEN_PROGRAM
      : TOKEN_PROGRAM_2022;
    const quoteTokenProgram = pool.poolQuoteTokenAccount.equals(quoteAtaTp)
      ? TOKEN_PROGRAM
      : TOKEN_PROGRAM_2022;
    const rpc = wrapConnection(connection);
    const mintAccount = await rpc.getAccountInfo(pool.baseMint).catch(() => undefined);
    const baseMintSupply = mintAccount?.value?.data
      ? decodeMintSupply(Buffer.from(mintAccount.value.data))
      : null;
    const effectiveQuoteBalance = effectiveQuoteReserves(
      balances.quoteBalance,
      pool.virtualQuoteReserves
    );
    const rawFeeBasisPoints = feeBasisPointsOverride ?? computePumpSwapFeeBasisPoints(
      await fetchPumpSwapFeeConfig(rpc).catch(() => null),
      pool.creator,
      pool.baseMint,
      baseMintSupply,
      balances.baseBalance,
      effectiveQuoteBalance
    );
    const feeBasisPoints = {
      ...rawFeeBasisPoints,
      coinCreatorFeeBasisPoints: pool.coinCreator.equals(PublicKey.default)
        ? BigInt(0)
        : rawFeeBasisPoints.coinCreatorFeeBasisPoints,
    };
    return new PumpSwapParams(
      poolAddress,
      pool.baseMint,
      pool.quoteMint,
      pool.poolBaseTokenAccount,
      pool.poolQuoteTokenAccount,
      balances.baseBalance,
      balances.quoteBalance,
      pool.virtualQuoteReserves,
      getCoinCreatorVaultAta(pool.coinCreator, pool.quoteMint, quoteTokenProgram),
      getCoinCreatorVaultAuthority(pool.coinCreator),
      baseTokenProgram,
      quoteTokenProgram,
      pool.isMayhemMode,
      pool.isCashbackCoin,
      pool.coinCreator,
      BigInt(0),
      feeBasisPoints,
      pool.creator,
      baseMintSupply
    );
  }
}

// ============== Bonk Params ==============

function bonkPlatformAssociatedAccount(platformConfig: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [platformConfig.toBuffer(), WSOL_TOKEN_ACCOUNT.toBuffer()],
    BONK_PROGRAM
  );
  return pda;
}

function bonkCreatorAssociatedAccount(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), WSOL_TOKEN_ACCOUNT.toBuffer()],
    BONK_PROGRAM
  );
  return pda;
}

export class BonkParams {
  constructor(
    public virtualBase: bigint,
    public virtualQuote: bigint,
    public realBase: bigint,
    public realQuote: bigint,
    public poolState: PublicKey,
    public baseVault: PublicKey,
    public quoteVault: PublicKey,
    public mintTokenProgram: PublicKey,
    public platformConfig: PublicKey,
    public platformAssociatedAccount: PublicKey,
    public creatorAssociatedAccount: PublicKey,
    public globalConfig: PublicKey
  ) {}

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey,
    usd1Pool: boolean = false
  ): Promise<BonkParams> {
    const quoteMint = usd1Pool ? USD1_TOKEN_ACCOUNT : WSOL_TOKEN_ACCOUNT;
    const poolAddress = getBonkPoolPDA(mint, quoteMint);
    const poolData = await fetchBonkPoolState(wrapConnection(connection), poolAddress);
    if (!poolData) {
      throw new Error('Bonk pool state not found');
    }
    const tokenAccount = await connection.getAccountInfo(poolData.baseMint);
    const mintTokenProgram = tokenAccount?.owner ?? TOKEN_PROGRAM;
    return new BonkParams(
      poolData.virtualBase,
      poolData.virtualQuote,
      poolData.realBase,
      poolData.realQuote,
      poolAddress,
      poolData.baseVault,
      poolData.quoteVault,
      mintTokenProgram,
      poolData.platformConfig,
      bonkPlatformAssociatedAccount(poolData.platformConfig),
      bonkCreatorAssociatedAccount(poolData.creator),
      poolData.globalConfig
    );
  }
}

// ============== Raydium Params ==============

export class RaydiumCpmmParams {
  constructor(
    public poolState: PublicKey,
    public ammConfig: PublicKey,
    public baseMint: PublicKey,
    public quoteMint: PublicKey,
    public baseReserve: bigint,
    public quoteReserve: bigint,
    public baseVault: PublicKey,
    public quoteVault: PublicKey,
    public baseTokenProgram: PublicKey,
    public quoteTokenProgram: PublicKey,
    public observationState: PublicKey
  ) {}

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<RaydiumCpmmParams> {
    const pool = await fetchRaydiumCPMMpoolState(wrapConnection(connection), poolAddress);
    if (!pool) {
      throw new Error('Raydium CPMM pool not found');
    }
    const bal = await getRaydiumCPMMpoolTokenBalances(
      wrapConnection(connection),
      poolAddress,
      pool.token0Mint,
      pool.token1Mint
    );
    if (!bal) {
      throw new Error('Failed to read Raydium CPMM vault balances');
    }
    return new RaydiumCpmmParams(
      poolAddress,
      pool.ammConfig,
      pool.token0Mint,
      pool.token1Mint,
      bal.token0Balance,
      bal.token1Balance,
      pool.token0Vault,
      pool.token1Vault,
      pool.token0Program,
      pool.token1Program,
      pool.observationKey
    );
  }
}

export class RaydiumAmmV4Params {
  constructor(
    public amm: PublicKey,
    public coinMint: PublicKey,
    public pcMint: PublicKey,
    public tokenCoin: PublicKey,
    public tokenPc: PublicKey,
    public ammOpenOrders: PublicKey,
    public ammTargetOrders: PublicKey,
    public serumProgram: PublicKey,
    public serumMarket: PublicKey,
    public serumBids: PublicKey,
    public serumAsks: PublicKey,
    public serumEventQueue: PublicKey,
    public serumCoinVaultAccount: PublicKey,
    public serumPcVaultAccount: PublicKey,
    public serumVaultSigner: PublicKey,
    public coinReserve: bigint,
    public pcReserve: bigint,
    public swapFeeNumerator:bigint=25n,
    public swapFeeDenominator:bigint=10000n
  ) {}

  static async fromAmmAddressByRpc(
    connection: Connection,
    amm: PublicKey
  ): Promise<RaydiumAmmV4Params> {
    const ammInfo = await fetchAmmInfo(wrapConnection(connection), amm);
    if (!ammInfo) {
      throw new Error('Raydium AMM account not found');
    }
    const marketState = await fetchMarketState(wrapConnection(connection), ammInfo.market);
    if (!marketState) {
      throw new Error('Raydium AMM market account not found');
    }
    const serumVaultSigner = deriveSerumVaultSigner(
      ammInfo.serumDex,
      ammInfo.market,
      marketState.vaultSignerNonce
    );
    const coinBal = await connection.getTokenAccountBalance(ammInfo.tokenCoin);
    const pcBal = await connection.getTokenAccountBalance(ammInfo.tokenPc);
    const coinReserve = BigInt(coinBal.value.amount)-ammInfo.output.needTakePnlCoin;
    const pcReserve = BigInt(pcBal.value.amount)-ammInfo.output.needTakePnlPc;
    if (coinReserve <= 0n || pcReserve <= 0n) throw new Error("AMM v4 vault reserves do not cover pending PnL");
    return new RaydiumAmmV4Params(
      amm,
      ammInfo.coinMint,
      ammInfo.pcMint,
      ammInfo.tokenCoin,
      ammInfo.tokenPc,
      ammInfo.openOrders,
      ammInfo.targetOrders,
      ammInfo.serumDex,
      ammInfo.market,
      marketState.serumBids,
      marketState.serumAsks,
      marketState.serumEventQueue,
      marketState.serumCoinVaultAccount,
      marketState.serumPcVaultAccount,
      serumVaultSigner,
      coinReserve,
      pcReserve,
      ammInfo.fees.swapFeeNumerator,
      ammInfo.fees.swapFeeDenominator
    );
  }
}

export class MeteoraDammV2Params {
  constructor(
    public pool: PublicKey,
    public tokenAVault: PublicKey,
    public tokenBVault: PublicKey,
    public tokenAMint: PublicKey,
    public tokenBMint: PublicKey,
    public tokenAProgram: PublicKey,
    public tokenBProgram: PublicKey
  ) {}

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<MeteoraDammV2Params> {
    const poolData = await fetchMeteoraPool(wrapConnection(connection), poolAddress);
    if (!poolData) {
      throw new Error('Meteora DAMM V2 pool not found');
    }
    return new MeteoraDammV2Params(
      poolAddress,
      poolData.tokenAVault,
      poolData.tokenBVault,
      poolData.tokenAMint,
      poolData.tokenBMint,
      TOKEN_PROGRAM,
      TOKEN_PROGRAM
    );
  }
}
