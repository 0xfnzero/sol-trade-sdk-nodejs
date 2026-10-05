import {TradeExecutorFactory,DexType} from "../src/trading/factory";
import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {AccountCacheSnapshot,PoolTradeHint} from '../src/trading/subscription_cache';
const cases=JSON.parse(readFileSync(new URL('./fixtures/cached_pumpswap_state.json',import.meta.url),'utf8')).cases;
const context={slot:100n,epoch:10n,maximumSlotAge:0n};
function fixture(c:any){
 const map=new Map<string,any>(c.accounts.map((a:any)=>[a.address,{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)}]));
 const hint=new PoolTradeHint(new PublicKey(c.pool),new PublicKey(c.input_mint),new PublicKey(c.output_mint));
 return {map,hint};
}
it.each(cases)('reads actual flat/tier fees, reserves and recipients %#',(c:any)=>{
 const {map,hint}=fixture(c);const s=new AccountCacheSnapshot(map).pumpSwap(hint,context);
 expect(Object.values(s.feeBasisPoints).map(String)).toEqual(c.expected_fees);
 expect(s.baseReserve).toBe(1000000n);expect(s.quoteReserve).toBe(500000n);
 expect(s.pool.virtualQuoteReserves).toBe(1000n);expect(s.protocolFeeRecipients[0]!.toBytes()).toEqual(new Uint8Array(32).fill(8));
 expect(s.baseTransferFee.basisPoints).toBe(0);
});
it.each([['pool-discriminator',0,0],['pool-boolean',0,243],['pool-bump',0,8],['mint-state',1,45],['vault-mint',3,0],['vault-frozen',3,108],['global-discriminator',5,0],['global-boolean',5,417],['fee-discriminator',6,0],['fee-bump',6,8]])('rejects corrupt %s',(_name,index,offset)=>{
 const {map,hint}=fixture(cases[0]);const a=map.get(cases[0].accounts[index].address)!;a.data[offset]=a.data[offset]===1?2:a.data[offset]^255;
 expect(()=>new AccountCacheSnapshot(map).pumpSwap(hint,context)).toThrow();
});
it('rejects missing config, wrong ownership and stale state',()=>{
 for(const mode of ['missing','owner','stale']){
  const {map,hint}=fixture(cases[0]);const address=cases[0].accounts[6].address;
  if(mode==='missing')map.delete(address);else if(mode==='owner')map.get(address)!.owner=PublicKey.default;else map.get(address)!.slot=99n;
  expect(()=>new AccountCacheSnapshot(map).pumpSwap(hint,context)).toThrow();
 }
});

import {prepareCachedTrade} from '../src/trading/cached_trade';
import {PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,PUMPSWAP_SELL_DISCRIMINATOR} from '../src/instruction/pumpswap';
const payer=new PublicKey(new Uint8Array(32).fill(42));
it.each(cases)('prepares independent buy and sell through the real factory core %#',(c:any)=>{
 const {map,hint}=fixture(c),snapshot=new AccountCacheSnapshot(map);
 for(const buy of [true,false]){
  const leg=buy?hint:new PoolTradeHint(hint.pool,hint.outputMint,hint.inputMint);
  const r=snapshot.preparePumpSwap(leg,context,payer,10000n,100);
  const out=BigInt(buy?c.expected_buy_quote:c.expected_sell_quote);
  expect(r.quote.amountOut).toBe(out);expect(r.quote.minimumAmountOut).toBe(out-out/100n);
  expect(r.instruction.data.subarray(0,8)).toEqual(buy?PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR:PUMPSWAP_SELL_DISCRIMINATOR);
  expect(r.instruction.data.readBigUInt64LE(8)).toBe(10000n);expect(r.instruction.data.readBigUInt64LE(16)).toBe(r.quote.minimumAmountOut);
  expect(r.instruction.keys[9]!.pubkey.toBytes()).toEqual(new Uint8Array(32).fill(8));
  expect(r.instruction.keys.at(-2)!.pubkey.toBytes()).toEqual(new Uint8Array(32).fill(10));
  expect(r.instruction.keys.length).toBe(buy?26:24);
  const prepared=TradeExecutorFactory.createCachedExecutor(DexType.PumpSwap).prepare({dexType:'PumpSwap',tradeType:buy?'Buy':'Sell',snapshot,hints:[leg],context,unixTimestamp:1n,payer,amount:10000n,recentBlockhash:'11111111111111111111111111111111',slippageBps:100});
  expect(prepared.route.swapInstructions[0]!.data).toEqual(r.instruction.data);
 }
});
it.each([['buy disabled',5,56,8],['sell disabled',5,56,16],['cashback context',0,244,1],['protocol recipient',5,57,0],['buyback recipient',5,643,0]])('rejects unavailable %s',(_name,i,o,v)=>{
 const {map,hint}=fixture(cases[0]);const a=map.get(cases[0].accounts[i].address)!;
 if(o===57||o===643)a.data.fill(0,o,o+32);else a.data[o]=v;
 const leg=o===56&&v===16?new PoolTradeHint(hint.pool,hint.outputMint,hint.inputMint):hint;
 expect(()=>new AccountCacheSnapshot(map).preparePumpSwap(leg,context,payer,10000n,100)).toThrow();
});
it('uses current reserved fee recipient in mayhem mode',()=>{
 const {map,hint}=fixture(cases[0]);map.get(cases[0].accounts[0].address)!.data[243]=1;
 const r=new AccountCacheSnapshot(map).preparePumpSwap(hint,context,payer,10000n,100);
 expect(r.instruction.keys[9]!.pubkey.toBytes()).toEqual(new Uint8Array(32).fill(9));
});

it.each(['buy','sell'])('replays verified mainnet %s without network',(direction)=>{
 const v=JSON.parse(readFileSync(new URL('../examples/fixtures/pumpswap_'+direction+'_mainnet_20261004.json',import.meta.url),'utf8'));
 const map=new Map<string,any>(v.accounts.map((a:any)=>[a.pubkey,{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)}]));
 const noNetwork=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('RPC in hot path')});
 try{
  const p=TradeExecutorFactory.createCachedExecutor(DexType.PumpSwap).prepare({dexType:'PumpSwap',tradeType:v.trade_type,snapshot:new AccountCacheSnapshot(map),hints:v.legs.map((h:any)=>new PoolTradeHint(new PublicKey(h.pool),new PublicKey(h.input_mint),new PublicKey(h.output_mint))),context:{slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:BigInt(v.maximum_slot_age)},unixTimestamp:BigInt(v.unix_timestamp),payer:new PublicKey(v.payer),amount:BigInt(v.amount),recentBlockhash:v.recent_blockhash,slippageBps:v.slippage_bps,nativeInput:v.native_input,nativeOutput:v.native_output,temporaryWsolSeed:v.temporary_wsol_seed,rentLamports:BigInt(v.rent_lamports)});
  const wire=Buffer.concat([p.compiled.message,Buffer.alloc(64*p.compiled.requiredSignatures)]);
  expect(String(p.route.minimumNetAmountOut)).toBe(v.expected.minimum_amount_out);
  expect(createHash('sha256').update(wire).digest('hex')).toBe(v.expected.wire_sha256);
  expect(noNetwork).not.toHaveBeenCalled();
 }finally{noNetwork.mockRestore()}
});
