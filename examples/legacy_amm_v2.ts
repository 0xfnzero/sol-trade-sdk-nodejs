/** Single AMM V2 via legacy entry; see ../docs/USAGE.md#amm-v4-cache. No sends or hot RPC.
 * npx tsx examples/legacy_amm_v2.ts snapshot.json [--simulate] [--exact-output=N]
 * Buy wraps SOL in WSOL ATA when native_input=true; sell receives WSOL. Never closes ATAs.
 */
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { SubscriptionAccountCache, PoolTradeHint } from "../src/index";
import {
  buildRaydiumAmmV4BuyInstructions,
  buildRaydiumAmmV4SellInstructions,
} from "../src/instruction/raydium_amm_v4_builder";
import { compileV1Message } from "../src/serialization/v1";
async function main() {
  const file = process.argv[2];
  if (!file) throw Error("Snapshot required");
  const v = JSON.parse(readFileSync(file, "utf8"));
  if (v.legs.length !== 1)
    throw Error("Single AMM pool required; use cached_trade for routes");
  const cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  const h = v.legs[0],
    hint = new PoolTradeHint(
      new PublicKey(h.pool),
      new PublicKey(h.input_mint),
      new PublicKey(h.output_mint),
    );
  const p = cache
    .snapshot()
    .ammV4(
      hint,
      {
        slot: BigInt(v.read_slot),
        epoch: BigInt(v.epoch),
        maximumSlotAge: BigInt(v.maximum_slot_age ?? 32),
      },
      BigInt(v.unix_timestamp),
    );
  const protocolParams = {
    amm: p.pool,
    coinMint: p.coinMint,
    pcMint: p.pcMint,
    tokenCoin: p.coinVault,
    tokenPc: p.pcVault,
    coinReserve: p.coinReserve,
    pcReserve: p.pcReserve,
    swapFeeNumerator: p.swapFeeNumerator,
    swapFeeDenominator: p.swapFeeDenominator,
  };
  const exact = process.argv.find((a) => a.startsWith("--exact-output="));
  const payer = new PublicKey(v.payer),
    common = {
      payer,
      inputMint: hint.inputMint,
      outputMint: hint.outputMint,
      inputAmount: BigInt(v.amount),
      slippageBasisPoints: BigInt(v.slippage_bps ?? 100),
      fixedOutputAmount: exact ? BigInt(exact.split("=")[1]!) : undefined,
      protocolParams,
    };
  const ixs =
    v.trade_type === "Buy"
      ? buildRaydiumAmmV4BuyInstructions({
          ...common,
          createInputMintAta: v.native_input ?? false,
        })
      : v.trade_type === "Sell"
        ? buildRaydiumAmmV4SellInstructions(common)
        : (() => {
            throw Error("Explicit Buy/Sell required");
          })();
  const c = compileV1Message(payer, ixs, v.recent_blockhash, {
      computeUnitLimit: 300000,
      loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
    }),
    raw = Buffer.concat([
      Buffer.from(c.message),
      Buffer.alloc(64 * c.requiredSignatures),
    ]),
    encoded = raw.toString("base64");
  console.log(JSON.stringify({ wire_bytes: raw.length, transaction: encoded }));
  if (process.argv.includes("--simulate")) {
    const response = await fetch(
      process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "simulateTransaction",
          params: [
            encoded,
            {
              encoding: "base64",
              sigVerify: false,
              replaceRecentBlockhash: true,
            },
          ],
        }),
      },
    );
    if (!response.ok) throw Error("Simulation HTTP failure");
    const value: any = await response.json();
    console.log(JSON.stringify(value));
    if (value.error || value.result.value.err !== null)
      throw Error("Simulation failed");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
