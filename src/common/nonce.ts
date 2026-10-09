/**
 * Durable nonce helpers — aligned with Rust `src/common/nonce_cache.rs` `fetch_nonce_info`.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

/** Same shape as `DurableNonceInfo` in `index.ts` (used for `buy`/`sell` without circular imports). */
export interface FetchedDurableNonce {
  nonceAccount: PublicKey;
  authority: PublicKey;
  /** Base58-encoded current nonce blockhash (32 bytes), for `recentBlockhash` / `nonceHash`. */
  nonceHash: string;
  /** Duplicate of `nonceHash` for parity with existing `DurableNonceInfo.recentBlockhash`. */
  recentBlockhash: string;
}

/**
 * Fetch durable nonce authority + current blockhash from a nonce account (RPC).
 * Accepts only System-owned, non-executable Current/Initialized nonce accounts.
 * Legacy nonces cannot validate durable transactions; the full layout is 80 bytes.
 */
export async function fetchDurableNonceInfo(
  connection: Pick<Connection, 'getAccountInfo'>,
  nonceAccount: PublicKey
): Promise<FetchedDurableNonce | null> {
  const account = await connection.getAccountInfo(nonceAccount);
  if (!account?.data || !account.owner.equals(PublicKey.default) || account.executable || account.data.length !== 80) {
    return null;
  }
  const data = Buffer.from(account.data);
  if (data.readUInt32LE(0) !== 1 || data.readUInt32LE(4) !== 1) return null;
  const authority = new PublicKey(data.subarray(8, 40));
  const hashBytes = data.subarray(40, 72);
  const nonceHash = bs58.encode(hashBytes);
  return {
    nonceAccount,
    authority,
    nonceHash,
    recentBlockhash: nonceHash,
  };
}
