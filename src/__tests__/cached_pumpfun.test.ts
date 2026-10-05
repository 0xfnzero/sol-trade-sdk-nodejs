import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {cachedPumpFun,quoteCachedPumpFunExactIn,decodePumpFunCurrentFees,prepareCachedPumpFun} from '../trading/cached_pumpfun';
import {getPumpFunFeeSharingConfigPda} from '../instruction/pumpfun_builder';
import {TOKEN_2022_PROGRAM_ID} from '../common/spl-token';
import {AccountCacheSnapshot,PoolTradeHint} from '../trading/subscription_cache';
import {PUMPFUN_PROGRAM_ID,PUMPFUN_GLOBAL_ACCOUNT,PUMPFUN_FEE_PROGRAM,PUMPFUN_FEE_CONFIG,getBondingCurvePda} from '../instruction/pumpfun_builder';
const oracle=JSON.parse(readFileSync(new URL('../../tests/fixtures/pumpfun_current_fee_oracle_2_0_0.json',import.meta.url),'utf8'));
const mint=new PublicKey('mtCXje1XCpF8Z3BptaJ4AngDERanJtC9grXicrHpump'),token=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const wsol=new PublicKey('So11111111111111111111111111111111111111112');
const ctx={slot:100n,epoch:1n,maximumSlotAge:5n};
const u64=(v:any)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b};
function config(){
 const [,bump]=PublicKey.findProgramAddressSync([Buffer.from('fee_config'),PUMPFUN_PROGRAM_ID.toBuffer()],PUMPFUN_FEE_PROGRAM);
 const tier=(t:any)=>Buffer.concat([u64(t[0]),Buffer.alloc(8),...t.slice(1).map(u64)]);
 const count=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b};
 return Buffer.concat([Buffer.from([143,52,146,187,219,123,76,155,bump]),Buffer.alloc(32),...oracle.fee_config.flat.map(u64),count(oracle.fee_config.tiers.length),...oracle.fee_config.tiers.map(tier),count(oracle.fee_config.stable.length),...oracle.fee_config.stable.map(tier),...oracle.fee_config.exotic.map(u64)]);
}
function fixture(v:any){
 const pool=getBondingCurvePda(mint),q=new PublicKey(v.quote),quote=q.equals(PublicKey.default)?wsol:q;
 const curve=Buffer.alloc(125);Buffer.from([23,183,248,55,96,216,172,96]).copy(curve);
 for(const [o,n] of [[8,'1000000000000'],[16,v.vq],[24,'800000000000'],[32,'1000000000000'],[40,v.supply],[115,v.creator_override]] as const)curve.writeBigUInt64LE(BigInt(n),o);
 (v.has_creator?wsol:PublicKey.default).toBuffer().copy(curve,49);curve[81]=Number(v.mayhem);q.toBuffer().copy(curve,83);
 const g=Buffer.alloc(1054);Buffer.from([167,232,232,177,200,108,114,127]).copy(g);g[8]=1;g[1045]=1;g.writeBigUInt64LE(100n,1046);
 const m=Buffer.alloc(82);m[45]=1;m.writeBigUInt64LE(BigInt(v.supply),36);
 const qm=Buffer.alloc(82);qm[45]=1;
 const accounts=new Map([[pool.toBase58(),{owner:PUMPFUN_PROGRAM_ID,data:curve,slot:100n,writeVersion:0n}],[PUMPFUN_GLOBAL_ACCOUNT.toBase58(),{owner:PUMPFUN_PROGRAM_ID,data:g,slot:100n,writeVersion:0n}],[PUMPFUN_FEE_CONFIG.toBase58(),{owner:PUMPFUN_FEE_PROGRAM,data:config(),slot:100n,writeVersion:0n}],[mint.toBase58(),{owner:token,data:m,slot:100n,writeVersion:0n}],[quote.toBase58(),{owner:token,data:qm,slot:100n,writeVersion:0n}]]);
 const hint=new PoolTradeHint(pool,v.buy?quote:mint,v.buy?mint:quote);
 return {accounts,hint,curve,g};
}
describe('current PumpFun quote against independent official 2.0.0 oracle',()=>{
 for(const [i,v] of oracle.vectors.entries())it('case '+i,()=>{
  const f=fixture(v),state=cachedPumpFun(new AccountCacheSnapshot(f.accounts),f.hint,ctx);
  const r=quoteCachedPumpFunExactIn(state,BigInt(v.amount),v.buy,100);
  expect(r.estimatedNetAmountOut).toBe(BigInt(v.expected_out));
  expect(r.fees.protocolFeeBps).toBe(BigInt(v.expected_protocol));expect(r.fees.creatorFeeBps).toBe(BigInt(v.expected_creator));
  expect(r.minimumNetAmountOut).toBe(BigInt(v.expected_out)*9900n/10000n);
 });
 it.each(['owner','stale','complete','missing-fee','bump','gate','override','partial'])('rejects '+ '%s',failure=>{
  const f=fixture(oracle.vectors[0]);
  if(failure==='owner')f.accounts.get(PUMPFUN_FEE_CONFIG.toBase58())!.owner=PublicKey.default;
  if(failure==='stale')f.accounts.get(PUMPFUN_FEE_CONFIG.toBase58())!.slot=94n;
  if(failure==='complete')f.curve[48]=1;
  if(failure==='missing-fee')f.accounts.delete(PUMPFUN_FEE_CONFIG.toBase58());
  if(failure==='bump')f.accounts.get(PUMPFUN_FEE_CONFIG.toBase58())!.data[8]^=1;
  if(failure==='gate')f.g[1045]=2;
  if(failure==='override')f.curve.writeBigUInt64LE(101n,115);
  if(failure==='partial')f.accounts.get(f.hint.pool.toBase58())!.data=f.curve.subarray(0,120);
  expect(()=>cachedPumpFun(new AccountCacheSnapshot(f.accounts),f.hint,ctx)).toThrow();
 });
 it('rejects malformed vectors and unsafe numbers',()=>{
  const d=config();d.writeUInt32LE(0xffffffff,65);
  expect(()=>decodePumpFunCurrentFees(d,wsol,1n)).toThrow('Truncated');
  expect(()=>decodePumpFunCurrentFees(config(),wsol,1 as any)).toThrow();
  const f=fixture(oracle.vectors[0]),s=cachedPumpFun(new AccountCacheSnapshot(f.accounts),f.hint,ctx);
  expect(()=>quoteCachedPumpFunExactIn(s,1 as any,true)).toThrow();
  expect(()=>quoteCachedPumpFunExactIn(s,1n,true)).toThrow('zero');
 });
 for(const buy of [true,false])it('rejects invalid creator rates without creator '+buy,()=>{
  const v=oracle.vectors.find((v:any)=>!v.has_creator&&v.buy===buy),f=fixture(v),s=cachedPumpFun(new AccountCacheSnapshot(f.accounts),f.hint,ctx);
  for(const [protocolFeeBps,creatorFeeBps] of [[0n,10001n],[9999n,2n],[10001n,0n]]) {
   const bad={...s,[buy?'buyFees':'sellFees']:{protocolFeeBps,creatorFeeBps}};
   expect(()=>quoteCachedPumpFunExactIn(bad,BigInt(v.amount),buy)).toThrow();
  }
 });
 for(const buy of [true,false])it('prepares independent V2 '+(buy?'buy':'sell')+' with current threshold and confirmed absence',()=>{
  const v=oracle.vectors.find((v:any)=>v.has_creator&&v.quote===wsol.toBase58()&&v.buy===buy),f=fixture(v);
  f.accounts.get(mint.toBase58())!.owner=TOKEN_2022_PROGRAM_ID;
  wsol.toBuffer().copy(f.g,41);wsol.toBuffer().copy(f.g,741);
  const key=getPumpFunFeeSharingConfigPda(mint).toBase58();
  f.accounts.set(key,{owner:PublicKey.default,data:Buffer.alloc(0),slot:100n,writeVersion:0n});
  const snapshot=new AccountCacheSnapshot(f.accounts),r=prepareCachedPumpFun(snapshot,f.hint,ctx,wsol,BigInt(v.amount),100);
  expect(r.instruction.data.readBigUInt64LE(8)).toBe(BigInt(v.amount));
  expect(r.instruction.data.readBigUInt64LE(16)).toBe(r.quote.minimumNetAmountOut);
  expect(r.instruction.keys[6]!.pubkey).toEqual(wsol);expect(r.instruction.keys[8]!.pubkey).toEqual(wsol);
  expect(r.instruction.keys[8]!.isWritable).toBe(true);
  const reads=vi.spyOn(snapshot,'get');
  const route=snapshot.prepareRoute([f.hint],ctx,0n,wsol,BigInt(v.amount),100,8,true);
  expect(reads.mock.calls.filter(([key])=>key.equals(PUMPFUN_FEE_CONFIG))).toHaveLength(1);
  expect(route.swapInstructions).toEqual([r.instruction]);
  expect(route.minimumNetAmountOut).toBe(r.quote.minimumNetAmountOut);
  reads.mockRestore();
  expect(()=>snapshot.get(new PublicKey(key),ctx)).toThrow('closed');
  f.accounts.delete(key);
  expect(()=>prepareCachedPumpFun(new AccountCacheSnapshot(f.accounts),f.hint,ctx,wsol,BigInt(v.amount))).toThrow('Missing cached');
 });
});
