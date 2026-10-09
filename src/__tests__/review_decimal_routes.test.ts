import { afterEach, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { writeFileSync } from 'node:fs';
import { DexType, GasFeeStrategy, GasFeeStrategyType, SwqosRegion, SwqosType, TradeConfigBuilder, TradeType, TradingClient } from '../index';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each([TradeType.Buy, TradeType.Sell])('signs/parses per-endpoint fee lanes with no RPC and clears submit timers (%s)', async side => {
  vi.useFakeTimers();
  const payer = Keypair.generate();
  const blockedTip = Keypair.generate().publicKey, boundaryTip = Keypair.generate().publicKey, plainTip = Keypair.generate().publicKey;
  // Private entry is intentionally accessed to isolate fee-lane assembly from pool discovery.
  const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1').swqosConfigs([
    { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'unused', customUrl: 'http://blocked', minTipSol: 0.100000001 },
    { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'unused', customUrl: 'http://boundary', minTipSol: 0.1 },
    { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'unused', customUrl: 'http://plain' },
  ]).build());
  const captures = new Map<string, Uint8Array[]>();
  const make = (tip: PublicKey, customUrl: string) => ({
    getTipAccount: vi.fn(() => tip.toBase58()), minTipSol: () => 0,
    sendTransaction: vi.fn(async (_: TradeType, wire: Uint8Array, wait: boolean) => {
      expect(wait).toBe(false);
      const tx = VersionedTransaction.deserialize(wire);
      expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, payer.publicKey.toBytes())).toBe(true);
      captures.set(customUrl, [...captures.get(customUrl) ?? [], wire]);
      return bs58.encode(tx.signatures[0]!);
    }),
  });
  const blocked = make(blockedTip, 'blocked'), boundary = make(boundaryTip, 'boundary'), plain = make(plainTip, 'plain'), rpc = make(PublicKey.default, 'rpc');
  client.getSwqosClient = vi.fn((_: unknown, cfg: { customUrl?: string; type: SwqosType }) =>
    cfg.type === SwqosType.Default ? rpc : cfg.customUrl === 'http://blocked' ? blocked : cfg.customUrl === 'http://boundary' ? boundary : plain);
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('network forbidden'); });
  client.connection = new Proxy({}, { get: () => { throw Error('RPC forbidden'); } });
  const strategy = new GasFeeStrategy();
  strategy.set(SwqosType.Jito, side, GasFeeStrategyType.HighTipLowCuPrice, 200_000, 0, 0.1);
  strategy.set(SwqosType.Jito, side, GasFeeStrategyType.LowTipHighCuPrice, 200_000, 0, 0.099999999);
  strategy.set(SwqosType.Jito, side === TradeType.Buy ? TradeType.Sell : TradeType.Buy, GasFeeStrategyType.Normal, 200_000, 0, 1);
  strategy.set(SwqosType.Default, side, GasFeeStrategyType.Normal, 200_000, 0, 0);
  client._config.gasStrategy = strategy;
  const result = await client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, false, {
    tradeType: side, dexType: DexType.PumpFun, waitForAllSubmits: true,
    durableNonce: { nonceAccount: Keypair.generate().publicKey, authority: payer.publicKey, nonceHash: PublicKey.default.toBase58() },
  });
  expect(result.error).toBeUndefined(); expect(result.success).toBe(true);
  expect(blocked.getTipAccount).not.toHaveBeenCalled(); expect(blocked.sendTransaction).not.toHaveBeenCalled();
  for (const [relay, name, amounts] of [[boundary, 'boundary', [100_000_000]], [plain, 'plain', [99_999_999, 100_000_000]]] as const) {
    expect(relay.sendTransaction).toHaveBeenCalledTimes(amounts.length);
    const parsedAmounts = captures.get(name)!.map(wire => {
      const tx = VersionedTransaction.deserialize(wire), ix = tx.message.compiledInstructions.find(ix =>
        tx.message.staticAccountKeys[ix.programIdIndex]!.equals(SystemProgram.programId) && ix.data.length === 12 && Buffer.from(ix.data).readUInt32LE() === 2)!;
      const bytes = Buffer.from(ix.data);
      expect(bytes.readUInt32LE()).toBe(2);
      expect(Buffer.from(tx.message.compiledInstructions[0]!.data).readUInt32LE()).toBe(4);
      return Number(bytes.readBigUInt64LE(4));
    }).sort((a, b) => a - b);
    expect(parsedAmounts).toEqual(amounts);
  }
  expect(network).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it('exports the actual SDK builder and signer output for the independent local bank', async () => {
  if (!process.env.REVIEW_BANK_WIRE_OUTPUT) return;
  const { Connection } = await import('@solana/web3.js');
  const { HotPathExecutor, TransactionBuilder } = await import('../hotpath');
  const payer = Keypair.generate(), recipient = Keypair.generate().publicKey;
  const blockhash = process.env.REVIEW_BANK_BLOCKHASH!;
  const hot = new HotPathExecutor(new Connection('http://localhost:1'), { enablePrefetch: false });
  vi.spyOn(hot, 'getBlockhash').mockReturnValue({ blockhash, lastValidBlockHeight: 100 });
  const tx = (await new TransactionBuilder(hot).buildTransaction(payer.publicKey,
    [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: 1_000_000 })], [payer],
    { computeUnitLimit: 200_000, computeUnitPrice: 0 }))!;
  expect(tx.verifySignatures()).toBe(true);
  writeFileSync(process.env.REVIEW_BANK_WIRE_OUTPUT, JSON.stringify({ sdk: 'sol-trade-sdk-nodejs', wire: tx.serialize().toString('base64'), payer: payer.publicKey.toBase58(), recipient: recipient.toBase58(), lamports: 1_000_000, blockhash }, null, 2));
});

