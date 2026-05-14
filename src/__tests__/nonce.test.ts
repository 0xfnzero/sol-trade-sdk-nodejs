/**
 * Rust `nonce_cache::fetch_nonce_info` parity
 */

import { describe, it, expect } from 'vitest';
import { PublicKey, type Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { fetchDurableNonceInfo } from '../common/nonce';

describe('fetchDurableNonceInfo', () => {
  it('parses authority at 8..40 and blockhash at 40..72', async () => {
    const auth = new PublicKey(Buffer.alloc(32, 7));
    const hashBytes = Buffer.alloc(32);
    hashBytes[0] = 9;
    const data = Buffer.alloc(80);
    auth.toBuffer().copy(data, 8);
    hashBytes.copy(data, 40);
    const conn = {
      getAccountInfo: async () => ({ data, owner: PublicKey.default }),
    } as Pick<Connection, 'getAccountInfo'>;
    const noncePk = new PublicKey(Buffer.alloc(32, 3));
    const got = await fetchDurableNonceInfo(conn, noncePk);
    expect(got).not.toBeNull();
    expect(got!.authority.equals(auth)).toBe(true);
    expect(got!.nonceHash).toBe(bs58.encode(hashBytes));
    expect(got!.recentBlockhash).toBe(got!.nonceHash);
    expect(got!.nonceAccount.equals(noncePk)).toBe(true);
  });

  it('returns null when account data too short', async () => {
    const conn = {
      getAccountInfo: async () => ({ data: Buffer.alloc(10) }),
    } as Pick<Connection, 'getAccountInfo'>;
    const got = await fetchDurableNonceInfo(conn, PublicKey.default);
    expect(got).toBeNull();
  });

  it('returns null when account missing', async () => {
    const conn = {
      getAccountInfo: async () => null,
    } as Pick<Connection, 'getAccountInfo'>;
    const got = await fetchDurableNonceInfo(conn, PublicKey.default);
    expect(got).toBeNull();
  });
});
