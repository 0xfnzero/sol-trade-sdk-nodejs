/**
 * PumpFun Copy Trading Example
 *
 * This example demonstrates how to copy trade on PumpFun.
 * Subscribe to PumpFun buy/sell events via gRPC and execute a buy + sell.
 */

import {
  TradeConfig,
  SwqosConfig,
  SwqosType,
  SwqosRegion,
  TradingClient,
  TradeBuyParams,
  TradeSellParams,
  DexType,
  TradeTokenType,
  GasFeeStrategy,
  PumpFunParams,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

async function createClient(): Promise<TradingClient> {
  const payer = Keypair.generate(); // Use your keypair here
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
    { type: SwqosType.JITO, uuid: 'your_uuid' },
  ];

  const tradeConfig = new TradeConfig({
    rpcUrl,
    swqosConfigs,
  });

  return TradingClient.new(payer, tradeConfig);
}

async function pumpfunCopyTrade(
  client: TradingClient,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  creator: PublicKey,
  creatorVault: PublicKey,
  feeRecipient: PublicKey,
  virtualTokenReserves: bigint,
  virtualSolReserves: bigint,
  realTokenReserves: bigint,
  realSolReserves: bigint,
  isCashbackCoin: boolean = false,
  tokenProgram?: PublicKey,
): Promise<void> {
  const slippageBasisPoints = 100;
  const recentBlockhash = await client.getLatestBlockhash();

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // Buy parameters
  const buySOLAmount = 100_000; // 0.0001 SOL

  const buyParams: TradeBuyParams = {
    dexType: DexType.PUMPFUN,
    inputTokenType: TradeTokenType.SOL,
    mint,
    inputTokenAmount: BigInt(buySOLAmount),
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: new PumpFunParams({
      bondingCurve,
      associatedBondingCurve,
      mint,
      creator,
      creatorVault,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      hasCreator: true,
      feeRecipient,
      isCashbackCoin,
      tokenProgram,
    }),
    waitConfirmed: true,
    createInputTokenATA: false,
    closeInputTokenATA: false,
    createMintATA: true,
    gasFeeStrategy,
  };

  // Execute buy
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);

  // Get token balance for sell
  const tokenBalance = await client.getTokenBalance(mint);
  console.log(`Token balance: ${tokenBalance}`);

  // Sell parameters
  const sellParams: TradeSellParams = {
    dexType: DexType.PUMPFUN,
    outputTokenType: TradeTokenType.SOL,
    mint,
    inputTokenAmount: tokenBalance,
    slippageBasisPoints,
    recentBlockhash,
    extensionParams: new PumpFunParams({
      bondingCurve,
      associatedBondingCurve,
      mint,
      creator,
      creatorVault,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      hasCreator: true,
      feeRecipient,
      isCashbackCoin,
      tokenProgram,
    }),
    waitConfirmed: true,
    createOutputTokenATA: false,
    closeOutputTokenATA: false,
    closeMintTokenATA: false,
    gasFeeStrategy,
  };

  // Execute sell
  const sellResult = await client.sell(sellParams);
  console.log(`Sell signature: ${sellResult.signature}`);
  console.log('Copy trade buy + sell completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Waiting for PumpFun events...');

  // In a real scenario, you would subscribe to gRPC events
  // using sol-parser-sdk and call pumpfunCopyTrade when
  // a trade event is received
}

main().catch(console.error);
