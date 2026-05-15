import { TradeType } from 'sol-trade-sdk';
import { flatGasFeeStrategy, lowLatencyGasStrategy } from './_shared';

async function main() {
  const strategy = lowLatencyGasStrategy();
  console.log('Flat per-trade gas config:', flatGasFeeStrategy);
  console.log('Buy strategy rows:', strategy.getStrategies(TradeType.Buy));
  console.log('Sell strategy rows:', strategy.getStrategies(TradeType.Sell));
}

main().catch(console.error);
