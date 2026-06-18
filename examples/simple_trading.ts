import {
  AccountPolicy,
  BuyAmount,
  DexType,
  TradeTokenType,
  createSimpleBuyParams,
  simpleBuyParamsToTradeBuyParams,
  withSimpleBuyAccountPolicy,
  withSimpleBuySlippage,
  withSimpleBuyWaitForAllSubmits,
  withSimpleBuyWaitTxConfirmed,
} from 'sol-trade-sdk';
import {
  RUN_LIVE,
  createExampleClient,
  describeDryRun,
  exampleBuyParams,
  logResult,
} from './_shared';

async function main() {
  const client = createExampleClient();
  const template = exampleBuyParams(DexType.PumpFun);

  let simple = createSimpleBuyParams(
    DexType.PumpFun,
    TradeTokenType.WSOL,
    template.mint,
    BuyAmount.WithMaxInput(template.inputTokenAmount),
    template.extensionParams,
    template.recentBlockhash!,
    template.gasFeeStrategy
  );
  simple = withSimpleBuyWaitForAllSubmits(
    withSimpleBuyWaitTxConfirmed(
      withSimpleBuyAccountPolicy(
        withSimpleBuySlippage(simple, template.slippageBasisPoints ?? 500),
        AccountPolicy.Auto
      ),
      false
    ),
    false
  );

  const lowLevel = simpleBuyParamsToTradeBuyParams(simple);

  describeDryRun('Simple buy intent API');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('payWith:', simple.payWith);
  console.log('amount intent:', simple.amount);
  console.log('createInputTokenAta:', lowLevel.createInputTokenAta);
  console.log('createMintAta:', lowLevel.createMintAta);

  if (RUN_LIVE) {
    const latest = await client.getLatestBlockhash();
    simple.recentBlockhash = latest.blockhash;
    logResult('buySimple', await client.buySimple(simple));
  }
}

main().catch(console.error);
