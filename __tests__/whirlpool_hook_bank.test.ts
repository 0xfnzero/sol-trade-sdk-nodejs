import {describe,it,expect} from 'vitest';
import {readFileSync} from 'fs';
import {PublicKey} from '@solana/web3.js';
import {resolveHookAccounts} from '../src/instruction/token2022_hook';
import {buildWhirlpoolSwapV2WithHooks,WhirlpoolSwapV2Accounts} from '../src/instruction/native_hops';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/whirlpool_hook_bank_20261008.json',import.meta.url),'utf8'));
const inputs=(r:any):Parameters<typeof resolveHookAccounts>=>[new PublicKey(r.hook),new PublicKey(r.mint),new PublicKey(r.mint_owner),Buffer.from(r.mint_data,'base64'),new PublicKey(r.meta),new PublicKey(r.meta_owner),Buffer.from(r.meta_data,'base64'),r.execute_accounts.map((x:string)=>new PublicKey(x))];
describe('executed Whirlpool Hook bank',()=>{
 for(const c of fixture.cases)it(`wire ${c.direction}`,()=>{
  const r=c.resolver,extra=resolveHookAccounts(...inputs(r));
  const a=Object.fromEntries(Object.entries(c.accounts).map(([k,v])=>[k,k==='tick_arrays'?(v as string[]).map(x=>new PublicKey(x)):new PublicKey(v as string)])) as unknown as WhirlpoolSwapV2Accounts;
  const index=a.mint_a.toBase58()===r.mint?0:1;
  const ix=buildWhirlpoolSwapV2WithHooks(a,{amount:BigInt(c.amount),other_amount_threshold:BigInt(c.minimum),sqrt_price_limit:0n,amount_specified_is_input:true,a_to_b:c.direction},index===0?extra:[],index===1?extra:[]);
  expect(ix.data.toString('base64')).toBe(c.expected.data);
  expect(ix.keys.map(m=>({key:m.pubkey.toBase58(),signer:m.isSigner,writable:m.isWritable}))).toEqual(c.expected.accounts);
 });
 for(const r of fixture.rewards)it(`resolution ${r.amount} ${r.mint}`,()=>{
  expect(resolveHookAccounts(...inputs(r)).map(m=>m.pubkey.toBase58())).toEqual(r.expected_accounts);
  for(const mode of ['owner','mint_owner','truncated','count','seed_index','encoding','signer','padding']){
   const a=inputs(r);if(mode==='owner')a[5]=PublicKey.default;if(mode==='mint_owner')a[2]=PublicKey.default;
   let b=Buffer.from(a[6]);if(mode==='truncated')b=b.subarray(0,-1);if(mode==='count')b[12]=255;if(mode==='seed_index')b[53]=255;if(mode==='encoding')b[51]=2;if(mode==='signer')b[49]=1;if(mode==='padding')b[55]=3;a[6]=b;
   expect(()=>resolveHookAccounts(...a)).toThrow();
  }
 });
});
