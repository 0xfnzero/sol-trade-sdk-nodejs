import { PublicKey } from '@solana/web3.js';
import { DexType, fetchDurableNonceInfo } from 'sol-trade-sdk';
import { createConnection, createExampleClient, describeDryRun, exampleBuyParams } from './_shared';

async function main() {
  const client = createExampleClient();
  const nonceAccount = process.env.NONCE_ACCOUNT ? new PublicKey(process.env.NONCE_ACCOUNT) : undefined;
  const buyParams = exampleBuyParams(DexType.PumpFun);

  describeDryRun('Durable nonce example for multi-SWQoS submission');
  if (nonceAccount) {
    const nonce = await fetchDurableNonceInfo(createConnection(), nonceAccount);
    if (nonce) {
      buyParams.recentBlockhash = undefined;
      buyParams.durableNonce = nonce;
      console.log('Fetched durable nonce:', nonce.nonceHash);
    }
  }
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('Durable nonce attached:', Boolean(buyParams.durableNonce));
}

main().catch(console.error);
