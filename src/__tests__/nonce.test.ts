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
    data.writeUInt32LE(1, 0);
    data.writeUInt32LE(1, 4);
    auth.toBuffer().copy(data, 8);
    hashBytes.copy(data, 40);
    const conn = {
      getAccountInfo: async () => ({ data, owner: PublicKey.default, executable: false }),
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
      getAccountInfo: async () => ({ data: Buffer.alloc(10), owner: PublicKey.default, executable: false }),
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

  it.each(['foreign-owner', 'executable', 'uninitialized', 'unknown-state', 'legacy-version', 'unknown-version', 'truncated', 'oversized'])('rejects %s through the public fetch helper', async (kind) => {
    let data = Buffer.alloc(80);
    data.writeUInt32LE(1, 0);
    data.writeUInt32LE(1, 4);
    const owner = kind === 'foreign-owner' ? new PublicKey(Buffer.alloc(32, 2)) : PublicKey.default;
    if (kind === 'uninitialized' || kind === 'unknown-state') data.writeUInt32LE(kind === 'uninitialized' ? 0 : 2, 4);
    if (kind === 'legacy-version' || kind === 'unknown-version') data.writeUInt32LE(kind === 'legacy-version' ? 0 : 2, 0);
    if (kind === 'truncated') data = data.subarray(0, 72);
    if (kind === 'oversized') data = Buffer.concat([data, Buffer.alloc(1)]);
    const connection = { getAccountInfo: async () => ({data, owner, executable: kind === 'executable'}) } as Pick<Connection, 'getAccountInfo'>;
    expect(await fetchDurableNonceInfo(connection, PublicKey.default)).toBeNull();
  });
});
