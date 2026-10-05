import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {PublicKey,TransactionInstruction} from '@solana/web3.js';
import {AccountCacheSnapshot,PoolTradeHint} from '../trading/subscription_cache';
import {TradeExecutorFactory,DexType} from '../trading/factory';
import {prepareCachedTrade,type CachedTradeRequest} from '../trading/cached_trade';
import {settlePumpFunNativeQuote} from '../trading/pumpfun_settlement';
const load=(name:string)=>JSON.parse(readFileSync(new URL('../../examples/fixtures/'+name,import.meta.url),'utf8'));
function request(v:any):CachedTradeRequest {
 return {dexType:'PumpFun',tradeType:v.trade_type,snapshot:new AccountCacheSnapshot(new Map(v.accounts.map((a:any)=>[a.pubkey,{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)}]))),hints:v.legs.map((h:any)=>new PoolTradeHint(new PublicKey(h.pool),new PublicKey(h.input_mint),new PublicKey(h.output_mint))),context:{slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:BigInt(v.maximum_slot_age)},payer:new PublicKey(v.payer),amount:BigInt(v.amount),unixTimestamp:BigInt(v.unix_timestamp),recentBlockhash:v.recent_blockhash,slippageBps:v.slippage_bps,nativeInput:v.native_input,nativeOutput:v.native_output,temporaryWsolSeed:v.temporary_wsol_seed,rentLamports:BigInt(v.rent_lamports)};
}
describe('gRPC discovered current PumpFun factory',()=>{
 for(const protocol of ['whirlpool','dlmm','clmm'])for(const direction of ['buy','sell'])it(`${protocol} native-quote ${direction} matches actual simulation and rejects missing arrays`,()=>{
  const name=`pumpfun_${protocol}_usdc_${direction}_20261005.json`,v=load(name),network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('network forbidden')});
  try{
   const p=prepareCachedTrade(request(v)),wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
   expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);
   expect(p.route.minimumNetAmountOut).toBe(BigInt(v.expected.minimum_out));
   expect(p.estimatedNativeResidualLamports).toBe(BigInt(v.expected.estimated_native_residual_lamports));
   const r=load('pumpfun_concentrated_multihop_simulations_20261005.json').records.find((x:any)=>x.fixture===name);
   expect(r.response.result.value.err).toBeNull();expect(BigInt(r.verified_balances.input_debit)).toBe(BigInt(v.amount));
   expect(BigInt(r.verified_balances.output_credit)>=p.route.minimumNetAmountOut).toBe(true);expect(BigInt(r.verified_balances.wsol_delta)>=0n).toBe(true);
   const hop=p.route.legs[direction==='buy'?0:1]!.instruction,address=hop.keys[protocol==='whirlpool'?11:protocol==='dlmm'?16:hop.keys.length-1]!.pubkey.toBase58();
   v.accounts=v.accounts.filter((a:any)=>a.pubkey!==address);expect(()=>prepareCachedTrade(request(v))).toThrow(/[Mm]issing|[Nn]ot.*cache/);
   expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore()}
 });
 it('non-native anchor cannot enable an unrelated native curve',()=>{
  const v=load('pumpfun_usdc_buy_20261004.json'),other=load('pumpfun_current_0_sol_buy_20261004.json'),usdc=v.legs[0].input_mint,wsol=v.legs[0].output_mint,anchor=v.legs[1];
  for(const a of v.accounts)if(a.pubkey===anchor.pool){const d=Buffer.from(a.data,'base64');new PublicKey(usdc).toBuffer().copy(d,83);a.data=d.toString('base64')}
  const extra=other.legs[0];v.legs=[{pool:extra.pool,input_mint:extra.output_mint,output_mint:wsol},{pool:v.legs[0].pool,input_mint:wsol,output_mint:usdc},{pool:anchor.pool,input_mint:usdc,output_mint:anchor.output_mint}];
  for(const a of other.accounts)if(a.pubkey===extra.pool||a.pubkey===extra.output_mint)v.accounts.push({...a,slot:v.read_slot});v.amount='100000000';
  expect(()=>prepareCachedTrade(request(v))).toThrow('requires cached trade settlement');
 });
 for(const direction of ['buy','sell'])it(`USDC native-quote multi-hop ${direction} uses verified wire and preserves residual types`,()=>{
  const v=load(`pumpfun_usdc_${direction}_20261004.json`),r=request(v),network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('network forbidden')});
  try{
   const p=prepareCachedTrade(r),wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
   expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);
   expect(p.route.minimumNetAmountOut).toBe(BigInt(v.expected.minimum_out));expect(p.estimatedNativeResidualLamports).toBe(BigInt(v.expected.estimated_native_residual_lamports));
   expect(p.route.estimatedIntermediateResiduals.map(x=>({mint:x.mint.toBase58(),amount:x.amount.toString()}))).toEqual(v.expected.estimated_intermediate_residuals);
   const swaps=[...p.route.swapInstructions],ix=swaps[0]!;swaps[0]=new TransactionInstruction({...ix,data:Buffer.concat([ix.data,Buffer.from([0])])});
   expect(()=>settlePumpFunNativeQuote({...p.route,swapInstructions:swaps},r.payer,false,false,'p',r.rentLamports!)).toThrow('differs from quoted leg');
   expect(()=>settlePumpFunNativeQuote({...p.route,legs:[{...p.route.legs[0]!,minimumNetAmountOut:p.route.legs[1]!.amountIn-1n},p.route.legs[1]!] },r.payer,false,false,'p',r.rentLamports!)).toThrow('protected intermediate credit');
   expect(()=>settlePumpFunNativeQuote(p.route,new PublicKey('11111111111111111111111111111111'),false,false,'p',r.rentLamports!)).toThrow('different wallet');expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore()}
 });
 for(const asset of ['sol','wsol'])it(`verified funded ${asset} sell wire`,()=>{
  const v=load(`pumpfun_funded_1_${asset}_sell_20261004.json`),p=prepareCachedTrade(request(v)),wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
  expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);expect(p.route.minimumNetAmountOut).toBe(7542n);expect(p.estimatedNativeResidualLamports).toBe(asset==='wsol'?397n:0n);
 });
 it('matches actually debited funded WSOL simulation wire',()=>{
  const v=load('pumpfun_settled_funded_wsol_buy_20261004.json'),p=prepareCachedTrade(request(v));
  const wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
  expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);
  const e=load('pumpfun_settled_funded_wsol_evidence_20261004.json');expect(e.verified_asset_payment).toBe(true);expect(e.actual_wsol_debit).toBe('10000');expect(wire.length).toBe(e.wire_bytes);
 });
 for(const i of [0,1])it('independent SOL buy fixture '+i+' keeps cross-language wire and current quote',()=>{
  const v=load('pumpfun_settled_'+i+'_sol_buy_20261004.json');
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('network forbidden')});
  try{
   const p=TradeExecutorFactory.createCachedExecutor(DexType.PumpFun).prepare(request(v));
   const wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
   expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);
   expect(p.route.legs[0]!.estimatedNetAmountOut).toBe(BigInt(v.expected.estimated_out));
   expect(p.route.minimumNetAmountOut).toBe(BigInt(v.expected.minimum_out));
   expect(p.route.swapInstructions[0]!.keys[8]!.isWritable).toBe(true);
   expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore()}
 });
 it('rejects mislabeled independent direction and explicit DAMM threshold',()=>{
  const r=request(load('pumpfun_current_0_sol_buy_20261004.json'));
  expect(()=>prepareCachedTrade({...r,tradeType:'Sell'})).toThrow('direction');
  expect(()=>prepareCachedTrade({...r,fixedOutputAmount:1n})).toThrow('only supported');
  expect(()=>r.snapshot.prepareRoute(r.hints,r.context,r.unixTimestamp,r.payer,r.amount)).toThrow('cached trade settlement');
 });
});
