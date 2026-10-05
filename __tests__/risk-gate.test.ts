import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { TradingClient, TradeError } from "../src/index";

describe("TradeRiskGate", () => {
  it("buy path rejects when gate throws", async () => {
    const payer = Keypair.generate();
    const client = new TradingClient(payer, {
      rpcUrl: "http://localhost:8899",
    });
    let calls = 0;
    client.withRiskGate({
      checkBuy() {
        calls += 1;
        throw new TradeError(1, "blocked by risk gate");
      },
    });

    await expect(
      client.buy({
        inputTokenAmount: 1_000_000,
        slippageBasisPoints: 100,
      } as any)
    ).rejects.toThrow(/blocked by risk gate/);
    expect(calls).toBe(1);
  });
});
