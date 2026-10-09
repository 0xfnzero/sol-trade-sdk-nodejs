import { afterEach, expect, it, vi } from 'vitest';
import { AddressLookupTableAccount, Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { DexType, SwqosType, TradeConfigBuilder, TradeType, TradingClient } from '../index';
import { withDeadline } from '../common/deadline';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each([true, false])('main executor releases losing deadlines after signed first success (late success=%s)', async lateSuccess => {
  vi.useFakeTimers();
  const payer = Keypair.generate();
  const nonce = Keypair.generate().publicKey, recipient = Keypair.generate().publicKey;
  const lookup = new AddressLookupTableAccount({ key: Keypair.generate().publicKey,
    state: { deactivationSlot: 0xffffffffffffffffn, lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0, addresses: [recipient, nonce] } });
  const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1')
    .swqosConfigs([{ type: SwqosType.Jito, customUrl: 'http://slow' }]).build());
  let resolve!: (signature: string) => void;
  let reject!: (error: Error) => void;
  let lateSignature = '';
  let completed = false;
  const pending = new Promise<string>((ok, fail) => { resolve = ok; reject = fail; })
    .finally(() => { completed = true; });
  const inspect = (wire: Uint8Array) => {
    const tx = VersionedTransaction.deserialize(wire);
    expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, payer.publicKey.toBytes())).toBe(true);
    expect(tx.message.addressTableLookups).toHaveLength(1);
    const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: [lookup] });
    const first = tx.message.compiledInstructions[0]!;
    expect(keys.get(first.programIdIndex)!.equals(SystemProgram.programId)).toBe(true);
    expect(Buffer.from(first.data).readUInt32LE()).toBe(4);
    expect(keys.get(first.accountKeyIndexes[0]!)!.equals(nonce)).toBe(true);
    const transfer = tx.message.compiledInstructions.at(-1)!;
    expect(keys.get(transfer.accountKeyIndexes[1]!)!.equals(recipient)).toBe(true);
    return bs58.encode(tx.signatures[0]!);
  };
  const slow = { getTipAccount: () => Keypair.generate().publicKey.toBase58(), minTipSol: () => 0,
    sendTransaction: vi.fn((_side: TradeType, wire: Uint8Array) => { lateSignature = inspect(wire); return pending; }) };
  const winner = { getTipAccount: () => '', minTipSol: () => 0,
    sendTransaction: vi.fn(async (_side: TradeType, wire: Uint8Array) => inspect(wire)) };
  client.getSwqosClient = (_: unknown, cfg: { type: SwqosType }) => cfg.type === SwqosType.Default ? winner : slow;
  const rpc = vi.fn(() => { throw Error('chain-state RPC forbidden'); });
  client.connection = new Proxy({}, { get: rpc });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('network forbidden'); });
  const result = await client.executeTransaction([SystemProgram.transfer({ fromPubkey: payer.publicKey,
    toPubkey: recipient, lamports: 1 })], PublicKey.default.toBase58(), lookup, false, false,
    { tradeType: TradeType.Buy, dexType: DexType.PumpFun,
      durableNonce: { nonceAccount: nonce, authority: payer.publicKey, nonceHash: PublicKey.default.toBase58() },
      gasFeeStrategy: { buyComputeUnits: 200_000, sellComputeUnits: 200_000, buyPriorityFee: 0,
        sellPriorityFee: 0, buyTipLamports: 100_000, sellTipLamports: 100_000 } });
  expect(result.success).toBe(true);
  expect(slow.sendTransaction).toHaveBeenCalledOnce();
  expect(winner.sendTransaction).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  if (lateSuccess) resolve(lateSignature); else reject(Error('late transport failure'));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(completed).toBe(true);
  expect(result.signatures).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(rpc).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});

it.each(['nonce', 'instruction'])('payer-only main executor rejects an unsupported %s signer before submit', async source => {
  const payer = Keypair.generate(), authority = Keypair.generate();
  const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1').build());
  const relay = { getTipAccount: () => '', minTipSol: () => 0, sendTransaction: vi.fn(async () => 'invalid-ack') };
  client.getSwqosClient = () => relay;
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  const instructions = source === 'instruction' ? [SystemProgram.transfer({
    fromPubkey: authority.publicKey, toPubkey: payer.publicKey, lamports: 1,
  })] : [];
  const result = await client.executeTransaction(instructions, PublicKey.default.toBase58(), undefined, false, false,
    { tradeType: TradeType.Buy, dexType: DexType.PumpFun,
      ...(source === 'nonce' ? { durableNonce: { nonceAccount: Keypair.generate().publicKey,
        authority: authority.publicKey, nonceHash: PublicKey.default.toBase58() } } : {}) });
  expect(result.success).toBe(false);
  expect(result.error.message).toContain('additional signers');
  expect(relay.sendTransaction).not.toHaveBeenCalled();
});

it('failed signed batch releases resources and the next batch can retry the exact wire locally', async () => {
  vi.useFakeTimers();
  const payer = Keypair.generate();
  const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1').build());
  let failing = true;
  const wires: Buffer[] = [];
  const relay = { getTipAccount: () => '', minTipSol: () => 0, sendTransaction: vi.fn(async (_: TradeType, wire: Uint8Array) => {
    wires.push(Buffer.from(wire));
    const tx = VersionedTransaction.deserialize(wire);
    expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, payer.publicKey.toBytes())).toBe(true);
    if (failing) throw Error('local transport failure');
    return bs58.encode(tx.signatures[0]!);
  }) };
  client.getSwqosClient = () => relay;
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  const execute = () => client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, false,
    { tradeType: TradeType.Sell, dexType: DexType.PumpFun });
  expect((await execute()).success).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  failing = false;
  expect((await execute()).success).toBe(true);
  expect(wires).toHaveLength(2);
  expect(wires[0]!.equals(wires[1]!)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancelled wait releases timer/listener while observing a late transport rejection', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  let reject!: (error: Error) => void;
  const transport = new Promise<string>((_ok, fail) => { reject = fail; });
  const waiting = withDeadline(() => transport, 5000, controller.signal);
  controller.abort();
  await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledOnce();
  reject(Error('late transport failure'));
  await Promise.resolve();
  const task = vi.fn(async () => 'unexpected');
  await expect(withDeadline(task, 5000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(task).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
