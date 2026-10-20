/** Historical parser output; no RPC, transaction signing or broadcasting. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  screenedStockCatalog,
  stockConversionLegs,
} from "../src/stock_catalog";
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--fixture"))
  throw Error("Usage: --fixture FILE");
const capture = JSON.parse(
  readFileSync(
    args[1] ?? resolve(__dirname, "fixtures/stock_conversion_routes.json"),
    "utf8",
  ),
);
const catalog = screenedStockCatalog();
for (const c of capture.cases)
  console.log(
    JSON.stringify({
      signature: c.signature,
      name: c.name,
      replay: true,
      conversion_legs: stockConversionLegs(catalog, c.route),
    }),
  );
