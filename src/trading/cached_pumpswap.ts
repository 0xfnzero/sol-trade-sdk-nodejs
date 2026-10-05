/** Validated PumpSwap state from an owned subscription snapshot. No RPC or fallback fees. */
import {PublicKey} from '@solana/web3.js';
import type {AccountCacheSnapshot,CacheReadContext,PoolTradeHint} from './subscription_cache';
import {decodePoolPayload,decodeFeeConfig,computePumpSwapFeeBasisPoints,PUMPSWAP_PROGRAM,PUMPSWAP_POOL_DISCRIMINATOR,PUMPSWAP_GLOBAL_ACCOUNT,PUMPSWAP_FEE_CONFIG,PUMPSWAP_FEE_PROGRAM} from '../instruction/pumpswap';
import {tokenTransferFeeForEpoch} from '../instruction/token_mint_state';
import {effectiveQuoteReserves} from '../calc';
const GLOBAL_DISC=Buffer.from([149,8,156,202,160,252,176,217]);
// Snapshot.get already returns owned bytes. Read them without a second copy;
// this view is local to the preparation and is never exposed or cached.
const accountBuffer=(data:Uint8Array)=>Buffer.from(data.buffer,data.byteOffset,data.byteLength);
export function cachedPumpSwap(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,ctx:CacheReadContext) {
 const d=accountBuffer(snapshot.get(hint.pool,ctx,PUMPSWAP_PROGRAM).data);
 if(d.length<8||!d.subarray(0,8).equals(PUMPSWAP_POOL_DISCRIMINATOR))throw new Error('Invalid PumpSwap pool discriminator');
 // Decode payload explicitly: full accounts may carry reserved trailing bytes.
 const pool=decodePoolPayload(d.subarray(8));
 if(!pool||d.readUInt8(243)>1||d.readUInt8(244)>1)throw new Error('Invalid PumpSwap pool layout');
 hint.matches(pool.baseMint,pool.quoteMint);
 const index=Buffer.alloc(2);index.writeUInt16LE(pool.index);
 const [address,bump]=PublicKey.findProgramAddressSync([Buffer.from('pool'),index,pool.creator.toBuffer(),pool.baseMint.toBuffer(),pool.quoteMint.toBuffer()],PUMPSWAP_PROGRAM);
 if(!address.equals(hint.pool)||bump!==pool.poolBump)throw new Error('PumpSwap pool PDA mismatch');
 if(pool.poolBaseTokenAccount.equals(pool.poolQuoteTokenAccount))throw new Error('PumpSwap vaults collide');
 const global=accountBuffer(snapshot.get(PUMPSWAP_GLOBAL_ACCOUNT,ctx,PUMPSWAP_PROGRAM).data);
 if(global.length<899||!global.subarray(0,8).equals(GLOBAL_DISC)||global.readUInt8(417)>1||global.readUInt8(642)>1)throw new Error('Invalid PumpSwap global config');
 const feeData=accountBuffer(snapshot.get(PUMPSWAP_FEE_CONFIG,ctx,PUMPSWAP_FEE_PROGRAM).data);
 const [feeAddress,feeBump]=PublicKey.findProgramAddressSync([Buffer.from('fee_config'),PUMPSWAP_PROGRAM.toBuffer()],PUMPSWAP_FEE_PROGRAM);
 if(!feeAddress.equals(PUMPSWAP_FEE_CONFIG)||feeData.length<9||feeData[8]!==feeBump)throw new Error('PumpSwap fee config PDA bump mismatch');
 const config=decodeFeeConfig(feeData);
 if(!config)throw new Error('Invalid PumpSwap fee config');
 for(const tiers of [config.feeTiers,config.stableFeeTiers])for(let i=1;i<tiers.length;i++)if(tiers[i-1]!.marketCapLamportsThreshold>=tiers[i]!.marketCapLamportsThreshold)throw new Error('PumpSwap fee tiers are not strictly ordered');
 const mints=[pool.baseMint,pool.quoteMint].map(k=>snapshot.get(k,ctx));
 const transferFees=mints.map(m=>tokenTransferFeeForEpoch(m.data,m.owner,ctx.epoch));
 const reserves=[pool.poolBaseTokenAccount,pool.poolQuoteTokenAccount].map((k,i)=>{
  const v=accountBuffer(snapshot.get(k,ctx,mints[i]!.owner).data);
  if(v.length<165||!v.subarray(0,32).equals([pool.baseMint,pool.quoteMint][i]!.toBuffer())||!v.subarray(32,64).equals(hint.pool.toBuffer())||v[108]!==1)throw new Error('Invalid PumpSwap vault identity or state');
  return v.readBigUInt64LE(64);
 });
 if(!reserves[0]||!reserves[1])throw new Error('PumpSwap reserves are empty');
 const effectiveQuoteReserve=effectiveQuoteReserves(reserves[1]!,pool.virtualQuoteReserves);
 const baseMintSupply=accountBuffer(mints[0]!.data).readBigUInt64LE(36);
 const fees=computePumpSwapFeeBasisPoints(config,pool.creator,pool.baseMint,baseMintSupply,reserves[0]!,effectiveQuoteReserve);
 const keys=(start:number,n:number)=>Array.from({length:n},(_,i)=>new PublicKey(global.subarray(start+i*32,start+(i+1)*32)));
 snapshot.assertUsable();
 return {poolAddress:hint.pool,pool,baseReserve:reserves[0]!,quoteReserve:reserves[1]!,baseMintSupply,
  baseTokenProgram:mints[0]!.owner,quoteTokenProgram:mints[1]!.owner,
  baseTransferFee:transferFees[0]!,quoteTransferFee:transferFees[1]!,feeBasisPoints:{...fees},
  disableFlags:global[56]!,protocolFeeRecipients:keys(57,8),reservedFeeRecipients:keys(385,1).concat(keys(418,7)),buybackFeeRecipients:keys(643,8),
  mayhemEnabled:global[417]===1,cashbackEnabled:global[642]===1};
}
export type CachedPumpSwapState=ReturnType<typeof cachedPumpSwap>;

