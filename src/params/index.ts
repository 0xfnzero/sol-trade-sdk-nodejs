/**
 * DEX parameters — RPC loaders aligned with Rust `src/trading/core/params.rs`
 */

import { PublicKey, Connection } from '@solana/web3.js';
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  BONK_PROGRAM,
} from '../constants';
import {
  getBondingCurvePda,
  getCreatorVaultPda,
} from '../instruction/pumpfun_builder';
import {
  findByMint as findPumpSwapPoolByMint,
  fetchPool as fetchPumpSwapPool,
  getTokenBalances as getPumpSwapTokenBalances,
  getAssociatedTokenAddress as getPumpSwapAta,
  getCoinCreatorVaultAta,
  getCoinCreatorVaultAuthority,
  type PumpSwapPool,
} from '../instruction/pumpswap';
import {
  fetchBonkPoolState,
  getBonkPoolPDA,
} from '../instruction/bonk_builder';
import {
  fetchRaydiumCPMMpoolState,
  getRaydiumCPMMpoolTokenBalances,
} from '../instruction/raydium_cpmm_builder';
import { fetchAmmInfo } from '../instruction/raydium_amm_v4_builder';
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

// ============== Bonding Curve ==============

export interface BondingCurveAccount {
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
}

function decodePumpFunBondingCurveData(
  data: Buffer,
  bondingCurveAddr: PublicKey
): BondingCurveAccount {
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
  return {
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
  };
}

export class PumpFunParams {
  constructor(
    public bondingCurve: BondingCurveAccount,
    public associatedBondingCurve: PublicKey,
    public creatorVault: PublicKey,
    public tokenProgram: PublicKey,
    public closeTokenAccountWhenSell?: boolean
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
  }): PumpFunParams {
    const isMayhemMode = false;
    return new PumpFunParams(
      {
        discriminator: 0,
        account: params.bondingCurve,
        virtualTokenReserves: params.virtualTokenReserves,
        virtualSolReserves: params.virtualSolReserves,
        realTokenReserves: params.realTokenReserves,
        realSolReserves: params.realSolReserves,
        tokenTotalSupply: BigInt(0),
        complete: false,
        creator: params.creator,
        isMayhemMode,
        isCashbackCoin: params.isCashbackCoin,
      },
      params.associatedBondingCurve,
      params.creatorVault,
      params.tokenProgram,
      params.closeTokenAccountWhenSell
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
    const bondingCurve = decodePumpFunBondingCurveData(
      accountInfo.data,
      bondingCurveAddr
    );
    const mintAccount = await connection.getAccountInfo(mint);
    const tokenProgram = mintAccount?.owner ?? TOKEN_PROGRAM;
    const associatedBondingCurve = getPumpSwapAta(
      bondingCurveAddr,
      mint,
      tokenProgram
    );
    const creatorVault = getCreatorVaultPda(bondingCurve.creator);
    return new PumpFunParams(
      bondingCurve,
      associatedBondingCurve,
      creatorVault,
      tokenProgram
    );
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
    public coinCreatorVaultAta: PublicKey,
    public coinCreatorVaultAuthority: PublicKey,
    public baseTokenProgram: PublicKey,
    public quoteTokenProgram: PublicKey,
    public isMayhemMode: boolean,
    public isCashbackCoin: boolean
  ) {}

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<PumpSwapParams> {
    const pool = await fetchPumpSwapPool(wrapConnection(connection), poolAddress);
    if (!pool) {
      throw new Error('PumpSwap pool account not found or invalid');
    }
    return PumpSwapParams.fromPoolData(connection, poolAddress, pool);
  }

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey
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
      found.pool
    );
  }

  private static async fromPoolData(
    connection: Connection,
    poolAddress: PublicKey,
    pool: PumpSwapPool
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
    return new PumpSwapParams(
      poolAddress,
      pool.baseMint,
      pool.quoteMint,
      pool.poolBaseTokenAccount,
      pool.poolQuoteTokenAccount,
      balances.baseBalance,
      balances.quoteBalance,
      getCoinCreatorVaultAta(pool.coinCreator, pool.quoteMint),
      getCoinCreatorVaultAuthority(pool.coinCreator),
      baseTokenProgram,
      quoteTokenProgram,
      pool.isMayhemMode,
      pool.isCashbackCoin
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
    public coinReserve: number,
    public pcReserve: number
  ) {}

  static async fromAmmAddressByRpc(
    connection: Connection,
    amm: PublicKey
  ): Promise<RaydiumAmmV4Params> {
    const ammInfo = await fetchAmmInfo(wrapConnection(connection), amm);
    if (!ammInfo) {
      throw new Error('Raydium AMM account not found');
    }
    const coinBal = await connection.getTokenAccountBalance(ammInfo.tokenCoin);
    const pcBal = await connection.getTokenAccountBalance(ammInfo.tokenPc);
    const coinReserve = Number(coinBal.value.amount);
    const pcReserve = Number(pcBal.value.amount);
    return new RaydiumAmmV4Params(
      amm,
      ammInfo.coinMint,
      ammInfo.pcMint,
      ammInfo.tokenCoin,
      ammInfo.tokenPc,
      coinReserve,
      pcReserve
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
