/** Native SIMD-0385 V1 compiler and signer. This path performs no RPC. */
import {
  PublicKey,
  type TransactionInstruction,
  type Signer,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
// RFC 8410 DER wrappers for a raw Ed25519 seed/public key. No signer keys are cached.
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
export interface V1Config {
  priorityFee?: bigint;
  computeUnitLimit?: number;
  loadedAccountsDataSizeLimit?: number;
  heapSize?: number;
}
export interface CompiledV1Message {
  message: Uint8Array;
  accountKeys: PublicKey[];
  requiredSignatures: number;
}
function u32(v: number): Buffer {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff)
    throw new Error("V1 config is outside u32");
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
}
export function compileV1Message(
  payer: PublicKey,
  instructions: readonly TransactionInstruction[],
  recentBlockhash: string,
  config: V1Config = {},
): CompiledV1Message {
  if (instructions.length > 64)
    throw new Error("V1 supports at most 64 instructions");
  const map = new Map<
    string,
    { key: PublicKey; signer: boolean; writable: boolean }
  >();
  function add(key: PublicKey, signer: boolean, writable: boolean) {
    const id = key.toBase58(),
      prior = map.get(id);
    map.set(id, {
      key,
      signer: signer || !!prior?.signer,
      writable: writable || !!prior?.writable,
    });
  }
  for (const ix of instructions) {
    add(ix.programId, false, false);
    for (const a of ix.keys) add(a.pubkey, a.isSigner, a.isWritable);
  }
  add(payer, true, true);
  const payerMeta = map.get(payer.toBase58())!;
  map.delete(payer.toBase58());
  const sorted = [...map.values()].sort((a, b) =>
    Buffer.compare(a.key.toBuffer(), b.key.toBuffer()),
  );
  const sw = [payerMeta, ...sorted.filter((k) => k.signer && k.writable)],
    sr = sorted.filter((k) => k.signer && !k.writable),
    uw = sorted.filter((k) => !k.signer && k.writable),
    ur = sorted.filter((k) => !k.signer && !k.writable);
  const all = [...sw, ...sr, ...uw, ...ur],
    signatures = sw.length + sr.length;
  if (all.length > 64 || signatures > 12)
    throw new Error("V1 account/signature limit exceeded");
  const indices = new Map(all.map((a, i) => [a.key.toBase58(), i]));
  const hash = bs58.decode(recentBlockhash);
  if (hash.length !== 32) throw new Error("Invalid blockhash");
  let mask = 0;
  const values: Buffer[] = [];
  if (config.priorityFee !== undefined) {
    if (config.priorityFee < 0n || config.priorityFee >= 1n << 64n)
      throw new Error("V1 priority fee outside u64");
    mask |= 3;
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(config.priorityFee);
    values.push(b);
  }
  if (config.computeUnitLimit !== undefined) {
    mask |= 4;
    values.push(u32(config.computeUnitLimit));
  }
  if (config.loadedAccountsDataSizeLimit !== undefined) {
    mask |= 8;
    values.push(u32(config.loadedAccountsDataSizeLimit));
  }
  if (config.heapSize !== undefined) {
    if (
      config.heapSize < 32768 ||
      config.heapSize > 262144 ||
      config.heapSize % 1024
    )
      throw new Error("Invalid V1 heap size");
    mask |= 16;
    values.push(u32(config.heapSize));
  }
  const headers: Buffer[] = [],
    payloads: Buffer[] = [];
  for (const ix of instructions) {
    const program = indices.get(ix.programId.toBase58())!;
    if (program === 0) throw new Error("V1 fee payer cannot be a program");
    if (ix.keys.length > 255 || ix.data.length > 65535)
      throw new Error("V1 instruction payload limit");
    const h = Buffer.alloc(4);
    h[0] = program;
    h[1] = ix.keys.length;
    h.writeUInt16LE(ix.data.length, 2);
    headers.push(h);
    payloads.push(
      Buffer.from(ix.keys.map((k) => indices.get(k.pubkey.toBase58())!)),
      ix.data,
    );
  }
  const message = Buffer.concat([
    Buffer.from([129, signatures, sr.length, ur.length]),
    u32(mask),
    Buffer.from(hash),
    Buffer.from([instructions.length, all.length]),
    ...all.map((a) => a.key.toBuffer()),
    ...values,
    ...headers,
    ...payloads,
  ]);
  if (message.length + signatures * 64 > 4096)
    throw new Error("V1 transaction exceeds 4096 bytes");
  return {
    message,
    accountKeys: all.map((a) => a.key),
    requiredSignatures: signatures,
  };
}
/** The returned bytes are ready for simulateTransaction/sendRawTransaction. */
export function signV1Transaction(
  compiled: CompiledV1Message,
  signers: readonly Signer[],
): Uint8Array {
  const m = Buffer.from(compiled.message),
    count = compiled.requiredSignatures;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12 ||
    count > compiled.accountKeys.length ||
    compiled.accountKeys.length > 64 ||
    m.length < 42 + 32 * compiled.accountKeys.length ||
    m.length + 64 * count > 4096 ||
    m[0] !== 129 ||
    m[1] !== count ||
    m[41] !== compiled.accountKeys.length ||
    m[2]! >= count ||
    m[3]! > compiled.accountKeys.length - count ||
    compiled.accountKeys.some(
      (k, i) => !m.subarray(42 + 32 * i, 74 + 32 * i).equals(k.toBuffer()),
    )
  )
    throw new Error("Invalid compiled V1 signer metadata");
  const provided = new Map(signers.map((s) => [s.publicKey.toBase58(), s]));
  const signatures = compiled.accountKeys
    .slice(0, compiled.requiredSignatures)
    .map((key) => {
      const signer = provided.get(key.toBase58());
      if (!signer) throw new Error("Missing V1 signer: " + key.toBase58());
      const publicBytes = key.toBuffer();
      const secretKey = signer.secretKey;
      if (
        secretKey.length !== 64 ||
        !Buffer.from(secretKey.subarray(32)).equals(publicBytes)
      )
        throw new Error("V1 signer key mismatch");
      const privateDer = Buffer.concat([
        ED25519_PKCS8_PREFIX,
        secretKey.subarray(0, 32),
      ]);
      let privateKey;
      try {
        privateKey = createPrivateKey({
          key: privateDer,
          format: "der",
          type: "pkcs8",
        });
      } finally {
        privateDer.fill(0);
      }
      const publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, publicBytes]),
        format: "der",
        type: "spki",
      });
      const signature = sign(null, m, privateKey);
      if (!verify(null, m, publicKey, signature))
        throw new Error("V1 signer key mismatch");
      return signature;
    });
  return Buffer.concat([m, ...signatures]);
}
