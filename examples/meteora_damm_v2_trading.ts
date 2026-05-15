import { DexType } from 'sol-trade-sdk';
import {
  RUN_LIVE,
  createExampleClient,
  describeDryRun,
  exampleBuyParams,
  exampleSellParams,
  logResult,
} from './_shared';

async function main() {
  const client = createExampleClient();
  const buyParams = exampleBuyParams(DexType.MeteoraDammV2);
  const sellParams = exampleSellParams(DexType.MeteoraDammV2);

  describeDryRun('Meteora DAMM v2 trading example');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('Buy params:', { dexType: buyParams.dexType, amount: buyParams.inputTokenAmount });
  console.log('Sell params:', { dexType: sellParams.dexType, amount: sellParams.inputTokenAmount });

  if (RUN_LIVE) {
    const latest = await client.getLatestBlockhash();
    buyParams.recentBlockhash = latest.blockhash;
    sellParams.recentBlockhash = latest.blockhash;
    logResult('buy', await client.buy(buyParams));
    logResult('sell', await client.sell(sellParams));
  }
}

main().catch(console.error);
