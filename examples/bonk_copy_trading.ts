/**
 * Bonk Copy Trading Example
 *
 * This example demonstrates how to copy trade on Bonk.
 * Subscribe to Bonk buy/sell events via gRPC and execute a buy + sell.
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
  BonkParams,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

const USD1_TOKEN_ACCOUNT = new PublicKey('B9C6PQJqM9vLZHMvPMJUfzHvPrPxYT4rL5hXhgS3nYVr');

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

async function bonkCopyTrade(
  client: TradingClient,
  baseTokenMint: PublicKey,
  quoteTokenMint: PublicKey,
  poolState: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  baseTokenProgram: PublicKey,
  platformConfig: PublicKey,
  platformAssociatedAccount: PublicKey,
  creatorAssociatedAccount: PublicKey,
  globalConfig: PublicKey,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBaseAfter: bigint,
  realQuoteAfter: bigint,
): Promise<void> {
  const slippageBasisPoints = 100;
  const recentBlockhash = await client.getLatestBlockhash();

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // Determine token type
  const inputTokenType = quoteTokenMint.equals(USD1_TOKEN_ACCOUNT)
    ? TradeTokenType.USD1
    : TradeTokenType.SOL;

  const buySOLAmount = 100_000; // 0.0001 SOL or USD1

  // Build params from trade
  const bonkParams = BonkParams.fromTrade({
    virtualBase,
    virtualQuote,
    realBaseAfter,
    realQuoteAfter,
    poolState,
    baseVault,
    quoteVault,
    baseTokenProgram,
    platformConfig,
    platformAssociatedAccount,
    creatorAssociatedAccount,
    globalConfig,
  });

  const buyParams: TradeBuyParams = {
    dexType: DexType.BONK,
    inputTokenType,
    mint: baseTokenMint,
    inputTokenAmount: BigInt(buySOLAmount),
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: bonkParams,
    waitConfirmed: true,
    createInputTokenATA: true,
    closeInputTokenATA: false,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  console.log('Buying tokens from Bonk...');
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Get token balance for sell
  const tokenBalance = await client.getTokenBalance(baseTokenMint);
  console.log(`Token balance: ${tokenBalance}`);

  const sellParams: TradeSellParams = {
    dexType: DexType.BONK,
    outputTokenType: inputTokenType,
    mint: baseTokenMint,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: bonkParams,
    waitConfirmed: true,
    createOutputTokenATA: false,
    closeOutputTokenATA: false,
    closeMintTokenATA: false,
    gasFeeStrategy,
  };

  // Execute sell
  console.log('Selling tokens...');
  const sellResult = await client.sell(sellParams);
  console.log(`Sell signature: ${sellResult.signature}`);
  console.log('Bonk copy trade completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Waiting for Bonk events...');

  // In a real scenario, you would:
  // 1. Subscribe to gRPC events for Bonk trades
  // 2. Call bonkCopyTrade when a trade event is received
}

main().catch(console.error);
