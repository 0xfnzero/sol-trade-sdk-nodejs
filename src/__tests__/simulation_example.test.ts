import {it,expect,vi} from 'vitest';
import {validateSimulationResponse,simulate,simulationOutput} from '../../examples/_simulation';
it.each([{},null,{result:null},{result:{value:{}}},{result:{value:null}},{error:{code:-1}}])('rejects missing execution result %#',r=>expect(()=>validateSimulationResponse(r)).toThrow());
it('explicit null error is required for success',()=>expect(validateSimulationResponse({result:{value:{err:null}}})).toBeNull());
it('requires explicit simulation with evidence path',()=>{
 expect(()=>simulationOutput(['--simulation-out','x'])).toThrow();
 expect(()=>simulationOutput(['--simulate','--simulation-out'])).toThrow();
});
it('sends only simulation, preserves wire and bounds network wait',async()=>{
 const wire=Buffer.from([1,2,3,255]);const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  const v=JSON.parse(init!.body as string);expect(v.method).toBe('simulateTransaction');expect(v.params[0]).toBe(wire.toString('base64'));expect(v.params[1].minContextSlot).toBe(123);expect(v.params[1].sigVerify).toBe(false);expect(init!.signal).toBeInstanceOf(AbortSignal);
  return new Response(JSON.stringify({result:{value:{err:{InstructionError:[0,'failure']}}}}),{status:200});
 });
 try{await expect(simulate(wire,123n)).rejects.toThrow('Simulation failed')}finally{spy.mockRestore()}
});
it('signed simulation request preserves signed hash and enables sigVerify (mock RPC contract)',async()=>{
 const {Keypair,SystemProgram,Transaction}=await import('@solana/web3.js');
 const payer=Keypair.generate();
 const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:'11111111111111111111111111111111'}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));
 tx.sign(payer);const wire=tx.serialize();expect(tx.verifySignatures()).toBe(true);
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  const request=JSON.parse(init!.body as string);
  expect(request.method).toBe('simulateTransaction');
  expect(request.params[1].sigVerify).toBe(true);expect(request.params[1].replaceRecentBlockhash).toBe(false);
  expect(Transaction.from(Buffer.from(request.params[0],'base64')).verifySignatures()).toBe(true);
  return new Response(JSON.stringify({result:{value:{err:null,logs:[],unitsConsumed:150}}}),{status:200});
 });
 try{await simulate(wire,0n,undefined,true);expect(spy).toHaveBeenCalledTimes(1)}finally{spy.mockRestore()}
});
it('signed durable-nonce simulation cannot replace the signed nonce hash (mock RPC contract)',async()=>{
 const {Keypair,SystemProgram,Transaction}=await import('@solana/web3.js');
 const payer=Keypair.generate(),nonce=Keypair.generate().publicKey,nonceHash=Keypair.generate().publicKey.toBase58();
 const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:nonceHash}).add(SystemProgram.nonceAdvance({noncePubkey:nonce,authorizedPubkey:payer.publicKey}));
 tx.sign(payer);
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  const request=JSON.parse(init!.body as string);
  expect(request.params[1].sigVerify).toBe(true);expect(request.params[1].replaceRecentBlockhash).toBe(false);
  const decoded=Transaction.from(Buffer.from(request.params[0],'base64'));
  expect(decoded.recentBlockhash).toBe(nonceHash);expect(decoded.instructions[0]!.data.readUInt32LE(0)).toBe(4);expect(decoded.verifySignatures()).toBe(true);
  return new Response(JSON.stringify({result:{value:{err:null}}}),{status:200});
 });
 try{await simulate(tx.serialize(),0n,undefined,true);expect(spy).toHaveBeenCalledTimes(1)}finally{spy.mockRestore()}
});
