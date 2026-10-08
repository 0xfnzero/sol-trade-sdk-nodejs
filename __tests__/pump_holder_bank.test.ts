import {test,expect} from 'vitest';
import {readFileSync} from 'fs';
import {PublicKey} from '@solana/web3.js';
import {buildPumpUpgradeInstruction} from '../src/instruction/pump_upgrade';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/pump_holder_bank_20261009.json',import.meta.url),'utf8'));
for(const c of fixture.cases)test(`holder bank ${c.name}`,()=>{
 const ix=buildPumpUpgradeInstruction(c.instruction,Object.fromEntries(Object.entries(c.roles).map(([k,v])=>[k,new PublicKey(v as string)])),c.args.map((v:string)=>BigInt(v)));
 expect(ix.programId.toBase58()).toBe(c.program);expect(ix.data.toString('hex')).toBe(c.data);expect(ix.keys.map(a=>a.pubkey.toBase58())).toEqual(c.accounts);
});
