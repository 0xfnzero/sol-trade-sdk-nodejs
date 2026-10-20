import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  screenedStockCatalog,
  stockConversionLegs,
} from "../src/stock_catalog";
const cases = JSON.parse(
  readFileSync(
    new URL(
      "../examples/fixtures/stock_conversion_routes.json",
      import.meta.url,
    ),
    "utf8",
  ),
).cases;
for (const c of cases)
  it("validates captured conversion legs " + c.name, () => {
    const catalog = screenedStockCatalog();
    expect(stockConversionLegs(catalog, c.route).map((l) => l.pool)).toEqual(
      c.expected_pools,
    );
    expect(
      stockConversionLegs(catalog, { ...c.route, succeeded: false }),
    ).toEqual([]);
    for (const field of [
      "program",
      "pool",
      "protocol",
      "input_mint",
      "output_mint",
    ]) {
      const route = structuredClone(c.route);
      for (const leg of route.legs) leg[field] = "invalid";
      expect(stockConversionLegs(catalog, route)).toEqual([]);
    }
  });
it("owns the catalog and preserves historical fee preference", () => {
  const a = screenedStockCatalog(),
    b = screenedStockCatalog();
  expect(a).toEqual(b);
  a.pools.length = 0;
  expect(b.pools.length).toBeGreaterThan(0);
});
