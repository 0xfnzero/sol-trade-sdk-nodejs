import { it, expect, vi } from "vitest";
import {
  BlockRazorClient,
  createCachedWireSubmit,
  signatureFromSerializedTransaction,
} from "../swqos/clients";
import { TradeType } from "../index";
import golden from "./fixtures/v1_submit_native.json";
const raw = Buffer.from(golden.transaction, "base64");
it("extracts V1 trailing signature and forwards identical bytes without RPC confirmation", async () => {
  expect(signatureFromSerializedTransaction(raw)).toBe(golden.signature);
  const mock = vi.fn(async (_url: any, init: any) => {
    expect(JSON.parse(init.body).transaction).toBe(golden.transaction);
    return new Response("", { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  try {
    expect(
      await createCachedWireSubmit(
        new BlockRazorClient(
          "https://never-rpc.invalid",
          "https://mock.invalid",
        ),
      )(raw, "Buy"),
    ).toBe(golden.signature);
    expect(mock).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("rejects malformed V1 boundaries, counts, config and trailing garbage", () => {
  const changes = [
    raw.subarray(0, raw.length - 1),
    Buffer.concat([raw, Buffer.from([0])]),
  ];
  for (const [index, value] of [
    [1, 2],
    [41, 65],
    [4, 32],
    [40, 64],
    [42 + 64 + 20, 0],
  ]) {
    const x = Buffer.from(raw);
    x[index] = value;
    changes.push(x);
  }
  for (const x of changes)
    expect(() => signatureFromSerializedTransaction(x)).toThrow();
});

it.each(["Buy", "Sell"] as const)(
  "adapter preserves %s and never polls",
  async (direction) => {
    const send = vi.fn(async (kind: TradeType, wire: Buffer, wait: boolean) => {
      expect(kind).toBe(direction);
      expect(wire).toEqual(raw);
      expect(wait).toBe(false);
      return golden.signature;
    });
    const submit = createCachedWireSubmit({ sendTransaction: send } as any);
    expect(await submit(raw, direction)).toBe(golden.signature);
    await expect(submit(raw, "Arbitrage" as any)).rejects.toThrow();
    await expect(
      submit(raw.subarray(0, raw.length - 1), direction),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  },
);
