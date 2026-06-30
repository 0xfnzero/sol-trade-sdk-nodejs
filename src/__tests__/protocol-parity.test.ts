import { PublicKey, SystemInstruction, SystemProgram } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { CONSTANTS } from '../index';
import { PumpSwapParams as RpcPumpSwapParams } from '../params';
import {
  RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR,
  buildRaydiumAmmV4BuyInstructions,
} from '../instruction/raydium_amm_v4_builder';
import {
  METEORA_DAMM_V2_PROGRAM_ID,
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR,
  METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL,
  buildMeteoraDammV2BuyInstructions,
} from '../instruction/meteora_damm_v2_builder';
import {
  PUMPFUN_BUY_V2_DISCRIMINATOR,
  buildPumpFunBuyInstructions,
} from '../instruction/pumpfun_builder';
import {
  PUMPSWAP_BUY_DISCRIMINATOR,
  PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,
  PUMPSWAP_SELL_DISCRIMINATOR,
  buildBuyInstructions as buildPumpSwapBuyInstructions,
  buildSellInstructions as buildPumpSwapSellInstructions,
  getPumpPoolAuthorityPDA,
  getAssociatedTokenAddress as getPumpSwapAssociatedTokenAddress,
  getPoolV2PDA,
  type PumpSwapParams,
} from '../instruction/pumpswap';
import {
  RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR,
  buildRaydiumCpmmBuyInstructions,
} from '../instruction/raydium_cpmm_builder';

function pk(seed: number): PublicKey {
  return new PublicKey(new Uint8Array(32).fill(seed));
}

function pumpFunProtocolParams(quoteMint: PublicKey = PublicKey.default) {
  return {
    bondingCurve: {
      account: PublicKey.default,
      virtualTokenReserves: 1_073_000_000_000_000n,
      virtualSolReserves: 30_000_000_000n,
      realTokenReserves: 793_100_000_000_000n,
      creator: pk(7),
      isMayhemMode: false,
      isCashbackCoin: false,
    },
    creatorVault: pk(8),
    tokenProgram: CONSTANTS.TOKEN_PROGRAM,
    quoteMint,
  };
}

function pumpSwapProtocolParams(overrides: Partial<PumpSwapParams> = {}): PumpSwapParams {
  return {
    pool: pk(21),
    baseMint: pk(22),
    quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
    poolBaseTokenAccount: pk(23),
    poolQuoteTokenAccount: pk(24),
    poolBaseTokenReserves: 1_000_000_000_000n,
    poolQuoteTokenReserves: 4_500_000_000n,
    coinCreatorVaultAta: pk(25),
    coinCreatorVaultAuthority: pk(26),
    baseTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    quoteTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    isMayhemMode: false,
    isCashbackCoin: false,
    coinCreator: pk(27),
    feeBasisPoints: {
      lpFeeBasisPoints: 20n,
      protocolFeeBasisPoints: 5n,
      coinCreatorFeeBasisPoints: 75n,
    },
    ...overrides,
  };
}

function feeConfigBytes(): Buffer {
  const chunks: Buffer[] = [Buffer.alloc(8), Buffer.from([1]), pk(55).toBuffer()];
  const pushU64 = (value: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value);
    chunks.push(buf);
  };
  const pushU128 = (value: bigint) => {
    const buf = Buffer.alloc(16);
    buf.writeBigUInt64LE(value, 0);
    chunks.push(buf);
  };
  pushU64(30n);
  pushU64(7n);
  pushU64(9n);
  chunks.push(Buffer.from([2, 0, 0, 0]));
  pushU128(0n);
  pushU64(25n);
  pushU64(5n);
  pushU64(5n);
  pushU128(1_000n);
  pushU64(20n);
  pushU64(5n);
  pushU64(75n);
  chunks.push(Buffer.from([0, 0, 0, 0]));
  return Buffer.concat(chunks);
}

function mintBytes(supply: bigint): Buffer {
  const data = Buffer.alloc(82);
  data.writeBigUInt64LE(supply, 36);
  return data;
}

