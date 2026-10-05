/** Verified DAMM v2 state only. The Rust baseline requires an explicit swap2 output threshold. */
import {PublicKey} from '@solana/web3.js';
import {decodeMeteoraPool,METEORA_DAMM_V2_PROGRAM_ID,METEORA_DAMM_V2_AUTHORITY} from '../instruction/meteora_damm_v2_builder';
import {tokenTransferFeeForEpoch} from '../instruction/token_mint_state';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '../common/spl-token';
import type {AccountCacheSnapshot,PoolTradeHint,CacheReadContext} from './subscription_cache';
export function cachedDammV2(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,context:CacheReadContext,unixTimestamp:bigint){
 if(typeof unixTimestamp!=='bigint'||unixTimestamp<0n||unixTimestamp>=1n<<64n)throw Error('Invalid DAMM v2 timestamp');
 const data=Buffer.from(snapshot.get(hint.pool,context,METEORA_DAMM_V2_PROGRAM_ID).data);
 if(data.length<1112||!data.subarray(0,8).equals(Buffer.from([241,154,109,4,17,177,109,188])))throw Error('Invalid DAMM v2 pool discriminator or size');
 const pool=decodeMeteoraPool(data.subarray(8))!;
 hint.matches(pool.tokenAMint,pool.tokenBMint);
 if(pool.poolStatus!==0||pool.liquidity===0n||pool.activationType>1||pool.sqrtPrice<pool.sqrtMinPrice||pool.sqrtPrice>pool.sqrtMaxPrice||pool.sqrtMinPrice===0n||pool.sqrtPrice===0n)throw Error('DAMM v2 pool is inactive or invalid');
 if((pool.activationType===0?context.slot:unixTimestamp)<pool.activationPoint)throw Error('DAMM v2 pool is not activated');
 if(pool.tokenAVault.equals(pool.tokenBVault))throw Error('DAMM v2 vaults collide');
 const mints=[pool.tokenAMint,pool.tokenBMint].map(k=>snapshot.get(k,context));
 const flags=[pool.tokenAFlag,pool.tokenBFlag];
 const transferFees=mints.map((a,i)=>{if(flags[i]!>1||!a.owner.equals(flags[i]===0?TOKEN_PROGRAM_ID:TOKEN_2022_PROGRAM_ID))throw Error('DAMM v2 mint program flag mismatch');return tokenTransferFeeForEpoch(a.data,a.owner,context.epoch)});
 const reserves=[pool.tokenAVault,pool.tokenBVault].map((k,i)=>{
  const vault=Buffer.from(snapshot.get(k,context,mints[i]!.owner).data),mint=i===0?pool.tokenAMint:pool.tokenBMint;
  if(vault.length<165||!vault.subarray(0,32).equals(mint.toBuffer())||!vault.subarray(32,64).equals(METEORA_DAMM_V2_AUTHORITY.toBuffer())||vault[108]!==1)throw Error('Invalid DAMM v2 vault identity or state');
  return vault.readBigUInt64LE(64);
 });
 snapshot.assertUsable();
 return {pool,poolAddress:hint.pool,tokenAProgram:mints[0]!.owner,tokenBProgram:mints[1]!.owner,transferFees,reserves};
}


import {buildMeteoraDammV2BuyInstructions,buildMeteoraDammV2SellInstructions} from '../instruction/meteora_damm_v2_builder';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction} from '../common/spl-token';
import type {PreparedCachedRoute} from './cached_route';
/** Direct exact-in with an explicit threshold. A missing estimate is represented as null. */
export function prepareExplicitDammV2Route(snapshot:AccountCacheSnapshot,hints:readonly PoolTradeHint[],context:CacheReadContext,timestamp:bigint,payer:PublicKey,amount:bigint,minimum?:bigint,direction:"Buy"|"Sell"="Buy"):PreparedCachedRoute {
 if(minimum===undefined)throw Error('DAMM v2 requires explicit fixedOutputAmount; it is not a quote');
 if(typeof amount!=='bigint'||amount<=0n||amount>=1n<<64n||typeof minimum!=='bigint'||minimum<=0n||minimum>=1n<<64n||payer.equals(PublicKey.default)||hints.length!==1||(direction!=="Buy"&&direction!=="Sell"))throw Error('Explicit DAMM v2 requires one independent positive exact-in swap');
 const hint=hints[0]!,state=cachedDammV2(snapshot,hint,context,timestamp),p=state.pool;
 if(state.transferFees.some(f=>f.basisPoints!==0&&f.maximumFee!==0n))throw Error('DAMM v2 net transfer-fee thresholds are not yet verified');
 const args={payer,inputMint:hint.inputMint,outputMint:hint.outputMint,inputAmount:amount,fixedOutputAmount:minimum,createOutputMintAta:false,protocolParams:{pool:hint.pool,tokenAMint:p.tokenAMint,tokenBMint:p.tokenBMint,tokenAVault:p.tokenAVault,tokenBVault:p.tokenBVault,tokenAProgram:state.tokenAProgram,tokenBProgram:state.tokenBProgram,swapMode:0 as const,includeRateLimiterSysvar:p.poolFees.baseFee.feeSchedulerMode===2}};
 const swaps=direction==="Buy" ? buildMeteoraDammV2BuyInstructions({...args,createInputMintAta:false}) : buildMeteoraDammV2SellInstructions(args);
 if(swaps.length!==1)throw Error('Unexpected DAMM v2 exact-in instruction count');
 const setup=[hint.inputMint,hint.outputMint].map(m=>{const program=m.equals(p.tokenAMint)?state.tokenAProgram:state.tokenBProgram;return createAssociatedTokenAccountIdempotentInstruction(payer,getAssociatedTokenAddressSync(m,payer,true,program),payer,m,program)});
 snapshot.assertUsable();
 return {legs:[{hint,amountIn:amount,estimatedNetAmountOut:null,minimumNetAmountOut:minimum,instruction:swaps[0]!}],setupInstructions:setup,swapInstructions:swaps,minimumNetAmountOut:minimum,estimatedIntermediateResiduals:[]};
}
