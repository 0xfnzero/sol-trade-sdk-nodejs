import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
import {getBuyTokenAmountFromSolAmount,getSellSolAmountFromTokenAmount} from "../src/calc";
import {pumpFunBuyExact,pumpFunSellExact} from "../src/calc/pumpfun_exact";
const fixture=JSON.parse(readFileSync(new URL("./fixtures/pumpfun_rust_5_0_6.json",import.meta.url),"utf8"));
it.each(fixture.cases)("matches pinned Rust curve %#",(c:any)=>{
 const vt=BigInt(c.virtual_token),vq=BigInt(c.virtual_quote),rt=BigInt(c.real_token),a=BigInt(c.amount);
 expect(getBuyTokenAmountFromSolAmount(vt,vq,rt,c.has_creator,a)).toBe(BigInt(c.buy));
 expect(getSellSolAmountFromTokenAmount(vt,vq,c.has_creator,a)).toBe(BigInt(c.sell));
});
it("rejects lossy and out-of-range inputs",()=>{
 expect(()=>pumpFunBuyExact(1000n,100n,1000n,1 as any)).toThrow();
 expect(()=>pumpFunSellExact(1000n,100n,1n<<64n)).toThrow();
});
