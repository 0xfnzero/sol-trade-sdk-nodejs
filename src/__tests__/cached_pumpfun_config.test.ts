import {describe,it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {AccountCacheSnapshot} from '../trading/subscription_cache';
import {cachedPumpFunConfiguration,decodePumpFunGlobalFeeRecipient,decodePumpFunSharingCreatorVault} from '../trading/cached_pumpfun_config';
import {PUMPFUN_PROGRAM_ID,PUMPFUN_GLOBAL_ACCOUNT,PUMPFUN_FEE_PROGRAM,getPumpFunFeeSharingConfigPda,getCreatorVaultPda} from '../instruction/pumpfun_builder';
const mint=new PublicKey('So11111111111111111111111111111111111111112');
const recipient=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const context={slot:100n,epoch:1n,maximumSlotAge:5n};
function fixture(){
 const global=Buffer.alloc(73);Buffer.from([167,232,232,177,200,108,114,127]).copy(global);recipient.toBuffer().copy(global,41);
 const sharing=Buffer.alloc(43);Buffer.from([216,74,9,0,56,140,93,75]).copy(sharing);sharing[10]=1;mint.toBuffer().copy(sharing,11);
 const accounts=new Map([[PUMPFUN_GLOBAL_ACCOUNT.toBase58(),{owner:PUMPFUN_PROGRAM_ID,data:global,slot:100n,writeVersion:0n}],[getPumpFunFeeSharingConfigPda(mint).toBase58(),{owner:PUMPFUN_FEE_PROGRAM,data:sharing,slot:100n,writeVersion:0n}]]);
 return {global,sharing,accounts};
}
describe('PumpFun current config from frozen cache',()=>{
 it('uses Global recipient and active config vault without network',()=>{
  const {accounts}=fixture(),s=cachedPumpFunConfiguration(new AccountCacheSnapshot(accounts),mint,context);
  expect(s.feeRecipient).toEqual(recipient);
  expect(s.feeSharingCreatorVaultIfActive).toEqual(getCreatorVaultPda(s.sharingConfig));
 });
 it('proven inactive is distinct from a missing config',()=>{
  const {accounts,sharing}=fixture();sharing[10]=0;
  expect(cachedPumpFunConfiguration(new AccountCacheSnapshot(accounts),mint,context).feeSharingCreatorVaultIfActive).toBeUndefined();
  accounts.delete(getPumpFunFeeSharingConfigPda(mint).toBase58());
  expect(()=>cachedPumpFunConfiguration(new AccountCacheSnapshot(accounts),mint,context)).toThrow('Missing cached');
 });
 it.each(['owner','stale','mint','global-disc','sharing-disc','zero-recipient'])('rejects %s',failure=>{
  const {accounts,global,sharing}=fixture();
  if(failure==='owner')accounts.get(PUMPFUN_GLOBAL_ACCOUNT.toBase58())!.owner=PublicKey.default;
  if(failure==='stale')accounts.get(PUMPFUN_GLOBAL_ACCOUNT.toBase58())!.slot=94n;
  if(failure==='mint')sharing[11]^=1;
  if(failure==='global-disc')global[0]^=1;
  if(failure==='sharing-disc')sharing[0]^=1;
  if(failure==='zero-recipient')global.fill(0,41);
  expect(()=>cachedPumpFunConfiguration(new AccountCacheSnapshot(accounts),mint,context)).toThrow();
 });
 it('rejects truncated data and continuity interruption',()=>{
  expect(()=>decodePumpFunGlobalFeeRecipient(Buffer.alloc(72))).toThrow();
  expect(()=>decodePumpFunSharingCreatorVault(Buffer.alloc(42),mint)).toThrow();
  expect(()=>cachedPumpFunConfiguration(new AccountCacheSnapshot(fixture().accounts,()=>{throw Error('interrupted')}),mint,context)).toThrow('interrupted');
 });
});
