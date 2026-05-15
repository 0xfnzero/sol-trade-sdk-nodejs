import { RUN_LIVE, createExampleClient, describeDryRun } from './_shared';

async function main() {
  const client = createExampleClient();
  const amountLamports = 1_000_000;

  describeDryRun('WSOL wrap and close example');
  console.log('Wallet:', client.getPayer().toBase58());
  console.log('Wrap amount:', amountLamports);

  if (RUN_LIVE) {
    const wrapSignature = await client.wrapSolToWsol(amountLamports);
    console.log('wrapSolToWsol signature:', wrapSignature);
    const closeSignature = await client.closeWsol();
    console.log('closeWsol signature:', closeSignature);
  }
}

main().catch(console.error);
