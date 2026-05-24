import { Keypair } from '@solana/web3.js';
import { TradingClient } from 'sol-trade-sdk';
import { defaultSwqosConfigs, tradeConfig } from './_shared';

async function main() {
  const config = tradeConfig({
    swqosConfigs: defaultSwqosConfigs(),
    createWsolAtaOnStartup: false,
    maxSwqosSubmitConcurrency: 8,
  });

  const client = new TradingClient(Keypair.generate(), config);

  console.log('TradingClient created with current SDK constructor.');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('SWQoS providers:', config.swqosConfigs.map((c) => c.type).join(', '));
  console.log('Sender core order from end:', config.swqosCoresFromEnd);
}

main().catch(console.error);