function poolBytes(pool: {
  poolBump: number;
  index: number;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  lpSupply: bigint;
  coinCreator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}): Buffer {
  const data = Buffer.alloc(8 + 244);
  let offset = 8;
  data.writeUInt8(pool.poolBump, offset);
  offset += 1;
  data.writeUInt16LE(pool.index, offset);
  offset += 2;
  pool.creator.toBuffer().copy(data, offset);
  offset += 32;
  pool.baseMint.toBuffer().copy(data, offset);
  offset += 32;
  pool.quoteMint.toBuffer().copy(data, offset);
  offset += 32;
  pool.lpMint.toBuffer().copy(data, offset);
  offset += 32;
  pool.poolBaseTokenAccount.toBuffer().copy(data, offset);
  offset += 32;
  pool.poolQuoteTokenAccount.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(pool.lpSupply, offset);
  offset += 8;
  pool.coinCreator.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(pool.isMayhemMode ? 1 : 0, offset);
  offset += 1;
  data.writeUInt8(pool.isCashbackCoin ? 1 : 0, offset);
  return data;
}

function fakePumpSwapConnection(poolAddress: PublicKey, pool: ReturnType<typeof poolBytes>, baseMint: PublicKey, balances: Map<string, bigint>) {
  return {
    getAccountInfo: async (pubkey: PublicKey) => {
      if (pubkey.equals(poolAddress)) return { data: pool, owner: PublicKey.default };
      if (pubkey.equals(baseMint)) return { data: mintBytes(10_000n), owner: PublicKey.default };
      // PUMPSWAP_FEE_CONFIG is intentionally not imported into this test surface.
      // Returning FeeConfig for unknown account requests is enough for this fixture.
      return { data: feeConfigBytes(), owner: PublicKey.default };
    },
    getTokenAccountBalance: async (pubkey: PublicKey) => ({
      value: { amount: String(balances.get(pubkey.toBase58()) ?? 0n) },
    }),
  } as any;
}

