import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  CONSTANTS,
  pumpFunParamsFromParserTrade,
  pumpSwapParamsFromParserTrade,
} from '../index';

describe('decoded event parameter adapter helpers', () => {
  it('maps PumpFun quote reserves for USDC decoded events', () => {
    const params = pumpFunParamsFromParserTrade({
      quote_mint: CONSTANTS.USDC_TOKEN_ACCOUNT.toBase58(),
      virtual_token_reserves: 1_000_000n,
      virtual_sol_reserves: 30_000_000_000n,
      virtual_quote_reserves: 4_292_000_000n,
      real_token_reserves: 900_000n,
      real_sol_reserves: 20_000_000_000n,
      real_quote_reserves: 123_456n,
      token_program: CONSTANTS.TOKEN_PROGRAM.toBase58(),
      is_cashback_coin: true,
    });

    expect(params.quoteMint?.toBase58()).toBe(CONSTANTS.USDC_TOKEN_ACCOUNT.toBase58());
    expect(params.bondingCurve.virtualSolReserves).toBe(4_292_000_000n);
    expect(params.bondingCurve.realSolReserves).toBe(123_456n);
    expect(params.bondingCurve.isCashbackCoin).toBe(true);
  });

  it('preserves explicit zero PumpFun quote reserves from decoded events', () => {
    const params = pumpFunParamsFromParserTrade({
      quote_mint: CONSTANTS.USDC_TOKEN_ACCOUNT.toBase58(),
      virtual_token_reserves: 1_000_000n,
      virtual_sol_reserves: 30_000_000_000n,
      virtual_quote_reserves: 0n,
      real_token_reserves: 900_000n,
      real_sol_reserves: 20_000_000_000n,
      real_quote_reserves: 0n,
      token_program: CONSTANTS.TOKEN_PROGRAM.toBase58(),
    });

    expect(params.bondingCurve.virtualSolReserves).toBe(0n);
    expect(params.bondingCurve.realSolReserves).toBe(0n);
  });

  it('maps Solscan SOL quote mint to legacy PumpFun reserves', () => {
    const params = pumpFunParamsFromParserTrade({
      quote_mint: CONSTANTS.SOL_TOKEN_ACCOUNT.toBase58(),
      virtual_token_reserves: 1_000_000n,
      virtual_sol_reserves: 30_123_456_789n,
      virtual_quote_reserves: 0n,
      real_token_reserves: 900_000n,
      real_sol_reserves: 123_456_789n,
      real_quote_reserves: 0n,
      token_program: CONSTANTS.TOKEN_PROGRAM.toBase58(),
    });

    expect(params.quoteMint?.toBase58()).toBe(PublicKey.default.toBase58());
    expect(params.bondingCurve.virtualSolReserves).toBe(30_123_456_789n);
    expect(params.bondingCurve.realSolReserves).toBe(123_456_789n);
  });

  it('maps PumpSwap creator vault accounts from decoded events', () => {
    const vault = PublicKey.unique();
    const authority = PublicKey.unique();
    const params = pumpSwapParamsFromParserTrade({
      pool: PublicKey.unique(),
      base_mint: PublicKey.unique(),
      quote_mint: CONSTANTS.USDC_TOKEN_ACCOUNT,
      pool_base_token_account: PublicKey.unique(),
      pool_quote_token_account: PublicKey.unique(),
      pool_base_token_reserves: 10n,
      pool_quote_token_reserves: 20n,
      virtual_quote_reserves: -7n,
      coin_creator_vault_ata: vault,
      coin_creator_vault_authority: authority,
      base_token_program: CONSTANTS.TOKEN_PROGRAM,
      quote_token_program: CONSTANTS.TOKEN_PROGRAM,
    });

    expect(params.coinCreatorVaultAta.toBase58()).toBe(vault.toBase58());
    expect(params.coinCreatorVaultAuthority.toBase58()).toBe(authority.toBase58());
    expect(params.poolBaseTokenReserves).toBe(10n);
    expect(params.poolQuoteTokenReserves).toBe(20n);
    expect(params.virtualQuoteReserves).toBe(-7n);
  });

  it('preserves PumpSwap u64 reserves beyond the JavaScript safe integer range', () => {
    const largeReserve = (BigInt(1) << BigInt(53)) + BigInt(123);
    const params = pumpSwapParamsFromParserTrade({
      pool_base_token_reserves: largeReserve.toString(),
      pool_quote_token_reserves: largeReserve,
      virtual_quote_reserves: '-123',
    });

    expect(params.poolBaseTokenReserves).toBe(largeReserve);
    expect(params.poolQuoteTokenReserves).toBe(largeReserve);
    expect(params.virtualQuoteReserves).toBe(-123n);
  });

  it('rejects unsafe number and out-of-range PumpSwap event values', () => {
    expect(() => pumpSwapParamsFromParserTrade({
      pool_quote_token_reserves: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow('must be provided as bigint or string');
    expect(() => pumpSwapParamsFromParserTrade({
      virtual_quote_reserves: BigInt(1) << BigInt(127),
    })).toThrow('outside the signed i128 range');
    expect(() => pumpSwapParamsFromParserTrade({
      pool_quote_token_reserves: BigInt(1) << BigInt(64),
    })).toThrow('outside the u64 range');
  });

  it('maps PumpSwap fee basis points from decoded events', () => {
    const creator = PublicKey.unique();
    const params = pumpSwapParamsFromParserTrade({
      pool: PublicKey.unique(),
      base_mint: PublicKey.unique(),
      quote_mint: CONSTANTS.USDC_TOKEN_ACCOUNT,
      pool_base_token_account: PublicKey.unique(),
      pool_quote_token_account: PublicKey.unique(),
      pool_base_token_reserves: 10n,
      pool_quote_token_reserves: 20n,
      coin_creator_vault_ata: PublicKey.unique(),
      coin_creator_vault_authority: PublicKey.unique(),
      base_token_program: CONSTANTS.TOKEN_PROGRAM,
      quote_token_program: CONSTANTS.TOKEN_PROGRAM,
      coin_creator: creator,
      cashback_fee_basis_points: 4n,
      lp_fee_basis_points: 20n,
      protocol_fee_basis_points: 5n,
      coin_creator_fee_basis_points: 75n,
    });

    expect(params.coinCreator?.toBase58()).toBe(creator.toBase58());
    expect(params.cashbackFeeBasisPoints).toBe(4n);
    expect(params.feeBasisPoints).toEqual({
      lpFeeBasisPoints: 20n,
      protocolFeeBasisPoints: 5n,
      coinCreatorFeeBasisPoints: 75n,
    });
  });
});

 describe('PumpFun exact parser integers', () => {
  it('preserves full u64 range and curve quote context', () => {
    const maximum = (1n << 64n) - 1n;
    const p = pumpFunParamsFromParserTrade({quote_mint: CONSTANTS.USDC_TOKEN_ACCOUNT, virtual_token_reserves: maximum.toString(), virtual_quote_reserves: maximum});
    expect(p.bondingCurve.virtualTokenReserves).toBe(maximum);
    expect(p.bondingCurve.virtualSolReserves).toBe(maximum);
    expect(p.bondingCurve.quoteMint).toEqual(CONSTANTS.USDC_TOKEN_ACCOUNT);
  });
  it.each([-1n, 1n << 64n, Number.MAX_SAFE_INTEGER + 1, 1.5, NaN, Infinity, '1e3', '0x10', ' 1 '])('rejects invalid reserves %s', value => {
    expect(() => pumpFunParamsFromParserTrade({virtual_token_reserves: value})).toThrow();
  });
});
