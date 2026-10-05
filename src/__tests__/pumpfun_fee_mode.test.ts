import {describe,it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {reconcileMayhemModeForTrade,feeRecipientOkForBondingCurveMode,pumpFunFeeRecipientMeta,getStandardFeeRecipientRandom,PUMPFUN_FEE_RECIPIENT,PUMPFUN_MAYHEM_FEE_RECIPIENTS,PUMPFUN_STANDARD_FEE_RECIPIENTS} from '../instruction/pumpfun_builder';
import {pumpFunParamsFromParserTrade} from '../index';
const mayhem=PUMPFUN_MAYHEM_FEE_RECIPIENTS[0]!,amm=PUMPFUN_STANDARD_FEE_RECIPIENTS[1]!,unknown=new PublicKey(Buffer.alloc(32,42));
describe('pinned Rust PumpFun fee mode resolution',()=>{
 for(const [name,key,expected] of [
  ['default',PublicKey.default,[false,false,true]],
  ['standard',PUMPFUN_FEE_RECIPIENT,[false,false,false]],
  ['reserved',mayhem,[true,true,true]],
  ['amm',amm,[false,false,true]],
  ['rotated',unknown,[false,false,true]],
 ] as const)it(name,()=>{
  for(const [i,flag] of [undefined,false,true].entries()){
   expect(reconcileMayhemModeForTrade(flag,key)).toBe(expected[i]);
   expect(pumpFunParamsFromParserTrade({fee_recipient:key.toBase58(),mayhem_mode:flag}).bondingCurve.isMayhemMode).toBe(expected[i]);
  }
 });
 it('never uses historical AMM recipients as the ordinary fallback',()=>{
  for(let i=0;i<30;i++)expect(getStandardFeeRecipientRandom()).toEqual(PUMPFUN_FEE_RECIPIENT);
  expect(pumpFunFeeRecipientMeta(mayhem,false)).toEqual(PUMPFUN_FEE_RECIPIENT);
  expect(PUMPFUN_MAYHEM_FEE_RECIPIENTS).toContainEqual(pumpFunFeeRecipientMeta(amm,true));
  for(const flag of [false,true])expect(pumpFunFeeRecipientMeta(unknown,flag)).toEqual(unknown);
  expect(feeRecipientOkForBondingCurveMode(PublicKey.default,false)).toBe(false);
 });
 it('rejects a nonboolean flag',()=>expect(()=>reconcileMayhemModeForTrade('false' as any,unknown)).toThrow('boolean'));
});
