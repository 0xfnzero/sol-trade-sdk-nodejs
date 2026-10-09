import { expect, it } from "vitest";
import { Keypair, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { compileV1Message, signV1Transaction } from "../serialization/v1";
const payer = Keypair.fromSeed(new Uint8Array(32).fill(17));
const co = Keypair.fromSeed(new Uint8Array(32).fill(18));
function message(two = false) {
  return compileV1Message(
    payer.publicKey,
    [
      new TransactionInstruction({
        programId: Keypair.fromSeed(new Uint8Array(32).fill(19)).publicKey,
        keys: two
          ? [{ pubkey: co.publicKey, isSigner: true, isWritable: false }]
          : [],
        data: Buffer.from([3, 2, 1]),
      }),
    ],
    Keypair.fromSeed(new Uint8Array(32).fill(20)).publicKey.toBase58(),
  );
}
for (const two of [false, true])
  it(`native Ed25519 matches independent NaCl, signer count=${two ? 2 : 1}`, () => {
    const m = message(two),
      wire = signV1Transaction(m, two ? [co, payer] : [payer]);
    const ordered = two ? [payer, co] : [payer];
    expect(wire.length).toBe(m.message.length + 64 * ordered.length);
    expect([...wire.subarray(0, m.message.length)]).toEqual([...m.message]);
    for (let i = 0; i < ordered.length; i++) {
      const signature = wire.subarray(
        m.message.length + 64 * i,
        m.message.length + 64 * (i + 1),
      );
      expect([...signature]).toEqual([
        ...nacl.sign.detached(m.message, ordered[i]!.secretKey),
      ]);
      expect(
        nacl.sign.detached.verify(
          m.message,
          signature,
          ordered[i]!.publicKey.toBytes(),
        ),
      ).toBe(true);
      const tampered = new Uint8Array(m.message);
      tampered[tampered.length - 1] ^= 1;
      expect(
        nacl.sign.detached.verify(
          tampered,
          signature,
          ordered[i]!.publicKey.toBytes(),
        ),
      ).toBe(false);
      const badSignature = new Uint8Array(signature);
      badSignature[0] ^= 1;
      expect(
        nacl.sign.detached.verify(
          m.message,
          badSignature,
          ordered[i]!.publicKey.toBytes(),
        ),
      ).toBe(false);
    }
  });
it("rejects substituted seed even when public-key suffix matches", () => {
  const secret = new Uint8Array(payer.secretKey);
  secret.set(co.secretKey.subarray(0, 32));
  expect(() =>
    signV1Transaction(message(), [
      { publicKey: payer.publicKey, secretKey: secret },
    ]),
  ).toThrow("V1 signer key mismatch");
});
it("rejects malformed public-key suffix, short secret, and missing second signer", () => {
  const secret = new Uint8Array(payer.secretKey);
  secret[63] ^= 1;
  expect(() =>
    signV1Transaction(message(), [
      { publicKey: payer.publicKey, secretKey: secret },
    ]),
  ).toThrow("V1 signer key mismatch");
  expect(() =>
    signV1Transaction(message(), [
      {
        publicKey: payer.publicKey,
        secretKey: payer.secretKey.subarray(0, 32),
      },
    ]),
  ).toThrow("V1 signer key mismatch");
  expect(() => signV1Transaction(message(true), [payer])).toThrow(
    "Missing V1 signer",
  );
});
it("rejects tampered signer metadata before signing and does not retain mutable secret keys", () => {
  const m = message();
  const corrupt = { ...m, message: new Uint8Array(m.message) };
  corrupt.message[42] ^= 1;
  expect(() => signV1Transaction(corrupt, [payer])).toThrow(
    "Invalid compiled V1 signer metadata",
  );
  const secret = new Uint8Array(payer.secretKey),
    signer = { publicKey: payer.publicKey, secretKey: secret };
  signV1Transaction(m, [signer]);
  secret[0] ^= 1;
  expect(() => signV1Transaction(m, [signer])).toThrow(
    "V1 signer key mismatch",
  );
});
it("returns exactly the signed message snapshot when a signer getter mutates caller bytes", () => {
  const m = message(),
    before = new Uint8Array(m.message);
  let reads = 0;
  const signer = {
    publicKey: payer.publicKey,
    get secretKey() {
      reads++;
      m.message[m.message.length - 1] ^= 1;
      return payer.secretKey;
    },
  };
  const wire = signV1Transaction(m, [signer]);
  expect(reads).toBe(1);
  expect([...wire.subarray(0, before.length)]).toEqual([...before]);
  expect(
    nacl.sign.detached.verify(
      before,
      wire.subarray(before.length),
      payer.publicKey.toBytes(),
    ),
  ).toBe(true);
});
