/** Rust 5.0.6 curve math with checked u128 intermediates and u64 outputs. */
const U64=(1n<<64n)-1n,U128=(1n<<128n)-1n;
function unsigned(n:bigint,max:bigint,label:string){if(typeof n!=="bigint"||n<0n||n>max)throw new RangeError(`${label} outside unsigned range`);}
export function pumpFunBuyExact(virtualToken:bigint,virtualQuote:bigint,realToken:bigint,amount:bigint,totalFeeBps=95n):bigint{
 for(const n of [virtualToken,virtualQuote,realToken])unsigned(n,U128,"reserve");unsigned(amount,U64,"amount");unsigned(totalFeeBps,U64,"fee");
 if(amount===0n||virtualToken===0n)return 0n;
 const net=amount*10000n/(totalFeeBps+10000n), curveIn=net>0n?net-1n:0n;
 if(curveIn===0n)return 0n;
 const denominator=virtualQuote+curveIn;if(denominator>U128||denominator===0n)return 0n;
 const numerator=curveIn*virtualToken;
 const out=numerator>U128?0n:numerator/denominator;
 return out<realToken?(out<U64?out:U64):(realToken<U64?realToken:U64);
}
export function pumpFunSellExact(virtualToken:bigint,virtualQuote:bigint,amount:bigint,totalFeeBps=95n):bigint{
 for(const n of [virtualToken,virtualQuote])unsigned(n,U128,"reserve");unsigned(amount,U64,"amount");unsigned(totalFeeBps,U64,"fee");
 if(amount===0n||virtualToken===0n)return 0n;
 const numerator=amount*virtualQuote;if(numerator>U128)return U64;
 const sum=virtualToken+amount, denominator=sum>U128?1n:sum;
 const gross=numerator/denominator, fee=(gross*totalFeeBps+9999n)/10000n;
 const out=gross>fee?gross-fee:0n;return out<U64?out:U64;
}
