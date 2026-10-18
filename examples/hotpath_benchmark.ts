/** Native fixed-workload local benchmark. Configuration and fixtures load before timing. */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@solana/web3.js";
import { replayPumpSwapFixture } from "./pumpswap_cached_prepare";
import {
  preparePumpSwapTrade,
  searchPumpSwapTrade,
} from "../src/trading/pumpswap_preparation";
const root = dirname(fileURLToPath(import.meta.url));
export function runHotpathBenchmark(
  configPath = resolve(root, "hotpath_benchmark.json"),
) {
  const config: { warmup: number; samples: number; batch: number } = JSON.parse(
    readFileSync(configPath, "utf8"),
  );
  for (const field of ["warmup", "samples", "batch"] as const)
    if (
      !Number.isSafeInteger(config[field]) ||
      config[field] < 1 ||
      config[field] > 100000
    )
      throw Error("Invalid benchmark " + field);
  const f = replayPumpSwapFixture(),
    buy = f.results[0]!,
    hints = buy.result.trade.preview.legs.map((l) => l.hint);
  const request = {
    snapshot: f.snapshot,
    context: f.context,
    unixTimestamp: BigInt(
      JSON.parse(
        readFileSync(
          resolve(root, "fixtures/pumpswap_ttwo_route_accounts.json"),
          "utf8",
        ),
      ).unix_timestamp,
    ),
    payer: f.payer.publicKey,
    amount: 1000000n,
    tradeType: "Buy" as const,
    slippageBps: 100,
  };
  const options = {
    context: f.context,
    recentBlockhash: PublicKey.default.toBase58(),
    signers: [f.payer],
    version: 1 as const,
    nativeInput: true,
    temporaryWsolSeed: "offline-pumpswap-Buy",
    rentLamports: 2039280n,
  };
  const cases: { name: string; run: () => number; work: number }[] = [
    {
      name: "prepare_three_hop_buy",
      run: () =>
        Number(preparePumpSwapTrade(request, hints).minimumNetAmountOut),
      work: 1,
    },
    {
      name: "search_three_hop_buy",
      run: () =>
        Number(
          searchPumpSwapTrade(request, f.search).trade.minimumNetAmountOut,
        ),
      work: 1,
    },
    {
      name: "build_sign_prepared_v1",
      run: () => buy.result.trade.buildSigned(options).wire.length,
      work: 1,
    },
  ];
  let checksum = 0;
  const results = cases.map((c) => {
    for (let i = 0; i < config.warmup; i++) checksum += c.run();
    const times: number[] = [];
    for (let i = 0; i < config.samples; i++) {
      const start = performance.now();
      for (let j = 0; j < config.batch; j++) checksum += c.run();
      times.push(
        ((performance.now() - start) * 1000) / (config.batch * c.work),
      );
    }
    times.sort((a, b) => a - b);
    const at = (p: number) =>
      times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)]!;
    return {
      name: c.name,
      unit: "microseconds/transaction",
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
    };
  });
  return {
    runtime: process.version,
    platform: process.platform,
    config,
    results,
    checksum,
    note: "Warm fixed local workloads; batch-normalized samples. Excludes fixtures/setup/network. No production latency guarantee.",
  };
}
if (process.argv[1]?.endsWith("hotpath_benchmark.ts"))
  console.log(JSON.stringify(runHotpathBenchmark(process.argv[2]), null, 2));
