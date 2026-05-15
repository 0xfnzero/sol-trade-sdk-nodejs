import { DexType } from 'sol-trade-sdk';
import { createExampleClient, describeDryRun, exampleBuyParams, exampleSellParams } from './_shared';

async function main() {
  const client = createExampleClient({ useSeedOptimize: true });
  const buyParams = exampleBuyParams(DexType.PumpSwap);
  const sellParams = exampleSellParams(DexType.PumpSwap);

  describeDryRun('Seed-optimized PumpSwap example');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('Seed optimization:', client.config.useSeedOptimize);
  console.log('Prepared params:', buyParams.dexType, sellParams.dexType);
}

main().catch(console.error);
