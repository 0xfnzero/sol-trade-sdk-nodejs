import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {snapshotI64,snapshotU64} from '../../examples/_snapshot';
import {build} from '../../examples/cached_damm_v2';
it('rejects already rounded JSON Number rather than restoring a false bigint',()=>{
 const input=JSON.parse('{"amount":9007199254740993}');
 expect(()=>snapshotU64(input.amount,'amount')).toThrow('unsafe Number');
 expect(snapshotU64('9007199254740993','amount')).toBe(9007199254740993n);
});
it('validates full unsigned and signed snapshot ranges',()=>{
 expect(snapshotU64('18446744073709551615','slot')).toBe((1n<<64n)-1n);
 expect(()=>snapshotU64('18446744073709551616','slot')).toThrow('out of range');
 expect(()=>snapshotU64(-1,'amount')).toThrow('out of range');
 expect(snapshotI64('-9223372036854775808','unix_timestamp')).toBe(-(1n<<63n));
 expect(()=>snapshotI64('9223372036854775808','unix_timestamp')).toThrow('out of range');
});
it.each([true,null,undefined,1.5,'1e3',''])('rejects non-integer snapshot value %#',value=>{
 expect(()=>snapshotU64(value,'amount')).toThrow();
});
it('DAMM example rejects unsafe amount before creating a transaction',()=>{
 const value=JSON.parse(readFileSync(new URL('../../examples/fixtures/cached_damm_v2_sol_buy_20261004.json',import.meta.url),'utf8'));
 value.amount=Number.MAX_SAFE_INTEGER+1;
 expect(()=>build(value)).toThrow('amount: unsafe Number');
});
