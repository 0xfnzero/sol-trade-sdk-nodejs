import {test,expect} from 'vitest';
import {readFileSync} from 'fs';
import {PublicKey} from '@solana/web3.js';
const fixture: any=JSON.parse(readFileSync(new URL('./fixtures/pump_routes_bank_20261009.json',import.meta.url),'utf8'));
import {derivePumpMultiHopAccounts,PumpMultiHop} from '../src/instruction/pump_compact_accounts';
import {buildPumpUpgradeInstruction} from '../src/instruction/pump_upgrade';
for(const c of fixture.cases)test(`native two-hop bank ${c.name}`,()=>{
 const hops:PumpMultiHop[]=c.hops.map((h:any)=>({venue:h.venue as 'curve'|'pool',baseMint:new PublicKey(h.base_mint),quoteMint:new PublicKey(h.quote_mint),address:new PublicKey(h.address),baseVault:new PublicKey(h.base_vault),quoteVault:new PublicKey(h.quote_vault),baseTokenProgram:new PublicKey(h.base_token_program),quoteTokenProgram:new PublicKey(h.quote_token_program),creator:new PublicKey(h.creator),index:h.index,mayhem:h.mayhem,cashback:h.cashback,complete:h.complete}));
 const {accounts,remaining}=derivePumpMultiHopAccounts(new PublicKey(c.user),new PublicKey(c.input_mint),new PublicKey(c.output_mint),new PublicKey(c.buyback_recipient),hops);
 const ix=buildPumpUpgradeInstruction('pump_amm_multi_hop_swap',accounts,c.args.map((a:string)=>BigInt(a)),undefined,remaining);
 expect(ix.programId.toBase58()).toBe(c.program);expect(ix.data.toString('hex')).toBe(c.data);expect(ix.keys.map(a=>a.pubkey.toBase58())).toEqual(c.accounts);
});
