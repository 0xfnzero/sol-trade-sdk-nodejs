/**
 * Meteora DAMM V2 Trading Example
 *
 * This example demonstrates how to trade on Meteora DAMM V2.
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

async function meteoraDammV2Trade(
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
  // const meteoraParams = await MeteoraDammV2Params.fromPoolAddressByRPC(client.infrastructure.rpc, pool);

  const inputTokenAmount = 100_000; // 0.0001 SOL

  const buyParams: TradeBuyParams = {
    dexType: DexType.METEORA_DAMM_V2,
    inputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: BigInt(inputTokenAmount),
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: meteoraParams,
    waitConfirmed: true,
    createInputTokenATA: true,
    closeInputTokenATA: true,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  console.log('Buying tokens from Meteora DAMM V2...');
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Get token balance for sell
  const tokenBalance = await client.getTokenBalance(mint);
  console.log(`Token balance: ${tokenBalance}`);

  const sellParams: TradeSellParams = {
    dexType: DexType.METEORA_DAMM_V2,
    outputTokenType: TradeTokenType.WSOL,
    mint,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    // extensionParams: meteoraParams,
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
  console.log('Meteora DAMM V2 trade completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Testing Meteora DAMM V2 trading...');

  // In a real scenario, fetch params via RPC and execute trade
}

main().catch(console.error);
