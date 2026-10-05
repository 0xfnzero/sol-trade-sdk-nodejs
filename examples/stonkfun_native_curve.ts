/** npx tsx examples/stonkfun_native_curve.ts snapshots.json [--simulate]
 * Same snapshot JSON schema as the native Python example. Build/quote never use RPC.
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
  if (!file) throw new Error("Provide subscription snapshots JSON");
  const input = JSON.parse(readFileSync(file, "utf8"));
  const account = (name: string) => {
    const a = input[name];
    return {
      pubkey: new PublicKey(a.pubkey),
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
    };
  };
  const names = ["pool", "global", "platform", "base_mint", "quote_mint"];
  const cache = new SubscriptionAccountCache();
  for (const name of names) {
    const a = account(name);
    cache.update(a.pubkey, {
      ...a,
      slot: BigInt(input[name].slot),
      writeVersion: BigInt(input[name].write_version),
    });
  }
  // Saved replay uses its account slot; live callers supply a subscribed Clock slot.
  const latest = names.reduce(
    (s, n) => (BigInt(input[n].slot) > s ? BigInt(input[n].slot) : s),
    0n,
  );
  const context = {
    slot: BigInt(input.read_slot ?? latest),
    epoch: BigInt(input.epoch),
    maximumSlotAge: BigInt(input.maximum_slot_age ?? 32),
  };
  const base = account("base_mint"),
    quote = account("quote_mint");
  if (typeof input.buy !== "boolean") throw new Error("buy must be boolean");
  const payer = new PublicKey(input.payer);
  const hint = new PoolTradeHint(
    account("pool").pubkey,
    input.buy ? quote.pubkey : base.pubkey,
    input.buy ? base.pubkey : quote.pubkey,
  );
  const { quote: result, instruction: swap } = cache
    .snapshot()
    .prepareStonkFunCurve(
      hint,
      context,
      payer,
      BigInt(input.amount),
      input.slippage_bps,
    );
  const setup = [base, quote].map((a) =>
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      getAssociatedTokenAddressSync(a.pubkey, payer, true, a.owner),
      payer,
      a.pubkey,
      a.owner,
    ),
  );
  const compiled = compileV1Message(
    payer,
    [...setup, swap],
    input.recent_blockhash,
    { computeUnitLimit: 300000, loadedAccountsDataSizeLimit: 64 * 1024 * 1024 },
  );
  const raw = Buffer.concat([
    Buffer.from(compiled.message),
    Buffer.alloc(64 * compiled.requiredSignatures),
  ]);
  console.log(
    JSON.stringify({
      amount_in: result.amountIn.toString(),
      minimum_amount_out: result.minimumAmountOut.toString(),
      version: 1,
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
    if (!response.ok)
      throw new Error("Simulation HTTP status " + response.status);
    const result: any = await response.json();
    console.log(JSON.stringify(result, null, 2));
    if (result.error || result.result?.value?.err)
      throw new Error("Simulation failed; inspect returned logs");
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
