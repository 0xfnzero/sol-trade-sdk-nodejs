import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {buildPumpFunBuyInstructions,buildPumpFunSellInstructions,PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR,PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR,PUMPFUN_SELL_DISCRIMINATOR,PUMPFUN_SELL_V2_DISCRIMINATOR} from '../src/instruction/pumpfun_builder';
import {CONSTANTS} from '../src/constants';
const keys:Record<string,PublicKey>={default:PublicKey.default,SOL:CONSTANTS.SOL_TOKEN_ACCOUNT,WSOL:CONSTANTS.WSOL_TOKEN_ACCOUNT,USDC:CONSTANTS.USDC_TOKEN_ACCOUNT};
const cases=JSON.parse(readFileSync(new URL('./fixtures/pumpfun_layout_rust_5_0_6.json',import.meta.url),'utf8')).cases;
for(const c of cases) for(const buy of [true,false]) it(`${buy?'buy':'sell'} quote=${c.quote} curve=${c.curve_quote} settlement=${c.settlement}`,()=>{
 const pk=(n:number)=>new PublicKey(new Uint8Array(32).fill(n));
 const protocolParams={bondingCurve:{account:pk(1),virtualTokenReserves:1000000000n,virtualSolReserves:1000000000n,realTokenReserves:900000000n,creator:pk(3),isMayhemMode:false,isCashbackCoin:false,quoteMint:keys[c.curve_quote]},creatorVault:pk(4),tokenProgram:CONSTANTS.TOKEN_PROGRAM,feeRecipient:pk(5),quoteMint:keys[c.quote]};
 const build=()=>buy?buildPumpFunBuyInstructions({payer:pk(42),inputMint:keys[c.settlement],outputMint:pk(2),inputAmount:10000n,createOutputMintAta:false,protocolParams}):buildPumpFunSellInstructions({payer:pk(42),inputMint:pk(2),outputMint:keys[c.settlement],inputAmount:10000n,protocolParams});
 if(c.error||c.strict_endpoint_error){expect(build).toThrow(/does not match/);return;}
 const instruction=build().find(i=>i.programId.toBase58()==='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')!;
 expect(instruction.data.subarray(0,8)).toEqual(buy?(c.v2?PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR:PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR):(c.v2?PUMPFUN_SELL_V2_DISCRIMINATOR:PUMPFUN_SELL_DISCRIMINATOR));
});
import {PumpFunParams as ExportedPumpFunParams} from '../src/params';
it('exported fromTrade retains quote, observed creator and fee recipient',()=>{
 const pk=(n:number)=>new PublicKey(new Uint8Array(32).fill(n));
 const p=ExportedPumpFunParams.fromTrade({bondingCurve:pk(1),associatedBondingCurve:pk(6),mint:pk(2),creator:pk(3),creatorVault:pk(4),virtualTokenReserves:1000000000n,virtualSolReserves:1000000000n,realTokenReserves:900000000n,realSolReserves:0n,feeRecipient:pk(5),tokenProgram:CONSTANTS.TOKEN_PROGRAM,isCashbackCoin:false,quoteMint:CONSTANTS.USDC_TOKEN_ACCOUNT,mayhemMode:true});
 expect(p.quoteMint).toEqual(CONSTANTS.USDC_TOKEN_ACCOUNT);expect(p.observedTradeCreator).toEqual(pk(3));expect(p.feeRecipient).toEqual(pk(5));expect(p.bondingCurve.isMayhemMode).toBe(true);
 const swap=buildPumpFunBuyInstructions({payer:pk(42),inputMint:CONSTANTS.USDC_TOKEN_ACCOUNT,outputMint:pk(2),inputAmount:10000n,createOutputMintAta:false,protocolParams:p}).at(-1)!;
 expect(swap.data.subarray(0,8)).toEqual(PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR);expect(swap.keys[6]!.pubkey).toEqual(pk(5));
});