import {SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {buyQuoteInputInternalWithFees,sellBaseInputInternalWithFees,calculateWithSlippageSell} from '../calc';
import {ASSOCIATED_TOKEN_PROGRAM_ID} from '../common/spl-token';
import {getAssociatedTokenAddress,getCoinCreatorVaultAta,getCoinCreatorVaultAuthority,getPoolV2PDA,getUserVolumeAccumulatorPDA,PUMPSWAP_EVENT_AUTHORITY,PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR,PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,PUMPSWAP_SELL_DISCRIMINATOR} from '../instruction/pumpswap';

export function prepareCachedPumpSwap(snapshot:AccountCacheSnapshot,hint:PoolTradeHint,ctx:CacheReadContext,payer:PublicKey,amount:bigint,slippageBps=0) {
 if(typeof amount!=='bigint'||amount<=0n||amount>=1n<<64n||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>=10000||payer.equals(PublicKey.default))throw new Error('Invalid PumpSwap preparation request');
 const state=cachedPumpSwap(snapshot,hint,ctx),p=state.pool;
 const quoteIn=hint.inputMint.equals(p.quoteMint);
 if(state.disableFlags&(quoteIn?8:16))throw new Error('PumpSwap direction is disabled');
 if(p.isCashbackCoin)throw new Error('PumpSwap cashback quote requires a verified current fee context');
 for(const f of [state.baseTransferFee,state.quoteTransferFee])if(f.basisPoints!==0&&f.maximumFee!==0n)throw new Error('PumpSwap transfer-fee quote semantics are not yet verified');
 const fees={...state.feeBasisPoints,coinCreatorFeeBasisPoints:p.coinCreator.equals(PublicKey.default)?0n:state.feeBasisPoints.coinCreatorFeeBasisPoints};
 const amountOut=quoteIn?buyQuoteInputInternalWithFees(amount,0n,state.baseReserve,state.quoteReserve,p.virtualQuoteReserves,fees).base:sellBaseInputInternalWithFees(amount,0n,state.baseReserve,state.quoteReserve,p.virtualQuoteReserves,fees).uiQuote;
 const minimumAmountOut=calculateWithSlippageSell(amountOut,BigInt(slippageBps));
 if(!minimumAmountOut)throw new Error('PumpSwap quote has zero protected output');
 const choose=(keys:PublicKey[],label:string)=>{const k=keys.find(k=>!k.equals(PublicKey.default));if(!k)throw new Error('Missing current PumpSwap '+label+' recipient');return k;};
 const feeRecipient=choose(p.isMayhemMode?state.reservedFeeRecipients:state.protocolFeeRecipients,'protocol');
 const buyback=choose(state.buybackFeeRecipients,'buyback');
 const writable=(pubkey:PublicKey)=>({pubkey,isSigner:false,isWritable:true});
 const readonly=(pubkey:PublicKey)=>({pubkey,isSigner:false,isWritable:false});
 const accounts=[writable(hint.pool),{pubkey:payer,isSigner:true,isWritable:true},readonly(PUMPSWAP_GLOBAL_ACCOUNT),readonly(p.baseMint),readonly(p.quoteMint),writable(getAssociatedTokenAddress(payer,p.baseMint,state.baseTokenProgram)),writable(getAssociatedTokenAddress(payer,p.quoteMint,state.quoteTokenProgram)),writable(p.poolBaseTokenAccount),writable(p.poolQuoteTokenAccount),readonly(feeRecipient),writable(getAssociatedTokenAddress(feeRecipient,p.quoteMint,state.quoteTokenProgram)),readonly(state.baseTokenProgram),readonly(state.quoteTokenProgram),readonly(SystemProgram.programId),readonly(ASSOCIATED_TOKEN_PROGRAM_ID),readonly(PUMPSWAP_EVENT_AUTHORITY),readonly(PUMPSWAP_PROGRAM),writable(getCoinCreatorVaultAta(p.coinCreator,p.quoteMint,state.quoteTokenProgram)),readonly(getCoinCreatorVaultAuthority(p.coinCreator))];
 if(quoteIn)accounts.push(writable(PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR),writable(getUserVolumeAccumulatorPDA(payer)));
 accounts.push(readonly(PUMPSWAP_FEE_CONFIG),readonly(PUMPSWAP_FEE_PROGRAM));
 if(!p.coinCreator.equals(PublicKey.default))accounts.push(readonly(getPoolV2PDA(p.baseMint)));
 accounts.push(readonly(buyback),writable(getAssociatedTokenAddress(buyback,p.quoteMint,state.quoteTokenProgram)));
 const data=Buffer.alloc(quoteIn?25:24);(quoteIn?PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR:PUMPSWAP_SELL_DISCRIMINATOR).copy(data);data.writeBigUInt64LE(amount,8);data.writeBigUInt64LE(minimumAmountOut,16);
 const instruction=new TransactionInstruction({programId:PUMPSWAP_PROGRAM,keys:accounts,data});
 snapshot.assertUsable();
 return {state,quote:{amountIn:amount,amountOut,minimumAmountOut},instruction};
}
