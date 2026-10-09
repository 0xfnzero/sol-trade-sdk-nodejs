import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { SubscriptionAccountCache, PoolTradeHint } from './subscription_cache';
import { SubscriptionReadiness } from './subscription_readiness';
const k = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const ctx = {slot: 10n, epoch: 0n, maximumSlotAge: 0n};
const a = (version: bigint, data = Buffer.from('one')) => ({owner:k(9),data,slot:10n,writeVersion:version});

describe('dependency-scoped snapshots', () => {
  it('owns bytes and freezes membership while preserving optional tombstone semantics', () => {
    const c = new SubscriptionAccountCache(), input = Buffer.from('one');
    c.updateMany([[k(1),a(1n,input)],[k(2),a(1n)], [k(3),a(1n,Buffer.alloc(0))]]);
    const s = c.snapshot([k(1),k(1),k(3)]); input.fill(0);
    c.update(k(1),a(2n,Buffer.from('two')));
    const returned = s.get(k(1),ctx); returned.data.fill(0);
    expect(Buffer.from(s.get(k(1),ctx).data).toString()).toBe('one');
    expect(s.getOptional(k(3),ctx)).toBeNull();
    expect(() => s.getOptional(k(2),ctx)).toThrow('Missing');
    expect(() => c.snapshot([k(4)])).toThrow('Missing');
    expect(() => c.snapshot([]).get(k(1),ctx)).toThrow('Missing');
    expect(() => s.get(k(1),{...ctx,slot:9n})).toThrow('future');
    expect(() => s.get(k(1),{...ctx,slot:11n})).toThrow('stale');
    expect(() => s.get(k(1),ctx,k(8))).toThrow('owner');
  });
  it('materializes dynamic iterators before selecting versions', () => {
    const c = new SubscriptionAccountCache(); c.updateMany([[k(1),a(1n)],[k(2),a(1n)]]);
    function* keys() { yield k(1); c.updateMany([[k(1),a(2n)],[k(2),a(2n)]]); yield k(2); yield k(1); }
    const s = c.snapshot(keys()); expect(s.get(k(1),ctx).writeVersion).toBe(2n); expect(s.get(k(2),ctx).writeVersion).toBe(2n);
  });
  it('retains cache fork and readiness generation invalidation', () => {
    const c = new SubscriptionAccountCache(); c.update(k(1),a(1n));
    const r = new SubscriptionReadiness('fork',[k(1).toBase58()]);
    expect(() => c.readySnapshot(r,[k(1)])).toThrow('continuity changed');
    r.markValidated([k(1).toBase58()],0n,'fork'); const s=c.readySnapshot(r,[k(1)]);
    r.interrupt('disconnected'); expect(() => s.get(k(1),ctx)).toThrow('disconnected');
    const plain = c.snapshot([k(1)]); expect(() => c.update(k(1),a(1n,Buffer.from('conflict')))).toThrow('Conflicting');
    expect(() => plain.get(k(1),ctx)).toThrow('Conflicting'); expect(() => c.snapshot([k(1)])).toThrow('Conflicting');
  });
  it('six real CPMM dependencies produce the full quote/build and each omission fails', () => {
    const f=JSON.parse(readFileSync('examples/fixtures/cpmm_mainnet_20261002.json','utf8'));
    const names=['pool','config','base_mint','quote_mint','base_vault','quote_vault'], c=new SubscriptionAccountCache();
    const keys=names.map(name=>{const v=f[name], key=new PublicKey(v.pubkey);c.update(key,{owner:new PublicKey(v.owner),data:Buffer.from(v.data,'base64'),slot:BigInt(v.slot),writeVersion:BigInt(v.write_version)});return key;});
    c.update(k(7),a(1n));
    const hint=new PoolTradeHint(keys[0]!,keys[f.base_in?2:3]!,keys[f.base_in?3:2]!);
    const context={slot:BigInt(f.read_slot),epoch:BigInt(f.epoch),maximumSlotAge:BigInt(f.maximum_slot_age)};
    const prepare=(s:ReturnType<typeof c.snapshot>)=>s.prepareCpmm(hint,context,BigInt(f.unix_timestamp),new PublicKey(f.payer),BigInt(f.amount),f.slippage_bps);
    expect(prepare(c.snapshot(keys))).toEqual(prepare(c.snapshot()));
    for (const omitted of keys) expect(()=>prepare(c.snapshot(keys.filter(key=>!key.equals(omitted))))).toThrow('Missing');
    const r=new SubscriptionReadiness('fork',keys.map(key=>key.toBase58()));r.markValidated(keys.map(key=>key.toBase58()),0n,'fork');expect(prepare(c.readySnapshot(r,keys))).toEqual(prepare(c.snapshot()));
  });
});
