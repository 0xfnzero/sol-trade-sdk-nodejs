import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {AccountCacheSnapshot,PoolTradeHint} from '../src/trading/subscription_cache';
import {build} from '../examples/damm_v2_snapshot';
const v=JSON.parse(readFileSync(new URL('../examples/fixtures/damm_v2_buy_mainnet_20261004.json',import.meta.url),'utf8'));
const hint=new PoolTradeHint(new PublicKey(v.legs[0].pool),new PublicKey(v.legs[0].input_mint),new PublicKey(v.legs[0].output_mint));
const context={slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:BigInt(v.maximum_slot_age)};
function accounts(){return new Map<string,any>(v.accounts.map((a:any)=>[a.pubkey,{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)}]))}
it('replays real validated DAMM state and exact unsigned wire without RPC',()=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('RPC in preparation')});
 try{expect(createHash('sha256').update(build(v)).digest('hex')).toBe(v.expected.wire_sha256);expect(network).not.toHaveBeenCalled()}finally{network.mockRestore()}
});
it.each(['discriminator','owner','status','activation','flag','vault','stale','missing'])('rejects %s state',(failure)=>{
 const a=accounts(),pool=a.get(v.accounts[0].pubkey)!;
 if(failure==='discriminator')pool.data[0]^=1;
 if(failure==='owner')pool.owner=PublicKey.default;
 if(failure==='status')pool.data[481]=1;
 if(failure==='activation')pool.data.writeBigUInt64LE((1n<<64n)-1n,472);
 if(failure==='flag')pool.data[482]=3;
 if(failure==='vault')a.get(v.accounts[3].pubkey)!.data[108]=2;
 if(failure==='stale')pool.slot=0n;
 if(failure==='missing')a.delete(v.accounts[1].pubkey);
 expect(()=>new AccountCacheSnapshot(a).dammV2(hint,context,BigInt(v.unix_timestamp))).toThrow();
});
it('does not let an interrupted snapshot prepare a DAMM state',()=>{expect(()=>new AccountCacheSnapshot(accounts(),()=>{throw Error('continuity interrupted')}).dammV2(hint,context,BigInt(v.unix_timestamp))).toThrow(/continuity/)});
