/** Current PumpFun fee schedules and exact-in quotes from frozen accounts. No RPC. */
import {PublicKey} from '@solana/web3.js';
import {decodePumpFunBondingCurveData} from '../params';
import {PUMPFUN_PROGRAM_ID,PUMPFUN_FEE_PROGRAM,PUMPFUN_FEE_CONFIG,PUMPFUN_GLOBAL_ACCOUNT,getBondingCurvePda} from '../instruction/pumpfun_builder';
import {tokenTransferFeeForEpoch} from '../instruction/token_mint_state';
import type {AccountCacheSnapshot,CacheReadContext,PoolTradeHint} from './subscription_cache';
import {buildPumpFunBuyV2Instructions,buildPumpFunSellV2Instructions,getPumpFunFeeSharingConfigPda,getCreatorVaultPda} from '../instruction/pumpfun_builder';
import {decodePumpFunSharingCreatorVault} from './cached_pumpfun_config';
import {getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '../common/spl-token';
const WSOL=new PublicKey('So11111111111111111111111111111111111111112');
const USDC=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const NATIVE2022=new PublicKey('9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP');
const U64=1n<<64n;
const checked=(v:bigint)=>{if(typeof v!=='bigint'||v<0n||v>=U64)throw Error('PumpFun amount outside u64');return v};
export interface PumpFunCurrentFees {protocolFeeBps:bigint;creatorFeeBps:bigint}
/** Decode the fee-program schema, including optional stable/exotic extensions. */
export function decodePumpFunCurrentFees(data:Uint8Array,quote:PublicKey,marketCap:bigint,creatorOverride=0n):PumpFunCurrentFees {
 const d=Buffer.from(data);let offset=41;
 if(d.length<69||!d.subarray(0,8).equals(Buffer.from([143,52,146,187,219,123,76,155]))||typeof marketCap!=='bigint'||marketCap<0n||marketCap>=1n<<128n)throw Error('Invalid PumpFun FeeConfig or market cap');
 const readFees=()=>{if(offset+24>d.length)throw Error('Truncated PumpFun fees');const values=[d.readBigUInt64LE(offset),d.readBigUInt64LE(offset+8),d.readBigUInt64LE(offset+16)];offset+=24;if(values.some(v=>v>10000n))throw Error('Invalid PumpFun fee rate');return values};
 const flat=readFees();
 const readTiers=()=>{
  if(offset+4>d.length)throw Error('Truncated PumpFun fee tier count');const n=d.readUInt32LE(offset);offset+=4;
  if(n>Math.floor((d.length-offset)/40))throw Error('Truncated PumpFun fee tiers');
  const tiers:{threshold:bigint;fees:bigint[]}[]=[];
  for(let i=0;i<n;i++){const threshold=d.readBigUInt64LE(offset)+(d.readBigUInt64LE(offset+8)<<64n);offset+=16;if(i&&threshold<=tiers[i-1]!.threshold)throw Error('PumpFun fee tiers are not strictly ordered');tiers.push({threshold,fees:readFees()})}
  return tiers;
 };
 const tiers=readTiers(),stable=offset===d.length?[]:readTiers(),exotic=offset===d.length?[0n,0n,0n]:readFees();
 const native=quote.equals(PublicKey.default)||quote.equals(WSOL)||quote.equals(NATIVE2022);
 let selected:bigint[];
 if(native||quote.equals(USDC)){
  const schedule=!native&&stable.length?stable:tiers;if(!schedule.length)throw Error('PumpFun fee tiers cannot be empty');
  selected=schedule[0]!.fees;for(const tier of schedule){if(marketCap>=tier.threshold)selected=tier.fees;else break}
 }else selected=exotic.some(v=>v!==0n)?exotic:flat;
 const protocolFeeBps=selected[1]!,creatorFeeBps=creatorOverride===0n?selected[2]!:checked(creatorOverride);
 if(protocolFeeBps+creatorFeeBps>10000n)throw Error('PumpFun combined fees exceed 100%');
 return {protocolFeeBps,creatorFeeBps};
}

export function cachedPumpFun(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,context:CacheReadContext) {
 const curveBytes=Buffer.from(snapshot.get(hint.pool,context,PUMPFUN_PROGRAM_ID).data);
 const curve=decodePumpFunBondingCurveData(curveBytes,hint.pool);
 const quote=curve.quoteMint?.equals(PublicKey.default)?WSOL:curve.quoteMint??WSOL;
 const mint=hint.inputMint.equals(quote)?hint.outputMint:hint.inputMint;
 hint.matches(mint,quote);
 if(!getBondingCurvePda(mint).equals(hint.pool)||curve.complete||curve.virtualTokenReserves===0n||curve.virtualSolReserves===0n)throw Error('Invalid, completed or mismatched PumpFun curve');
 const global=Buffer.from(snapshot.get(PUMPFUN_GLOBAL_ACCOUNT,context,PUMPFUN_PROGRAM_ID).data);
 if(global.length<1045||!global.subarray(0,8).equals(Buffer.from([167,232,232,177,200,108,114,127]))||global[8]!>1)throw Error('Invalid PumpFun Global');
 if(global.length>1045&&global.length<1054||curveBytes.length>115&&curveBytes.length<123)throw Error('Truncated PumpFun configurable fee fields');
 if(global.length>=1054&&global[1045]!>1)throw Error('Invalid PumpFun creator fee gate');
 let override=global.length>=1054&&global[1045]===1&&curveBytes.length>=123?curveBytes.readBigUInt64LE(115):0n;
 if(override&&override>global.readBigUInt64LE(1046))throw Error('PumpFun creator fee exceeds Global maximum');
 const fee=Buffer.from(snapshot.get(PUMPFUN_FEE_CONFIG,context,PUMPFUN_FEE_PROGRAM).data);
 const [feeAddress,bump]=PublicKey.findProgramAddressSync([Buffer.from('fee_config'),PUMPFUN_PROGRAM_ID.toBuffer()],PUMPFUN_FEE_PROGRAM);
 if(!feeAddress.equals(PUMPFUN_FEE_CONFIG)||fee.length<9||fee[8]!==bump)throw Error('PumpFun FeeConfig PDA bump mismatch');
 const mints=[mint,quote].map(k=>snapshot.get(k,context));
 const transferFees=mints.map(m=>tokenTransferFeeForEpoch(m.data,m.owner,context.epoch));
 if(transferFees.some(f=>f.basisPoints!==0&&f.maximumFee!==0n))throw Error('PumpFun nonzero transfer-fee quotes are not yet verified');
 const supply=Buffer.from(mints[0]!.data).readBigUInt64LE(36);
 if(supply===0n)throw Error('PumpFun mint supply is zero');
 const cap=(s:bigint)=>s*curve.virtualSolReserves/curve.virtualTokenReserves;
 const buyFees=decodePumpFunCurrentFees(fee,quote,cap(supply),override);
 const sellFees=decodePumpFunCurrentFees(fee,quote,cap(curve.isMayhemMode?supply:1_000_000_000_000_000n),override);
 snapshot.assertUsable();
 return {curve,mint,quote,buyFees,sellFees,tokenProgram:mints[0]!.owner,quoteTokenProgram:mints[1]!.owner};
}
export type CachedPumpFunState=ReturnType<typeof cachedPumpFun>;
export function quoteCachedPumpFunExactIn(state:CachedPumpFunState,amount:bigint,buy:boolean,slippageBps=0) {
 checked(amount);if(!amount||typeof buy!=='boolean'||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>9999)throw Error('Invalid PumpFun exact-in request');
 const c=state.curve,f=buy?state.buyFees:state.sellFees,creator=c.creator.equals(PublicKey.default)?0n:f.creatorFeeBps;
 for(const value of [c.virtualTokenReserves,c.virtualSolReserves,c.realTokenReserves,f.protocolFeeBps,f.creatorFeeBps])checked(value);
 if(c.complete||!c.virtualTokenReserves||!c.virtualSolReserves||f.protocolFeeBps+f.creatorFeeBps>10000n)throw Error('Invalid PumpFun quote state');
 let estimated:bigint;
 if(buy){const net=(amount-1n)*10000n/(10000n+f.protocolFeeBps+creator);estimated=net*c.virtualTokenReserves/(c.virtualSolReserves+net);if(estimated>c.realTokenReserves)estimated=c.realTokenReserves}
 else{const gross=amount*c.virtualSolReserves/(c.virtualTokenReserves+amount),fee=(bps:bigint)=>(gross*bps+9999n)/10000n;estimated=gross-fee(f.protocolFeeBps)-fee(creator)}
 const minimum=estimated*BigInt(10000-slippageBps)/10000n;
 if(estimated<=0n||minimum<=0n)throw Error('PumpFun quote has zero protected output');
 checked(estimated);return {amountIn:amount,estimatedNetAmountOut:estimated,minimumNetAmountOut:minimum,fees:f};
}

/** V2 exact-in leg. Setup/native settlement remains in the shared route core. */
export function prepareCachedPumpFun(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,context:CacheReadContext,payer:PublicKey,amount:bigint,slippageBps=0) {
 return prepareCachedPumpFunRouteLeg(snapshot,hint,context,payer,amount,slippageBps,true);
}
/** @internal Shared route gate runs immediately after the single state decode. */
export function prepareCachedPumpFunRouteLeg(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,context:CacheReadContext,payer:PublicKey,amount:bigint,slippageBps:number,allowNative:boolean) {
 if(payer.equals(PublicKey.default))throw Error('Missing PumpFun payer');
 const state=cachedPumpFun(snapshot,hint,context);
 if(state.quote.equals(WSOL)&&!allowNative)throw Error('PumpFun native quote requires cached trade settlement');
 const buy=hint.inputMint.equals(state.quote),quote=quoteCachedPumpFunExactIn(state,amount,buy,slippageBps);
 if(!state.quoteTokenProgram.equals(TOKEN_PROGRAM_ID))throw Error('PumpFun V2 quote token program is unsupported');
 if(state.mint.toBase58().endsWith('pump')&&!state.tokenProgram.equals(TOKEN_2022_PROGRAM_ID))throw Error('PumpFun mint suffix and token program mismatch');
 const raw=Buffer.from(snapshot.get(hint.pool,context,PUMPFUN_PROGRAM_ID).data);
 if(raw.length>=125&&raw[124]!==0){const holder=PublicKey.findProgramAddressSync([Buffer.from('holder-rewards'),state.mint.toBuffer()],PUMPFUN_PROGRAM_ID)[0];if(raw[124]!==1 || !holder.equals(state.curve.creator))throw Error('Invalid PumpFun holder-reward creator');}
 const config=getPumpFunFeeSharingConfigPda(state.mint),sharing=snapshot.getOptional(config,context,PUMPFUN_FEE_PROGRAM);
 const active=sharing?decodePumpFunSharingCreatorVault(sharing.data,state.mint):undefined;
 const creatorVault=active??getCreatorVaultPda(state.curve.creator);
 const g=Buffer.from(snapshot.get(PUMPFUN_GLOBAL_ACCOUNT,context,PUMPFUN_PROGRAM_ID).data);
 const firstNonzero=(start:number,n:number)=>{for(let i=0;i<n;i++){const key=new PublicKey(g.subarray(start+32*i,start+32*(i+1)));if(!key.equals(PublicKey.default))return key}throw Error('Missing PumpFun current fee recipient')};
 const recipient=firstNonzero(state.curve.isMayhemMode?483:41,1),buyback=firstNonzero(741,8);
 const protocolParams={bondingCurve:state.curve,quoteMint:state.quote,tokenProgram:state.tokenProgram,creatorVault,feeSharingCreatorVaultIfActive:active,feeRecipient:recipient};
 const swaps=buy?buildPumpFunBuyV2Instructions({payer,inputMint:state.quote,outputMint:state.mint,inputAmount:amount,protocolParams,createOutputMintAta:false,createInputMintAta:false,useExactSolAmount:true}):buildPumpFunSellV2Instructions({payer,inputMint:state.mint,outputMint:state.quote,inputAmount:amount,protocolParams,createOutputMintAta:false,fixedOutputAmount:quote.minimumNetAmountOut});
 if(swaps.length!==1||swaps[0]!.keys.length!==(buy?27:26))throw Error('Unexpected PumpFun V2 layout');
 const instruction=swaps[0]!;
 instruction.data.writeBigUInt64LE(amount,8);instruction.data.writeBigUInt64LE(quote.minimumNetAmountOut,16);
 instruction.keys[6]!.pubkey=recipient;instruction.keys[7]!.pubkey=getAssociatedTokenAddressSync(state.quote,recipient,true,TOKEN_PROGRAM_ID);
 instruction.keys[8]!.pubkey=buyback;instruction.keys[8]!.isWritable=true;instruction.keys[9]!.pubkey=getAssociatedTokenAddressSync(state.quote,buyback,true,TOKEN_PROGRAM_ID);
 snapshot.assertUsable();return {state,quote,instruction};
}
