import { PublicKey, SystemInstruction, SystemProgram } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { CONSTANTS } from '../index';
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
