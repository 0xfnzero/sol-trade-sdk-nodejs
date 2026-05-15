import { Keypair } from '@solana/web3.js';
import { TradingClient } from 'sol-trade-sdk';
import { tradeConfig } from './_shared';

async function main() {
  const sharedConfig = tradeConfig({ maxSwqosSubmitConcurrency: 8 });
  const wallets = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const clients = wallets.map((payer) => new TradingClient(payer, sharedConfig));

  console.log('Shared configuration prepared for multiple wallets.');
  for (const [index, client] of clients.entries()) {
    console.log('Client ' + (index + 1) + ':', client.getPayer().toBase58());
  }
  console.log('Reuse one TradeConfig/gas strategy, while each client keeps its own signer.');
}

main().catch(console.error);
