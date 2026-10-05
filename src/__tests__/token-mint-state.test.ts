import { it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
const token = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
function mint(extensions: [number, Buffer][]) {
  const d = Buffer.alloc(166);
  d[45] = 1;
  d[165] = 1;
  return Buffer.concat([
    d,
    ...extensions.flatMap(([type, payload]) => {
      const h = Buffer.alloc(4);
      h.writeUInt16LE(type);
      h.writeUInt16LE(payload.length, 2);
      return [h, payload];
    }),
  ]);
}
it("uses exact supplied epoch fee schedule", () => {
  const fees = Buffer.alloc(108);
  fees.writeBigUInt64LE(500n, 80);
  fees.writeUInt16LE(100, 88);
  fees.writeBigUInt64LE(4n, 90);
  fees.writeBigUInt64LE(900n, 98);
  fees.writeUInt16LE(300, 106);
  const d = mint([[1, fees]]);
  expect(tokenTransferFeeForEpoch(d, token, 3n)).toEqual({
    basisPoints: 100,
    maximumFee: 500n,
  });
  expect(tokenTransferFeeForEpoch(d, token, 4n)).toEqual({
    basisPoints: 300,
    maximumFee: 900n,
  });
});
it("permits stock public transfers and rejects frozen/paused/active hook", () => {
  const pause = Buffer.alloc(33),
    hook = Buffer.alloc(64);
  const build = (state: number) =>
    mint([
      [6, Buffer.from([state])],
      [26, pause],
      [14, hook],
      [4, Buffer.alloc(65)],
    ]);
  expect(tokenTransferFeeForEpoch(build(1), token, 1n).basisPoints).toBe(0);
  expect(() => tokenTransferFeeForEpoch(build(2), token, 1n)).toThrow("frozen");
  pause[32] = 1;
  expect(() => tokenTransferFeeForEpoch(build(1), token, 1n)).toThrow("paused");
  pause[32] = 0;
  hook[32] = 1;
  expect(() => tokenTransferFeeForEpoch(build(1), token, 1n)).toThrow("hook");
  expect(() =>
    tokenTransferFeeForEpoch(mint([[6, Buffer.alloc(0)]]), token, 1n),
  ).toThrow("size");
});

it.each([1, 2, 3, 4, 64])("accepts %i zero padding bytes", (padding) => {
  const d = Buffer.concat([mint([[6, Buffer.from([1])], [19, Buffer.alloc(0)]]), Buffer.alloc(padding)]);
  expect(tokenTransferFeeForEpoch(d, token, 1n).basisPoints).toBe(0);
});
it.each([[0, 1], [0, 0, 1, 0], [6, 0, 1], [6, 0, 2, 0, 1]])("rejects malformed tail %j", (...tail) => {
  expect(() => tokenTransferFeeForEpoch(Buffer.concat([mint([]), Buffer.from(tail)]), token, 1n)).toThrow();
});
it.each([6, 19])("rejects duplicate extension %i including empty metadata", (kind) => {
  const payload = kind === 6 ? Buffer.from([1]) : Buffer.alloc(0);
  expect(() => tokenTransferFeeForEpoch(mint([[kind, payload], [kind, payload]]), token, 1n)).toThrow("duplicate");
});
