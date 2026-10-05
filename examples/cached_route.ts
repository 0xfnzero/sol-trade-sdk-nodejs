import { settleCachedRouteWithNativeSol } from "../src/index";
/** npx tsx examples/cached_route.ts snapshots.json [--simulate].
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
    payer = new PublicKey(v.payer);
  const hints = v.legs.map(
    (h: any) =>
      new PoolTradeHint(
        new PublicKey(h.pool),
        new PublicKey(h.input_mint),
        new PublicKey(h.output_mint),
      ),
  );
  const route = snapshot.prepareRoute(
    hints,
    ctx,
    BigInt(v.unix_timestamp),
    payer,
    BigInt(v.amount),
    v.slippage_bps ?? 100,
    v.maximum_arrays ?? 8,
  );
  for (const k of ["native_input", "native_output"])
    if (k in v && typeof v[k] !== "boolean")
      throw Error(k + " must be boolean");
  let instructions = [...route.setupInstructions, ...route.swapInstructions];
  if (v.native_input || v.native_output)
    instructions = [
      ...settleCachedRouteWithNativeSol(
        route,
        payer,
        v.temporary_wsol_seed,
        BigInt(v.rent_lamports),
        v.native_input ?? false,
        v.native_output ?? false,
      ).instructions,
    ];
  const compiled = compileV1Message(payer, instructions, v.recent_blockhash, {
      computeUnitLimit: 300000,
      loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
    }),
    raw = Buffer.concat([
      Buffer.from(compiled.message),
      Buffer.alloc(compiled.requiredSignatures * 64),
    ]);
  console.log(
    JSON.stringify({
      minimum_amount_out: String(route.minimumNetAmountOut),
      legs: route.legs.map((l) => ({
        amount_in: String(l.amountIn),
        amount_out: l.estimatedNetAmountOut === null ? null : String(l.estimatedNetAmountOut),
        minimum_amount_out: String(l.minimumNetAmountOut),
      })),
      intermediate_residuals: route.estimatedIntermediateResiduals.map((r) => ({
        mint: r.mint.toBase58(),
        amount: String(r.amount),
      })),
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