describe('protocol instruction parity', () => {
  it('uses Raydium CPMM swap_base_out for fixed-output buys', () => {
    const ixs = buildRaydiumCpmmBuyInstructions({
      payer: pk(99),
      outputMint: pk(2),
      inputAmount: 100_000n,
      fixedOutputAmount: 42n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        ammConfig: pk(1),
        baseMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
        quoteMint: pk(2),
        baseTokenProgram: CONSTANTS.TOKEN_PROGRAM,
        quoteTokenProgram: CONSTANTS.TOKEN_PROGRAM,
        baseReserve: 1_000_000_000n,
        quoteReserve: 2_000_000_000n,
      },
    });
    const ix = ixs.at(-1)!;

    expect([...ix.data.subarray(0, 8)]).toEqual([...RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR]);
    expect(ix.data.readBigUInt64LE(8)).toBe(100_000n);
    expect(ix.data.readBigUInt64LE(16)).toBe(42n);
  });

  it('builds Raydium AMM V4 with the IDL market account order', () => {
    const ixs = buildRaydiumAmmV4BuyInstructions({
      payer: pk(99),
      outputMint: pk(2),
      inputAmount: 100_000n,
      fixedOutputAmount: 42n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        amm: pk(1),
        coinMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
        pcMint: pk(2),
        tokenCoin: pk(3),
        tokenPc: pk(4),
        ammOpenOrders: pk(5),
        ammTargetOrders: pk(6),
        serumProgram: pk(7),
        serumMarket: pk(8),
        serumBids: pk(9),
        serumAsks: pk(10),
        serumEventQueue: pk(11),
        serumCoinVaultAccount: pk(12),
        serumPcVaultAccount: pk(13),
        serumVaultSigner: pk(14),
        coinReserve: 1_000_000_000n,
        pcReserve: 2_000_000_000n,
      },
    });
    const ix = ixs.at(-1)!;

    expect(ix.keys).toHaveLength(18);
    expect(ix.data[0]).toBe(RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR[0]);
    expect(ix.keys[3]!.pubkey.toBase58()).toBe(pk(5).toBase58());
    expect(ix.keys[4]!.pubkey.toBase58()).toBe(pk(6).toBase58());
    expect(ix.keys[7]!.pubkey.toBase58()).toBe(pk(7).toBase58());
    expect(ix.keys[14]!.pubkey.toBase58()).toBe(pk(14).toBase58());
  });

  it('rejects Raydium AMM V4 buy output mint mismatches before building', () => {
    expect(() =>
      buildRaydiumAmmV4BuyInstructions({
        payer: pk(99),
        outputMint: pk(3),
        inputAmount: 100_000n,
        fixedOutputAmount: 42n,
        createInputMintAta: false,
        createOutputMintAta: false,
        protocolParams: {
          amm: pk(1),
          coinMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
          pcMint: pk(2),
          tokenCoin: pk(3),
          tokenPc: pk(4),
          ammOpenOrders: pk(5),
          ammTargetOrders: pk(6),
          serumProgram: pk(7),
          serumMarket: pk(8),
          serumBids: pk(9),
          serumAsks: pk(10),
          serumEventQueue: pk(11),
          serumCoinVaultAccount: pk(12),
          serumPcVaultAccount: pk(13),
          serumVaultSigner: pk(14),
          coinReserve: 1_000_000_000n,
          pcReserve: 2_000_000_000n,
        },
      })
    ).toThrow(/outputMint/);
  });

  it('builds Meteora DAMM V2 swap2 partial-fill data and accounts', () => {
    const ixs = buildMeteoraDammV2BuyInstructions({
      payer: pk(99),
      inputMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
      outputMint: pk(2),
      inputAmount: 100_000n,
      fixedOutputAmount: 42n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        pool: pk(1),
        tokenAMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
        tokenBMint: pk(2),
        tokenAVault: pk(3),
        tokenBVault: pk(4),
        tokenAProgram: CONSTANTS.TOKEN_PROGRAM,
        tokenBProgram: CONSTANTS.TOKEN_PROGRAM,
      },
    });
    const ix = ixs.at(-1)!;

    expect(ix.keys).toHaveLength(13);
    expect([...ix.data.subarray(0, 8)]).toEqual([...METEORA_DAMM_V2_SWAP2_DISCRIMINATOR]);
    expect(ix.data[24]).toBe(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL);
    expect(ix.keys[12]!.pubkey.toBase58()).toBe(METEORA_DAMM_V2_PROGRAM_ID.toBase58());
  });

  it('normalizes SOL input aliases to WSOL for Meteora DAMM V2', () => {
    const ixs = buildMeteoraDammV2BuyInstructions({
      payer: pk(99),
      inputMint: CONSTANTS.SOL_TOKEN_ACCOUNT,
      outputMint: pk(2),
      inputAmount: 100_000n,
      fixedOutputAmount: 42n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        pool: pk(1),
        tokenAMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
        tokenBMint: pk(2),
        tokenAVault: pk(3),
        tokenBVault: pk(4),
        tokenAProgram: CONSTANTS.TOKEN_PROGRAM,
        tokenBProgram: CONSTANTS.TOKEN_PROGRAM,
      },
    });

    expect(ixs.at(-1)!.keys[6]!.pubkey.toBase58()).toBe(CONSTANTS.WSOL_TOKEN_ACCOUNT.toBase58());
  });

  it('builds PumpFun V2 buy with the current 27-account layout', () => {
    const creatorVault = pk(8);
    const ixs = buildPumpFunBuyInstructions({
      payer: pk(99),
      inputMint: CONSTANTS.USDC_TOKEN_ACCOUNT,
      outputMint: pk(2),
      inputAmount: 100_000n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: pumpFunProtocolParams(CONSTANTS.USDC_TOKEN_ACCOUNT),
    });
    const ix = ixs.at(-1)!;

    expect(ix.keys).toHaveLength(27);
    expect(ix.keys[16]!.pubkey.toBase58()).toBe(creatorVault.toBase58());
    expect(ix.keys[18]!.isWritable).toBe(false);
  });

  it('uses buy_v2 for PumpFun V2 fixed-output buys', () => {
    const ixs = buildPumpFunBuyInstructions({
      payer: pk(99),
      inputMint: CONSTANTS.SOL_TOKEN_ACCOUNT,
      outputMint: pk(2),
      inputAmount: 100_000n,
      fixedOutputAmount: 42n,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: pumpFunProtocolParams(CONSTANTS.WSOL_TOKEN_ACCOUNT),
    });
    const ix = ixs.at(-1)!;

    expect([...ix.data.subarray(0, 8)]).toEqual([...PUMPFUN_BUY_V2_DISCRIMINATOR]);
    expect(ix.data.readBigUInt64LE(8)).toBe(42n);
    expect(ix.data.readBigUInt64LE(16)).toBe(100_000n);
  });

  it('uses PumpSwap fee bps from params for exact quote buy math', () => {
    const params20_5_75 = pumpSwapProtocolParams();
    const params25_5_5 = pumpSwapProtocolParams({
      feeBasisPoints: {
        lpFeeBasisPoints: 25n,
        protocolFeeBasisPoints: 5n,
        coinCreatorFeeBasisPoints: 5n,
      },
    });

    const current = buildPumpSwapBuyInstructions({
      payer: pk(99),
      inputAmount: 1_000_000n,
      slippageBasisPoints: 300n,
      protocolParams: params20_5_75,
      createInputMintAta: false,
      createOutputMintAta: false,
      useExactQuoteAmount: true,
    }).at(-1)!;
    const legacy = buildPumpSwapBuyInstructions({
      payer: pk(99),
      inputAmount: 1_000_000n,
      slippageBasisPoints: 300n,
      protocolParams: params25_5_5,
      createInputMintAta: false,
      createOutputMintAta: false,
      useExactQuoteAmount: true,
    }).at(-1)!;

    expect([...current.data.subarray(0, 8)]).toEqual([
      ...PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,
    ]);
    expect(current.data.length).toBe(25);
    expect(current.data.readBigUInt64LE(16)).not.toBe(legacy.data.readBigUInt64LE(16));
  });

  it('uses PumpSwap buy discriminator for fixed output buys', () => {
    const ix = buildPumpSwapBuyInstructions({
      payer: pk(99),
      inputAmount: 1_000_000n,
      fixedOutputAmount: 123n,
      slippageBasisPoints: 300n,
      protocolParams: pumpSwapProtocolParams(),
      createInputMintAta: false,
      createOutputMintAta: false,
      useExactQuoteAmount: true,
    }).at(-1)!;

    expect([...ix.data.subarray(0, 8)]).toEqual([...PUMPSWAP_BUY_DISCRIMINATOR]);
    expect(ix.data.length).toBe(25);
    expect(ix.data.readBigUInt64LE(8)).toBe(123n);
    expect(ix.data.readUInt8(24)).toBe(0);
  });

  it('uses PumpSwap buy two-arg data for reverse sell path', () => {
    const payer = pk(99);
    const quoteMint = pk(22);
    const reverseParams = pumpSwapProtocolParams({
      baseMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
      quoteMint,
    });
    const ixs = buildPumpSwapSellInstructions({
      payer,
      inputAmount: 1_000_000n,
      slippageBasisPoints: 300n,
      protocolParams: reverseParams,
      createOutputMintAta: false,
      closeInputMintAta: true,
    });
    const ix = ixs.at(-2)!;
    const closeIx = ixs.at(-1)!;
    const userQuoteAta = getPumpSwapAssociatedTokenAddress(
      payer,
      quoteMint,
      CONSTANTS.TOKEN_PROGRAM
    );

    expect(closeIx.keys[0]!.pubkey.toBase58()).toBe(userQuoteAta.toBase58());
    expect(closeIx.programId.toBase58()).toBe(CONSTANTS.TOKEN_PROGRAM.toBase58());

    expect([...ix.data.subarray(0, 8)]).toEqual([...PUMPSWAP_BUY_DISCRIMINATOR]);
    expect(ix.data.length).toBe(24);
    expect([...PUMPSWAP_SELL_DISCRIMINATOR]).not.toEqual([...ix.data.subarray(0, 8)]);
  });

  it('omits PumpSwap pool-v2 when known coin_creator is default', () => {
    const baseMint = pk(22);
    const ix = buildPumpSwapBuyInstructions({
      payer: pk(99),
      inputAmount: 1_000_000n,
      slippageBasisPoints: 300n,
      protocolParams: pumpSwapProtocolParams({
        baseMint,
        coinCreator: PublicKey.default,
        feeBasisPoints: {
          lpFeeBasisPoints: 20n,
          protocolFeeBasisPoints: 5n,
          coinCreatorFeeBasisPoints: 75n,
        },
      }),
      createInputMintAta: false,
      createOutputMintAta: false,
      useExactQuoteAmount: true,
    }).at(-1)!;

    const poolV2 = getPoolV2PDA(baseMint).toBase58();
    expect(ix.keys.map((key) => key.pubkey.toBase58())).not.toContain(poolV2);
  });

  it('auto-discovers PumpSwap fee bps in the RPC params helper', async () => {
    const baseMint = pk(31);
    const poolAddress = pk(32);
    const coinCreator = pk(33);
    const pool = {
      poolBump: 1,
      index: 0,
      creator: getPumpPoolAuthorityPDA(baseMint),
      baseMint,
      quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
      lpMint: pk(34),
      poolBaseTokenAccount: getPumpSwapAssociatedTokenAddress(
        poolAddress,
        baseMint,
        CONSTANTS.TOKEN_PROGRAM
      ),
      poolQuoteTokenAccount: getPumpSwapAssociatedTokenAddress(
        poolAddress,
        CONSTANTS.WSOL_TOKEN_ACCOUNT,
        CONSTANTS.TOKEN_PROGRAM
      ),
      lpSupply: 100n,
      coinCreator,
      isMayhemMode: false,
      isCashbackCoin: false,
    };
    const balances = new Map<string, bigint>([
      [pool.poolBaseTokenAccount.toBase58(), 1_000n],
      [pool.poolQuoteTokenAccount.toBase58(), 1_000n],
    ]);

    const params = await RpcPumpSwapParams.fromPoolAddressByRpc(
      fakePumpSwapConnection(poolAddress, poolBytes(pool), baseMint, balances),
      poolAddress
    );

    expect(params.feeBasisPoints).toEqual({
      lpFeeBasisPoints: 20n,
      protocolFeeBasisPoints: 5n,
      coinCreatorFeeBasisPoints: 75n,
    });
    expect(params.baseMintSupply).toBe(10_000n);
  });

  it('preserves manual PumpSwap fee bps in the RPC params helper', async () => {
    const baseMint = pk(35);
    const poolAddress = pk(36);
    const pool = {
      poolBump: 1,
      index: 0,
      creator: getPumpPoolAuthorityPDA(baseMint),
      baseMint,
      quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
      lpMint: pk(37),
      poolBaseTokenAccount: getPumpSwapAssociatedTokenAddress(
        poolAddress,
        baseMint,
        CONSTANTS.TOKEN_PROGRAM
      ),
      poolQuoteTokenAccount: getPumpSwapAssociatedTokenAddress(
        poolAddress,
        CONSTANTS.WSOL_TOKEN_ACCOUNT,
        CONSTANTS.TOKEN_PROGRAM
      ),
      lpSupply: 100n,
      coinCreator: pk(38),
      isMayhemMode: false,
      isCashbackCoin: false,
    };
    const balances = new Map<string, bigint>([
      [pool.poolBaseTokenAccount.toBase58(), 1_000n],
      [pool.poolQuoteTokenAccount.toBase58(), 1_000n],
    ]);

    const params = await RpcPumpSwapParams.fromPoolAddressByRpc(
      fakePumpSwapConnection(poolAddress, poolBytes(pool), baseMint, balances),
      poolAddress,
      {
        lpFeeBasisPoints: 99n,
        protocolFeeBasisPoints: 88n,
        coinCreatorFeeBasisPoints: 77n,
      }
    );

    expect(params.feeBasisPoints).toEqual({
      lpFeeBasisPoints: 99n,
      protocolFeeBasisPoints: 88n,
      coinCreatorFeeBasisPoints: 77n,
    });
  });

  it('wraps the max quote budget for regular PumpFun V2 WSOL buys', () => {
    const ixs = buildPumpFunBuyInstructions({
      payer: pk(99),
      inputMint: CONSTANTS.SOL_TOKEN_ACCOUNT,
      outputMint: pk(2),
      inputAmount: 100_000n,
      slippageBasisPoints: 1000n,
      useExactSolAmount: false,
      createInputMintAta: true,
      createOutputMintAta: false,
      protocolParams: pumpFunProtocolParams(CONSTANTS.WSOL_TOKEN_ACCOUNT),
    });

    expect(ixs[1]!.programId.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(BigInt(SystemInstruction.decodeTransfer(ixs[1]!).lamports)).toBe(110_000n);
  });
});
