import {snapshotU64,snapshotI64} from './_snapshot';
import {prepareCachedTrade} from "../src/trading/cached_trade";
/** npx tsx examples/cached_damm_v2.ts snapshot.json [--simulate].
 * Frozen state -> caller's explicit swap2 threshold -> unsigned V1. No autoquote/send.
 */
import {readFileSync} from 'node:fs';
import {simulate,simulationOutput} from './_simulation';
import {PublicKey} from '@solana/web3.js';
import {SubscriptionAccountCache,PoolTradeHint} from '../src/trading/subscription_cache';
export function build(v:any):Buffer {
 const cache=new SubscriptionAccountCache();
 for(const a of v.accounts)cache.update(new PublicKey(a.pubkey),{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:snapshotU64(a.slot,'account.slot'),writeVersion:snapshotU64(a.write_version,'account.write_version')});
 if(v.legs.length!==1)throw Error('One independent DAMM v2 swap required');
 const leg=v.legs[0],hint=new PoolTradeHint(new PublicKey(leg.pool),new PublicKey(leg.input_mint),new PublicKey(leg.output_mint));
 const prepared=prepareCachedTrade({dexType:'MeteoraDammV2',tradeType:v.trade_type??'Buy',snapshot:cache.snapshot(),hints:[hint],context:{slot:snapshotU64(v.read_slot,'read_slot'),epoch:snapshotU64(v.epoch,'epoch'),maximumSlotAge:snapshotU64(v.maximum_slot_age,'maximum_slot_age')},unixTimestamp:snapshotI64(v.unix_timestamp,'unix_timestamp'),payer:new PublicKey(v.payer),amount:snapshotU64(v.amount,'amount'),fixedOutputAmount:snapshotU64(v.fixed_output_amount,'fixed_output_amount'),recentBlockhash:v.recent_blockhash,nativeInput:v.native_input??false,nativeOutput:v.native_output??false,temporaryWsolSeed:v.temporary_wsol_seed,rentLamports:snapshotU64(v.rent_lamports??'0','rent_lamports')});
 const message=prepared.compiled;
 return Buffer.concat([message.message,Buffer.alloc(64*message.requiredSignatures)]);
}
async function main(){
 if(!process.argv[2])throw Error('Provide frozen snapshot JSON');
 const output=simulationOutput(process.argv),v=JSON.parse(readFileSync(process.argv[2],'utf8')),wire=build(v);console.log(JSON.stringify({transaction:wire.toString('base64'),wire_bytes:wire.length}));
 if(process.argv.includes('--simulate')){
  await simulate(wire,snapshotU64(v.read_slot,'read_slot'),output);
 }
}
if(import.meta.url.endsWith(process.argv[1]?.split('/').at(-1)??''))main().catch(e=>{console.error(e);process.exitCode=1});
