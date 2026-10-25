import {PublicKey} from '@solana/web3.js';
import {PumpRouteExecution, selectPumpRoute, type PumpRouteOptions} from '../instruction/pump_route';
import {COMPACT_PUMP_PROGRAM as PUMP, COMPACT_AMM_PROGRAM as AMM, type PumpMultiHop} from '../instruction/pump_compact_accounts';
import {cachedPumpFun} from './cached_pumpfun';
import {cachedPumpSwap} from './cached_pumpswap';
import {getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction} from '../common/spl-token';
import type {AccountCacheSnapshot, PoolTradeHint, CacheReadContext} from './subscription_cache';
import type {PreparedCachedRoute} from './cached_route';

/** Native-SOL temporary-account settlement and cross-DEX routes retain their existing path. */
export function prepareOfficialPumpRoute(snapshot: AccountCacheSnapshot, hints: readonly PoolTradeHint[],
  context: CacheReadContext, payer: PublicKey, amount: bigint, options: PumpRouteOptions = {},
  nativeSettlement = false): PreparedCachedRoute | undefined {
  if (!hints.length) throw Error('Pump route requires hops');
  const input = hints[0]!.inputMint, output = hints.at(-1)!.outputMint;
  const fallback = () => selectPumpRoute(options,payer,input,output,amount,undefined);
  if (options.execution === PumpRouteExecution.Sequential || !options.minimumOutputAmount || !options.buybackRecipient || nativeSettlement || hints.length < 2 || hints.length > 3) {
    fallback(); return undefined;
  }
  const hops: PumpMultiHop[] = [];
  const programs = hints.map(h => snapshot.get(h.pool,context).owner);
  if (programs.some(p => !p.equals(PUMP) && !p.equals(AMM))) { fallback(); return undefined; }
  const zero = (f: {basisPoints:number;maximumFee:bigint}) => f.basisPoints === 0 || f.maximumFee === 0n;
  for (let i=0;i<hints.length;i++) {
    const h=hints[i]!;
    if (i && !hints[i-1]!.outputMint.equals(h.inputMint)) { fallback(); return undefined; }
    if (programs[i]!.equals(PUMP)) {
      const s=cachedPumpFun(snapshot,h,context);
      hops.push({venue:'curve',baseMint:s.mint,quoteMint:s.quote,address:h.pool,
        baseVault:getAssociatedTokenAddressSync(s.mint,h.pool,true,s.tokenProgram),
        quoteVault:getAssociatedTokenAddressSync(s.quote,h.pool,true,s.quoteTokenProgram),
        baseTokenProgram:s.tokenProgram,quoteTokenProgram:s.quoteTokenProgram,
        mayhem:s.curve.isMayhemMode,cashback:s.curve.isCashbackCoin,complete:s.curve.complete});
    } else {
      const s=cachedPumpSwap(snapshot,h,context),p=s.pool;
      if (s.disableFlags & (h.inputMint.equals(p.quoteMint) ? 8 : 16)) throw Error('PumpSwap direction is disabled');
      if (!s.buybackFeeRecipients.some(k => k.equals(options.buybackRecipient!))) throw Error('Pump buyback recipient is not in current GlobalConfig');
      if (!zero(s.baseTransferFee) || !zero(s.quoteTransferFee)) { fallback(); return undefined; }
      hops.push({venue:'pool',baseMint:p.baseMint,quoteMint:p.quoteMint,address:h.pool,
        baseVault:p.poolBaseTokenAccount,quoteVault:p.poolQuoteTokenAccount,
        baseTokenProgram:s.baseTokenProgram,quoteTokenProgram:s.quoteTokenProgram,
        mayhem:p.isMayhemMode,cashback:p.isCashbackCoin,index:p.index,creator:p.creator});
    }
  }
  const currency = input.equals(hops[0]!.quoteMint) ? hops[0]! : hops.at(-1)!;
  if (currency.venue === 'curve' && currency.quoteMint.toBase58() === 'So11111111111111111111111111111111111111112') {
    fallback(); return undefined; // Official curve currency settles wallet SOL, not a WSOL balance.
  }
  const ix=selectPumpRoute(options,payer,input,output,amount,hops);
  if (!ix) return undefined;
  const buy=input.equals(hops[0]!.quoteMint),last=hops.at(-1)!;
  const endpoints = [[input,buy?hops[0]!.quoteTokenProgram:hops[0]!.baseTokenProgram,payer],
    [output,buy?last.baseTokenProgram:last.quoteTokenProgram,payer],
    [currency.quoteMint,currency.quoteTokenProgram,options.buybackRecipient]] as const;
  const setupInstructions=endpoints.map(([mint,token,owner]) => createAssociatedTokenAccountIdempotentInstruction(
    payer,getAssociatedTokenAddressSync(mint,owner!,true,token),owner!,mint,token));
  snapshot.assertUsable();
  return {execution:PumpRouteExecution.Official,legs:[],setupInstructions,swapInstructions:[ix],
    minimumNetAmountOut:options.minimumOutputAmount!,estimatedIntermediateResiduals:[]};
}
