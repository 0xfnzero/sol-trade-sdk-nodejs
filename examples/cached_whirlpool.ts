/** npx tsx examples/cached_whirlpool.ts snapshots.json [--simulate].
 * Same JSON schema as Python. Quote/build are offline; nothing is sent.
 */
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
  compileV1Message,
} from "../src/index";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "../src/common/spl-token";
async function main() {
  const file = process.argv[2];
  if (!file) throw Error("Provide subscription snapshots JSON");
  const v = JSON.parse(readFileSync(file, "utf8")),
    cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  const snapshot = cache.snapshot(),
    ctx = {
      slot: BigInt(v.read_slot),
      epoch: BigInt(v.epoch),
      maximumSlotAge: BigInt(v.maximum_slot_age ?? 32),
    },
    payer = new PublicKey(v.payer),
    hint = new PoolTradeHint(
      new PublicKey(v.pool),
      new PublicKey(v.input_mint),
      new PublicKey(v.output_mint),
    );
  const { quote, instruction: swap } = snapshot.prepareWhirlpool(
    hint,
    ctx,
    BigInt(v.unix_timestamp),
    payer,
    BigInt(v.amount),
    v.slippage_bps ?? 100,
    v.maximum_arrays ?? 8,
  );
  const setup = [hint.inputMint, hint.outputMint].map((m) => {
    const program = snapshot.get(m, ctx).owner;
    return createAssociatedTokenAccountIdempotentInstruction(
      payer,
      getAssociatedTokenAddressSync(m, payer, true, program),
      payer,
      m,
      program,
    );
  });
  const compiled = compileV1Message(
      payer,
      [...setup, swap],
      v.recent_blockhash,
      {
        computeUnitLimit: 300000,
        loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
      },
    ),
    raw = Buffer.concat([
      Buffer.from(compiled.message),
      Buffer.alloc(compiled.requiredSignatures * 64),
    ]);
  console.log(
    JSON.stringify({
      amount_in: String(quote.amountIn),
      amount_out: String(quote.estimatedNetAmountOut),
      minimum_amount_out: String(quote.minimumAmountOut),
      wire_bytes: raw.length,
      transaction: raw.toString("base64"),
    }),
  );
  if (process.argv.includes("--simulate")) {
    const response = await fetch(
      process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "simulateTransaction",
          params: [
            raw.toString("base64"),
            {
              encoding: "base64",
              sigVerify: false,
              replaceRecentBlockhash: true,
              commitment: "confirmed",
            },
          ],
        }),
      },
    );
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const result: any = await response.json();
    console.log(JSON.stringify(result));
    if (result.error || result.result.value.err !== null)
      throw Error("Simulation failed");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
