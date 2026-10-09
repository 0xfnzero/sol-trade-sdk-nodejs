import { describe, expect, it, vi } from 'vitest';
import { ComputeBudgetProgram, Keypair, SystemProgram, Connection } from '@solana/web3.js';
import { HotPathExecutor, TransactionBuilder } from '../hotpath';
import { TradeExecutor, defaultExecutorOptions } from '../trading/executor';
import { SwqosType, TradeType } from '../common/gas-fee-strategy';

const payer = Keypair.generate();
const ix = SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1});
const makeBuilder = () => {
  const executor = new HotPathExecutor(new Connection('http://localhost:1'), {enablePrefetch:false});
  vi.spyOn(executor, 'getBlockhash').mockReturnValue({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:100});
  return new TransactionBuilder(executor);
};

describe('hot path signed transaction compute budget', () => {
  it('encodes limits and price before the swap, using only cached hash', async () => {
    const tx = (await makeBuilder().buildTransaction(payer.publicKey,[ix],[payer],{computeUnitLimit:1400000,computeUnitPrice:1000000}))!;
    expect(tx.instructions.map(i => i.programId)).toEqual([ComputeBudgetProgram.programId,ComputeBudgetProgram.programId,SystemProgram.programId]);
    expect(tx.instructions[0]!.data.readUInt32LE(1)).toBe(1400000);
    expect(tx.instructions[1]!.data.readBigUInt64LE(1)).toBe(1000000n);
    expect(tx.verifySignatures()).toBe(true);
  });
  it('preserves the optional budget and rejects malformed values', async () => {
    expect((await makeBuilder().buildTransaction(payer.publicKey,[ix],[payer]))!.instructions).toHaveLength(1);
    await expect(makeBuilder().buildTransaction(payer.publicKey,[ix],[payer],{computeUnitLimit:1.5,computeUnitPrice:0})).rejects.toThrow('Invalid compute budget');
  });
});

const executeWith = (clients: object[], waitConfirmation=false) => {
  const executor = new TradeExecutor({rpcUrl:'http://localhost:1',swqosConfigs:[]});
  const internal = executor as unknown as {clients:Map<SwqosType,object>};
  internal.clients = new Map(clients.map((client,i) => [i === 0 ? SwqosType.Jito : SwqosType.Default,client]));
  return {executor,run:()=>executor.execute(TradeType.Buy,Buffer.alloc(0),{...defaultExecutorOptions(),waitConfirmation})};
};
it('returns a successful lane before another submission settles', async () => {
  let finish!: (signature:string)=>void;
  const slow = new Promise<string>(resolve => {finish=resolve;});
  const {run} = executeWith([{sendTransaction:async()=> 'fast'},{sendTransaction:()=>slow}]);
  expect((await run()).signature).toBe('fast');
  finish('slow');
});
it('waits past failed lanes and retains all failure diagnostics', async () => {
  const failure={sendTransaction:async()=>{throw Error('provider failed');}};
  expect((await executeWith([failure,{sendTransaction:async()=> 'ok'}]).run()).signature).toBe('ok');
  const failed=await executeWith([failure,{sendTransaction:async()=>{throw Error('second failed');}}]).run();
  expect(failed.success).toBe(false);
  expect(failed.error).toContain('provider failed');
  expect(failed.error).toContain('second failed');
});
it('requires confirmation when requested before choosing a successful lane', async () => {
  const {executor,run}=executeWith([{sendTransaction:async()=> 'confirmed'},{sendTransaction:async()=>{throw Error('rejected');}}],true);
  vi.spyOn(executor.getConnection(),'getSignatureStatus').mockResolvedValue({context:{slot:1},value:{slot:1,confirmations:1,err:null,confirmationStatus:'confirmed'}});
  expect((await run()).success).toBe(true);
  expect(executor.getConnection().getSignatureStatus).toHaveBeenCalledWith('confirmed');
});
