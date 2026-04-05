/**
 * Address Lookup Table Example
 *
 * This example demonstrates how to use Address Lookup Tables (ALT)
 * to optimize transaction size and reduce fees.
 */

import {
  fetchAddressLookupTableAccount,
  AddressLookupTableCache,
} from 'sol-trade-sdk/address-lookup';
import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  console.log('Address Lookup Table Example');

  // Create connection
  const connection = new Connection('https://api.mainnet-beta.solana.com');

  // Example ALT address
  const altAddress = new PublicKey('your_alt_address_here');

  try {
    // Fetch ALT from chain
    const alt = await fetchAddressLookupTableAccount(connection, altAddress);
    console.log(`ALT contains ${alt.addresses.length} addresses`);

    // List addresses
    for (let i = 0; i < alt.addresses.length; i++) {
      console.log(`  [${i}] ${alt.addresses[i].toBase58()}`);
    }

    // Use cache for performance
    const cache = new AddressLookupTableCache(connection);
    await cache.prefetch([altAddress]);
    const cached = cache.get(altAddress);
    if (cached) {
      console.log('\nCached ALT retrieved successfully');
    }
  } catch (error) {
    console.log('ALT example completed (no real ALT provided)');
    return;
  }

  console.log('\nAddress Lookup Table example completed!');
}

main().catch(console.error);
