import {test,expect} from 'vitest';
import {readFileSync} from 'fs';
import {PublicKey} from '@solana/web3.js';
import {resolveHookAccounts} from '../src/instruction/token2022_hook';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/dlmm_hook_context_20261009.json',import.meta.url),'utf8'));
for(const [index,c]of fixture.cases.entries())test(`executed seed context ${index}`,()=>{
 const args:Parameters<typeof resolveHookAccounts>=[new PublicKey(c.hook),new PublicKey(c.mint),new PublicKey(c.mint_owner),Buffer.from(c.mint_data,'base64'),new PublicKey(c.meta),new PublicKey(c.meta_owner),Buffer.from(c.meta_data,'base64'),c.execute_accounts.map((k:string)=>new PublicKey(k))];
 const context={executeData:Buffer.from(c.execute_data,'base64'),accountData:new Map<string,Buffer>(Object.entries(c.account_data).map(([k,v])=>[k,Buffer.from(v as string,'base64')]))};
 const got=resolveHookAccounts(...args,context);expect(got.map(a=>a.pubkey.toBase58())).toEqual(c.expected_accounts);
 expect(()=>resolveHookAccounts(...args)).toThrow();expect(()=>resolveHookAccounts(...args,{executeData:context.executeData})).toThrow();expect(()=>resolveHookAccounts(...args,{...context,executeData:context.executeData.subarray(0,15)})).toThrow();
 for(const [offset,value]of [[86,255],[96,255],[102,33],[88,31],[122,1],[122,0],[123,255],[124,255],[125,1]]){const bad=[...args]as Parameters<typeof resolveHookAccounts>;bad[6]=Buffer.from(args[6]);bad[6][offset!]=value!;expect(()=>resolveHookAccounts(...bad,context)).toThrow();}
 const changed=Buffer.from(context.executeData);changed[8]=changed[8]!+1;expect(resolveHookAccounts(...args,{...context,executeData:changed})[2]!.pubkey.equals(got[2]!.pubkey)).toBe(false);
});
