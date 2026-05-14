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
 * Layout matches Rust: version (4) + authority_type (4) + authority (32) + blockhash (32) starting at offset 40.
 */
export async function fetchDurableNonceInfo(
  connection: Pick<Connection, 'getAccountInfo'>,
  nonceAccount: PublicKey
): Promise<FetchedDurableNonce | null> {
  const account = await connection.getAccountInfo(nonceAccount);
  if (!account?.data || account.data.length < 72) {
    return null;
  }
  const data = Buffer.from(account.data);
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
