/** Deterministic shortest paths from caller-supplied pool identities; no discovery/RPC. */
import { PublicKey } from "@solana/web3.js";
import { PoolTradeHint } from "./subscription_cache";
export function* iterateCandidateRoutes(candidates: readonly PoolTradeHint[], input: PublicKey, output: PublicKey, maximumHops = 5): Generator<PoolTradeHint[]> {
  if (!Number.isInteger(maximumHops) || maximumHops < 1 || maximumHops > 5 || input.equals(output) || input.equals(PublicKey.default) || output.equals(PublicKey.default)) throw Error("Invalid candidate route endpoints or hop limit");
  const byPool = new Map<string, PoolTradeHint>();
  for (const h of candidates) {
    new PoolTradeHint(h.pool,h.inputMint,h.outputMint);
    const name = h.pool.toBase58(), previous = byPool.get(name);
    if (previous && !((previous.inputMint.equals(h.inputMint) && previous.outputMint.equals(h.outputMint)) || (previous.inputMint.equals(h.outputMint) && previous.outputMint.equals(h.inputMint)))) throw Error("Conflicting candidate pool mints");
    byPool.set(name, h);
    if (byPool.size > 64) throw Error("Candidate search budget: maximum 64 pools");
  }
  const edges = [...byPool.values()].flatMap(h => [h, new PoolTradeHint(h.pool, h.outputMint, h.inputMint)])
    .map(h => ({hint:h, pool:h.pool.toBase58(), input:h.inputMint.toBase58(), output:h.outputMint.toBase58()}))
    .sort((a,b) => lexical(a.pool,b.pool) || lexical(a.output,b.output));
  const adjacent = new Map<string, typeof edges>();
  for (const edge of edges) {
    const list = adjacent.get(edge.input);
    if (list) list.push(edge); else adjacent.set(edge.input,[edge]);
  }
  let routes=0;
  const target = output.toBase58(), start = input.toBase58();
  let frontier: {hints: PoolTradeHint[], mint: string, seen: Set<string>}[] = [{hints:[],mint:start,seen:new Set([start])}];
  for (let depth=0;depth<maximumHops && frontier.length;depth++) {
    const next: typeof frontier = [];
    for (const p of frontier) for (const edge of adjacent.get(p.mint) ?? []) {
      const h = edge.hint;
      if (p.seen.has(edge.output) || p.hints.some(x=>x.pool.equals(h.pool))) continue;
      const hints = [...p.hints,h];
      if (edge.output === target) { routes++; if (routes > 64) throw Error("Candidate search budget: maximum 64 paths"); yield hints; }
      else if (depth + 1 < maximumHops) {
        if (next.length >= 4096) throw Error("Candidate search budget exceeded");
        next.push({hints,mint:edge.output,seen:new Set([...p.seen,edge.output])});
      }
    }
    frontier=next;
  }
  if (!routes) throw Error("No connected candidate route");
  return;
}

function lexical(a:string,b:string):number { return a < b ? -1 : a > b ? 1 : 0; }

export function candidateRoutes(candidates: readonly PoolTradeHint[],input:PublicKey,output:PublicKey,maximumHops=5):readonly PoolTradeHint[][] {return [...iterateCandidateRoutes(candidates,input,output,maximumHops)];}
