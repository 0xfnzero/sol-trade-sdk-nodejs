/**
 * Nonce Cache Example
 *
 * This example demonstrates how to use durable nonce for transaction submission.
 * Use durable nonce to implement transaction replay protection and optimize
 * transaction processing when using multiple MEV services.
 */

import {
  TradeConfig,
  SwqosConfig,
  SwqosType,
  TradingClient,
  TradeBuyParams,
  DexType,
  TradeTokenType,
  GasFeeStrategy,
  PumpFunParams,
  fetchNonceInfo,
} from 'sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

async function createClient(): Promise<TradingClient> {
  const payer = Keypair.generate();
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
    { type: SwqosType.JITO, uuid: 'your_uuid' },
    { type: SwqosType.BLOXROUTE, apiToken: 'your_api_token' },
  ];

  const tradeConfig = new TradeConfig({
    rpcUrl,
    swqosConfigs,
  });

  return TradingClient.new(payer, tradeConfig);
}

async function tradeWithNonce(
  client: TradingClient,
  nonceAccount: PublicKey,
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
  // Fetch nonce info
  const durableNonce = await fetchNonceInfo(client.infrastructure.rpc, nonceAccount);

  if (!durableNonce) {
    console.log('Failed to fetch nonce info');
    return;
  }

  console.log(`Nonce authority: ${durableNonce.authority.toBase58()}`);
  console.log(`Nonce value: ${durableNonce.nonce}`);

  // Configure gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  // Buy parameters - note we use durableNonce instead of recentBlockhash
  const buySOLAmount = 100_000; // 0.0001 SOL

  const buyParams: TradeBuyParams = {
    dexType: DexType.PUMPFUN,
    inputTokenType: TradeTokenType.SOL,
    mint,
    inputTokenAmount: BigInt(buySOLAmount),
    slippageBasisPoints: 100,
    recentBlockhash: undefined, // Not used when durableNonce is provided
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
    createInputTokenATA: false,
    closeInputTokenATA: false,
    createMintATA: true,
    durableNonce,
    gasFeeStrategy,
  };

  // Execute buy with nonce
  const buyResult = await client.buy(buyParams);
  console.log(`Buy signature: ${buyResult.signature}`);
  console.log('Trade with nonce completed!');
}

async function main() {
  const client = await createClient();
  console.log(`Client created: ${client.payerPubkey}`);

  // Nonce account must be created beforehand
  const nonceAccount = new PublicKey('use_your_nonce_account_here');
  console.log(`Using nonce account: ${nonceAccount.toBase58()}`);

  // In a real scenario, you would:
  // 1. Subscribe to gRPC events
  // 2. Fetch nonce info
  // 3. Execute trade with durableNonce
}

main().catch(console.error);
