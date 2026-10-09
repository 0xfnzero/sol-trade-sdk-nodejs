import { afterEach, describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Connection } from '@solana/web3.js';
import { AsyncTradeExecutor, ExecutionStatus, SubmitMode } from '../trading/core/async-executor';
import { HotPathExecutor } from '../hotpath/executor';
import { RateLimiter } from '../trading/executor';
import { SwqosType, TradeType } from '../index';
import type { SwqosClient } from '../swqos/clients';
const fake = (type: SwqosType, send: () => Promise<string>) => ({ getSwqosType: () => type, sendTransaction: vi.fn(send) }) as unknown as SwqosClient;
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('executor lifecycle regressions', () => {
  it.each([true, false])('returns first success despite a hung lane (abortOnSuccess=%s)', async abortOnSuccess => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const slow = new Promise<string>((_, fail) => { reject = fail; });
    const updates: ExecutionStatus[] = [];
    const executor = new AsyncTradeExecutor('http://localhost:1', [fake(SwqosType.Jito, async () => 'fast'), fake(SwqosType.Bloxroute, () => slow)]);
    const receipt = await executor.execute(TradeType.Buy, Buffer.alloc(0), { waitConfirmation: false, timeoutMs: 20, abortOnSuccess, onStatusUpdate: s => updates.push(s) });
    expect(receipt).toMatchObject({ success: true, signature: 'fast', status: ExecutionStatus.Submitted, attempts: 1 });
    expect(vi.getTimerCount()).toBe(abortOnSuccess ? 0 : 1);
    if (!abortOnSuccess) { await vi.advanceTimersByTimeAsync(20); expect(vi.getTimerCount()).toBe(0); }
    reject(new Error('late failure')); await tick();
    expect(updates).toEqual([ExecutionStatus.Pending, ExecutionStatus.Submitted]);
  });
  it.each(['confirmed', 'finalized'] as const)('reports observed %s only after polling', async status => {
    const updates: ExecutionStatus[] = [];
    const executor = new AsyncTradeExecutor('http://localhost:1', [fake(SwqosType.Jito, async () => 'ack')]);
    const poll = vi.fn(async () => {
      expect(updates).toEqual([ExecutionStatus.Pending, ExecutionStatus.Submitted]);
      return { value: { err: null, confirmationStatus: status, slot: 42 } };
    });
    // Private connection injection isolates confirmation RPC from the network.
    (executor as any).connection.getSignatureStatus = poll;
    const receipt = await executor.execute(TradeType.Buy, Buffer.alloc(0), { submitMode: SubmitMode.Single, commitment: status, onStatusUpdate: s => updates.push(s) });
    expect(receipt.status).toBe(status === 'confirmed' ? ExecutionStatus.Confirmed : ExecutionStatus.Finalized);
    expect(receipt.slot).toBe(42);
    expect(updates).toEqual(status === 'confirmed' ? [ExecutionStatus.Pending, ExecutionStatus.Submitted, ExecutionStatus.Confirmed] : [ExecutionStatus.Pending, ExecutionStatus.Submitted, ExecutionStatus.Confirmed, ExecutionStatus.Finalized]);
  });
  it('honors finalized commitment and cleans cancellation polling timers', async () => {
    vi.useFakeTimers();
    const updates: ExecutionStatus[] = [];
    const executor = new AsyncTradeExecutor('http://localhost:1', [fake(SwqosType.Jito, async () => 'ack')]);
    const poll = vi.fn(async () => ({ value: { err: null, confirmationStatus: 'confirmed', slot: 42 } }));
    // Private connection injection isolates confirmation RPC from the network.
    (executor as any).connection.getSignatureStatus = poll;
    const pending = executor.execute(TradeType.Buy, Buffer.alloc(0), { commitment: 'finalized', onStatusUpdate: s => updates.push(s) });
    await tick();
    expect(updates).toEqual([ExecutionStatus.Pending, ExecutionStatus.Submitted]);
    expect(executor.cancelAll()).toBe(1);
    expect(await pending).toMatchObject({ status: ExecutionStatus.Cancelled, signature: 'ack', success: false });
    await tick(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000); expect(poll).toHaveBeenCalledTimes(1);
  });
  it('parallel first success requires configured confirmation and stops losing polls', async () => {
    vi.useFakeTimers();
    const executor = new AsyncTradeExecutor('http://localhost:1', [fake(SwqosType.Jito, async () => 'winner'), fake(SwqosType.Bloxroute, async () => 'loser')]);
    const poll = vi.fn(async (signature: string) => ({ value: { err: null, confirmationStatus: signature === 'winner' ? 'finalized' : 'processed', slot: 42 } }));
    // Private connection injection isolates confirmation RPC from the network.
    // Private connection injection isolates confirmation RPC from the network.
    (executor as any).connection.getSignatureStatus = poll;
    const receipt = await executor.execute(TradeType.Buy, Buffer.alloc(0), { commitment: 'finalized', abortOnSuccess: true });
    expect(receipt).toMatchObject({ signature: 'winner', status: ExecutionStatus.Finalized, success: true });
    await tick(); expect(vi.getTimerCount()).toBe(0);
    const count = poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000); expect(poll).toHaveBeenCalledTimes(count);
  });
  it('cleans deadlines on transport failure and timeout without RPC', async () => {
    vi.useFakeTimers();
    const hot = new HotPathExecutor(new Connection('http://localhost:1'), { enablePrefetch: false });
    hot.addSwqosClient(fake(SwqosType.Jito, async () => { throw new Error('transport failed'); }));
    const options = { parallelSubmit: false, timeoutMs: 20, skipBlockhashValidation: true, maxRetries: 1 };
    expect(await hot.execute(TradeType.Buy, Buffer.alloc(0), options)).toMatchObject({ success: false });
    expect(vi.getTimerCount()).toBe(0);
    hot.addSwqosClient(fake(SwqosType.Jito, () => new Promise(() => {})));
    const pending = hot.execute(TradeType.Buy, Buffer.alloc(0), options);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ success: false }); expect(vi.getTimerCount()).toBe(0);
  });
  it('timeout retains acknowledged signature and ends polls', async () => {
    vi.useFakeTimers();
    const executor = new AsyncTradeExecutor('http://localhost:1', [fake(SwqosType.Jito, async () => 'ack')]);
    // Private connection injection isolates confirmation RPC from the network.
    (executor as any).connection.getSignatureStatus = vi.fn(() => new Promise(() => {}));
    const pending = executor.execute(TradeType.Buy, Buffer.alloc(0), { timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ status: ExecutionStatus.TimedOut, signature: 'ack' });
    await tick(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([true, false])('releases hotpath deadlines after success (parallel=%s)', async parallelSubmit => {
    vi.useFakeTimers();
    const connection = new Connection('http://localhost:1');
    const rpc = vi.spyOn(connection, 'getLatestBlockhash').mockRejectedValue(new Error('RPC forbidden'));
    const executor = new HotPathExecutor(connection, { enablePrefetch: false });
    executor.addSwqosClient(fake(SwqosType.Jito, async () => 'ack'));
    executor.addSwqosClient(fake(SwqosType.Bloxroute, () => new Promise(() => {})));
    expect(await executor.execute(TradeType.Buy, Buffer.alloc(0), { parallelSubmit, timeoutMs: 10000, skipBlockhashValidation: true, maxRetries: 1 })).toMatchObject({ success: true, signature: 'ack' });
    await tick(); expect(vi.getTimerCount()).toBe(0); expect(rpc).not.toHaveBeenCalled();
  });
  it('serializes simultaneous reservations despite delayed timers and wall clock jumps', async () => {
    vi.useFakeTimers(); let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const limiter = new RateLimiter(10); const released: number[] = [];
    await limiter.wait();
    const first = limiter.wait().then(() => released.push(now));
    const second = limiter.wait().then(() => released.push(now));
    await tick(); expect(vi.getTimerCount()).toBe(1);
    vi.setSystemTime(-1000); now = 150;
    await vi.advanceTimersByTimeAsync(10);
    expect(released).toEqual([150]); expect(vi.getTimerCount()).toBe(1);
    now = 160; await vi.advanceTimersByTimeAsync(10);
    await Promise.all([first, second]); expect(released).toEqual([150, 160]);
  });
  it('rejects invalid limiter intervals', () => {
    for (const interval of [-1, NaN, Infinity]) expect(() => new RateLimiter(interval)).toThrow(RangeError);
  });
});
