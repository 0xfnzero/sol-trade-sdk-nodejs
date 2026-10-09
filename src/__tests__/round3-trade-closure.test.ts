import {describe,it,expect,vi} from 'vitest';
import {AsyncTradeExecutor, SubmitMode} from '../trading/core/async-executor';
import {TradeExecutor} from '../trading/executor';
import {TradeType, SwqosType} from '../common/gas-fee-strategy';
const signature='acknowledged-signature';
const status=async()=>({context:{slot:1},value:{slot:1,err:{InstructionError:[0,1]},confirmationStatus:'confirmed'}});
function client(kind=SwqosType.Default, ack=true) {
 return {getSwqosType:()=>kind,sendTransaction:vi.fn(async()=>{if(!ack)throw new Error('send rejected');return signature;})};
}
describe('acknowledged receipts remain actionable on terminal failures',()=>{
 for(const mode of [SubmitMode.Single,SubmitMode.Fallback]) {
  it(`async ${mode} retains signature/provider and does not resubmit after confirmation error`,async()=>{
   const first=client(),second=client(SwqosType.Jito,false);
   const ex=new AsyncTradeExecutor('http://offline.invalid',[first,second] as any);
   (ex as any).connection.getSignatureStatus=status;
   const r=await ex.execute(TradeType.Buy,Buffer.alloc(0),{submitMode:mode,waitConfirmation:true,maxRetries:3,retryDelayMs:0,timeoutMs:1000});
   expect(r.success).toBe(false);expect(r.signature).toBe(signature);expect(r.provider).toBe(SwqosType.Default);
   expect(first.sendTransaction).toHaveBeenCalledTimes(1);expect(second.sendTransaction).not.toHaveBeenCalled();
  });
 }
 for(const parallel of [true,false]) {
  it(`ordinary parallel=${parallel} retains submitted receipt metadata`,async()=>{
   const first=client(),second=client(SwqosType.Jito,false);
   const ex=new TradeExecutor({rpcUrl:'http://offline.invalid',swqosConfigs:[]});
   (ex as any).clients=new Map([[SwqosType.Default,first],[SwqosType.Jito,second]]);
   (ex as any).connection.getSignatureStatus=status;
   const r=await ex.execute(TradeType.Buy,Buffer.alloc(0),{parallelSubmit:parallel,waitConfirmation:true,maxRetries:3,retryDelayMs:0});
   expect(r.success).toBe(false);expect(r.signature).toBe(signature);expect(r.confirmationTimeMs).toBeTypeOf('number');
   expect(first.sendTransaction).toHaveBeenCalledTimes(1);
   if(!parallel)expect(second.sendTransaction).not.toHaveBeenCalled();
  });
 }
 it('ordinary thrown observer preserves acknowledgement',async()=>{
  const ex=new TradeExecutor({rpcUrl:'http://offline.invalid',swqosConfigs:[]});
  (ex as any).clients=new Map([[SwqosType.Default,client()]]);
  (ex as any).waitForConfirmation=async()=>{throw new Error('observer failed');};
  const r=await ex.execute(TradeType.Buy,Buffer.alloc(0),{parallelSubmit:true,waitConfirmation:true,maxRetries:1,retryDelayMs:0});
  expect(r.signature).toBe(signature);expect(r.success).toBe(false);expect(r.error).toContain('observer failed');
 });
});

describe('async receipt identity stays paired with its provider',()=>{
 it('parallel failure prioritizes acknowledged lane over unrelated rejected send',async()=>{
  const first=client(SwqosType.Default,false),second=client(SwqosType.Jito);
  const ex=new AsyncTradeExecutor('http://offline.invalid',[first,second] as any);
  (ex as any).connection.getSignatureStatus=status;
  const r=await ex.execute(TradeType.Buy,Buffer.alloc(0),{submitMode:SubmitMode.Parallel,waitConfirmation:true,maxRetries:1,timeoutMs:1000});
  expect(r.success).toBe(false);expect(r.signature).toBe(signature);expect(r.provider).toBe(SwqosType.Jito);
  expect(r.error).toContain('confirm');
 });
 it('execution deadline retains acknowledged provider without resubmitting',async()=>{
  const submitted=client(SwqosType.Jito);
  const ex=new AsyncTradeExecutor('http://offline.invalid',[submitted] as any);
  (ex as any).connection.getSignatureStatus=()=>new Promise(()=>{});
  const r=await ex.execute(TradeType.Buy,Buffer.alloc(0),{submitMode:SubmitMode.Single,waitConfirmation:true,maxRetries:3,timeoutMs:10});
  expect(r.success).toBe(false);expect(r.signature).toBe(signature);expect(r.provider).toBe(SwqosType.Jito);
  expect(submitted.sendTransaction).toHaveBeenCalledTimes(1);
 });
});
