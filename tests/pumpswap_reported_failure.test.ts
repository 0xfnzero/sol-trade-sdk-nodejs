import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import * as ps from '../src/instruction/pumpswap';
import { TOKEN_PROGRAM_2022 } from '../src/constants';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pumpswap_reported_failure.json', import.meta.url), 'utf8'));
const key = (i: number) => new PublicKey(fixture.instruction_accounts[i]);
const payer = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey;
function pool(): ps.PumpSwapParams {
  const account = (address: PublicKey) => Buffer.from(fixture.accounts.find((a: any) => a.address === address.toBase58()).data_base64, 'base64');
  const state = ps.decodePoolPayload(account(key(0)).subarray(8))!;
  return {
    pool: key(0), baseMint: key(3), quoteMint: key(4),
    poolBaseTokenAccount: key(7), poolQuoteTokenAccount: key(8),
    poolBaseTokenReserves: account(key(7)).readBigUInt64LE(64),
    poolQuoteTokenReserves: account(key(8)).readBigUInt64LE(64),
    virtualQuoteReserves: state.virtualQuoteReserves,
    baseTokenProgram: key(11), quoteTokenProgram: key(12),
    coinCreator: state.coinCreator,
    coinCreatorVaultAuthority: ps.getCoinCreatorVaultAuthority(state.coinCreator),
    coinCreatorVaultAta: ps.getCoinCreatorVaultAta(state.coinCreator, key(4), key(12)),
    isMayhemMode: false, isCashbackCoin: false,
    protocolFeeRecipientOverride: key(9), protocolExtraFeeRecipientOverride: key(24),
  };
}
function request(protocolParams = pool()) {
  return { payer, protocolParams, inputMint: protocolParams.quoteMint, outputMint: protocolParams.baseMint,
    inputAmount: 1_000_000n, fixedOutputAmount: 1_000_000n, slippageBasisPoints: 100n,
    createInputMintAta: false, createOutputMintAta: false };
}

it('rebuilds the real 3007 Buy payload with valid creator accounts', () => {
  const original = Buffer.from(bs58.decode(fixture.instruction_data_base58));
  const ix = ps.buildBuyInstructions({ ...request(), inputAmount: original.readBigUInt64LE(16), fixedOutputAmount: original.readBigUInt64LE(8) })[0]!;
  expect(ix.data).toEqual(original);
  expect(fixture.error).toEqual({ InstructionError: [5, { Custom: 3007 }] });
  expect(key(17)).toEqual(PublicKey.default); expect(key(18)).toEqual(PublicKey.default);
  expect(ix.keys[17]!.pubkey.toBase58()).toBe(fixture.correct_creator_vault_ata);
  expect(ix.keys[18]!.pubkey.toBase58()).toBe(fixture.correct_creator_vault_authority);
  for (const i of [0, 3, 4, 7, 8, 11, 12]) expect(ix.keys[i]!.pubkey).toEqual(key(i));
});

it('rejects missing creator fields, wrong quote program derivation, and colliding vaults for both APIs', () => {
  for (const change of [
    { coinCreatorVaultAta: PublicKey.default }, { coinCreatorVaultAuthority: PublicKey.default },
    { coinCreatorVaultAta: PublicKey.default, coinCreatorVaultAuthority: PublicKey.default },
    { coinCreator: undefined }, { coinCreatorVaultAta: undefined },
    { baseTokenProgram: undefined }, { quoteTokenProgram: undefined },
    { coinCreatorVaultAta: ps.getCoinCreatorVaultAta(pool().coinCreator!, key(4), TOKEN_PROGRAM_2022) },
    { poolQuoteTokenAccount: key(7) },
    { protocolFeeRecipientOverride: PublicKey.default }, { protocolExtraFeeRecipientOverride: PublicKey.default },
  ]) {
    const bad = { ...pool(), ...change } as ps.PumpSwapParams;
    for (const build of [ps.buildBuyInstructions, ps.buildSellInstructions]) expect(() => build(request(bad))).toThrow(/PumpSwap/);
  }
});

it('honors explicit current fee recipients in normal and mayhem pools', () => {
  for (const isMayhemMode of [false, true]) for (const buy of [true, false]) {
    const p = { ...pool(), isMayhemMode };
    const args = { ...request(p), fixedOutputAmount: undefined,
      inputMint: buy ? p.quoteMint : p.baseMint, outputMint: buy ? p.baseMint : p.quoteMint };
    const ix = (buy ? ps.buildBuyInstructions : ps.buildSellInstructions)(args)[0]!;
    expect(ix.keys[9]!.pubkey).toEqual(key(9));
    expect(ix.keys.at(-2)!.pubkey).toEqual(key(24));
    expect(ix.keys[10]!.pubkey).toEqual(ps.getAssociatedTokenAddress(key(9), p.quoteMint, p.quoteTokenProgram));
    expect(ix.keys.at(-1)!.pubkey).toEqual(ps.getAssociatedTokenAddress(key(24), p.quoteMint, p.quoteTokenProgram));
  }
});

it('exports the common small exact-output Buy for independent cross-language comparison', () => {
  const ix = ps.buildBuyInstructions(request())[0]!;
  const fromSell = ps.buildSellInstructions(request())[0]!;
  expect(fromSell).toEqual(ix);
  // Pump AMM IDL marks global_volume_accumulator readonly in both Buy forms.
  expect(ix.keys[19]!.isWritable).toBe(false);
  expect(ps.buildBuyInstructions({ ...request(), fixedOutputAmount: undefined })[0]!.keys[19]!.isWritable).toBe(false);
  const directory = process.env.PUMPSWAP_FIXTURE_EXPORT_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'nodejs.json'), JSON.stringify({
      program: ix.programId.toBase58(), payer: payer.toBase58(), data_base64: ix.data.toString('base64'),
      accounts: ix.keys.map(a => ({ pubkey: a.pubkey.toBase58(), is_signer: a.isSigner, is_writable: a.isWritable })),
    }, null, 2));
  }
});
