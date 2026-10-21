import { it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { PumpSwapRoutingConfig, PoolTradeHint } from '../src';
import { replayGlobalRouting } from '../examples/pumpswap_global_routing';
it('merges defaults atomically and preserves alternatives', () => {
 const c=new PumpSwapRoutingConfig(), pools=c.conversionPools;
 expect(pools).toHaveLength(59);
 c.extendPools([...pools,...pools.map(h=>new PoolTradeHint(h.pool,h.outputMint,h.inputMint))]);
 expect(c.conversionPools).toHaveLength(59);
 const h=pools[0]!;
 const extra=new PoolTradeHint(new PublicKey(new Uint8Array(32).fill(91)),h.inputMint,h.outputMint);
 expect(()=>c.extendPools([extra,new PoolTradeHint(h.pool,h.inputMint,extra.pool)])).toThrow(/Conflicting/);
 expect(c.conversionPools).toHaveLength(59);
 c.extendPools([extra]); expect(c.conversionPools).toHaveLength(60);
 expect(new PumpSwapRoutingConfig([]).conversionPools).toHaveLength(0);
});
it('quotes buy and sell from partial cached state with all defaults', () => {
 expect(replayGlobalRouting().map(r=>r.trade.minimumNetAmountOut)).toEqual([47932572n,19264527n]);
});
import { replayPumpSwapFixture } from '../examples/pumpswap_cached_prepare';
it('starts USDC at its own pool and configures bridge slippage independently', () => {
 const f=replayPumpSwapFixture(), config=new PumpSwapRoutingConfig();
 const usdc=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
 const request={snapshot:f.snapshot,context:f.context,unixTimestamp:1792302906n,
   payer:f.payer.publicKey,amount:1000000n,tradeType:'Buy' as const,slippageBps:500};
 const a=config.prepare(request,f.search.pool,f.search.tokenMint,usdc).trade;
 expect(a.preview.legs).toHaveLength(2);
 expect(a.preview.legs[0]!.hint.inputMint.equals(usdc)).toBe(true);
 config.bridgeSlippageBps=0;
 const b=config.prepare(request,f.search.pool,f.search.tokenMint,usdc).trade;
 expect(b.preview.legs[0]!.minimumNetAmountOut).toBeGreaterThan(a.preview.legs[0]!.minimumNetAmountOut);
 expect(b.minimumNetAmountOut).toBeGreaterThan(a.minimumNetAmountOut);
 config.maximumBridgePriceImpactBps=10000;
 expect(()=>config.prepare(request,f.search.pool,f.search.tokenMint,usdc)).toThrow();
});
import { prepareCachedRoute } from '../src/trading/cached_route';
it('rejects large bridge impact and honors user tolerance from the same captured state', () => {
 const f=replayPumpSwapFixture();
 const quote=(impact:number)=>prepareCachedRoute(f.snapshot,[new PumpSwapRoutingConfig().conversionPools.find(h=>h.pool.toBase58() === "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2")!],f.context,
   1792302906n,f.payer.publicKey,1000000000000n,100,6,false,
   {anchorPool:f.search.pool,slippageBps:100,maximumPriceImpactBps:impact});
 expect(()=>quote(0)).toThrow(/impact/);
 expect(quote(9999).minimumNetAmountOut).toBeGreaterThan(0n);
});

import { vi } from 'vitest';
import * as spl from '../src/common/spl-token';
it('builds each swap and ATA once even with bridge probes', () => {
 const f=replayPumpSwapFixture(), c=new PumpSwapRoutingConfig();
 const request={snapshot:f.snapshot,context:f.context,unixTimestamp:1792302906n,payer:f.payer.publicKey,amount:1000000n,tradeType:'Buy' as const};
 const selected=c.prepare(request,f.search.pool,f.search.tokenMint,f.search.assetMint).trade;
 const ata=vi.spyOn(spl,'createAssociatedTokenAccountIdempotentInstruction');
 const amm=vi.spyOn(f.snapshot,'prepareAmmV4'), dlmm=vi.spyOn(f.snapshot,'prepareDlmm'), pump=vi.spyOn(f.snapshot,'preparePumpSwap');
 try {
  const result=prepareCachedRoute(f.snapshot,selected.preview.legs.map(l=>l.hint),f.context,request.unixTimestamp,request.payer,request.amount,100,6,false,
    {anchorPool:f.search.pool,slippageBps:100,maximumPriceImpactBps:100});
  expect(result.minimumNetAmountOut).toBe(47932572n);
  expect([ata.mock.calls.length,amm.mock.calls.length,dlmm.mock.calls.length,pump.mock.calls.length]).toEqual([4,1,1,1]);
 } finally { vi.restoreAllMocks(); }
 const changed=c.prepare({...request,amount:2000000n},f.search.pool,f.search.tokenMint,f.search.assetMint).trade;
 expect(changed.minimumNetAmountOut).not.toBe(selected.minimumNetAmountOut);
});

import * as preparation from '../src/trading/pumpswap_preparation';
it('reuses topology and protects cached identities from caller mutation', () => {
 const f=replayPumpSwapFixture(), c=new PumpSwapRoutingConfig();
 const build=vi.spyOn(preparation,'buildPumpSwapTopology');
 try {
  const request={snapshot:f.snapshot,context:f.context,unixTimestamp:1792302906n,payer:f.payer.publicKey,amount:1000000n,tradeType:'Buy' as const};
  for(let i=0;i<2;i++) expect(c.prepare(request,f.search.pool,f.search.tokenMint,f.search.assetMint).trade.minimumNetAmountOut).toBe(47932572n);
  expect(build).not.toHaveBeenCalled();
  const h=c.conversionPools[0]!;
  expect(()=>c.extendPools([new PoolTradeHint(h.pool,h.inputMint,new PublicKey(new Uint8Array(32).fill(99)))])).toThrow();
  expect(c.prepare(request,f.search.pool,f.search.tokenMint,f.search.assetMint).trade.minimumNetAmountOut).toBe(47932572n);
  c.extendPools([h]); expect(build).toHaveBeenCalledTimes(1);
 } finally { vi.restoreAllMocks(); }
});
