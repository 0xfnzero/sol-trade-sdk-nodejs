/**
 * Raydium CPMM Trading Example
 *
 * This example demonstrates how to trade on Raydium CPMM.
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
      // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
      .build();

  return TradingClient.new(payer, tradeConfig);
}

async function raydiumCPMMTrade(
  client: TradingClient,
  pool: PublicKey,
  mint: PublicKey,
): Promise<void> {
  const slippageBasisPoints = 100;
  const recentBlockhash = await client.getLatestBlockhash();

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // In a real scenario, fetch params via RPC:
  // const cpmmParams = await RaydiumCPMMParams.fromPoolAddressByRPC(client.infrastructure.rpc, pool);

  const inputTokenAmount = 100_000; // 0.0001 SOL

  const buyParams: TradeBuyParams = {
    dexType: DexType.RAYDIUM_CPMM,
    inputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: BigInt(inputTokenAmount),
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: cpmmParams,
    waitConfirmed: true,
    createInputTokenATA: true,
    closeInputTokenATA: true,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  console.log('Buying tokens from Raydium CPMM...');
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Get token balance for sell
  const tokenBalance = await client.getTokenBalance(mint);
  console.log(`Token balance: ${tokenBalance}`);

  const sellParams: TradeSellParams = {
    dexType: DexType.RAYDIUM_CPMM,
    outputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: cpmmParams,
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
  console.log('Raydium CPMM trade completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Testing Raydium CPMM trading...');

  // In a real scenario, fetch params via RPC and execute trade
}

main().catch(console.error);
