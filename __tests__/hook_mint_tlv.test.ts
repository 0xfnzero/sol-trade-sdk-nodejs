import { test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PublicKey } from '@solana/web3.js';
import { resolveHookAccounts } from '../src/instruction/token2022_hook';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/hook_mint_tlv_20261009.json',import.meta.url),'utf8'));
for(const c of fixture.cases)test(`official SPL mint TLV ${c.name}`,()=>{
 const args:Parameters<typeof resolveHookAccounts>=[new PublicKey(c.hook),new PublicKey(c.mint),new PublicKey(c.mint_owner),Buffer.from(c.mint_data,'base64'),new PublicKey(c.meta),new PublicKey(c.meta_owner),Buffer.from(c.meta_data,'base64'),c.execute_accounts.map((k:string)=>new PublicKey(k))];
 const context={executeData:Buffer.from(c.execute_data,'base64'),accountData:new Map<string,Buffer>(Object.entries(c.account_data).map(([k,v])=>[k,Buffer.from(v as string,'base64')]))};
 if(c.expected_active)expect(resolveHookAccounts(...args,context).map(a=>a.pubkey.toBase58())).toEqual(c.expected_accounts);
 else expect(()=>resolveHookAccounts(...args,context)).toThrow('Active Hook program mismatch');
});
