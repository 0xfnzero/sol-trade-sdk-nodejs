import { it, expect } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { compileV1Message, signV1Transaction } from "../serialization/v1";
import golden from "./fixtures/v1_rust_4_4_1.json";
const payer = Keypair.fromSeed(new Uint8Array(32).fill(7)),
  co = Keypair.fromSeed(new Uint8Array(32).fill(8));
const pk = (v: number) => new PublicKey(new Uint8Array(32).fill(v)),
  a = pk(3),
  b = pk(4),
  program = pk(5);
const ix = [
  new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: a, isSigner: false, isWritable: true },
      { pubkey: co.publicKey, isSigner: true, isWritable: false },
      { pubkey: b, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([1, 2, 3, 4]),
  }),
  new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: b, isSigner: false, isWritable: true },
      { pubkey: a, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([9, 8]),
  }),
];
it("compiles and signs byte-for-byte like Rust V1", () => {
  const compiled = compileV1Message(payer.publicKey, ix, pk(6).toBase58(), {
    priorityFee: 5000n,
    computeUnitLimit: 300000,
    loadedAccountsDataSizeLimit: 1000000,
    heapSize: 32768,
  });
  expect([...compiled.message]).toEqual(golden.message);
  const raw = signV1Transaction(compiled, [co, payer]);
  expect([...raw]).toEqual([...golden.message, ...golden.signatures.flat()]);
  expect(
    nacl.sign.detached.verify(
      compiled.message,
      raw.slice(compiled.message.length, compiled.message.length + 64),
      payer.publicKey.toBytes(),
    ),
  ).toBe(true);
  expect(() => signV1Transaction(compiled, [payer])).toThrow("Missing");
});
it("enforces V1 limits and config bounds", () => {
  expect(() =>
    compileV1Message(payer.publicKey, Array(65).fill(ix[0]), pk(6).toBase58()),
  ).toThrow();
  expect(() =>
    compileV1Message(payer.publicKey, ix, pk(6).toBase58(), {
      heapSize: 32769,
    }),
  ).toThrow();
  expect(() =>
    compileV1Message(
      payer.publicKey,
      [
        new TransactionInstruction({
          programId: program,
          keys: [],
          data: Buffer.alloc(4096),
        }),
      ],
      pk(6).toBase58(),
    ),
  ).toThrow("4096");
});
