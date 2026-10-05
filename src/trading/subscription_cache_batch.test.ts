import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { SubscriptionAccountCache, type CachedAccount } from './subscription_cache';

const key = new PublicKey(new Uint8Array(32).fill(1));
const other = new PublicKey(new Uint8Array(32).fill(2));
const account = (version: bigint, data: string): CachedAccount => ({owner: other, data: Buffer.from(data), slot: 10n, writeVersion: version});
const context = {slot: 10n, epoch: 0n, maximumSlotAge: 0n};

describe('batch overlay', () => {
  it('orders repeated identities against staged versions and preserves frozen bytes', () => {
    const cache = new SubscriptionAccountCache();
    cache.update(key, account(1n, 'one'));
    const frozen = cache.snapshot();
    expect(cache.updateMany([[key, account(2n, 'two')], [key, account(1n, 'stale')], [key, account(2n, 'two')], [key, account(3n, 'three')]])).toBe(2);
    expect(Buffer.from(cache.snapshot().get(key, context).data).toString()).toBe('three');
    expect(Buffer.from(frozen.get(key, context).data).toString()).toBe('one');
  });
  it('rolls back accepted entries when an iterator throws', () => {
    const cache = new SubscriptionAccountCache();
    cache.update(key, account(1n, 'one'));
    function* updates(): IterableIterator<readonly [PublicKey, CachedAccount]> {
      yield [key, account(2n, 'two')];
      yield [other, account(1n, 'new')];
      throw Error('source failed');
    }
    expect(() => cache.updateMany(updates())).toThrow('source failed');
    expect(Buffer.from(cache.snapshot().get(key, context).data).toString()).toBe('one');
    expect(() => cache.snapshot().get(other, context)).toThrow('Missing');
  });
  it('rejects invalid late metadata without a partial commit', () => {
    const cache = new SubscriptionAccountCache();
    cache.update(key, account(1n, 'one'));
    expect(() => cache.updateMany([[key, account(2n, 'two')], [other, account(-1n, 'invalid')]])).toThrow('u64');
    expect(Buffer.from(cache.snapshot().get(key, context).data).toString()).toBe('one');
  });
  it('invalidates snapshots on conflicts inside the staged batch', () => {
    const cache = new SubscriptionAccountCache();
    cache.update(key, account(1n, 'one'));
    const frozen = cache.snapshot();
    expect(() => cache.updateMany([[key, account(2n, 'two')], [key, account(2n, 'conflict')]])).toThrow('Conflicting');
    expect(() => frozen.get(key, context)).toThrow('Conflicting');
    expect(() => cache.update(key, account(3n, 'three'))).toThrow('Conflicting');
  });
});
