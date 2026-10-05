import {expect,it} from "vitest";
import {PublicKey} from "@solana/web3.js";
import {SubscriptionReadiness,CacheNotReadyError} from "../src/trading/subscription_readiness";
import {SubscriptionAccountCache} from "../src/trading/subscription_cache";
it("invalidates frozen snapshots on a gRPC gap and requires complete revalidation",()=>{
 const key=new PublicKey(new Uint8Array(32).fill(1)), owner=new PublicKey(new Uint8Array(32).fill(2));
 const r=new SubscriptionReadiness("confirmed/fork-a",[key.toBase58(),"clock"]);
 const c=new SubscriptionAccountCache(); c.update(key,{owner,data:Uint8Array.of(1),slot:1n,writeVersion:0n});
 expect(()=>c.readySnapshot(r)).toThrow(CacheNotReadyError);
 expect(r.markValidated([key.toBase58()],0n,"confirmed/fork-a")).toBe(false);
 expect(r.markValidated(["clock"],0n,"confirmed/fork-a")).toBe(true);
 const old=c.readySnapshot(r),ctx={slot:1n,epoch:0n,maximumSlotAge:0n}; expect(Array.from(old.get(key,ctx).data)).toEqual([1]);
 r.interrupt("stream gap");expect(()=>old.get(key,ctx)).toThrow(CacheNotReadyError);
 const gen=r.beginRecovery("confirmed/fork-a"); expect(r.markValidated([key.toBase58(),"clock"],0n,"confirmed/fork-a")).toBe(false);
 expect(r.markValidated([key.toBase58(),"clock"],gen,"other-fork")).toBe(false);
 expect(r.markValidated([key.toBase58(),"clock"],gen,"confirmed/fork-a")).toBe(true);
 expect(()=>old.get(key,ctx)).toThrow(CacheNotReadyError); expect(c.readySnapshot(r).get(key,ctx).data.length).toBe(1);
 r.requireAccounts(["new-array"]);expect(()=>c.readySnapshot(r)).toThrow(CacheNotReadyError);
});
it("new arrays cannot bypass explicit recovery after a fork conflict",()=>{
 const r=new SubscriptionReadiness("confirmed/fork-a",["pool"]);
 expect(r.markValidated(["pool"],0n,"confirmed/fork-a")).toBe(true);
 const old=r.guard();r.interrupt("fork conflict");const generation=r.requireAccounts(["new-array"]);
 expect(r.status().state).toBe("continuity-broken");expect(r.status().reason).toBe("fork conflict");
 expect(r.markValidated(["pool","new-array"],generation,"confirmed/fork-a")).toBe(false);
 expect(()=>r.guard()).toThrow(CacheNotReadyError);
 const recovered=r.beginRecovery("confirmed/fork-b");
 expect(r.markValidated(["pool","new-array"],generation,"confirmed/fork-a")).toBe(false);
 expect(r.markValidated(["pool"],recovered,"confirmed/fork-b")).toBe(false);
 expect(r.markValidated(["new-array"],recovered,"confirmed/fork-b")).toBe(true);
 expect(()=>r.guard()()).not.toThrow();expect(old).toThrow(CacheNotReadyError);
});
for(const conflict of ["data","owner","closed"])it(`account ${conflict} conflict invalidates every cache-bound snapshot`,()=>{
 const key=new PublicKey(new Uint8Array(32).fill(1)),owner=new PublicKey(new Uint8Array(32).fill(2)),other=new PublicKey(new Uint8Array(32).fill(3));
 const c=new SubscriptionAccountCache(),r=new SubscriptionReadiness("confirmed/fork-a",[key.toBase58()]);
 c.update(key,{owner,data:Buffer.from('one'),slot:1n,writeVersion:0n});expect(r.markValidated([key.toBase58()],0n,"confirmed/fork-a")).toBe(true);
 const offline=c.snapshot(),live=c.readySnapshot(r),ctx={slot:1n,epoch:0n,maximumSlotAge:0n};
 expect(()=>c.update(key,{owner:conflict==='owner'?other:owner,data:Buffer.from(conflict==='closed'?'':conflict==='data'?'other':'one'),slot:1n,writeVersion:0n})).toThrow(/Conflicting/);
 for(const s of [offline,live,c.snapshot()]){expect(()=>s.assertUsable()).toThrow(/Conflicting/);expect(()=>s.getOptional(key,ctx)).toThrow(/Conflicting/)}
 const generation=r.beginRecovery('confirmed/fork-b');expect(r.markValidated([key.toBase58()],generation,'confirmed/fork-b')).toBe(true);
 expect(()=>c.readySnapshot(r)).toThrow(/Conflicting/);
 const fresh=new SubscriptionAccountCache();fresh.update(key,{owner,data:Buffer.from('selected'),slot:1n,writeVersion:0n});expect(Buffer.from(fresh.readySnapshot(r).get(key,ctx).data).toString()).toBe('selected');
});
