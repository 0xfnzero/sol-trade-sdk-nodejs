import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {buyBaseInputInternalWithFees,buyQuoteInputInternalWithFees,sellBaseInputInternalWithFees,sellQuoteInputInternalWithFees,computeFee,ceilDiv,calculateWithSlippageBuy,calculateWithSlippageSell} from '../src/calc';
const cases=JSON.parse(readFileSync(new URL('./fixtures/pumpswap_rust_5_0_6.json',import.meta.url),'utf8')).cases;
const funcs=[buyBaseInputInternalWithFees,buyQuoteInputInternalWithFees,sellBaseInputInternalWithFees,sellQuoteInputInternalWithFees];
const fields=[['internalQuoteAmount','uiQuote','maxQuote'],['base','internalQuoteWithoutFees','maxQuote'],['uiQuote','minQuote','internalQuoteAmountOut'],['internalRawQuote','base','minQuote']];
it.each(cases)('matches pinned Rust amounts and current PumpSwap floor minimum %#',(c:any)=>{
 const [lp,p,creator]=c.fees.map(BigInt);
 funcs.forEach((fn,i)=>{
  const run=()=>fn(BigInt(c.amount),BigInt(c.slippage),BigInt(c.base_reserve),BigInt(c.quote_reserve),BigInt(c.virtual),{lpFeeBasisPoints:lp,protocolFeeBasisPoints:p,coinCreatorFeeBasisPoints:creator});
  if(c.results[i]===null)expect(run).toThrow();
  else {const r=run();const expected=[...c.results[i]];if(i===2||i===3){const bps=BigInt(c.slippage)>9999n?9999n:BigInt(c.slippage);const amount=i===2?BigInt(expected[0]):BigInt(c.amount);expected[i===2?1:2]=(amount*(10000n-bps)/10000n).toString();}expect(fields[i].map(k=>(r as any)[k].toString())).toEqual(expected);}
 });
});
it('uses wide intermediates and Rust common boundary semantics',()=>{
 const max=(1n<<64n)-1n;
 expect(computeFee(max,10000n)).toBe(max);
 expect(ceilDiv(max,2n)).toBe(9223372036854775808n);
 expect(calculateWithSlippageBuy(max,100n)).toBe(max);
 expect(calculateWithSlippageSell(max,100n)).toBe(18262276632972456099n);
 expect(calculateWithSlippageSell(0n,max)).toBe(0n);
 expect(calculateWithSlippageSell(10000n,max)).toBe(1n);
 expect(()=>calculateWithSlippageBuy(1n,-1n)).toThrow();
});

it('public PumpSwap sell minimum floors independently of generic SDK slippage',()=>{
 const fees={lpFeeBasisPoints:0n,protocolFeeBasisPoints:0n,coinCreatorFeeBasisPoints:0n};
 expect(sellQuoteInputInternalWithFees(101n,100n,1000000n,1000000n,0n,fees).minQuote).toBe(99n);
 const quote=sellBaseInputInternalWithFees(100n,100n,1000000n,1000000n,0n,fees);
 expect(quote.uiQuote).toBe(99n);expect(quote.minQuote).toBe(98n);
 expect(calculateWithSlippageSell(101n,100n)).toBe(100n);
});
