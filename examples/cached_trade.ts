import {snapshotU64,snapshotI64} from './_snapshot';
import { TradeExecutorFactory, DexType } from "../src/trading/factory";
/** npx tsx examples/cached_trade.ts snapshots.json [--simulate].
 * Same JSON schema as Python. Quote/build are offline; nothing is sent.
 */
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { SubscriptionAccountCache, PoolTradeHint } from "../src/index";
import {simulate,simulationOutput} from "./_simulation";
async function main() {
  const evidencePath=simulationOutput(process.argv);
  const file = process.argv[2];
  if (!file) throw Error("Provide subscription snapshots JSON");
  const v = JSON.parse(readFileSync(file, "utf8")),
    cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: snapshotU64(a.slot,'account.slot'),
      writeVersion: snapshotU64(a.write_version,'account.write_version'),
    });
  const snapshot = cache.snapshot(),
    ctx = {
      slot: snapshotU64(v.read_slot,'read_slot'),
      epoch: snapshotU64(v.epoch,'epoch'),
      maximumSlotAge: snapshotU64(v.maximum_slot_age ?? 32,'maximum_slot_age'),
    },
    payer = new PublicKey(v.payer);
  const hint = (h: any) => new PoolTradeHint(new PublicKey(h.pool),new PublicKey(h.input_mint),new PublicKey(h.output_mint));
  const candidates=(v.candidates ?? []).map(hint);
  const hints = (v.legs ?? []).map(
    (h: any) =>
      new PoolTradeHint(
        new PublicKey(h.pool),
        new PublicKey(h.input_mint),
        new PublicKey(h.output_mint),
      ),
  );
  const prepared = TradeExecutorFactory.createCachedExecutor(
    v.dex_type as DexType,
  ).prepare({
    dexType: v.dex_type,
    tradeType: v.trade_type,
    snapshot,
    hints,
    candidates,
    inputMint: v.input_mint ? new PublicKey(v.input_mint) : undefined,
    outputMint: v.output_mint ? new PublicKey(v.output_mint) : undefined,
    context: ctx,
    unixTimestamp: snapshotI64(v.unix_timestamp,'unix_timestamp'),
    payer,
    amount: snapshotU64(v.amount,'amount'),
    fixedOutputAmount: v.fixed_output_amount === undefined ? undefined : snapshotU64(v.fixed_output_amount,'fixed_output_amount'),
    recentBlockhash: v.recent_blockhash,
    slippageBps: v.slippage_bps ?? 100,
    maximumArrays: v.maximum_arrays ?? 8,
    nativeInput: v.native_input ?? false,
    nativeOutput: v.native_output ?? false,
    temporaryWsolSeed: v.temporary_wsol_seed,
    rentLamports: snapshotU64(v.rent_lamports ?? 0,'rent_lamports'),
    tipAccount: v.tip_account ? new PublicKey(v.tip_account) : undefined,
    tipLamports: snapshotU64(v.tip_lamports ?? 0,'tip_lamports'),
  });
  const route = prepared.route,
    compiled = prepared.compiled,
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
      estimated_native_residual_lamports: prepared.estimatedNativeResidualLamports.toString(),
      wire_bytes: raw.length,
      transaction: raw.toString("base64"),
    }),
  );
  if (process.argv.includes("--simulate")) {
    await simulate(raw,snapshotU64(v.read_slot,'read_slot'),evidencePath);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
