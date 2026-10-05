import {expect,it} from "vitest";
import {decodeFeeConfig} from "../src/instruction/pumpswap";
it("requires actual fee config account type",()=>{
 const data=Buffer.alloc(73);Buffer.from([143,52,146,187,219,123,76,155]).copy(data);
 data.writeBigUInt64LE(25n,41);
 expect(decodeFeeConfig(data)?.flatFees.lpFeeBasisPoints).toBe(25n);
 data[0]^=1;expect(decodeFeeConfig(data)).toBeNull();expect(decodeFeeConfig(data.subarray(0,7))).toBeNull();
});
