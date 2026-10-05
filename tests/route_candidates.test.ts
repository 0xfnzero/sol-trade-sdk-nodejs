import {it,expect} from "vitest";
import {PublicKey} from "@solana/web3.js";
import {candidateRoutes,iterateCandidateRoutes} from "../src/trading/route_candidates";
import {PoolTradeHint} from "../src/trading/subscription_cache";
const key=(n:number)=>new PublicKey(new Uint8Array(32).fill(n));
const edge=(n:number,a:number,b:number)=>new PoolTradeHint(key(n),key(a),key(b));
it("orders shortest paths, reverses pools and avoids cycles",()=>{
 const pools=[edge(10,1,2),edge(11,2,3),edge(12,1,3)];
 const paths=candidateRoutes(pools,key(3),key(1));
 expect(paths.map(p=>p.length)).toEqual([1,2]);
 expect(paths[0][0].inputMint.equals(key(3))).toBe(true);
 expect(candidateRoutes([...pools].reverse(),key(3),key(1))).toEqual(paths);
 expect(()=>candidateRoutes(pools,key(1),key(4))).toThrow("No connected");
 expect(()=>candidateRoutes(pools,key(1),PublicKey.default)).toThrow("endpoints");
 expect(()=>candidateRoutes([...pools,edge(10,1,4)],key(1),key(3))).toThrow("Conflicting");
 expect(()=>candidateRoutes(pools,key(1),key(3),6)).toThrow("hop limit");
});

it("does not enumerate longer paths after finding a valid shortest path",()=>{
 const pools:PoolTradeHint[]=[];let n=10;
 for(let a=1;a<=9;a++)for(let b=a+1;b<=9;b++)pools.push(edge(n++,a,b));
 expect(iterateCandidateRoutes(pools,key(1),key(2)).next().value).toHaveLength(1);
 expect(()=>candidateRoutes(pools,key(1),key(2))).toThrow("budget");
});

it("does not expand beyond the hop limit and enforces frontier budget during expansion",()=>{
 const pools:PoolTradeHint[]=[];let n=100;
 for(let a=1;a<=11;a++)for(let b=a+1;b<=11;b++)pools.push(edge(n++,a,b));
 expect(()=>candidateRoutes(pools,key(1),key(200),4)).toThrow("No connected");
 expect(()=>candidateRoutes(pools,key(1),key(200),5)).toThrow("budget");
});

it("preserves reference breadth-first order for all 64 four-mint graphs",()=>{
 const possible=[[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]].map(([a,b],i)=>edge(100+i,a,b));
 for(let mask=0;mask<64;mask++) {
  const pools=possible.filter((_,i)=>mask&(1<<i));
  const edges=pools.flatMap(h=>[h,new PoolTradeHint(h.pool,h.outputMint,h.inputMint)]).sort((a,b)=>a.pool.toBase58()<b.pool.toBase58()?-1:a.pool.toBase58()>b.pool.toBase58()?1:a.outputMint.toBase58()<b.outputMint.toBase58()?-1:1);
  let frontier=[{path:[] as PoolTradeHint[],mint:key(1),seen:new Set([key(1).toBase58()])}];const expected:PoolTradeHint[][]=[];
  for(let depth=0;depth<3;depth++) {
   const next:typeof frontier=[];
   for(const p of frontier)for(const h of edges) {
    if(!h.inputMint.equals(p.mint)||p.seen.has(h.outputMint.toBase58()))continue;
    const path=[...p.path,h];
    if(h.outputMint.equals(key(4)))expected.push(path);
    else next.push({path,mint:h.outputMint,seen:new Set([...p.seen,h.outputMint.toBase58()])});
   }
   frontier=next;
  }
  if(expected.length)expect(candidateRoutes([...pools].reverse(),key(1),key(4),3)).toEqual(expected);
  else expect(()=>candidateRoutes(pools,key(1),key(4),3)).toThrow("No connected");
 }
});
