import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {build} from '../../examples/cached_damm_v2';
import {AccountCacheSnapshot,PoolTradeHint} from '../trading/subscription_cache';
import {prepareCachedTrade,type CachedTradeRequest} from '../trading/cached_trade';
import {TradeExecutorFactory,DexType} from '../trading/factory';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL('../../examples/fixtures/'+name,import.meta.url),'utf8'));
const v=fixture('cached_damm_v2_wsol_buy_20261004.json');
function request(guard?:()=>void):CachedTradeRequest {
 const h=v.legs[0];
 const snapshot=new AccountCacheSnapshot(new Map(v.accounts.map((a:any)=>[a.pubkey,{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)}])),guard);
 return {dexType:'MeteoraDammV2',tradeType:'Buy',snapshot,hints:[new PoolTradeHint(new PublicKey(h.pool),new PublicKey(h.input_mint),new PublicKey(h.output_mint))],context:{slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:BigInt(v.maximum_slot_age)},unixTimestamp:BigInt(v.unix_timestamp),payer:new PublicKey(v.payer),amount:BigInt(v.amount),fixedOutputAmount:BigInt(v.fixed_output_amount),recentBlockhash:v.recent_blockhash};
}
describe('explicit cached DAMM factory',()=>{
 for(const asset of ['sol','wsol'])it(asset+' wire',()=>{
  const input=fixture('cached_damm_v2_'+asset+'_buy_20261004.json');
  expect(createHash('sha256').update(build(input)).digest('hex')).toBe(input.expected.wire_sha256);
 });
 for(const sell of [false,true])it(sell?'sell':'buy',()=>{
  const r=request();if(sell){const h=r.hints![0]!;r.tradeType='Sell';r.hints=[new PoolTradeHint(h.pool,h.outputMint,h.inputMint)]}
  const p=TradeExecutorFactory.createCachedExecutor(DexType.MeteoraDammV2).prepare(r);
  expect(p.route.legs[0]!.estimatedNetAmountOut).toBeNull();
  expect(p.route.minimumNetAmountOut).toBe(r.fixedOutputAmount);
  expect(p.requiredNativeLamports).toBe(0n);
  expect(p.instructions.some(i=>i.programId.equals(PublicKey.default))).toBe(false);
 });
 for(const minimum of [undefined,0n,-1n,1n<<64n,1 as any])it('invalid threshold '+String(minimum),()=>expect(()=>prepareCachedTrade({...request(),fixedOutputAmount:minimum})).toThrow());
 it('rejects unquoted multihop',()=>{const r=request();expect(()=>prepareCachedTrade({...r,hints:[...r.hints!,...r.hints!]})).toThrow('one independent')});
});

import {vi} from 'vitest';
import {prepareExplicitDammV2Route} from '../trading/cached_damm_v2';
for(const direction of ['Buy','Sell'] as const)it('reuses validated mint programs '+direction,()=>{
 const r=request(),h=r.hints![0]!,hint=direction==='Buy'?h:new PoolTradeHint(h.pool,h.outputMint,h.inputMint);
 const spy=vi.spyOn(r.snapshot!,'get');
 try{
  prepareExplicitDammV2Route(r.snapshot!,[hint],r.context!,r.unixTimestamp!,r.payer,r.amount,r.fixedOutputAmount,direction);
  expect(spy).toHaveBeenCalledTimes(5);
 }finally{spy.mockRestore()}
});
it('rejects invalid runtime direction',()=>{
 const r=request();
 expect(()=>prepareExplicitDammV2Route(r.snapshot!,r.hints!,r.context!,r.unixTimestamp!,r.payer,r.amount,r.fixedOutputAmount,'invalid' as 'Buy')).toThrow('one independent');
});
it('rejects continuity interruption after state validation',()=>{
 let checks=0;
 const r=request(()=>{if(++checks===7)throw Error('late continuity interruption')});
 expect(()=>prepareExplicitDammV2Route(r.snapshot!,r.hints!,r.context!,r.unixTimestamp!,r.payer,r.amount,r.fixedOutputAmount)).toThrow('late continuity');
});
