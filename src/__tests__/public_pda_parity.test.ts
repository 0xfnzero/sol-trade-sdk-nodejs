import {describe,it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import * as seed from '../seed/pda';
import {CONSTANTS,SDK_MAYHEM_FEE_RECIPIENTS,PUMPSWAP_DISCRIMINATORS} from '../constants';
import {PUMPFUN_MAYHEM_FEE_RECIPIENTS,getBondingCurvePda,PUMPFUN_GLOBAL_ACCOUNT,PUMPFUN_EVENT_AUTHORITY} from '../instruction/pumpfun_builder';
import {validateProgramId} from '../security/validators';
describe('public PDA/constants match instruction builders',()=>{
 it('uses the real mainnet programs and rejects fabricated prior addresses',()=>{
  expect(seed.PUMPFUN_PROGRAM_ID).toBe(CONSTANTS.PUMPFUN_PROGRAM.toBase58());
  expect(seed.PUMPSWAP_PROGRAM_ID).toBe(CONSTANTS.PUMPSWAP_PROGRAM.toBase58());
  expect(seed.RAYDIUM_CPMM_PROGRAM_ID).toBe(CONSTANTS.RAYDIUM_CPMM_PROGRAM.toBase58());
  expect(seed.METEORA_DAMM_V2_PROGRAM_ID).toBe(CONSTANTS.METEORA_DAMM_V2_PROGRAM.toBase58());
  for(const [key,program] of [['pumpfun',seed.PUMPFUN_PROGRAM_ID],['pumpswap',seed.PUMPSWAP_PROGRAM_ID],['raydium',seed.RAYDIUM_CPMM_PROGRAM_ID],['meteora',seed.METEORA_DAMM_V2_PROGRAM_ID]])expect(validateProgramId(program!,key!)).toBe(program);
  expect(()=>validateProgramId('6EF8rrecthR5Dkzon8Nwu78hRvfCKopJFfWcCzNfXt3D','pumpfun')).toThrow();
  expect(SDK_MAYHEM_FEE_RECIPIENTS).toEqual(PUMPFUN_MAYHEM_FEE_RECIPIENTS);
  expect(PUMPSWAP_DISCRIMINATORS.BUY_EXACT_QUOTE_IN).toEqual(Buffer.from([198,46,21,82,180,217,232,112]));
 });
 it('derives official Global/event and mint curve addresses',async()=>{
  expect(new PublicKey((await seed.getGlobalAccountPDA()).pubkey)).toEqual(PUMPFUN_GLOBAL_ACCOUNT);
  expect(new PublicKey((await seed.getEventAuthorityPDA()).pubkey)).toEqual(PUMPFUN_EVENT_AUTHORITY);
  expect(new PublicKey((await seed.getBondingCurvePDA(CONSTANTS.USDC_TOKEN_ACCOUNT.toBase58())).pubkey)).toEqual(getBondingCurvePda(CONSTANTS.USDC_TOKEN_ACCOUNT));
 });
 it('matches Solana domain separation, off-curve test, and bump',async()=>{
  const program=CONSTANTS.PUMPFUN_PROGRAM;
  for(let i=0;i<20;i++){
   const seeds=[Buffer.from('fixture'),Buffer.from([i])];const [address,bump]=PublicKey.findProgramAddressSync(seeds,program);
   expect(await seed.findProgramAddress(seeds,program.toBase58())).toEqual({pubkey:address.toBuffer(),bump});
   expect(await seed.createProgramAddress([...seeds,Buffer.from([bump])],program.toBase58())).toEqual(address.toBuffer());
  }
  await expect(seed.findProgramAddress([Buffer.alloc(33)],program.toBase58())).rejects.toThrow();
 });
 it('does not expose cached address bytes for mutation, and preserves leading zeros',async()=>{
  const a=await seed.getGlobalAccountPDA();a.pubkey.fill(0);expect(new PublicKey((await seed.getGlobalAccountPDA()).pubkey)).toEqual(PUMPFUN_GLOBAL_ACCOUNT);
  expect(seed.base58Encode(Buffer.alloc(32))).toBe(PublicKey.default.toBase58());
  expect(seed.base58Decode(PublicKey.default.toBase58())).toEqual(Buffer.alloc(32));
 });
 it('requires all generic PumpSwap seeds and rejects unidentifiable pools/recipient PDAs',async()=>{
  const creator=CONSTANTS.USDC_TOKEN_ACCOUNT,base=CONSTANTS.WSOL_TOKEN_ACCOUNT,quote=CONSTANTS.USDC_TOKEN_ACCOUNT,index=257;
  const bytes=Buffer.from([1,1]);const [expected,bump]=PublicKey.findProgramAddressSync([Buffer.from('pool'),bytes,creator.toBuffer(),base.toBuffer(),quote.toBuffer()],CONSTANTS.PUMPSWAP_PROGRAM);
  expect(await seed.getPumpSwapPoolPDA(base.toBase58(),quote.toBase58(),index,creator.toBase58())).toEqual({pubkey:expected.toBuffer(),bump});
  await expect(seed.getFeeRecipientPDA()).rejects.toThrow('not a PDA');
  await expect(seed.getMeteoraPoolPDA(base.toBase58(),quote.toBase58())).rejects.toThrow('two mints');
 });
});
