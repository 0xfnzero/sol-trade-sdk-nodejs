import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { HotPathExecutor, TradeType, defaultExecuteOptions } from 'sol-trade-sdk';
import { examplePublicKey, rpcUrl } from './_shared';

async function main() {
  const connection = new Connection(rpcUrl(), 'confirmed');
  const executor = new HotPathExecutor(connection, {
    blockhashRefreshIntervalMs: 1_500,
    cacheTtlMs: 4_000,
    enablePrefetch: true,
  });

  const payer = Keypair.generate();
  const recipient = examplePublicKey(88);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: 1 })
  );

  console.log('Hot path executor prepared.');
  console.log('Options:', defaultExecuteOptions());
  console.log('Unsigned example transaction instructions:', tx.instructions.length);
  console.log('Start executor and prefetch accounts before calling execute(TradeType.Buy, bytes).');
  console.log('Trade type enum:', TradeType.Buy);
  console.log('Executor ready:', executor.isReady());
}

main().catch(console.error);
