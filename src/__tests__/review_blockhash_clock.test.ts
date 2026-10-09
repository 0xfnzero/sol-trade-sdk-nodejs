import { afterEach, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { HotPathExecutor, TransactionBuilder } from '../hotpath';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('cold-prefetched blockhash expiry follows monotonic milliseconds across wall jumps and stop',async()=>{
 let wall=1_000_000,mono=100;
 vi.spyOn(Date,'now').mockImplementation(()=>wall);
 vi.spyOn(performance,'now').mockImplementation(()=>mono);
 const connection=new Connection('http://localhost:1');
 const rpc=vi.spyOn(connection,'getLatestBlockhash').mockResolvedValue({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100});
 const executor=new HotPathExecutor(connection,{cacheTtlMs:1000,blockhashRefreshIntervalMs:1_000_000});
 await executor.start();executor.stop();
 const accountKey=Keypair.generate().publicKey.toBase58();
 const accountsRpc=vi.spyOn(connection,'getMultipleAccountsInfo').mockResolvedValue([{data:Buffer.from([1]),lamports:1,owner:SystemProgram.programId,executable:false,rentEpoch:0}]);
 await executor.prefetchAccounts([accountKey]);
 const state=executor.getState();
 const poolKey=Keypair.generate().publicKey.toBase58();
 state.updatePool(poolKey,{poolAddress:poolKey,poolType:'pumpfun',mintA:accountKey,mintB:accountKey,vaultA:accountKey,vaultB:accountKey,reserveA:1n,reserveB:1n,feeRate:0,fetchedAt:wall});
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('implicit network');});
 const payer=Keypair.generate();const ix=SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1});
 const builder=new TransactionBuilder(executor);
 const sign=async()=>{const tx=(await builder.buildTransaction(payer.publicKey,[ix],[payer]))!;const parsed=Transaction.from(tx.serialize());expect(nacl.sign.detached.verify(parsed.serializeMessage(),parsed.signature!,payer.publicKey.toBytes())).toBe(true);};
 mono=1099;wall+=1_000_000;await sign();expect(state.getAccount(accountKey)).not.toBeNull();expect(state.getPool(poolKey)).not.toBeNull(); // Wall forward jump cannot expire a fresh cache.
 mono=1100;await sign();expect(state.getAccount(accountKey)).not.toBeNull();expect(state.getPool(poolKey)).not.toBeNull(); // Existing contract is inclusive at exactly TTL.
 mono=1100.001;wall=1;
 await expect(builder.buildTransaction(payer.publicKey,[ix],[payer])).rejects.toThrow('Stale blockhash');
 expect(executor.isReady()).toBe(false);expect(state.getAccount(accountKey)).toBeNull();expect(state.getPool(poolKey)).toBeNull();expect(accountsRpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledTimes(1);expect(network).not.toHaveBeenCalled();
});

it('account cold prefetch releases its deadline after successful response',async()=>{
 vi.useFakeTimers();
 const connection=new Connection('http://localhost:1');
 vi.spyOn(connection,'getMultipleAccountsInfo').mockResolvedValue([null]);
 const executor=new HotPathExecutor(connection,{enablePrefetch:false});
 await executor.prefetchAccounts([Keypair.generate().publicKey.toBase58()]);
 expect(vi.getTimerCount()).toBe(0);
});
