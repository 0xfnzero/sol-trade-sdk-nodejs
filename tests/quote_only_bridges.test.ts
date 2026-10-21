import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { SubscriptionAccountCache, PoolTradeHint } from '../src/trading/subscription_cache';
import { quoteCachedClmm, prepareCachedClmm } from '../src/trading/cached_clmm';
import { quoteCachedDlmm, prepareCachedDlmm } from '../src/trading/cached_dlmm';
import { quoteCachedWhirlpool, prepareCachedWhirlpool } from '../src/trading/cached_whirlpool';
import * as spl from '../src/common/spl-token';
import * as builders from '../src/instruction/native_hops';
for (const [name, quote, prepare] of [
 ['clmm', quoteCachedClmm, prepareCachedClmm],
 ['dlmm', quoteCachedDlmm, prepareCachedDlmm],
 ['whirlpool', quoteCachedWhirlpool, prepareCachedWhirlpool],
] as const) for (const reverse of [false,true]) it(`${name} quote-only parity reverse=${reverse}`, () => {
 const v=JSON.parse(readFileSync(new URL(`../examples/fixtures/${name}_mainnet_20261002.json`,import.meta.url),'utf8'));
 const cache=new SubscriptionAccountCache();
 for (const a of v.accounts) cache.update(new PublicKey(a.pubkey),{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)});
 const snapshot=cache.snapshot(), hint=new PoolTradeHint(new PublicKey(v.pool),new PublicKey(reverse?v.output_mint:v.input_mint),new PublicKey(reverse?v.input_mint:v.output_mint));
 const context={slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:0n};
 const amount=reverse && name==='dlmm'?1000000n:10000n;
 const args=[snapshot,hint,context,BigInt(v.unix_timestamp),new PublicKey(v.payer),amount,100,8] as const;
 const expected=prepare(...args).quote;
 const forbidden=()=>{throw Error('quote built ATA or swap instruction')};
 vi.spyOn(spl,'getAssociatedTokenAddressSync').mockImplementation(forbidden);
 vi.spyOn(builders,'buildRaydiumClmmSwapV2').mockImplementation(forbidden);
 vi.spyOn(builders,'buildMeteoraDlmmSwap2').mockImplementation(forbidden);
 vi.spyOn(builders,'buildWhirlpoolSwapV2').mockImplementation(forbidden);
 try {expect(quote(...args)).toEqual(expected);} finally {vi.restoreAllMocks();}
});
