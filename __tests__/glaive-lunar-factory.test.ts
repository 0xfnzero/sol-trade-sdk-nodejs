import { describe, expect, it } from "vitest";
import { SwqosType, SwqosRegion, SwqosTransport } from "../src/index";
import { ClientFactory } from "../src/swqos/clients";

describe("Glaive/LunarLander factory", () => {
  it("creates LunarLander HTTP client", () => {
    const client = ClientFactory.createClient(
      {
        type: SwqosType.LunarLander,
        region: SwqosRegion.Default,
        apiKey: "test",
        transport: SwqosTransport.Http,
      },
      "http://localhost:8899"
    );
    expect(client.getSwqosType()).toBe(SwqosType.LunarLander);
    expect(client.minTipSol()).toBe(0.001);
  });

  it("creates Glaive HTTP client with uuid v4", () => {
    const client = ClientFactory.createClient(
      {
        type: SwqosType.Glaive,
        region: SwqosRegion.Default,
        apiKey: "550e8400-e29b-41d4-a716-446655440000",
        transport: SwqosTransport.Http,
      },
      "http://localhost:8899"
    );
    expect(client.getSwqosType()).toBe(SwqosType.Glaive);
    expect(client.minTipSol()).toBe(0.0001);
  });
});
