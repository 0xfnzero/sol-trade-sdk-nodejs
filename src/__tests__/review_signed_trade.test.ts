import { afterEach, expect, it, vi } from 'vitest';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { HotPathExecutor, TransactionBuilder } from '../hotpath';
import { compileV1Message, signV1Transaction } from '../serialization/v1';

afterEach(() => vi.restoreAllMocks());
it('generated-key legacy hotpath signs locally, parses wire and rejects tampering/missing signer', async () => {
  const payer = Keypair.generate(), other = Keypair.generate();
  const connection = new Connection('http://localhost:1');
  const rpc = vi.spyOn(connection, 'getLatestBlockhash').mockImplementation(() => { throw Error('RPC forbidden'); });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('network forbidden'); });
  const hot = new HotPathExecutor(connection, { enablePrefetch: false });
  vi.spyOn(hot, 'getBlockhash').mockReturnValue({ blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100 });
  const builder = new TransactionBuilder(hot);
  const ix = SystemProgram.transfer({ fromPubkey: other.publicKey, toPubkey: payer.publicKey, lamports: 1 });
  const tx = (await builder.buildTransaction(payer.publicKey, [ix], [other, payer]))!;
  const parsed = Transaction.from(tx.serialize());
  expect(parsed.signatures).toHaveLength(2);
  expect(parsed.verifySignatures()).toBe(true);
  const message = parsed.serializeMessage();
  for (const sig of parsed.signatures) expect(nacl.sign.detached.verify(message, sig.signature!, sig.publicKey.toBytes())).toBe(true);
  parsed.instructions[0]!.data[4] ^= 1;
  expect(parsed.verifySignatures()).toBe(false);
  await expect(builder.buildTransaction(payer.publicKey, [ix], [payer])).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});

it('generated-key native V1 signer order, real Ed25519 verification and tamper rejection', () => {
  const payer = Keypair.generate(), other = Keypair.generate();
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('RPC forbidden'); });
  const ix = SystemProgram.transfer({ fromPubkey: other.publicKey, toPubkey: payer.publicKey, lamports: 1 });
  const compiled = compileV1Message(payer.publicKey, [ix], PublicKey.default.toBase58());
  const wire = signV1Transaction(compiled, [other, payer]);
  expect(compiled.requiredSignatures).toBe(2);
  expect(compiled.accountKeys[0]!.equals(payer.publicKey)).toBe(true);
  const verify = (bytes: Uint8Array) => compiled.accountKeys.slice(0, 2).every((key, i) =>
    nacl.sign.detached.verify(bytes.slice(0, compiled.message.length), bytes.slice(compiled.message.length + 64 * i, compiled.message.length + 64 * (i + 1)), key.toBytes()));
  expect(verify(wire)).toBe(true);
  const messageTamper = wire.slice(); messageTamper[compiled.message.length - 1] ^= 1;
  const signatureTamper = wire.slice(); signatureTamper[compiled.message.length] ^= 1;
  expect(verify(messageTamper)).toBe(false); expect(verify(signatureTamper)).toBe(false);
  expect(() => signV1Transaction(compiled, [payer])).toThrow('Missing V1 signer');
  expect(network).not.toHaveBeenCalled();
});
