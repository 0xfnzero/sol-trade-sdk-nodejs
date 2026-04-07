/**
 * TradingClient Creation Example
 *
 * This example demonstrates two ways to create a TradingClient:
 * 1. Simple method: TradingClient() - creates client with its own infrastructure
 * 2. Shared method: TradingClient.fromInfrastructure() - reuses existing infrastructure
 *
 * For multi-wallet scenarios, see the shared_infrastructure example.
 */

import {
  TradeConfigBuilder,
  SwqosConfig,
  SwqosType,
  SwqosRegion,
  TradingClient,
  InfrastructureConfig,
  TradingInfrastructure,
} from 'sol-trade-sdk';
import { Keypair } from '@solana/web3.js';

/**
 * Method 1: Create TradingClient using TradeConfig (simple, self-contained)
 *
 * Use this when you have a single wallet or don't need to share infrastructure.
 */
async function createTradingClientSimple(): Promise<TradingClient> {
  const payer = Keypair.generate(); // Use your keypair here
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
    { type: SwqosType.JITO, uuid: 'your_uuid', region: SwqosRegion.FRANKFURT },
    { type: SwqosType.BLOXROUTE, apiToken: 'your_api_token', region: SwqosRegion.FRANKFURT },
    { type: SwqosType.ZEROSLOT, apiToken: 'your_api_token', region: SwqosRegion.FRANKFURT },
    { type: SwqosType.TEMPORAL, apiToken: 'your_api_token', region: SwqosRegion.FRANKFURT },
  ];

  const tradeConfig = TradeConfigBuilder.create(rpcUrl)
    .swqosConfigs(swqosConfigs)
    // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
    .build();

  // Creates new infrastructure internally
  const client = await TradingClient.new(payer, tradeConfig);
  console.log('Method 1: Created TradingClient with new()');
  console.log(`  Wallet: ${client.payerPubkey}`);
  return client;
}

/**
 * Method 2: Create TradingClient from shared infrastructure
 *
 * Use this when you have multiple wallets sharing the same configuration.
 * The infrastructure (RPC client, SWQOS clients) is created once and shared.
 */
async function createTradingClientFromInfrastructure(): Promise<TradingClient> {
  const payer = Keypair.generate(); // Use your keypair here
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
    { type: SwqosType.JITO, uuid: 'your_uuid', region: SwqosRegion.FRANKFURT },
  ];

  // Create infrastructure separately (can be shared across multiple wallets)
  const infraConfig = new InfrastructureConfig({
    rpcUrl,
    swqosConfigs,
  });
  const infrastructure = await TradingInfrastructure.new(infraConfig);

  // Create client from existing infrastructure (fast, no async needed)
  const client = TradingClient.fromInfrastructure(payer, infrastructure, true);
  console.log('Method 2: Created TradingClient with fromInfrastructure()');
  console.log(`  Wallet: ${client.payerPubkey}`);
  return client;
}

async function main() {
  // Method 1: Simple - TradingClient.new() (recommended for single wallet)
  const client1 = await createTradingClientSimple();

  // Method 2: From infrastructure (recommended for multiple wallets)
  const client2 = await createTradingClientFromInfrastructure();
}

main().catch(console.error);
