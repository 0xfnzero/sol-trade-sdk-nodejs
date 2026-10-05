import {it,expect} from 'vitest';
import {Keypair,TransactionInstruction} from '@solana/web3.js';
import {PUMPFUN_PROGRAM_ID} from '../instruction/pumpfun_builder';
import {WSOL_MINT,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '../common/spl-token';
import {settlePumpFunNativeQuote} from '../trading/pumpfun_settlement';
import type {PreparedCachedRoute} from '../trading/cached_route';
const PAYER=Keypair.generate().publicKey;
const route=(buy=true)=>{
 const mint=Keypair.generate().publicKey,pool=Keypair.generate().publicKey,keys=Array.from({length:buy?27:26},()=>({pubkey:Keypair.generate().publicKey,isSigner:false,isWritable:false}));
 for(const [index,pubkey] of [[1,mint],[2,WSOL_MINT],[10,pool],[13,PAYER]] as const)keys[index]={pubkey,isSigner:index===13,isWritable:index===10||index===13};
 const data=Buffer.alloc(24);Buffer.from(buy?'c2ab1c46684d5b2f':'5df6823ce7e940b2','hex').copy(data);data.writeBigUInt64LE(10000n,8);data.writeBigUInt64LE(10000n,16);
 const ix=new TransactionInstruction({programId:PUMPFUN_PROGRAM_ID,data,keys});return {legs:[{hint:{pool,inputMint:buy?WSOL_MINT:mint,outputMint:buy?mint:WSOL_MINT},amountIn:10000n,minimumNetAmountOut:10000n,estimatedNetAmountOut:11000n,instruction:ix}],setupInstructions:[],swapInstructions:[ix],minimumNetAmountOut:10000n} as unknown as PreparedCachedRoute
};
it('SOL buy settles directly without WSOL funding',()=>{const r=settlePumpFunNativeQuote(route(),PAYER,true,false,'',0n);expect(r.instructions).toHaveLength(1);expect(r.requiredLamports).toBe(10000n)});
it('WSOL input debits source and closes only temporary account',()=>{const payer=PAYER,r=settlePumpFunNativeQuote(route(),payer,false,false,'p',2039280n),ata=getAssociatedTokenAddressSync(WSOL_MINT,payer,true,TOKEN_PROGRAM_ID);expect(r.instructions).toHaveLength(5);expect(r.instructions[2]!.keys[0]!.pubkey.equals(ata)).toBe(true);expect(r.instructions[3]!.keys[0]!.pubkey.equals(ata)).toBe(false);expect(r.instructions[2]!.data.readBigUInt64LE(1)).toBe(10000n)});
it('WSOL sell wraps minimum and reports SOL remainder',()=>{const r=settlePumpFunNativeQuote(route(false),PAYER,false,false,'',0n);expect(r.instructions[1]!.data.readBigUInt64LE(4)).toBe(10000n);expect(r.estimatedNativeResidualLamports).toBe(1000n)});
it('rejects multi-hop native settlement and invalid rent',()=>{const r=route();r.legs.push(r.legs[0]!);expect(()=>settlePumpFunNativeQuote(r,PAYER,true,false,'',0n)).toThrow('multi-hop');expect(()=>settlePumpFunNativeQuote(route(),PAYER,false,false,'p',0n)).toThrow('rent')});
for(const condition of ['wallet','protocol','quote','instruction','protection','zero','flags','encoded_amount','pool'])it(`rejects inconsistent single settlement ${condition}`,()=>{
 const r=route();let payer=PAYER,nativeInput=true;
 if(condition==='wallet')payer=Keypair.generate().publicKey;
 else if(condition==='protocol'){const ix=new TransactionInstruction({...r.legs[0]!.instruction,programId:TOKEN_PROGRAM_ID});r.legs[0]!.instruction=ix;r.swapInstructions=[ix]}
 else if(condition==='quote')r.legs[0]!.hint.outputMint=WSOL_MINT;
 else if(condition==='instruction')r.swapInstructions=[new TransactionInstruction({...r.legs[0]!.instruction,data:Buffer.from('changed')})];
 else if(condition==='protection')r.minimumNetAmountOut=1n;
 else if(condition==='zero')r.legs[0]!.amountIn=0n;
 else if(condition==='flags')nativeInput=1 as unknown as boolean;
 else if(condition==='encoded_amount')r.legs[0]!.amountIn=10001n;
 else if(condition==='pool')r.legs[0]!.hint.pool=Keypair.generate().publicKey;
 expect(()=>settlePumpFunNativeQuote(r,payer,nativeInput,false,'',0n)).toThrow();
});
