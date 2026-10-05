import {it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {buildBuyInstructions,buildSellInstructions,PUMPSWAP_BUY_DISCRIMINATOR,type PumpSwapParams} from '../src/instruction/pumpswap';
const key=(n:number)=>new PublicKey(new Uint8Array(32).fill(n));
const token=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const wsol=new PublicKey('So11111111111111111111111111111111111111112');
function params(reverse=false):PumpSwapParams{return {pool:key(1),baseMint:reverse?wsol:key(2),quoteMint:reverse?key(2):wsol,poolBaseTokenAccount:key(3),poolQuoteTokenAccount:key(4),poolBaseTokenReserves:1000000n,poolQuoteTokenReserves:500000n,virtualQuoteReserves:0n,coinCreatorVaultAta:key(5),coinCreatorVaultAuthority:key(6),baseTokenProgram:token,quoteTokenProgram:token,isMayhemMode:false,isCashbackCoin:false,coinCreator:key(7)}}
it('fixed base output preserves explicit quote cap rather than adding slippage',()=>{
 for(const amount of [1n,1000000n]){
  const ix=buildBuyInstructions({payer:key(9),protocolParams:params(),inputAmount:amount,fixedOutputAmount:123n,slippageBasisPoints:300n,createOutputMintAta:false}).at(-1)!;
  expect(ix.data.subarray(0,8)).toEqual(PUMPSWAP_BUY_DISCRIMINATOR);
  expect(ix.data.readBigUInt64LE(8)).toBe(123n);expect(ix.data.readBigUInt64LE(16)).toBe(amount);
 }
});
it('reverse exact-output sell preserves quote cap and rejects wrong instruction direction',()=>{
 const args={payer:key(9),protocolParams:params(true),inputAmount:1n,fixedOutputAmount:123n,slippageBasisPoints:300n,createOutputMintAta:false};
 const ix=buildSellInstructions(args).at(-1)!;
 expect(ix.data.readBigUInt64LE(8)).toBe(123n);expect(ix.data.readBigUInt64LE(16)).toBe(1n);
 expect(()=>buildBuyInstructions({...args,createOutputMintAta:false})).toThrow();
 expect(()=>buildSellInstructions({...args,protocolParams:params()})).toThrow();
 expect(()=>buildBuyInstructions({...args,protocolParams:params(),fixedOutputAmount:1000000n})).toThrow();
});

it('uses explicit config fee recipient for both independent directions',()=>{
 for(const build of [buildBuyInstructions,buildSellInstructions]){
  const ix=build({payer:key(9),protocolParams:{...params(),protocolFeeRecipientOverride:key(20)},inputAmount:10000n,slippageBasisPoints:100n,createOutputMintAta:false}).at(-1)!;
  expect(ix.keys[9]!.pubkey).toEqual(key(20));
 }
});
