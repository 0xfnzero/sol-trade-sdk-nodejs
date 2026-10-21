import {it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {PumpFunVersion,buildPumpFunBuyInstructions,buildPumpFunSellInstructions,getBondingCurvePda,type PumpFunParams} from '../instruction/pumpfun_builder';
import {TOKEN_2022_PROGRAM_ID} from '../common/spl-token';

it('V1 preserves native settlement and rejects explicit token endpoints for both sides', () => {
 const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
 const mint = key(1), payer = key(3);
 const sol = new PublicKey('So11111111111111111111111111111111111111111');
 const p: PumpFunParams = {version: PumpFunVersion.Legacy,
  bondingCurve: {account: getBondingCurvePda(mint), virtualTokenReserves: 1000000n,
   virtualSolReserves: 1000000n, realTokenReserves: 800000n, isMayhemMode: false, isCashbackCoin: false},
  creatorVault: PublicKey.default, tokenProgram: TOKEN_2022_PROGRAM_ID};
 const buy = (inputMint?: PublicKey) => buildPumpFunBuyInstructions({payer, inputMint,
  outputMint: mint, inputAmount: 10000n, protocolParams: p, createOutputMintAta: false});
 const sell = (outputMint?: PublicKey) => buildPumpFunSellInstructions({payer, outputMint,
  inputMint: mint, inputAmount: 10000n, fixedOutputAmount: 7n, protocolParams: p});
 for (const endpoint of [undefined, PublicKey.default, sol]) {
  const buyIx = buy(endpoint), sellIx = sell(endpoint);
  expect(buyIx).toHaveLength(1); expect(sellIx).toHaveLength(1);
  expect(buyIx[0]!.data.subarray(0, 8).toString('hex')).toBe('38fc74089edfcd5f');
  expect(sellIx[0]!.data.subarray(0, 8).toString('hex')).toBe('33e685a4017f83ad');
  expect(sellIx[0]!.data.readBigUInt64LE(16)).toBe(7n);
 }
 for (const endpoint of [new PublicKey('So11111111111111111111111111111111111111112'),
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), key(4)]) {
  expect(() => buy(endpoint)).toThrow(/wallet SOL/);
  expect(() => sell(endpoint)).toThrow(/wallet SOL/);
 }
 expect(p.version).toBe(PumpFunVersion.Legacy);
});

it('V3 stock quote uses actual token programs and explicit bounds; V1 rejects it',()=>{
 const key=(n:number)=>new PublicKey(new Uint8Array(32).fill(n));
 const mint=key(1),quote=key(2),payer=key(3);
 const p:PumpFunParams={version:PumpFunVersion.V3,bondingCurve:{account:getBondingCurvePda(mint),virtualTokenReserves:1000000n,virtualSolReserves:1000000n,realTokenReserves:800000n,isMayhemMode:false,isCashbackCoin:false},creatorVault:key(4),tokenProgram:TOKEN_2022_PROGRAM_ID,quoteMint:quote,quoteTokenProgram:TOKEN_2022_PROGRAM_ID,minimumOutputAmount:7n,baseTransferFeeBps:0,quoteTransferFeeBps:0};
 const buy=(protocolParams=p)=>buildPumpFunBuyInstructions({payer,inputMint:quote,outputMint:mint,inputAmount:100n,protocolParams,createOutputMintAta:false});
 const sell=buildPumpFunSellInstructions({payer,inputMint:mint,outputMint:quote,inputAmount:100n,protocolParams:p});
 for(const ix of [buy()[0]!,sell[0]!]){
  expect(ix.keys).toHaveLength(17);
  expect(ix.keys[2]!.pubkey).toEqual(quote);
  expect(ix.keys[4]!.pubkey).toEqual(TOKEN_2022_PROGRAM_ID);
  expect(ix.data.readBigUInt64LE(8)).toBe(100n);
  expect(ix.data.readBigUInt64LE(16)).toBe(7n);
 }
 expect(()=>buy({...p,version:PumpFunVersion.Legacy})).toThrow(/native SOL/);
 expect(()=>buy({...p,quoteTransferFeeBps:undefined})).toThrow(/verified zero/);
 expect(()=>buy({...p,quoteTransferFeeBps:1})).toThrow();
 expect(()=>buy({...p,bondingCurve:{...p.bondingCurve,complete:true}})).toThrow(/active/);
 const protectedSell=buildPumpFunSellInstructions({payer,inputMint:mint,outputMint:quote,inputAmount:100n,protocolParams:p,fixedOutputAmount:99n})[0]!;
 expect(protectedSell.data.readBigUInt64LE(16)).toBe(99n);
 expect(()=>buildPumpFunSellInstructions({payer,inputMint:mint,outputMint:quote,inputAmount:100n,protocolParams:p,fixedOutputAmount:0n})).toThrow(/nonzero/);
 expect(()=>buildPumpFunBuyInstructions({payer,inputMint:quote,outputMint:mint,inputAmount:100n,protocolParams:p,useExactSolAmount:false})).toThrow(/explicit fixed output/);
 const exact=buildPumpFunBuyInstructions({payer,inputMint:quote,outputMint:mint,inputAmount:100n,protocolParams:p,useExactSolAmount:false,fixedOutputAmount:55n,createOutputMintAta:false})[0]!;
 expect(exact.data.subarray(0,8).toString('hex')).toBe('07051dc4f5176550');
 expect(exact.data.readBigUInt64LE(8)).toBe(55n);
 expect(exact.data.readBigUInt64LE(16)).toBe(100n);
});

it('V3 native maximum-input sizing preserves the output target and rejects direct WSOL settlement',()=>{
 const mint=new PublicKey(new Uint8Array(32).fill(1)),payer=new PublicKey(new Uint8Array(32).fill(3));
 const sol=new PublicKey('So11111111111111111111111111111111111111111'),wsol=new PublicKey('So11111111111111111111111111111111111111112');
 const p:PumpFunParams={version:PumpFunVersion.V3,bondingCurve:{account:getBondingCurvePda(mint),virtualTokenReserves:1000000n,virtualSolReserves:1000000n,realTokenReserves:800000n,isMayhemMode:false,isCashbackCoin:false},creatorVault:PublicKey.default,tokenProgram:TOKEN_2022_PROGRAM_ID};
 const request={payer,inputMint:sol,outputMint:mint,inputAmount:10000n,slippageBasisPoints:1000n,protocolParams:p,createOutputMintAta:false};
 const ix=buildPumpFunBuyInstructions({...request,useExactSolAmount:false})[0]!;
 // 9,999 quote units less the 95 bps fee -> 9,904, then constant-product output.
 expect(ix.data.subarray(0,8).toString('hex')).toBe('07051dc4f5176550');
 expect(ix.data.readBigUInt64LE(8)).toBe(9806n);
 expect(ix.data.readBigUInt64LE(16)).toBe(11000n);
 expect(buildPumpFunBuyInstructions(request)[0]!.data.subarray(0,8).toString('hex')).toBe('e1f7501ed5b38488');
 expect(()=>buildPumpFunBuyInstructions({...request,inputMint:wsol})).toThrow(/wallet SOL/);
 expect(()=>buildPumpFunSellInstructions({payer,inputMint:mint,outputMint:wsol,inputAmount:10000n,protocolParams:p})).toThrow(/wallet SOL/);
});
