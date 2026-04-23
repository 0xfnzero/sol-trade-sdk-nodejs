/**
 * Address Lookup Table support for Solana transactions.
 *
 * This module provides functionality to fetch and use Address Lookup Tables (ALT)
 * to reduce transaction size by storing frequently used addresses in a lookup table.
 */

import { PublicKey, Connection, AccountInfo } from '@solana/web3.js';

/**
 * Represents an address lookup table account.
 */
export interface AddressLookupTableAccount {
  key: PublicKey;
  addresses: PublicKey[];
}

/**
 * Header structure for Address Lookup Table (56 bytes)
 * - authority: 32 bytes
 * - deactivationSlot: 8 bytes
 * - lastExtendedSlot: 8 bytes
 * - lastExtendedSlotStartIndex: 1 byte
 * - padding: 7 bytes
 */
const ALT_HEADER_SIZE = 56;

/**
 * Fetch an address lookup table account from the blockchain.
 *
 * @param connection - Solana RPC connection
 * @param lookupTableAddress - The address of the lookup table
 * @param commitment - Commitment level for the query
 * @returns AddressLookupTableAccount if found, null otherwise
 */
export async function fetchAddressLookupTableAccount(
  connection: Connection,
  lookupTableAddress: PublicKey,
  commitment?: 'processed' | 'confirmed' | 'finalized'
): Promise<AddressLookupTableAccount | null> {
  try {
    const info = await connection.getAccountInfo(
      lookupTableAddress,
      commitment ?? 'confirmed'
    );

    if (info === null) {
      return null;
    }

    return parseAddressLookupTable(lookupTableAddress, info);
  } catch (error) {
    throw new Error(`Failed to fetch address lookup table: ${error}`);
  }
}

/**
 * Parse an address lookup table from account data.
 *
 * @param key - The lookup table public key
 * @param accountInfo - The account info containing the lookup table data
 * @returns AddressLookupTableAccount
 */
export function parseAddressLookupTable(
  key: PublicKey,
  accountInfo: AccountInfo<Buffer>
): AddressLookupTableAccount | null {
  const data = accountInfo.data;

  if (data.length < ALT_HEADER_SIZE) {
    return null;
  }

  // Skip header and parse addresses
  const addressesData = data.slice(ALT_HEADER_SIZE);
  const addresses: PublicKey[] = [];

  // Each address is 32 bytes
  for (let i = 0; i + 32 <= addressesData.length; i += 32) {
    const addrBytes = addressesData.slice(i, i + 32);
    addresses.push(new PublicKey(addrBytes));
  }

  return {
    key,
    addresses,
  };
}

/**
 * Cache for address lookup tables to avoid repeated RPC calls.
 */
export class AddressLookupTableCache {
  private cache: Map<string, AddressLookupTableAccount> = new Map();

  /**
   * Get lookup table from cache or fetch from RPC.
   *
   * @param connection - Solana RPC connection
   * @param lookupTableAddress - The lookup table address
   * @returns AddressLookupTableAccount if found, null otherwise
   */
  async getLookupTable(
    connection: Connection,
    lookupTableAddress: PublicKey
  ): Promise<AddressLookupTableAccount | null> {
    const key = lookupTableAddress.toBase58();

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const lookupTable = await fetchAddressLookupTableAccount(connection, lookupTableAddress);

    if (lookupTable) {
      this.cache.set(key, lookupTable);
    }

    return lookupTable;
  }

  /**
   * Get multiple lookup tables from cache or fetch from RPC.
   *
   * @param connection - Solana RPC connection
   * @param lookupTableAddresses - Array of lookup table addresses
   * @returns Array of AddressLookupTableAccount (null for not found)
   */
  async getLookupTables(
    connection: Connection,
    lookupTableAddresses: PublicKey[]
  ): Promise<(AddressLookupTableAccount | null)[]> {
    const results: (AddressLookupTableAccount | null)[] = [];
    const toFetch: { index: number; address: PublicKey }[] = [];

    // Check cache first
    for (let i = 0; i < lookupTableAddresses.length; i++) {
      const addr = lookupTableAddresses[i];
      if (!addr) continue;
      const key = addr.toBase58();
      const cached = this.cache.get(key);
      if (cached) {
        results[i] = cached;
      } else {
        results[i] = null;
        toFetch.push({ index: i, address: addr });
      }
    }

    // Fetch missing tables
    if (toFetch.length > 0) {
      const fetchPromises = toFetch.map(async ({ index, address }) => {
        const lookupTable = await fetchAddressLookupTableAccount(connection, address);
        if (lookupTable) {
          this.cache.set(address.toBase58(), lookupTable);
        }
        return { index, lookupTable };
      });

      const fetched = await Promise.all(fetchPromises);
      for (const { index, lookupTable } of fetched) {
        results[index] = lookupTable;
      }
    }

    return results;
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific lookup table from cache.
   *
   * @param lookupTableAddress - The lookup table address to remove
   */
  remove(lookupTableAddress: PublicKey): void {
    const key = lookupTableAddress.toBase58();
    this.cache.delete(key);
  }

  /**
   * Get cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Default global cache instance.
 */
export const addressLookupTableCache = new AddressLookupTableCache();
