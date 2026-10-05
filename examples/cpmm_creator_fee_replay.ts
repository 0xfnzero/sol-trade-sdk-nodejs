/** Offline mainnet replay: npx tsx examples/cpmm_creator_fee_replay.ts */
import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  decodeCpmmCollectionPool,
  decodeCpmmAmmConfig,
  resolveCreatorFeeShareRate,
  collectCreatorFee,
  collectCreatorFeePermissionless,
  estimateCreatorFeePayout,
} from "../src/instruction/cpmm_creator_fee";
const cases = JSON.parse(
  fs.readFileSync("examples/fixtures/cpmm_creator_fee_rust_5_0_7.json", "utf8"),
);
for (const c of cases) {
  const pool = decodeCpmmCollectionPool(
      Buffer.from(c.accounts[0].data_base64, "base64"),
    ),
    config = decodeCpmmAmmConfig(
      Buffer.from(c.accounts[1].data_base64, "base64"),
    ),
    a = c.accounts[2];
  const rate = resolveCreatorFeeShareRate(
    config,
    pool.poolCreator,
    pool.ammConfig,
    a
      ? {
          owner: new PublicKey(a.owner),
          data: Buffer.from(a.data_base64, "base64"),
          lamports: a.lamports,
        }
      : null,
  );
  const ix = c.permissionless
    ? collectCreatorFeePermissionless(
        new PublicKey(c.payer),
        new PublicKey(c.pool),
        pool,
      )
    : collectCreatorFee(new PublicKey(c.pool), pool);
  if (
    JSON.stringify(ix.keys.map((k) => k.pubkey.toBase58())) !==
      JSON.stringify(c.instruction.accounts) ||
    ix.data.toString("base64") !== c.instruction.data_base64
  )
    throw Error("Mainnet instruction mismatch");
  console.log(c.name, {
    permissionless: c.permissionless,
    accounts: ix.keys.length,
    rate: rate.toString(),
    payout: estimateCreatorFeePayout(pool, rate).map(String),
  });
}
