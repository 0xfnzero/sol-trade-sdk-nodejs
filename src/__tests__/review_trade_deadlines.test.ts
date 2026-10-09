import { afterEach, expect, it, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { HotPathExecutor } from '../hotpath/executor';
import { SwqosType, TradeType } from '../index';
import type { SwqosClient } from '../swqos/clients';

const client = (type: SwqosType, send: () => Promise<string>) =>
  ({ getSwqosType: () => type, sendTransaction: vi.fn(send) }) as unknown as SwqosClient;
const options = { parallelSubmit: false, timeoutMs: 10000, skipBlockhashValidation: true, maxRetries: 1 };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('releases every deadline after repeated fast success and failure', async () => {
  vi.useFakeTimers();
  const hot = new HotPathExecutor(new Connection('http://localhost:1'), { enablePrefetch: false });
  let success = true;
  hot.addSwqosClient(client(SwqosType.Jito, async () => {
    if (!success) throw new Error('transport failed');
    return 'ack';
  }));
  for (let i = 0; i < 100; i++) {
    success = i % 2 === 0;
    expect((await hot.execute(TradeType.Buy, Buffer.alloc(0), options)).success).toBe(success);
    expect(vi.getTimerCount()).toBe(0);
  }
});

it.each([true, false])('releases losing deadlines without stopping transport (late success=%s)', async lateSuccess => {
  vi.useFakeTimers();
  let resolve!: (signature: string) => void;
  let reject!: (error: Error) => void;
  let transportFinished = false;
  const transport = new Promise<string>((ok, fail) => { resolve = ok; reject = fail; })
    .finally(() => { transportFinished = true; });
  const hot = new HotPathExecutor(new Connection('http://localhost:1'), { enablePrefetch: false });
  const loser = client(SwqosType.Bloxroute, () => transport);
  hot.addSwqosClient(client(SwqosType.Jito, async () => 'winner'));
  hot.addSwqosClient(loser);
  const result = await hot.execute(TradeType.Buy, Buffer.alloc(0), { ...options, parallelSubmit: true });
  expect(result).toMatchObject({ success: true, signature: 'winner' });
  expect(vi.getTimerCount()).toBe(0);
  expect(transportFinished).toBe(false);
  expect(loser.sendTransaction).toHaveBeenCalledTimes(1);
  if (lateSuccess) resolve('late'); else reject(new Error('late failure'));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(transportFinished).toBe(true);
  expect(result.signature).toBe('winner');
  expect(vi.getTimerCount()).toBe(0);
});
