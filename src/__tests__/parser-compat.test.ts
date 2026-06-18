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
    expect(params.bondingCurve.virtualSolReserves).toBe(4_292_000_000);
    expect(params.bondingCurve.realSolReserves).toBe(123_456);
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

    expect(params.bondingCurve.virtualSolReserves).toBe(0);
    expect(params.bondingCurve.realSolReserves).toBe(0);
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
    expect(params.bondingCurve.virtualSolReserves).toBe(30_123_456_789);
    expect(params.bondingCurve.realSolReserves).toBe(123_456_789);
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
      coin_creator_vault_ata: vault,
      coin_creator_vault_authority: authority,
      base_token_program: CONSTANTS.TOKEN_PROGRAM,
      quote_token_program: CONSTANTS.TOKEN_PROGRAM,
    });

    expect(params.coinCreatorVaultAta.toBase58()).toBe(vault.toBase58());
    expect(params.coinCreatorVaultAuthority.toBase58()).toBe(authority.toBase58());
  });
});
