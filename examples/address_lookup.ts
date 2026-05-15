import { PublicKey } from '@solana/web3.js';
import { AddressLookupTableCache, fetchAddressLookupTableAccount } from 'sol-trade-sdk';
import { createConnection } from './_shared';

async function main() {
  const connection = createConnection();
  const cache = new AddressLookupTableCache();
  const altAddress = process.env.ALT_ADDRESS ? new PublicKey(process.env.ALT_ADDRESS) : undefined;

  console.log('Address Lookup Table example prepared.');
  if (!altAddress) {
    console.log('Set ALT_ADDRESS to fetch and cache a real lookup table.');
    return;
  }

  const direct = await fetchAddressLookupTableAccount(connection, altAddress);
  const cached = await cache.getLookupTable(connection, altAddress);
  console.log('Direct ALT size:', direct?.addresses.length ?? 0);
  console.log('Cached ALT size:', cached?.addresses.length ?? 0);
}

main().catch(console.error);
