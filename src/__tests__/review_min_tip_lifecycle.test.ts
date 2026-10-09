import { afterEach, expect, it, vi } from 'vitest';
import { AddressLookupTableAccount, Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { DexType, GasFeeStrategy, GasFeeStrategyType, SwqosRegion, SwqosType, TradeConfigBuilder, TradeType, TradingClient } from '../index';
import { ClientFactory } from '../swqos/clients';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const config = (minTipSol?: number, type = SwqosType.Jito) => ({ type, minTipSol,
  region: SwqosRegion.Default, apiKey: '', customUrl: 'http://localhost:1' });
// Access the assembly entry to isolate route eligibility from pool discovery.
const create = (configs = [config()]) => new (TradingClient as any)(Keypair.generate(),
  TradeConfigBuilder.create('http://localhost:1').swqosConfigs(configs).build());
const context = { tradeType: TradeType.Buy, dexType: DexType.PumpFun, waitForAllSubmits: true };

it.each([[-0, 0], [0.00000000049, 0], [0.0000000005, 1], [0.00000000149, 1]])('initializes decimal minimum %s and filters at %s whole lamports', async (minimum, expected) => {
  const client = create([config(minimum)]);
  const ack = async (_: TradeType, wire: Uint8Array) => {
    const tx = VersionedTransaction.deserialize(wire);
    expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, client.payer.publicKey.toBytes())).toBe(true);
    return bs58.encode(tx.signatures[0]!);
  };
  const relay = { getTipAccount: vi.fn(() => Keypair.generate().publicKey.toBase58()), minTipSol: () => 0,
    sendTransaction: vi.fn(ack) };
  const fallback = { getTipAccount: () => '', minTipSol: () => 0, sendTransaction: ack };
  vi.spyOn(ClientFactory, 'createClient').mockImplementation(cfg => cfg.type === SwqosType.Default ? fallback as any : relay as any);
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  for (const amount of [0, 1]) {
    relay.sendTransaction.mockClear();
    const result = await client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, false,
      { ...context, gasFeeStrategy: { buyComputeUnits: 200_000, sellComputeUnits: 200_000,
        buyPriorityFee: 0, sellPriorityFee: 0, buyTipLamports: amount, sellTipLamports: amount } });
    expect(result.success).toBe(true);
    expect(relay.sendTransaction).toHaveBeenCalledTimes(amount >= expected! ? 1 : 0);
  }
});
it('rejects an initialization one representable step beyond safe lamports', () => {
  expect(() => TradeConfigBuilder.create('http://localhost:1').swqosConfigs([
    config(Number.MAX_SAFE_INTEGER / 1e9 + 0.00000001),
  ])).toThrow('safe lamport range');
});

it('same-endpoint client reuse keeps omission/equality/minimum distinct per signed nonce+ALT lane', async () => {
  const client = create([config(0.000100001), config(0.0001), config()]);
  const nonce = Keypair.generate().publicKey, recipient = Keypair.generate().publicKey;
  const lookup = new AddressLookupTableAccount({ key: Keypair.generate().publicKey, state: {
    deactivationSlot: 0xffffffffffffffffn, lastExtendedSlot: 0,
    lastExtendedSlotStartIndex: 0, addresses: [nonce, recipient],
  } });
  const tipRecipient = Keypair.generate().publicKey;
  const amounts: bigint[] = [];
  const relay = { minTipSol: () => 0, getTipAccount: vi.fn(() => tipRecipient.toBase58()),
    sendTransaction: vi.fn(async (_: TradeType, wire: Uint8Array) => {
      const tx = VersionedTransaction.deserialize(wire);
      expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, client.payer.publicKey.toBytes())).toBe(true);
      const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: [lookup] });
      const advance = tx.message.compiledInstructions[0]!;
      expect(Buffer.from(advance.data).readUInt32LE()).toBe(4);
      expect(keys.get(advance.accountKeyIndexes[0]!)!.equals(nonce)).toBe(true);
      const tip = tx.message.compiledInstructions.find(ix => keys.get(ix.programIdIndex)!.equals(SystemProgram.programId)
        && ix.data.length === 12 && keys.get(ix.accountKeyIndexes[1]!)!.equals(tipRecipient))!;
      amounts.push(Buffer.from(tip.data).readBigUInt64LE(4));
      const transfer = tx.message.compiledInstructions.at(-1)!;
      expect(keys.get(transfer.accountKeyIndexes[1]!)!.equals(recipient)).toBe(true);
      return bs58.encode(tx.signatures[0]!);
    }) };
  const factory = vi.spyOn(ClientFactory, 'createClient').mockReturnValue(relay as any);
  client.connection = new Proxy({}, { get: () => { throw Error('chain-state RPC forbidden'); } });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('network forbidden'); });
  const strategy = new GasFeeStrategy();
  strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.HighTipLowCuPrice, 200_000, 0, 0.0001);
  strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice, 200_000, 0, 0.000099999);
  client._config.gasStrategy = strategy;
  const result = await client.executeTransaction([SystemProgram.transfer({ fromPubkey: client.payer.publicKey,
    toPubkey: recipient, lamports: 1 })], PublicKey.default.toBase58(), lookup, false, false, { ...context,
    durableNonce: { nonceAccount: nonce, authority: client.payer.publicKey, nonceHash: PublicKey.default.toBase58() } });
  expect(result.success).toBe(true);
  expect(factory).toHaveBeenCalledOnce();
  expect(relay.getTipAccount).toHaveBeenCalledTimes(3);
  expect(amounts.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)).toEqual([99_999n, 100_000n, 100_000n]);
  expect(network).not.toHaveBeenCalled();
});

