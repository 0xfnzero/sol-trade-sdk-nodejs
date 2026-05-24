import { DexType } from 'sol-trade-sdk';
import { RUN_LIVE, createExampleClient, describeDryRun, exampleBuyParams, logResult } from './_shared';

async function main() {
  const client = createExampleClient();
  const buyParams = exampleBuyParams(DexType.PumpFun);

  describeDryRun('Complete PumpFun buy flow');
  console.log('Wallet:', client.getPayer().toBase58());
  if (buyParams.extensionParams.type === 'PumpFun') {
    console.log('PumpFun quote mint:', buyParams.extensionParams.params.quoteMint?.toBase58() ?? 'legacy SOL');
    console.log('Cashback flag:', buyParams.extensionParams.params.bondingCurve.isCashbackCoin);
  }

  if (RUN_LIVE) {
    const latest = await client.getLatestBlockhash();
    buyParams.recentBlockhash = latest.blockhash;
    logResult('buy', await client.buy(buyParams));
  }
}

main().catch(console.error);
