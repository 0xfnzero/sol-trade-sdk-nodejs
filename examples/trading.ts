import { DexType } from 'sol-trade-sdk';
import { RUN_LIVE, createExampleClient, describeDryRun, exampleBuyParams, logResult } from './_shared';

async function main() {
  const client = createExampleClient({ usePumpfunV2: true });
  const buyParams = exampleBuyParams(DexType.PumpFun);

  describeDryRun('Complete PumpFun buy flow');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('PumpFun v2 enabled:', client.config.usePumpfunV2);
  console.log('Cashback flag:', buyParams.extensionParams.type === 'PumpFun' && buyParams.extensionParams.params.bondingCurve.isCashbackCoin);

  if (RUN_LIVE) {
    const latest = await client.getLatestBlockhash();
    buyParams.recentBlockhash = latest.blockhash;
    logResult('buy', await client.buy(buyParams));
  }
}

main().catch(console.error);
