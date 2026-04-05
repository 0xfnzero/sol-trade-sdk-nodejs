/**
 * Raydium AMM V4 Trading Example
 *
 * This example demonstrates how to trade on Raydium AMM V4.
 * Subscribe to swap events via gRPC and execute a buy + sell.
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
  RaydiumAmmV4Params,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

const WSOL_TOKEN_ACCOUNT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_TOKEN_ACCOUNT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

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

async function raydiumAmmV4Trade(
  client: TradingClient,
  amm: PublicKey,
  coinMint: PublicKey,
  pcMint: PublicKey,
  tokenCoin: PublicKey,
  tokenPc: PublicKey,
  coinReserve: bigint,
  pcReserve: bigint,
): Promise<void> {
  const slippageBasisPoints = 100;
  const recentBlockhash = await client.getLatestBlockhash();

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // Determine token type (WSOL or USDC)
  const isWSOL = pcMint.equals(WSOL_TOKEN_ACCOUNT) || coinMint.equals(WSOL_TOKEN_ACCOUNT);
  const inputTokenType = isWSOL ? TradeTokenType.WSOL : TradeTokenType.USDC;

  // Determine mint to trade
  const mintPubkey = pcMint.equals(WSOL_TOKEN_ACCOUNT) || pcMint.equals(USDC_TOKEN_ACCOUNT)
    ? coinMint
    : pcMint;

  // Build params
  const params = new RaydiumAmmV4Params({
    amm,
    coinMint,
    pcMint,
    tokenCoin,
    tokenPc,
    coinReserve,
    pcReserve,
  });

  const inputTokenAmount = 100_000; // 0.0001 SOL or USDC

  const buyParams: TradeBuyParams = {
    dexType: DexType.RAYDIUM_AMM_V4,
    inputTokenType,
    mint: mintPubkey,
    inputTokenAmount: BigInt(inputTokenAmount),
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: params,
    waitConfirmed: true,
    createInputTokenATA: isWSOL,
    closeInputTokenATA: isWSOL,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  console.log('Buying tokens from Raydium AMM V4...');
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Get token balance for sell
  const tokenBalance = await client.getTokenBalance(mintPubkey);
  console.log(`Token balance: ${tokenBalance}`);

  const sellParams: TradeSellParams = {
    dexType: DexType.RAYDIUM_AMM_V4,
    outputTokenType: inputTokenType,
    mint: mintPubkey,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: params, // In real scenario, fetch fresh params via RPC
    waitConfirmed: true,
    createOutputTokenATA: isWSOL,
    closeOutputTokenATA: isWSOL,
    closeMintTokenATA: false,
    gasFeeStrategy,
  };

  // Execute sell
  console.log('Selling tokens...');
  const sellResult = await client.sell(sellParams);
  console.log(`Sell signature: ${sellResult.signature}`);
  console.log('Raydium AMM V4 trade completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Testing Raydium AMM V4 trading...');

  // In a real scenario, subscribe to gRPC events and execute trade
}

main().catch(console.error);
