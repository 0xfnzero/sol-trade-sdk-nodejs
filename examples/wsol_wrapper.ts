/**
 * WSOL Wrapper Example
 *
 * This example demonstrates how to:
 * 1. Wrap SOL to WSOL
 * 2. Partially unwrap WSOL back to SOL using seed account
 * 3. Close WSOL account and unwrap remaining balance
 */

import {
  TradeConfigBuilder,
  SwqosConfig,
  SwqosType,
  TradingClient,
} from 'sol-trade-sdk';
import { Keypair } from '@solana/web3.js';

async function createClient(): Promise<TradingClient> {
  const payer = Keypair.generate();
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
  ];

  const tradeConfig = TradeConfigBuilder.create(rpcUrl)
      .swqosConfigs(swqosConfigs)
      // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
      .build();

  return TradingClient.new(payer, tradeConfig);
}

async function main() {
  console.log('WSOL Wrapper Example');
  console.log('This example demonstrates:');
  console.log('1. Wrapping SOL to WSOL');
  console.log('2. Partial unwrapping WSOL back to SOL');
  console.log('3. Closing WSOL account and unwrapping remaining balance');

  // Initialize client
  const client = await createClient();
  console.log(`\nClient created: ${client.payerPubkey}`);

  // Example 1: Wrap SOL to WSOL
  console.log('\n--- Example 1: Wrapping SOL to WSOL ---');
  const wrapAmount = 1_000_000; // 0.001 SOL in lamports
  console.log(`Wrapping ${wrapAmount} lamports (0.001 SOL) to WSOL...`);

  try {
    const signature = await client.wrapSolToWsol(wrapAmount);
    console.log('Successfully wrapped SOL to WSOL!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`Explorer: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.log(`Failed to wrap SOL to WSOL: ${error}`);
    return;
  }

  // Wait before partial unwrapping
  console.log('\nWaiting 3 seconds before partial unwrapping...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Example 2: Unwrap half of the WSOL back to SOL using seed account
  console.log('\n--- Example 2: Unwrapping half of WSOL back to SOL ---');
  const unwrapAmount = wrapAmount / 2; // Half of the wrapped amount
  console.log(`Unwrapping ${unwrapAmount} lamports (0.0005 SOL) back to SOL...`);

  try {
    const signature = await client.wrapWsolToSol(unwrapAmount);
    console.log('Successfully unwrapped half of WSOL back to SOL!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`Explorer: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.log(`Failed to unwrap WSOL to SOL: ${error}`);
  }

  // Wait before final unwrapping
  console.log('\nWaiting 3 seconds before final unwrapping...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Example 3: Close WSOL account and unwrap all remaining balance
  console.log('\n--- Example 3: Closing WSOL account ---');
  console.log('Closing WSOL account and unwrapping all remaining balance to SOL...');

  try {
    const signature = await client.closeWsol();
    console.log('Successfully closed WSOL account and unwrapped remaining balance!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`Explorer: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.log(`Failed to close WSOL account: ${error}`);
  }

  console.log('\nWSOL Wrapper example completed!');
}

main().catch(console.error);
