import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {decodeMeteoraPool} from '../src/instruction/meteora_damm_v2_builder';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/damm_v2_layout_rust_5_0_6.json',import.meta.url),'utf8'));
const data=Buffer.from(fixture.payload,'base64');
function canonical(v:any):any {
 if(v instanceof PublicKey)return Array.from(v.toBytes());
 if(typeof v==='bigint')return v>BigInt(Number.MAX_SAFE_INTEGER)?String(v):Number(v);
 if(v instanceof Uint8Array)return Array.from(v);
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()).replace(/^padding(\d)$/,'padding_$1'),canonical(x)]));
 return v;
}
it('decodes every pinned Rust Borsh field without offset or precision loss',()=>{expect(data.length).toBe(1104);expect(canonical(decodeMeteoraPool(data))).toMatchObject(fixture.expected)});
it('accepts trailing extension bytes and rejects truncated payload',()=>{expect(canonical(decodeMeteoraPool(Buffer.concat([data,Buffer.alloc(32)])))).toMatchObject(fixture.expected);expect(decodeMeteoraPool(data.subarray(0,1103))).toBeNull()});
import {buildMeteoraDammV2BuyInstructions,METEORA_DAMM_V2_PROGRAM_ID} from '../src/instruction/meteora_damm_v2_builder';
import {CONSTANTS} from '../src/constants';
it('keeps referral slot, readonly payer, idempotent ATAs and exact large SOL funding',()=>{
 const pk=(n:number)=>new PublicKey(new Uint8Array(32).fill(n)),amount=9007199254740993n;
 const ixs=buildMeteoraDammV2BuyInstructions({payer:pk(42),inputMint:CONSTANTS.WSOL_TOKEN_ACCOUNT,outputMint:pk(2),inputAmount:amount,fixedOutputAmount:1n,protocolParams:{pool:pk(1),tokenAMint:CONSTANTS.WSOL_TOKEN_ACCOUNT,tokenBMint:pk(2),tokenAVault:pk(3),tokenBVault:pk(4),tokenAProgram:CONSTANTS.TOKEN_PROGRAM,tokenBProgram:CONSTANTS.TOKEN_PROGRAM,swapMode:0}});
 expect(ixs[0]!.data).toEqual(Buffer.from([1]));expect(ixs[3]!.data).toEqual(Buffer.from([1]));
 expect(ixs[1]!.data.readBigUInt64LE(4)).toBe(amount);
 const swap=ixs.at(-1)!;expect(swap.keys).toHaveLength(14);expect(swap.keys[11]!.pubkey).toEqual(METEORA_DAMM_V2_PROGRAM_ID);expect(swap.keys[11]!.isWritable).toBe(false);expect(swap.keys[8]!.isWritable).toBe(false);
});
const current=JSON.parse(readFileSync(new URL('./fixtures/damm_v2_current.json',import.meta.url),'utf8'));
it('exposes current official DAMM v2 compound fees, reserves and versions',()=>{
 const p=decodeMeteoraPool(Buffer.from(current.payload,'base64'))!;
 expect(p.poolFees.compoundingFeeBps).toBe(321);
 expect(p.poolFees.initSqrtPrice).toBe((1n<<100n)+123n);
 expect(p.deadLiquidityFeeCheckpoint).toBe(987654321n);
 expect(p.feeVersion).toBe(1);expect(p.layoutVersion).toBe(1);
 expect(Array.from(p.creator.toBytes())).toEqual(current.expected.creator);
 expect(p.tokenAAmount).toBe(9007199254740993n);expect(p.tokenBAmount).toBe(9007199254740995n);
 expect(p.sqrtPrice).toBe((1n<<64n)+1234n);
});

import {buildMeteoraDammV2SellInstructions} from '../src/instruction/meteora_damm_v2_builder';
import {getAssociatedTokenAddressSync} from '../src/common/spl-token';
it('uses explicit SOL/USDC directions on both pool orderings and rejects same-side mints',()=>{
 const pk=(n:number)=>new PublicKey(new Uint8Array(32).fill(n)),payer=pk(42);
 for(const [a,b] of [[CONSTANTS.WSOL_TOKEN_ACCOUNT,CONSTANTS.USDC_TOKEN_ACCOUNT],[CONSTANTS.USDC_TOKEN_ACCOUNT,CONSTANTS.WSOL_TOKEN_ACCOUNT]]) {
  for(const sell of [false,true]) {
   const inputMint=sell?CONSTANTS.USDC_TOKEN_ACCOUNT:CONSTANTS.WSOL_TOKEN_ACCOUNT;
   const outputMint=sell?CONSTANTS.WSOL_TOKEN_ACCOUNT:CONSTANTS.USDC_TOKEN_ACCOUNT;
   const params={payer,inputMint,outputMint,inputAmount:10000n,fixedOutputAmount:1n,createInputMintAta:false,createOutputMintAta:false,
    protocolParams:{pool:pk(1),tokenAMint:a!,tokenBMint:b!,tokenAVault:pk(3),tokenBVault:pk(4),tokenAProgram:CONSTANTS.TOKEN_PROGRAM,tokenBProgram:CONSTANTS.TOKEN_PROGRAM,swapMode:0}};
   const builder=sell?buildMeteoraDammV2SellInstructions:buildMeteoraDammV2BuyInstructions;
   const swap=builder(params).at(-1)!;
   expect(swap.keys[2]!.pubkey).toEqual(getAssociatedTokenAddressSync(inputMint,payer,true));
   expect(swap.keys[3]!.pubkey).toEqual(getAssociatedTokenAddressSync(outputMint,payer,true));
   expect(()=>builder({...params,outputMint:inputMint})).toThrow();
  }
 }
});
