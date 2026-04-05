/**
 * Trading Example for Sol Trade SDK TypeScript
 */

import {
  TradingClient,
  DexType,
  TradeTokenType,
  createTradeConfig,
  createGasFeeStrategy,
  PumpFunParams,
  CONSTANTS,
  getBondingCurvePDA,
  getCreatorVaultPDA,
  getAssociatedTokenAddress,
} from '@fnzero/sol-trade-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

async function main() {
  // 1. Setup wallet
  const privateKeyBase58 = 'your_private_key_here';
  const payer = Keypair.fromSecretKey(
    Buffer.from(privateKeyBase58, 'base64')
  );

  // 2. Configure SWQOS services
  const swqosConfigs = [
    { type: 'Default' as const, region: 'Frankfurt' as const, apiKey: '' },
    { type: 'Jito' as const, region: 'Frankfurt' as const, apiKey: 'your_jito_uuid' },
  ];

  // 3. Create trade configuration
  const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=your_api_key';
  const config = createTradeConfig(rpcUrl, swqosConfigs);

  // 4. Create trading client
  const client = new TradingClient(payer, config);

  console.log(`Trading client created for wallet: ${client.getPayer().toBase58()}`);

  // 5. Example: Build PumpFun parameters
  const mint = new PublicKey('your_token_mint_here');
  const bondingCurve = getBondingCurvePDA(mint);
  const creator = new PublicKey('creator_address');
  const creatorVault = getCreatorVaultPDA(creator);

  const pumpFunParams: PumpFunParams = {
    bondingCurve: {
      discriminator: 0,
      account: bondingCurve,
      virtualTokenReserves: BigInt(1000000000),
      virtualSolReserves: BigInt(30000000000),
      realTokenReserves: BigInt(800000000),
      realSolReserves: BigInt(24000000000),
      tokenTotalSupply: BigInt(1000000000),
      complete: false,
      creator: creator,
      isMayhemMode: false,
      isCashbackCoin: false,
    },
    associatedBondingCurve: getAssociatedTokenAddress(
      bondingCurve,
      mint,
      CONSTANTS.TOKEN_PROGRAM
    ),
    creatorVault: creatorVault,
    tokenProgram: CONSTANTS.TOKEN_PROGRAM,
  };

  // 6. Get recent blockhash
  const { blockhash } = await client.getLatestBlockhash();

  // 7. Build buy parameters
  const buyParams = {
    dexType: DexType.PumpFun,
    inputTokenType: TradeTokenType.WSOL,
    mint: mint,
    inputTokenAmount: 10000000, // 0.01 SOL
    slippageBasisPoints: 500, // 5%
    recentBlockhash: blockhash,
    extensionParams: { type: 'PumpFun', params: pumpFunParams },
    waitTxConfirmed: true,
    createMintAta: true,
    gasFeeStrategy: createGasFeeStrategy(),
  };

  // 8. Execute buy
  try {
    const result = await client.buy(buyParams);
    if (result.success) {
      console.log(`Buy successful! Signatures: ${result.signatures}`);
    } else {
      console.log(`Buy failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Buy error:', error);
  }

  // 9. Example: Sell tokens
  const sellParams = {
    dexType: DexType.PumpFun,
    outputTokenType: TradeTokenType.WSOL,
    mint: mint,
    inputTokenAmount: 1000000, // Token amount to sell
    slippageBasisPoints: 500,
    recentBlockhash: blockhash,
    extensionParams: { type: 'PumpFun', params: pumpFunParams },
    withTip: true,
    waitTxConfirmed: true,
    gasFeeStrategy: createGasFeeStrategy(),
  };

  try {
    const sellResult = await client.sell(sellParams);
    if (sellResult.success) {
      console.log(`Sell successful! Signatures: ${sellResult.signatures}`);
    } else {
      console.log(`Sell failed: ${sellResult.error}`);
    }
  } catch (error) {
    console.error('Sell error:', error);
  }
}

main().catch(console.error);
