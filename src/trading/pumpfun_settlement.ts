/** PumpFun currently settles a WSOL-sentinel curve in wallet SOL even in V2. */
import {createHash} from 'node:crypto';
import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,WSOL_MINT,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '../common/spl-token';
import type {PreparedCachedRoute} from './cached_route';
import {PUMPFUN_PROGRAM_ID} from '../instruction/pumpfun_builder';
function validateSettlementInstructions(route:PreparedCachedRoute,payer:PublicKey):void{
 if(route.swapInstructions.length!==route.legs.length)throw Error('Invalid PumpFun settlement instructions');
 for(let i=0;i<route.legs.length;i++){
  const leg=route.legs[i]!,ix=route.swapInstructions[i]!,quoted=leg.instruction;
  if(!ix||!quoted||!ix.programId.equals(quoted.programId)||!ix.data.equals(quoted.data)||ix.keys.length!==quoted.keys.length||ix.keys.some((a,j)=>{const b=quoted.keys[j]!;return !a.pubkey.equals(b.pubkey)||a.isSigner!==b.isSigner||a.isWritable!==b.isWritable}))throw Error('PumpFun settlement instruction differs from quoted leg');
  if(!ix.keys.some(a=>a.pubkey.equals(payer)&&a.isSigner))throw Error('PumpFun settlement belongs to a different wallet');
  if(typeof leg.amountIn!=='bigint'||typeof leg.minimumNetAmountOut!=='bigint'||leg.amountIn<=0n||leg.amountIn>=1n<<64n||leg.minimumNetAmountOut<=0n||leg.minimumNetAmountOut>=1n<<64n)throw Error('Invalid PumpFun settlement amount or protection');
 }
 if(route.minimumNetAmountOut!==route.legs.at(-1)!.minimumNetAmountOut)throw Error('PumpFun settlement protection differs from quoted leg');
}
function validateNativeAnchor(leg:PreparedCachedRoute['legs'][number],payer:PublicKey,buy:boolean):void{
 const ix=leg.instruction,keys=ix.keys,discriminator=Buffer.from(buy?'c2ab1c46684d5b2f':'5df6823ce7e940b2','hex');
 if(ix.data.length!==24||!ix.data.subarray(0,8).equals(discriminator)||keys.length!==(buy?27:26)||ix.data.readBigUInt64LE(8)!==leg.amountIn||ix.data.readBigUInt64LE(16)!==leg.minimumNetAmountOut||!keys[13]!.pubkey.equals(payer)||!keys[13]!.isSigner||!keys[13]!.isWritable||!keys[10]!.pubkey.equals(leg.hint.pool)||!keys[2]!.pubkey.equals(WSOL_MINT)||!keys[1]!.pubkey.equals(buy?leg.hint.outputMint:leg.hint.inputMint))throw Error('PumpFun native settlement requires matching exact-in V2 quote and accounts');
}
export function settlePumpFunNativeQuote(route:PreparedCachedRoute,payer:PublicKey,nativeInput:boolean,nativeOutput:boolean,seed:string,rent:bigint):{instructions:TransactionInstruction[];requiredLamports:bigint;estimatedNativeResidualLamports:bigint}{
 if(typeof nativeInput!=='boolean'||typeof nativeOutput!=='boolean')throw Error('Invalid PumpFun native endpoint flags');
 if(route.legs.length!==1){
  if(route.legs.length<2||route.legs.length>5||nativeInput||nativeOutput)throw Error('Invalid PumpFun native-quote multi-hop endpoints');
  const indices=route.legs.flatMap((l,i)=>l.instruction?.programId.equals(PUMPFUN_PROGRAM_ID)?[i]:[]);
  if(indices.length!==1||(indices[0]!==0&&indices[0]!==route.legs.length-1))throw Error('PumpFun multi-hop requires one curve at the buy or sell anchor');
  const index=indices[0]!,anchor=route.legs[index]!,buy=index===route.legs.length-1;
  if(!(buy?anchor.hint.inputMint:anchor.hint.outputMint).equals(WSOL_MINT))throw Error('PumpFun multi-hop anchor must use native quote');
  for(let i=1;i<route.legs.length;i++){const previous=route.legs[i-1]!,current=route.legs[i]!;if(!previous.hint.outputMint.equals(current.hint.inputMint)||current.amountIn<=0n||current.amountIn>previous.minimumNetAmountOut)throw Error('PumpFun multi-hop exceeds protected intermediate credit');}
  validateSettlementInstructions(route,payer);
  const converted=settlePumpFunNativeQuote({...route,legs:[anchor],setupInstructions:[],swapInstructions:[anchor.instruction],minimumNetAmountOut:anchor.minimumNetAmountOut,estimatedIntermediateResiduals:[]},payer,false,false,seed,rent);
  const swaps=route.swapInstructions;
  return {...converted,instructions:buy?[...route.setupInstructions,...swaps.slice(0,-1),...converted.instructions]:[...route.setupInstructions,...converted.instructions,...swaps.slice(1)]};
 }
 const leg=route.legs[0]!,buy=leg.hint.inputMint.equals(WSOL_MINT);
 if(!leg.instruction?.programId.equals(PUMPFUN_PROGRAM_ID)||leg.hint.inputMint.equals(WSOL_MINT)===leg.hint.outputMint.equals(WSOL_MINT))throw Error('PumpFun settlement requires one native-quote curve');
 validateSettlementInstructions(route,payer);
 validateNativeAnchor(leg,payer,buy);
 if(buy?nativeOutput:nativeInput)throw Error('Invalid PumpFun native endpoint');
 const ata=getAssociatedTokenAddressSync(WSOL_MINT,payer,true,TOKEN_PROGRAM_ID);
 const keep=route.setupInstructions.filter(ix=>!(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)&&ix.keys[1]?.pubkey.equals(ata)));
 const swap=route.swapInstructions;
 if(buy&&nativeInput)return {instructions:[...keep,...swap],requiredLamports:leg.amountIn,estimatedNativeResidualLamports:0n};
 if(!buy&&nativeOutput)return {instructions:[...keep,...swap],requiredLamports:0n,estimatedNativeResidualLamports:0n};
 if(!buy){
  const amount=route.minimumNetAmountOut;
  if(leg.estimatedNetAmountOut==null || leg.estimatedNetAmountOut<amount)throw Error('Missing PumpFun output estimate');
  const data=Buffer.alloc(12);data.writeUInt32LE(2);data.writeBigUInt64LE(amount,4);
  const fund=new TransactionInstruction({programId:SystemProgram.programId,data,keys:[{pubkey:payer,isSigner:true,isWritable:true},{pubkey:ata,isSigner:false,isWritable:true}]});
  const sync=new TransactionInstruction({programId:TOKEN_PROGRAM_ID,data:Buffer.from([17]),keys:[{pubkey:ata,isSigner:false,isWritable:true}]});
  return {instructions:[...route.setupInstructions,...swap,fund,sync],requiredLamports:0n,estimatedNativeResidualLamports:leg.estimatedNetAmountOut! - amount};
 }
 if(typeof seed!=='string'||Buffer.from(seed).toString()!==seed||Buffer.byteLength(seed)<1||Buffer.byteLength(seed)>32||typeof rent!=='bigint'||rent<=0n||rent>=1n<<64n)throw Error('WSOL PumpFun input requires unique seed and current account rent');
 const encoded=Buffer.from(seed),temporary=new PublicKey(createHash('sha256').update(Buffer.concat([payer.toBuffer(),encoded,TOKEN_PROGRAM_ID.toBuffer()])).digest());
 if(temporary.equals(ata))throw Error('Temporary WSOL account collides with input ATA');
 const data=Buffer.alloc(4+32+8+encoded.length+8+8+32);data.writeUInt32LE(3);payer.toBuffer().copy(data,4);data.writeBigUInt64LE(BigInt(encoded.length),36);encoded.copy(data,44);let o=44+encoded.length;data.writeBigUInt64LE(rent,o);o+=8;data.writeBigUInt64LE(165n,o);TOKEN_PROGRAM_ID.toBuffer().copy(data,o+8);
 const create=new TransactionInstruction({programId:SystemProgram.programId,data,keys:[{pubkey:payer,isSigner:true,isWritable:true},{pubkey:temporary,isSigner:false,isWritable:true}]});
 const init=new TransactionInstruction({programId:TOKEN_PROGRAM_ID,data:Buffer.concat([Buffer.from([18]),payer.toBuffer()]),keys:[{pubkey:temporary,isSigner:false,isWritable:true},{pubkey:WSOL_MINT,isSigner:false,isWritable:false}]});
 const transferData=Buffer.alloc(9);transferData[0]=3;transferData.writeBigUInt64LE(leg.amountIn,1);
 const transfer=new TransactionInstruction({programId:TOKEN_PROGRAM_ID,data:transferData,keys:[{pubkey:ata,isSigner:false,isWritable:true},{pubkey:temporary,isSigner:false,isWritable:true},{pubkey:payer,isSigner:true,isWritable:false}]});
 const close=new TransactionInstruction({programId:TOKEN_PROGRAM_ID,data:Buffer.from([9]),keys:[{pubkey:temporary,isSigner:false,isWritable:true},{pubkey:payer,isSigner:false,isWritable:true},{pubkey:payer,isSigner:true,isWritable:false}]});
 return {instructions:[create,init,transfer,close,...keep,...swap],requiredLamports:rent,estimatedNativeResidualLamports:0n};
}
