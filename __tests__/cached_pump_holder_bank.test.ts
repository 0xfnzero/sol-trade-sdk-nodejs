import {test,expect} from 'vitest';
import {readFileSync} from 'fs';
import {PublicKey} from '@solana/web3.js';
import {SubscriptionAccountCache,PoolTradeHint} from '../src/trading/subscription_cache';
import {prepareCachedPumpFun} from '../src/trading/cached_pumpfun';
for(const side of ['buy','sell'])test(`cached holder bank ${side}`,()=>{
 const v=JSON.parse(readFileSync(new URL(`./fixtures/pump_holder_cached_${side}_20261009.json`,import.meta.url),'utf8'));
 function invoke(mut?:number){const cache=new SubscriptionAccountCache();for(const a of v.accounts){const data=Buffer.from(a.data,'base64');if(a.pubkey===v.legs[0].pool&&mut!==undefined){if(mut===0)data.fill(0,49,81);else data[124]=mut;}cache.update(new PublicKey(a.pubkey),{owner:new PublicKey(a.owner),data,slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)});}const h=v.legs[0];return prepareCachedPumpFun(cache.snapshot(),new PoolTradeHint(new PublicKey(h.pool),new PublicKey(h.input_mint),new PublicKey(h.output_mint)),{slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:32n},new PublicKey(v.payer),BigInt(v.amount),v.slippage_bps);}
 const p=invoke();expect(p.quote.estimatedNetAmountOut.toString()).toBe(v.expected.estimated_out);expect(p.quote.minimumNetAmountOut.toString()).toBe(v.expected.minimum_out);expect(()=>invoke(0)).toThrow(/holder-reward/);expect(()=>invoke(2)).toThrow(/holder-reward/);
});