it('optionally benchmarks warmed decimal route execution without a latency SLA', async () => {
  if (!process.env.REVIEW_BENCH_OUTPUT) return;
  const { performance } = await import('node:perf_hooks');
  const cases = [];
  const tipAccount = Keypair.generate().publicKey.toBase58();
  for (const [name, minimum] of [['None', undefined], ['eligible', 0.0001], ['below', 0.000100001]] as const) {
    const payer = Keypair.generate();
    const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1').swqosConfigs([
      { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'unused', minTipSol: minimum },
    ]).build());
    const relay = { minTipSol: () => 0, getTipAccount: () => tipAccount,
      sendTransaction: async (_: unknown, wire: Uint8Array) => bs58.encode(VersionedTransaction.deserialize(wire).signatures[0]!) };
    const rpc = { ...relay, getTipAccount: () => '' };
    client.getSwqosClient = (_: unknown, cfg: { type: SwqosType }) => cfg.type === SwqosType.Default ? rpc : relay;
    const execute = () => client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, false,
      { tradeType: TradeType.Buy, dexType: DexType.PumpFun, waitForAllSubmits: true,
        gasFeeStrategy: { buyComputeUnits: 200_000, sellComputeUnits: 200_000, buyPriorityFee: 0, sellPriorityFee: 0, buyTipLamports: 100_000, sellTipLamports: 100_000 } });
    for (let i = 0; i < 50; i++) await execute();
    const samples = [];
    for (let i = 0; i < 500; i++) { const start = performance.now(); expect((await execute()).success).toBe(true); samples.push((performance.now() - start) * 1_000_000); }
    samples.sort((a, b) => a - b);
    cases.push({ case: name, iterations: 500, warmup: 50, median_ns: Math.round(samples[250]!), p95_ns: Math.round(samples[475]!) });
  }
  writeFileSync(process.env.REVIEW_BENCH_OUTPUT, JSON.stringify({ sdk: 'sol-trade-sdk-nodejs', node: process.version, arch: process.arch,
    scope: 'warmed executeTransaction route selection, real signing, deserialize and local ack; implicit Default route always signs; no network', cases }, null, 2));
});

it.each([99_999, 100_000])('simulation selects an eligible signed route after decimal filtering (tip=%s, mock RPC contract)', async amount => {
  const payer = Keypair.generate(), tip = Keypair.generate().publicKey;
  const client = new (TradingClient as any)(payer, TradeConfigBuilder.create('http://localhost:1').swqosConfigs([
    { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'unused', minTipSol: 0.0001 },
  ]).build());
  const relay = { getTipAccount: vi.fn(() => tip.toBase58()), minTipSol: () => 0, sendTransaction: vi.fn() };
  const rpc = { getTipAccount: vi.fn(() => ''), minTipSol: () => 0, sendTransaction: vi.fn() };
  client.getSwqosClient = (_: unknown, cfg: { type: SwqosType }) => cfg.type === SwqosType.Default ? rpc : relay;
  const simulate = vi.fn(async (tx: VersionedTransaction) => {
    expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0]!, payer.publicKey.toBytes())).toBe(true);
    expect(tx.message.staticAccountKeys.some(key => key.equals(tip))).toBe(amount === 100_000);
    return { value: { err: null, unitsConsumed: 150, logs: [] } };
  });
  client.connection = { simulateTransaction: simulate };
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('network forbidden'); });
  const result = await client.executeTransaction([], PublicKey.default.toBase58(), undefined, false, true,
    { tradeType: TradeType.Buy, dexType: DexType.PumpFun,
      gasFeeStrategy: { buyComputeUnits: 200_000, sellComputeUnits: 200_000, buyPriorityFee: 0, sellPriorityFee: 0, buyTipLamports: amount, sellTipLamports: amount } });
  expect(result.success).toBe(true); expect(simulate).toHaveBeenCalledOnce();
  expect(relay.getTipAccount).toHaveBeenCalledTimes(amount === 100_000 ? 1 : 0);
  expect(relay.sendTransaction).not.toHaveBeenCalled(); expect(rpc.sendTransaction).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});
