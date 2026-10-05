import {it,expect} from 'vitest';
import cases from './fixtures/damm_integer_review_20261005.json';
import {meteoraDammV2ComputeSwapAmount,meteoraDammV2CalculateLiquidity,meteoraDammV2GetAmountIn,meteoraDammV2GetAmountOut} from '../calc';
it.each(cases)('DAMM integer boundaries %#',c=>{
 const a=BigInt(c.a),b=BigInt(c.b),amount=BigInt(c.amount);
 const q=meteoraDammV2ComputeSwapAmount(a,b,c.buy,amount,BigInt(c.slippage));
 expect(q).toEqual({amountOut:BigInt(c.out),minAmountOut:BigInt(c.minimum)});
 expect(meteoraDammV2CalculateLiquidity(a,b)).toBe(BigInt(c.liquidity));
 const [i,o]=c.buy?[a,b]:[b,a];
 expect(meteoraDammV2GetAmountOut(amount,i!,o!,BigInt(c.fee))).toBe(BigInt(c.feeout));
 expect(meteoraDammV2GetAmountIn(BigInt(c.wanted),i!,o!,BigInt(c.fee))).toBe(BigInt(c.needed));
 const needed=BigInt(c.needed),wanted=BigInt(c.wanted);
 if(needed>0n&&wanted>0n){
  expect(meteoraDammV2GetAmountOut(needed,i!,o!,BigInt(c.fee))).toBeGreaterThanOrEqual(wanted);
  expect(meteoraDammV2GetAmountOut(needed-1n,i!,o!,BigInt(c.fee))).toBeLessThan(wanted);
 }
});
it('inverts the floored input fee after rounding required net input',()=>expect(meteoraDammV2GetAmountIn(1n,1n,3n,5000n)).toBe(2n));
it.each([-1n,1n<<64n,1 as unknown as bigint])('rejects invalid DAMM balances %s',a=>{
 expect(()=>meteoraDammV2CalculateLiquidity(a,1n)).toThrow();
 expect(()=>meteoraDammV2ComputeSwapAmount(a,1n,true,0n,0n)).toThrow();
});
