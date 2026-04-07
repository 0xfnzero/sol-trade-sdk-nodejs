/**
 * PumpFun Sniper Trading Example
 *
 * This example demonstrates how to snipe new tokens on PumpFun.
 * Listen for creator first buy events and execute a buy + sell.
 */

import {
  TradeConfigBuilder,
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
    { type: SwqosType.JITO, uuid: 'your_uuid', region: SwqosRegion.FRANKFURT },
  ];

  const tradeConfig = TradeConfigBuilder.create(rpcUrl)
      .swqosConfigs(swqosConfigs)
      // .mevProtection(true)   // Enable MEV protection (BlockRazor: sandwichMitigation, Astralane: port 9000)
      .build();

  return TradingClient.new(payer, tradeConfig);
}

async function pumpfunSniperTrade(
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
): Promise<void> {
  const slippageBasisPoints = 300;
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
    }),
    waitConfirmed: true,
    createInputTokenATA: true,
    closeInputTokenATA: true,
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
    }),
    waitConfirmed: true,
    createOutputTokenATA: true,
    closeOutputTokenATA: true,
    gasFeeStrategy,
  };

  // Execute sell
  const sellResult = await client.sell(sellParams);
  console.log(`Sell signature: ${sellResult.signature}`);
  console.log('Snipe buy + sell completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);
  console.log('Waiting for PumpFun events...');

  // In a real scenario, you would subscribe to gRPC events
  // and call pumpfunSniperTrade when a snipe opportunity is detected
}

main().catch(console.error);
