import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { VersionedTransaction } from "@solana/web3.js";
import { runPumpSwapBank } from "../examples/pumpswap_offline_bank";
const root = resolve("examples/pumpswap_bank");
function temporaryConfig(overrides: Record<string, unknown>): {
  path: string;
  cleanup: () => void;
} {
  const folder = mkdtempSync(resolve(tmpdir(), "node-ttwo-bank-")),
    path = resolve(folder, "config.json");
  const base = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
  writeFileSync(
    path,
    JSON.stringify({
      ...base,
      snapshot: resolve(root, base.snapshot),
      programs: resolve(root, base.programs),
      programs_manifest: resolve(root, base.programs_manifest),
      ...overrides,
    }),
  );
  return {
    path,
    cleanup: () => rmSync(folder, { recursive: true, force: true }),
  };
}
it("executes freshly signed SDK TTWO instructions in pinned SBF banks without network", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw Error("network forbidden in bank replay");
  });
  try {
    const result = runPumpSwapBank();
    expect(result.traces).toHaveLength(12);
    expect(result.benchmark).toBeUndefined();
    for (const trace of result.traces) {
      const wire = Buffer.from(trace.wire, "base64"),
        tx = VersionedTransaction.deserialize(wire);
      expect(wire.length).toBeLessThanOrEqual(1232);
      expect(tx.signatures).toHaveLength(1);
      expect(tx.message.addressTableLookups.length).toBe(trace.alt ? 1 : 0);
      expect(BigInt(trace.units)).toBeGreaterThan(0n);
      if (trace.reject) {
        expect(trace.output).toBe("0");
        expect(trace.logs.join("\n")).toMatch(/slippage/i);
      } else {
        expect(BigInt(trace.output)).toBeGreaterThan(0n);
        expect(trace.logs.join("\n")).toContain(
          "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA success",
        );
      }
    }
    expect(result.traces.filter((t) => t.conversion)).toHaveLength(4);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
}, 120000);
it("rejects altered fixture hashes before execution and can benchmark without bank runs", () => {
  const invalid = temporaryConfig({ sha256: "0".repeat(64) });
  try {
    expect(() => runPumpSwapBank(invalid.path)).toThrow();
  } finally {
    invalid.cleanup();
  }
  const benchmark = temporaryConfig({
    run_bank: false,
    benchmark_iterations: 3,
  });
  try {
    const result = runPumpSwapBank(benchmark.path);
    expect(result.traces).toEqual([]);
    expect(result.benchmark?.iterations).toBe(3);
    expect(result.benchmark!.prepareMicroseconds).toBeGreaterThan(0);
    expect(result.benchmark!.buildMicroseconds).toBeGreaterThan(0);
  } finally {
    benchmark.cleanup();
  }
});
