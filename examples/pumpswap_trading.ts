/**
 * PumpSwap Trading Example
 *
 * This example demonstrates how to trade on PumpSwap.
 */

import {
  TradeConfig,
  SwqosConfig,
  SwqosType,
  TradingClient,
  TradeBuyParams,
  TradeSellParams,
  DexType,
  TradeTokenType,
  GasFeeStrategy,
  PumpSwapParams,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

async function createClient(): Promise<TradingClient> {
  const payer = Keypair.generate();
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
  ];

  const tradeConfig = new TradeConfig({
    rpcUrl,
    swqosConfigs,
  });

  return TradingClient.new(payer, tradeConfig);
}

async function pumpSwapTrade(
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

  // Get token balance for sell
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
  console.log('PumpSwap trade completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Testing PumpSwap trading...');

  // Example pool and mint
  const pool = new PublicKey('9qKxzRejsV6Bp2zkefXWCbGvg61c3hHei7ShXJ4FythA');
  const mint = new PublicKey('2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv');

  // In a real scenario, fetch params via RPC and execute trade
}

main().catch(console.error);