it('all explicit provider/default minima filter before client initialization and recover next call', async () => {
  vi.useFakeTimers();
  const client = create([config(0.0001), config(0.0001, SwqosType.Default)]);
  const relay = { getTipAccount: vi.fn(() => Keypair.generate().publicKey.toBase58()), minTipSol: () => 0,
    sendTransaction: vi.fn(async (_: TradeType, wire: Uint8Array) => {
      const tx = VersionedTransaction.deserialize(wire);
      expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, client.payer.publicKey.toBytes())).toBe(true);
      return bs58.encode(tx.signatures[0]!);
    }) };
  const factory = vi.spyOn(ClientFactory, 'createClient').mockReturnValue(relay as any);
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  const gas = { buyComputeUnits: 200_000, sellComputeUnits: 200_000, buyPriorityFee: 0,
    sellPriorityFee: 0, buyTipLamports: 99_999, sellTipLamports: 99_999 };
  const execute = () => client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, false,
    { ...context, gasFeeStrategy: gas });
  const blocked = await execute();
  expect(blocked.success).toBe(false); expect(blocked.error.message).toContain('All SWQOS providers filtered');
  expect(factory).not.toHaveBeenCalled(); expect(relay.getTipAccount).not.toHaveBeenCalled();
  expect(relay.sendTransaction).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  gas.buyTipLamports = 100_000;
  expect((await execute()).success).toBe(true);
  expect(relay.sendTransaction).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});

it('expired signed submissions release all waits, ignore late acknowledgements, and accept a fresh cached hash', async () => {
  vi.useFakeTimers();
  const client = create();
  let hanging = true;
  const late: (() => void)[] = [];
  const observedHashes: string[] = [];
  const relay = { getTipAccount: () => Keypair.generate().publicKey.toBase58(), minTipSol: () => 0,
    sendTransaction: vi.fn(async (_: TradeType, wire: Uint8Array) => {
      const tx = VersionedTransaction.deserialize(wire);
      expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, client.payer.publicKey.toBytes())).toBe(true);
      observedHashes.push(tx.message.recentBlockhash);
      const signature = bs58.encode(tx.signatures[0]!);
      if (!hanging) return signature;
      return new Promise<string>(resolve => { late.push(() => resolve(signature)); });
    }) };
  vi.spyOn(ClientFactory, 'createClient').mockReturnValue(relay as any);
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  const firstHash = Keypair.generate().publicKey.toBase58();
  const pending = client.executeTransaction([], firstHash, undefined, false, false, context);
  await vi.waitFor(() => expect(relay.sendTransaction).toHaveBeenCalledTimes(2));
  expect(vi.getTimerCount()).toBe(2);
  await vi.advanceTimersByTimeAsync(5000);
  const timedOut = await pending;
  expect(timedOut.success).toBe(false); expect(timedOut.error.message).toContain('Timeout');
  expect(timedOut.signatures).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  for (const finish of late) finish();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(timedOut.success).toBe(false); expect(timedOut.signatures).toEqual([]);
  hanging = false;
  const nextHash = Keypair.generate().publicKey.toBase58();
  const next = await client.executeTransaction([], nextHash, undefined, false, false, context);
  expect(next.success).toBe(true); expect(vi.getTimerCount()).toBe(0);
  expect(observedHashes).toEqual([firstHash, firstHash, nextHash, nextHash]);
});
