/**
 * Seed Trading Example
 *
 * This example demonstrates how to trade using seed optimization
 * for faster ATA derivation and account operations.
 */

import {
  TradeConfigBuilder,
  SwqosConfig,
  SwqosType,
  TradingClient,
  TradeBuyParams,
  TradeSellParams,
  DexType,
  TradeTokenType,
  GasFeeStrategy,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

async function createClient(): Promise<TradingClient> {
  const payer = Keypair.generate();
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
  ];

  const tradeConfig = TradeConfigBuilder.create(rpcUrl)
    .swqosConfigs(swqosConfigs)
    // .useSeedOptimize(true)  // Enable seed optimization
    // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
    .build();

  return TradingClient.new(payer, tradeConfig);
}

async function seedTradingExample(
  client: TradingClient,
  pool: PublicKey,
  mint: PublicKey,
): Promise<void> {
  console.log('Testing PumpSwap trading with seed optimization...');

  const slippageBasisPoints = 100;
  const recentBlockhash = await client.getLatestBlockhash();

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // In a real scenario, fetch params via RPC:
  // const pumpSwapParams = await PumpSwapParams.fromPoolAddressByRPC(client.infrastructure.rpc, pool);

  const buySOLAmount = 100_000; // 0.0001 WSOL

  const buyParams: TradeBuyParams = {
    dexType: DexType.PUMPSWAP,
    inputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: BigInt(buySOLAmount),
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: pumpSwapParams,
    waitConfirmed: true,
    createInputTokenATA: true,
    closeInputTokenATA: true,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  console.log('Buying tokens from PumpSwap...');
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Wait for confirmation
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Get token balance for sell (uses seed optimization internally)
  const tokenBalance = await client.getTokenBalance(mint);
  console.log(`Token balance: ${tokenBalance}`);

  const sellParams: TradeSellParams = {
    dexType: DexType.PUMPSWAP,
    outputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: pumpSwapParams,
    waitConfirmed: true,
    createOutputTokenATA: true,
    closeOutputTokenATA: true,
    closeMintTokenATA: false,
    gasFeeStrategy,
  };

  // Execute sell
  console.log('Selling tokens...');
  const sellResult = await client.sell(sellParams);
  console.log(`Sell signature: ${sellResult.signature}`);
  console.log('Seed trading example completed!');
}

async function main() {
  // Create client with seed optimization
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log(`Seed optimization enabled: ${client.useSeedOptimize}`);

  // Example pool and mint addresses
  const pool = new PublicKey('9qKxzRejsV6Bp2zkefXWCbGvg61c3hHei7ShXJ4FythA');
  const mint = new PublicKey('2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv');

  // In a real scenario, you would call seedTradingExample
  // with actual pool and mint addresses
}

main().catch(console.error);
